//! Subprocess wrapper around `git`. See docs/technical-design.md section 7.2.
//!
//! Every invocation is hidden (no console flash on Windows), cannot block on
//! the index lock, never prompts for credentials, and is bounded by a timeout.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::error::{AppError, Result};

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const TIMEOUT: Duration = Duration::from_secs(3);
const POLL: Duration = Duration::from_millis(10);

pub struct GitOutput {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Like `GitOutput`, with stdout kept as bytes: file contents read out of the
/// index or a commit may not be text.
pub struct RawOutput {
    pub ok: bool,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

/// Runs git in `cwd`. Returns Err only when git could not be run at all or the
/// call timed out; a non-zero exit is reported through `GitOutput::ok`, because
/// plenty of the calls here fail legitimately (no upstream, no origin, ...).
pub fn run(cwd: &Path, args: &[&str]) -> Result<GitOutput> {
    let raw = run_raw(cwd, args, TIMEOUT)?;
    Ok(GitOutput {
        ok: raw.ok,
        stdout: String::from_utf8_lossy(&raw.stdout).into_owned(),
        stderr: raw.stderr,
    })
}

/// `run` with raw stdout and a caller chosen timeout, for the review commands
/// that read blobs or stage files and may take longer than a label lookup.
pub fn run_raw(cwd: &Path, args: &[&str], timeout: Duration) -> Result<RawOutput> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(cwd)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_PAGER", "cat")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            AppError::GitNotInstalled {
                message: "git was not found on PATH".to_string(),
            }
        } else {
            AppError::Io {
                message: error.to_string(),
            }
        }
    })?;

    // Drained on their own threads: polling try_wait while a pipe fills would
    // deadlock on anything that writes more than the pipe buffer.
    let stdout = child.stdout.take().map(drain);
    let stderr = child.stderr.take().map(drain);

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::GitTimeout {
                        message: format!("git {} timed out", args.join(" ")),
                    });
                }
                std::thread::sleep(POLL);
            }
            Err(error) => {
                return Err(AppError::Io {
                    message: error.to_string(),
                })
            }
        }
    };

    Ok(RawOutput {
        ok: status.success(),
        stdout: stdout.and_then(|handle| handle.join().ok()).unwrap_or_default(),
        stderr: stderr
            .and_then(|handle| handle.join().ok())
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
            .unwrap_or_default(),
    })
}

/// Trimmed stdout when the command succeeded, otherwise None.
pub fn output(cwd: &Path, args: &[&str]) -> Option<String> {
    match run(cwd, args) {
        Ok(result) if result.ok => Some(result.stdout.trim_end_matches(['\r', '\n']).to_string()),
        _ => None,
    }
}

/// Trimmed stdout, treating an empty result as absent.
pub fn value(cwd: &Path, args: &[&str]) -> Option<String> {
    output(cwd, args)
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn drain<R: Read + Send + 'static>(mut reader: R) -> std::thread::JoinHandle<Vec<u8>> {
    std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = reader.read_to_end(&mut buffer);
        buffer
    })
}
