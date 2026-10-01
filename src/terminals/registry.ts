/**
 * Owns the xterm.js instances.
 *
 * They live outside React because a terminal must survive every re-render, a
 * page switch and a reorder: the registry keeps a detached host element per
 * session and React only ever re-parents it. Nothing here dispatches; the
 * callbacks handed to `configure` bridge back into the reducer.
 */
import { Terminal } from "@xterm/xterm";
import type { IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import type { Config, HotkeyModifier, TerminalId } from "../ipc/types";
import { isModifierHeld } from "../lib/hotkeys";
import { clipboardIntent } from "./clipboard";
import { parseOsc7, parseOsc133, parseOsc7777 } from "./osc";
import { TERMINAL_THEME } from "./theme";

export interface RegistryCallbacks {
  onData(id: TerminalId, data: string): void;
  onResize(id: TerminalId, cols: number, rows: number): void;
  onCwd(id: TerminalId, cwd: string): void;
  onCommand(id: TerminalId, command: string): void;
  onCommandEnd(id: TerminalId, exitCode: number | null): void;
  /** The shell finished drawing its prompt and waits for input (OSC 133;B). */
  onPrompt(id: TerminalId): void;
  onBell(id: TerminalId): void;
  onFocus(id: TerminalId): void;
}

interface Entry {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  observer: ResizeObserver;
  disposables: IDisposable[];
  lastOutputAt: number;
  cols: number;
  rows: number;
}

const NOOP_CALLBACKS: RegistryCallbacks = {
  onData: () => {},
  onResize: () => {},
  onCwd: () => {},
  onCommand: () => {},
  onCommandEnd: () => {},
  onPrompt: () => {},
  onBell: () => {},
  onFocus: () => {},
};

/** Cap on output held for a session whose terminal does not exist yet. */
const EARLY_OUTPUT_LIMIT = 256 * 1024;

export class TerminalRegistry {
  private readonly entries = new Map<TerminalId, Entry>();
  /**
   * Output that arrived before the session's terminal was created. A shell
   * spawned under ConPTY asks for the cursor position and blocks until the
   * terminal answers, so dropping these bytes hangs it before its first
   * prompt; on session restore that was every pane but the last.
   */
  private readonly early = new Map<TerminalId, Uint8Array[]>();
  private readonly disposed = new Set<TerminalId>();
  private callbacks: RegistryCallbacks = NOOP_CALLBACKS;
  private modifier: HotkeyModifier = "ctrl+alt";
  private options: Pick<Config, "fontFamily" | "fontSize" | "scrollback"> = {
    fontFamily: null,
    fontSize: 14,
    scrollback: 10000,
  };

  /** Wires the registry to the app. Safe to call on every config change. */
  configure(callbacks: RegistryCallbacks, config: Config): void {
    this.callbacks = callbacks;
    this.modifier = config.hotkeyModifier;
    this.options = {
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      scrollback: config.scrollback,
    };
    for (const entry of this.entries.values()) this.applyOptions(entry.term);
  }

  has(id: TerminalId): boolean {
    return this.entries.has(id);
  }

  /** Creates the terminal for a session if it does not exist yet. */
  ensure(id: TerminalId): Entry {
    const existing = this.entries.get(id);
    if (existing) return existing;

    const host = document.createElement("div");
    host.className = "xterm-host";

    const term = new Terminal({
      allowProposedApi: true,
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      drawBoldTextInBrightColors: true,
      fontSize: this.options.fontSize,
      fontFamily: fontStack(this.options.fontFamily),
      lineHeight: 1.2,
      letterSpacing: 0,
      macOptionIsMeta: false,
      minimumContrastRatio: 1,
      scrollback: this.options.scrollback,
      theme: TERMINAL_THEME,
      windowsPty: { backend: "conpty" },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    loadWebgl(term);

    // xterm must never swallow the app chord (design section 6), and the
    // system clipboard keys go to the browser so paste and copy just work.
    term.attachCustomKeyEventHandler((event) => {
      if (isModifierHeld(event, this.modifier)) return false;
      const intent = clipboardIntent(event, term.hasSelection());
      if (!intent) return true;
      if (intent.kind === "copy" && event.type === "keydown") {
        // The browser copies on this key; drop the selection afterwards so the
        // next Ctrl+C is an interrupt again, as in Windows Terminal.
        window.setTimeout(() => term.clearSelection(), 0);
      }
      return false;
    });

    const disposables: IDisposable[] = [
      term.onData((data) => this.callbacks.onData(id, data)),
      term.onBinary((data) => this.callbacks.onData(id, data)),
      term.onBell(() => this.callbacks.onBell(id)),
      term.parser.registerOscHandler(7, (payload) => {
        const cwd = parseOsc7(payload);
        if (cwd) this.callbacks.onCwd(id, cwd);
        return true;
      }),
      term.parser.registerOscHandler(133, (payload) => {
        const mark = parseOsc133(payload);
        if (mark?.kind === "command-end") this.callbacks.onCommandEnd(id, mark.exitCode);
        if (mark?.kind === "prompt-end") this.callbacks.onPrompt(id);
        return true;
      }),
      term.parser.registerOscHandler(7777, (payload) => {
        const command = parseOsc7777(payload);
        if (command) this.callbacks.onCommand(id, command);
        return true;
      }),
    ];

    host.addEventListener("focusin", () => this.callbacks.onFocus(id));

    const entry: Entry = {
      term,
      fit,
      host,
      observer: new ResizeObserver(() => this.fit(id)),
      disposables,
      lastOutputAt: Date.now(),
      cols: term.cols,
      rows: term.rows,
    };
    entry.observer.observe(host);
    this.entries.set(id, entry);

    const early = this.early.get(id);
    if (early) {
      this.early.delete(id);
      for (const chunk of early) term.write(chunk);
    }
    return entry;
  }

  /** Moves the session's terminal element into `slot`. Idempotent. */
  attach(id: TerminalId, slot: HTMLElement): void {
    const entry = this.ensure(id);
    if (entry.host.parentElement !== slot) slot.appendChild(entry.host);
    this.fit(id);
  }

  write(id: TerminalId, data: Uint8Array): void {
    const entry = this.entries.get(id);
    if (!entry) {
      if (!this.disposed.has(id)) this.hold(id, data);
      return;
    }
    entry.lastOutputAt = Date.now();
    entry.term.write(data);
  }

  /** Clears the screen and scrollback, used when a session is restarted. */
  reset(id: TerminalId): void {
    this.entries.get(id)?.term.reset();
  }

  focus(id: TerminalId): void {
    this.entries.get(id)?.term.focus();
  }

  blurAll(): void {
    for (const entry of this.entries.values()) entry.term.blur();
  }

  /** Refits a terminal to its slot and reports the new size when it changed. */
  fit(id: TerminalId): void {
    const entry = this.entries.get(id);
    if (!entry || entry.host.clientWidth === 0 || entry.host.clientHeight === 0) return;
    try {
      entry.fit.fit();
    } catch {
      // proposeDimensions throws while the element is being torn down.
      return;
    }
    if (entry.term.cols === entry.cols && entry.term.rows === entry.rows) return;
    entry.cols = entry.term.cols;
    entry.rows = entry.term.rows;
    this.callbacks.onResize(id, entry.cols, entry.rows);
  }

  fitAll(): void {
    for (const id of this.entries.keys()) this.fit(id);
  }

  size(id: TerminalId): { cols: number; rows: number } {
    const entry = this.entries.get(id);
    return entry ? { cols: entry.cols, rows: entry.rows } : { cols: 80, rows: 24 };
  }

  /** Snapshot of the last time each session produced output, for the idle check. */
  activity(): Record<TerminalId, number> {
    const out: Record<TerminalId, number> = {};
    for (const [id, entry] of this.entries) out[id] = entry.lastOutputAt;
    return out;
  }

  dispose(id: TerminalId): void {
    this.early.delete(id);
    this.disposed.add(id);
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.observer.disconnect();
    for (const disposable of entry.disposables) disposable.dispose();
    entry.term.dispose();
    entry.host.remove();
    this.entries.delete(id);
  }

  disposeAll(): void {
    for (const id of [...this.entries.keys()]) this.dispose(id);
  }

  private hold(id: TerminalId, data: Uint8Array): void {
    const chunks = this.early.get(id) ?? [];
    let size = chunks.reduce((total, chunk) => total + chunk.length, data.length);
    // Keep the newest bytes when a session floods before it is shown.
    while (size > EARLY_OUTPUT_LIMIT && chunks.length > 0) size -= chunks.shift()!.length;
    chunks.push(data);
    this.early.set(id, chunks);
  }

  private applyOptions(term: Terminal): void {
    term.options.fontFamily = fontStack(this.options.fontFamily);
    term.options.fontSize = this.options.fontSize;
    term.options.scrollback = this.options.scrollback;
  }
}

function fontStack(family: string | null): string {
  const preferred = family?.trim();
  const fallback = '"JetBrains Mono", "Cascadia Mono", Consolas, monospace';
  return preferred ? `"${preferred}", ${fallback}` : fallback;
}

/**
 * WebGL is a large win with nine live terminals (design section 13) but is not
 * available on every WebView2 build, and the context can be lost at runtime.
 * Both cases fall back to the DOM renderer without taking the pane down.
 */
function loadWebgl(term: Terminal): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // DOM renderer stays active.
  }
}

export const terminalRegistry = new TerminalRegistry();
