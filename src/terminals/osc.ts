/**
 * OSC sequence payload parsing for the shell integration script
 * (docs/technical-design.md section 4.5). The xterm handlers hand us the raw
 * payload with the `ESC ] <id> ;` prefix and the terminator already stripped;
 * everything below is pure so it can be unit tested without a terminal.
 */

/** OSC 7: `file://<host>/<path>` -> a filesystem path. */
export function parseOsc7(payload: string): string | null {
  const match = /^file:\/\/([^/]*)(\/.*)$/.exec(payload.trim());
  if (!match) return null;
  let path = decodeUriComponentSafe(match[2]);
  // Windows paths arrive as /C:/Users/... — drop the leading slash.
  if (/^\/[a-zA-Z]:/.test(path)) path = path.slice(1);
  return path.replace(/\\/g, "/");
}

export type ShellIntegrationMark =
  | { kind: "prompt-start" }
  | { kind: "prompt-end" }
  | { kind: "command-start" }
  | { kind: "command-end"; exitCode: number | null };

/** OSC 133: `A` prompt start, `B` prompt end, `C` command start, `D[;code]` command end. */
export function parseOsc133(payload: string): ShellIntegrationMark | null {
  const [mark, ...rest] = payload.split(";");
  switch (mark) {
    case "A":
      return { kind: "prompt-start" };
    case "B":
      return { kind: "prompt-end" };
    case "C":
      return { kind: "command-start" };
    case "D": {
      const raw = rest[0];
      const code = raw === undefined || raw === "" ? null : Number.parseInt(raw, 10);
      return { kind: "command-end", exitCode: code === null || Number.isNaN(code) ? null : code };
    }
    default:
      return null;
  }
}

/** OSC 7777: `cmd;<base64 utf-8>` — the command line that just finished. */
export function parseOsc7777(payload: string): string | null {
  const sep = payload.indexOf(";");
  if (sep === -1) return null;
  if (payload.slice(0, sep) !== "cmd") return null;
  return decodeBase64Utf8(payload.slice(sep + 1));
}

/**
 * OSC 52: `<targets>;<base64 utf-8>` — a program setting the clipboard, as
 * Claude Code does with text selected inside its own mouse-driven view. A `?`
 * is a read request and carries no text.
 */
export function parseOsc52(payload: string): string | null {
  const sep = payload.indexOf(";");
  if (sep === -1) return null;
  const data = payload.slice(sep + 1);
  if (data === "" || data === "?") return null;
  return decodeBase64Utf8(data) || null;
}

/** True when a command line looks like one of the configured agent patterns. */
export function matchesAgentPattern(commandLine: string, patterns: string[]): string | null {
  const haystack = commandLine.toLowerCase();
  for (const pattern of patterns) {
    const needle = pattern.trim().toLowerCase();
    if (needle && haystack.includes(needle)) return pattern;
  }
  return null;
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return null;
  }
}
