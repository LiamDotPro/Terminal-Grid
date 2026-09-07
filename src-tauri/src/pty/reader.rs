//! Output coalescing for the PTY reader thread.
//!
//! Flushing every `read()` would emit thousands of tiny IPC messages a second
//! under a busy build. Bytes are batched until either 16 KiB has piled up or
//! 8 ms passed since the first unflushed byte, and a session that floods is
//! paced (design section 4.3).
//!
//! The reader thread only ever fills the buffer; a second thread drains it.
//! That split is what makes the time threshold work at all — a shell that
//! prints its prompt and then waits for input produces no further reads, so
//! nothing would ever push the batch out — and having exactly one thread emit
//! keeps the byte stream in order.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

pub const FLUSH_BYTES: usize = 16 * 1024;
pub const FLUSH_AFTER: Duration = Duration::from_millis(8);
pub const READ_BUFFER: usize = 8 * 1024;

/// Bytes per second above which the reader starts pacing itself.
const THROTTLE_BYTES_PER_SEC: usize = 4 * 1024 * 1024;
pub const THROTTLE_SLEEP: Duration = Duration::from_millis(20);

/// The batching policy. Pure, so the thresholds are testable on their own.
pub struct Coalescer {
    buffer: Vec<u8>,
    first_byte_at: Option<Instant>,
    window_started_at: Instant,
    window_bytes: usize,
    throttled: bool,
}

impl Coalescer {
    pub fn new(now: Instant) -> Self {
        Self {
            buffer: Vec::with_capacity(FLUSH_BYTES),
            first_byte_at: None,
            window_started_at: now,
            window_bytes: 0,
            throttled: false,
        }
    }

    pub fn push(&mut self, chunk: &[u8], now: Instant) {
        if chunk.is_empty() {
            return;
        }
        if self.first_byte_at.is_none() {
            self.first_byte_at = Some(now);
        }
        self.buffer.extend_from_slice(chunk);

        if now.duration_since(self.window_started_at) >= Duration::from_secs(1) {
            self.throttled = self.window_bytes > THROTTLE_BYTES_PER_SEC;
            self.window_started_at = now;
            self.window_bytes = 0;
        }
        self.window_bytes += chunk.len();
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }

    /// Whether a runaway writer should be paced before the next read.
    pub fn should_throttle(&self) -> bool {
        self.throttled || self.window_bytes > THROTTLE_BYTES_PER_SEC
    }

    pub fn is_due(&self, now: Instant) -> bool {
        if self.buffer.is_empty() {
            return false;
        }
        self.buffer.len() >= FLUSH_BYTES
            || self
                .first_byte_at
                .is_some_and(|at| now.duration_since(at) >= FLUSH_AFTER)
    }

    /// How long until the time threshold expires, for the flusher's wait.
    pub fn time_until_due(&self, now: Instant) -> Duration {
        match self.first_byte_at {
            Some(at) => FLUSH_AFTER.saturating_sub(now.duration_since(at)),
            None => FLUSH_AFTER,
        }
    }

    pub fn take(&mut self) -> Option<Vec<u8>> {
        if self.buffer.is_empty() {
            return None;
        }
        self.first_byte_at = None;
        Some(std::mem::take(&mut self.buffer))
    }
}

/// Hands bytes from the reader thread to the single thread that emits them.
pub struct OutputPump {
    coalescer: Mutex<Coalescer>,
    ready: Condvar,
    closed: AtomicBool,
}

impl OutputPump {
    pub fn new() -> Self {
        Self {
            coalescer: Mutex::new(Coalescer::new(Instant::now())),
            ready: Condvar::new(),
            closed: AtomicBool::new(false),
        }
    }

    /// Called by the reader thread for every chunk it reads.
    pub fn push(&self, chunk: &[u8]) {
        let mut coalescer = self.coalescer.lock().expect("output pump");
        coalescer.push(chunk, Instant::now());
        self.ready.notify_all();
    }

    pub fn should_throttle(&self) -> bool {
        self.coalescer
            .lock()
            .expect("output pump")
            .should_throttle()
    }

