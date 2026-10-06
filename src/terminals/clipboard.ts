/**
 * Which keys the terminal hands back to the browser so the system clipboard
 * shortcuts behave the way they do everywhere else on Windows.
 *
 * xterm.js would otherwise turn Ctrl+V into a raw ^V for the shell and Ctrl+C
 * into an interrupt even while text is selected. Returning "native" for a key
 * makes xterm ignore it, the browser then fires its own copy/paste event on the
 * terminal element, and xterm's listeners for those events do the actual work
 * (including bracketed paste for shells that ask for it).
 */

export interface ClipboardKeyEvent {
  type: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type ClipboardIntent =
  /** Let the browser paste into the terminal. */
  | { kind: "paste" }
  /** Let the browser copy the terminal's selection. */
  | { kind: "copy" }
  /** Not a clipboard key; xterm handles it as usual. */
  | null;

/**
 * Ctrl+V, Shift+Insert paste. Ctrl+C with a selection and Ctrl+Insert copy.
 * Ctrl+C without a selection still reaches the shell as an interrupt.
 *
 * On macOS the clipboard is ⌘C / ⌘V, which the app's Edit menu turns into the
 * same copy and paste events, so every Ctrl key stays the shell's: Ctrl+C is
 * always an interrupt and Ctrl+V the literal-next key, as in Terminal.
 */
export function clipboardIntent(
  event: ClipboardKeyEvent,
  hasSelection: boolean,
  mac = false,
): ClipboardIntent {
  if (mac || event.metaKey || event.altKey) return null;

  if (event.code === "Insert") {
    if (event.ctrlKey && !event.shiftKey) return { kind: "copy" };
    if (event.shiftKey && !event.ctrlKey) return { kind: "paste" };
    return null;
  }

  if (!event.ctrlKey) return null;
  if (event.code === "KeyV") return { kind: "paste" };
  if (event.code === "KeyC" && !event.shiftKey && hasSelection) return { kind: "copy" };
  return null;
}
