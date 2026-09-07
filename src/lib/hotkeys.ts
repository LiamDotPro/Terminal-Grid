/**
 * Keyboard shortcuts. The bindings are the ones the design's hotkey popover
 * advertises (Terminal Grid.dc.html, screen 1d), plus the aliases from
 * docs/technical-design.md section 6 that do not collide with them.
 *
 * Matching is done on `KeyboardEvent.code`, never on `key`: with Ctrl+Alt held
 * Windows treats the combination as AltGr on Dutch and US-international
 * layouts, so `key` is unreliable for letters, digits and brackets.
 */
import type { HotkeyModifier } from "../ipc/types";
import type { Direction } from "../ipc/layout";

export type HotkeyAction =
  | { type: "new-pane" }
  | { type: "new-pane-here" }
  | { type: "close-pane" }
  | { type: "restart-pane" }
  | { type: "move-pane"; dir: Direction }
  | { type: "move-focus"; dir: Direction }
  | { type: "focus-index"; index: number }
  | { type: "page"; delta: -1 | 1 }
  | { type: "toggle-tab" }
  | { type: "set-tab"; tab: "terminals" | "notes" }
  | { type: "open-settings" }
  | { type: "toggle-fullscreen" };

const ARROWS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export interface HotkeyEventLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}

/** Human readable form of the modifier, used in the popover and the empty state. */
export function modifierLabel(modifier: HotkeyModifier): string {
  return modifier === "ctrl+shift" ? "Ctrl+Shift" : "Ctrl+Alt";
}

/**
 * True while the chord modifier itself is held down. The chrome uses this to
 * reveal the hotkey popover without a click.
 */
export function isModifierHeld(event: HotkeyEventLike, modifier: HotkeyModifier): boolean {
  return modifier === "ctrl+shift"
    ? event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
    : event.ctrlKey && event.altKey && !event.metaKey;
}

/**
 * Resolves a key event to an action, or null when it is not one of ours.
 * The "secondary" modifier (Shift for Ctrl+Alt, Alt for Ctrl+Shift) turns a
 * pane move into a focus move and a new pane into a new pane in the same cwd.
 */
export function matchHotkey(event: HotkeyEventLike, modifier: HotkeyModifier): HotkeyAction | null {
  if (event.code === "F11" && !event.ctrlKey && !event.altKey && !event.metaKey) {
    return { type: "toggle-fullscreen" };
  }
  if (!event.ctrlKey || event.metaKey) return null;
  if (modifier === "ctrl+shift" ? !event.shiftKey : !event.altKey) return null;

  // The other of the two modifiers qualifies the chord: focus move instead of
  // pane move, new pane in the same cwd instead of a folder picker.
  const secondary = modifier === "ctrl+shift" ? event.altKey : event.shiftKey;

  const arrow = ARROWS[event.code];
  if (arrow) return secondary ? { type: "move-focus", dir: arrow } : { type: "move-pane", dir: arrow };

  const digit = /^Digit([1-9])$/.exec(event.code);
  if (digit) return { type: "focus-index", index: Number(digit[1]) - 1 };

  switch (event.code) {
    case "KeyN":
      return secondary ? { type: "new-pane-here" } : { type: "new-pane" };
    case "KeyW":
      return { type: "close-pane" };
    case "KeyR":
      return { type: "restart-pane" };
    case "BracketLeft":
    case "PageUp":
      return { type: "page", delta: -1 };
    case "BracketRight":
    case "PageDown":
      return { type: "page", delta: 1 };
    case "Tab":
      return { type: "toggle-tab" };
    case "KeyT":
      return { type: "set-tab", tab: "terminals" };
    case "KeyM":
      return { type: "set-tab", tab: "notes" };
    case "Comma":
      return { type: "open-settings" };
    default:
      return null;
  }
}

export interface HotkeyHint {
  label: string;
  key: string;
}

/** The list rendered by the hotkey popover, in the design's order. */
export function hotkeyHints(modifier: HotkeyModifier): HotkeyHint[] {
  const mod = modifierLabel(modifier);
  return [
    { label: "New pane", key: `${mod}+N` },
    { label: "Close pane", key: `${mod}+W` },
    { label: "Restart shell", key: `${mod}+R` },
    { label: "Move pane", key: `${mod}+←↑↓→` },
    { label: "Focus pane 1–9", key: `${mod}+1…9` },
    { label: "Previous / next page", key: `${mod}+[ ]` },
    { label: "Notes / Terminals", key: `${mod}+Tab` },
    { label: "Settings", key: `${mod}+,` },
  ];
}