    /// Called by the reader thread when the pty reaches EOF.
    pub fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.ready.notify_all();
    }

    /// Blocks until a batch is due. `None` once the pty closed and drained.
    pub fn next_batch(&self) -> Option<Vec<u8>> {
        let mut coalescer = self.coalescer.lock().expect("output pump");
        loop {
            if self.closed.load(Ordering::SeqCst) {
                return coalescer.take();
            }
            if coalescer.is_empty() {
                coalescer = self.ready.wait(coalescer).expect("output pump");
                continue;
            }
            let now = Instant::now();
            if coalescer.is_due(now) {
                return coalescer.take();
            }
            let remaining = coalescer.time_until_due(now);
            let (guard, _) = self
                .ready
                .wait_timeout(coalescer, remaining)
                .expect("output pump");
            coalescer = guard;
        }
    }
}

impl Default for OutputPump {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn small_writes_are_held_back() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(start);
        coalescer.push(b"hello", start);
        coalescer.push(b" world", start);
        assert!(!coalescer.is_due(start));
    }

    #[test]
    fn the_size_threshold_makes_a_batch_due_immediately() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(start);
        let chunk = vec![b'x'; READ_BUFFER];
        for _ in 0..3 {
            coalescer.push(&chunk, start);
        }
        assert!(coalescer.is_due(start));
        assert!(coalescer.take().expect("a batch").len() >= FLUSH_BYTES);
    }

    #[test]
    fn the_time_threshold_makes_a_batch_due_without_further_reads() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(start);
        coalescer.push(b"tick", start);
        assert!(!coalescer.is_due(start));
        assert!(coalescer.is_due(start + FLUSH_AFTER + Duration::from_millis(1)));
        assert_eq!(coalescer.take().as_deref(), Some(&b"tick"[..]));
    }

    #[test]
    fn time_until_due_shrinks_as_the_window_elapses() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(start);
        assert_eq!(coalescer.time_until_due(start), FLUSH_AFTER);
        coalescer.push(b"x", start);
        let half = start + Duration::from_millis(4);
        assert!(coalescer.time_until_due(half) <= Duration::from_millis(4));
        assert_eq!(
            coalescer.time_until_due(start + Duration::from_secs(1)),
            Duration::ZERO
        );
    }

    #[test]
    fn taking_twice_yields_nothing_the_second_time() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(start);
        coalescer.push(b"data", start);
        assert!(coalescer.take().is_some());
        assert!(coalescer.take().is_none());
    }

    #[test]
    fn a_flood_trips_the_throttle() {
        let start = Instant::now();
        let mut coalescer = Coalescer::new(start);
        let chunk = vec![b'x'; READ_BUFFER];
        assert!(!coalescer.should_throttle());
        for _ in 0..(THROTTLE_BYTES_PER_SEC / READ_BUFFER + 2) {
            coalescer.push(&chunk, start);
        }
        assert!(coalescer.should_throttle());
    }

    /// The case that motivated the split: one small write and then silence.
    #[test]
    fn the_pump_delivers_a_lone_prompt_without_another_read() {
        let pump = Arc::new(OutputPump::new());
        pump.push(b"PS C:\\dev> ");

        let batch = pump.next_batch().expect("the prompt should be delivered");
        assert_eq!(batch, b"PS C:\\dev> ");
    }

    #[test]
    fn the_pump_coalesces_writes_that_arrive_together() {
        let pump = Arc::new(OutputPump::new());
        pump.push(b"one ");
        pump.push(b"two ");
        pump.push(b"three");

        let batch = pump.next_batch().expect("a batch");
        assert_eq!(batch, b"one two three");
    }

    #[test]
    fn closing_drains_what_is_left_and_then_ends() {
        let pump = Arc::new(OutputPump::new());
        pump.push(b"tail");
        pump.close();
        assert_eq!(pump.next_batch().as_deref(), Some(&b"tail"[..]));
        assert_eq!(pump.next_batch(), None);
    }

    #[test]
    fn a_reader_on_another_thread_is_picked_up() {
        let pump = Arc::new(OutputPump::new());
        let writer = Arc::clone(&pump);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            writer.push(b"late");
            writer.close();
        });

        assert_eq!(pump.next_batch().as_deref(), Some(&b"late"[..]));
        assert_eq!(pump.next_batch(), None);
    }
}
