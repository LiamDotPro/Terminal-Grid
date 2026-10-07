import { describe, expect, it } from "vitest";
import {
  focusPaneLabel,
  hotkeyHints,
  hotkeyScheme,
  isModifierHeld,
  matchHotkey,
  shortcutLabel,
  type HotkeyEventLike,
} from "./hotkeys";

const key = (code: string, mods: Partial<HotkeyEventLike> = {}): HotkeyEventLike => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

const ctrlAlt = (code: string, extra: Partial<HotkeyEventLike> = {}) =>
  key(code, { ctrlKey: true, altKey: true, ...extra });

describe("matchHotkey with Ctrl+Alt", () => {
  it("resolves the bindings the popover advertises", () => {
    expect(matchHotkey(ctrlAlt("KeyN"), "ctrl+alt")).toEqual({ type: "new-pane" });
    expect(matchHotkey(ctrlAlt("KeyW"), "ctrl+alt")).toEqual({ type: "close-pane" });
    expect(matchHotkey(ctrlAlt("KeyR"), "ctrl+alt")).toEqual({ type: "restart-pane" });
    expect(matchHotkey(ctrlAlt("ArrowLeft"), "ctrl+alt")).toEqual({
      type: "move-pane",
      dir: "left",
    });
    expect(matchHotkey(ctrlAlt("Digit3"), "ctrl+alt")).toEqual({ type: "focus-index", index: 2 });
    expect(matchHotkey(ctrlAlt("BracketLeft"), "ctrl+alt")).toEqual({ type: "page", delta: -1 });
    expect(matchHotkey(ctrlAlt("BracketRight"), "ctrl+alt")).toEqual({ type: "page", delta: 1 });
    expect(matchHotkey(ctrlAlt("Tab"), "ctrl+alt")).toEqual({ type: "toggle-tab" });
    expect(matchHotkey(ctrlAlt("Comma"), "ctrl+alt")).toEqual({ type: "open-settings" });
    expect(matchHotkey(ctrlAlt("KeyL"), "ctrl+alt")).toEqual({ type: "cycle-layout" });
    expect(matchHotkey(ctrlAlt("KeyB"), "ctrl+alt")).toEqual({ type: "notes-toggle", panel: "tree" });
    expect(matchHotkey(ctrlAlt("KeyP"), "ctrl+alt")).toEqual({ type: "notes-toggle", panel: "preview" });
    expect(matchHotkey(ctrlAlt("Enter"), "ctrl+alt")).toEqual({ type: "toggle-review" });
    expect(matchHotkey(ctrlAlt("NumpadEnter"), "ctrl+alt")).toEqual({ type: "toggle-review" });
    expect(matchHotkey(ctrlAlt("KeyS"), "ctrl+alt")).toEqual({ type: "save-note" });
  });

  it("uses Shift to qualify the chord", () => {
    expect(matchHotkey(ctrlAlt("ArrowUp", { shiftKey: true }), "ctrl+alt")).toEqual({
      type: "move-focus",
      dir: "up",
    });
    expect(matchHotkey(ctrlAlt("KeyN", { shiftKey: true }), "ctrl+alt")).toEqual({
      type: "new-pane-here",
    });
  });

  it("moves focus with plain Alt+Arrow under either modifier", () => {
    expect(matchHotkey(key("ArrowRight", { altKey: true }), "ctrl+alt")).toEqual({
      type: "move-focus",
      dir: "right",
    });
    expect(matchHotkey(key("ArrowDown", { altKey: true }), "ctrl+shift")).toEqual({
      type: "move-focus",
      dir: "down",
    });
    expect(matchHotkey(key("ArrowDown", { altKey: true, shiftKey: true }), "ctrl+alt")).toBeNull();
  });

  it("ignores the chord without the modifier, and anything with Meta", () => {
    expect(matchHotkey(key("KeyN", { ctrlKey: true }), "ctrl+alt")).toBeNull();
    expect(matchHotkey(key("KeyN", { altKey: true }), "ctrl+alt")).toBeNull();
    expect(matchHotkey(ctrlAlt("KeyN", { metaKey: true }), "ctrl+alt")).toBeNull();
  });

  it("ignores keys that are not bound", () => {
    expect(matchHotkey(ctrlAlt("KeyZ"), "ctrl+alt")).toBeNull();
    expect(matchHotkey(ctrlAlt("Digit0"), "ctrl+alt")).toBeNull();
  });

  it("takes F11 on its own", () => {
    expect(matchHotkey(key("F11"), "ctrl+alt")).toEqual({ type: "toggle-fullscreen" });
    expect(matchHotkey(key("F11", { ctrlKey: true }), "ctrl+alt")).toBeNull();
  });
});

describe("matchHotkey with Ctrl+Shift", () => {
  const ctrlShift = (code: string, extra: Partial<HotkeyEventLike> = {}) =>
    key(code, { ctrlKey: true, shiftKey: true, ...extra });

  it("swaps which modifier is primary", () => {
    expect(matchHotkey(ctrlShift("KeyW"), "ctrl+shift")).toEqual({ type: "close-pane" });
    expect(matchHotkey(ctrlAlt("KeyW"), "ctrl+shift")).toBeNull();
  });

  it("uses Alt as the qualifier", () => {
    expect(matchHotkey(ctrlShift("ArrowRight", { altKey: true }), "ctrl+shift")).toEqual({
      type: "move-focus",
      dir: "right",
    });
  });
});

describe("isModifierHeld", () => {
  it("is true only for the configured pair", () => {
    expect(isModifierHeld(key("AltLeft", { ctrlKey: true, altKey: true }), "ctrl+alt")).toBe(true);
    expect(isModifierHeld(key("ShiftLeft", { ctrlKey: true, shiftKey: true }), "ctrl+alt")).toBe(
      false,
    );
    expect(isModifierHeld(key("ShiftLeft", { ctrlKey: true, shiftKey: true }), "ctrl+shift")).toBe(
      true,
    );
  });
});

describe("hotkeyHints", () => {
  it("renders every label with the active modifier", () => {
    const hints = hotkeyHints("ctrl+shift");
    expect(hints).toHaveLength(15);
    // Alt+Arrow focus movement and F11 are the bindings that do not use the chord.
    const chorded = hints.filter((hint) => !hint.key.startsWith("Alt+") && hint.key !== "F11");
    expect(chorded).toHaveLength(hints.length - 2);
    expect(chorded.every((hint) => hint.key.startsWith("Ctrl+Shift"))).toBe(true);
  });

  it("names the secondary modifier of each chord", () => {
    expect(shortcutLabel("ctrl+alt", "new-pane-here")).toBe("Ctrl+Alt+Shift+N");
    expect(shortcutLabel("ctrl+shift", "new-pane-here")).toBe("Ctrl+Shift+Alt+N");
  });

  it("writes the macOS layout with Mac symbols only", () => {
    const hints = hotkeyHints("mac");
    expect(hints).toHaveLength(15);
    expect(hints.some((hint) => /Ctrl|Alt|Shift/.test(hint.key))).toBe(false);
    expect(shortcutLabel("mac", "toggle-review")).toBe("⌘↩");
    expect(focusPaneLabel("mac", 3)).toBe("⌘3");
    expect(focusPaneLabel("ctrl+alt", 3)).toBe("Ctrl+Alt+3");
  });
});

describe("the macOS layout", () => {
  const cmd = (code: string, extra: Partial<HotkeyEventLike> = {}) => key(code, { metaKey: true, ...extra });

  it("is used on a Mac whatever the setting says", () => {
    expect(hotkeyScheme("ctrl+shift", true)).toBe("mac");
    expect(hotkeyScheme("ctrl+shift", false)).toBe("ctrl+shift");
  });

  it("resolves Command shortcuts", () => {
    expect(matchHotkey(cmd("KeyN"), "mac")).toEqual({ type: "new-pane" });
    expect(matchHotkey(cmd("KeyT"), "mac")).toEqual({ type: "new-pane-here" });
    expect(matchHotkey(cmd("KeyW"), "mac")).toEqual({ type: "close-pane" });
    expect(matchHotkey(cmd("KeyR"), "mac")).toEqual({ type: "restart-pane" });
    expect(matchHotkey(cmd("Digit4"), "mac")).toEqual({ type: "focus-index", index: 3 });
    expect(matchHotkey(cmd("Enter"), "mac")).toEqual({ type: "toggle-review" });
    expect(matchHotkey(cmd("Comma"), "mac")).toEqual({ type: "open-settings" });
    expect(matchHotkey(cmd("KeyL"), "mac")).toEqual({ type: "cycle-layout" });
    expect(matchHotkey(cmd("KeyB"), "mac")).toEqual({ type: "notes-toggle", panel: "tree" });
    expect(matchHotkey(cmd("BracketRight", { shiftKey: true }), "mac")).toEqual({ type: "page", delta: 1 });
    expect(matchHotkey(cmd("BracketLeft"), "mac")).toEqual({ type: "page", delta: -1 });
    expect(matchHotkey(cmd("KeyF", { ctrlKey: true }), "mac")).toEqual({ type: "toggle-fullscreen" });
    expect(matchHotkey(cmd("KeyS"), "mac")).toEqual({ type: "save-note" });
  });

  it("moves focus with Option+Command and panes with Control+Command", () => {
    expect(matchHotkey(cmd("ArrowLeft", { altKey: true }), "mac")).toEqual({ type: "move-focus", dir: "left" });
    expect(matchHotkey(cmd("ArrowUp", { ctrlKey: true }), "mac")).toEqual({ type: "move-pane", dir: "up" });
    // ⌘← is line start in a text box; it is not ours.
    expect(matchHotkey(cmd("ArrowLeft"), "mac")).toBeNull();
  });

  it("switches tabs with Control+Tab", () => {
    expect(matchHotkey(key("Tab", { ctrlKey: true }), "mac")).toEqual({ type: "toggle-tab" });
  });

  it("leaves Option and Control keys to the shell", () => {
    expect(matchHotkey(key("ArrowLeft", { altKey: true }), "mac")).toBeNull();
    expect(matchHotkey(key("KeyN", { ctrlKey: true, altKey: true }), "mac")).toBeNull();
    expect(matchHotkey(key("F11"), "mac")).toBeNull();
  });

  it("leaves Command keys it does not bind to the system", () => {
    expect(matchHotkey(cmd("KeyC"), "mac")).toBeNull();
    expect(matchHotkey(cmd("KeyV"), "mac")).toBeNull();
    expect(matchHotkey(cmd("KeyQ"), "mac")).toBeNull();
    expect(matchHotkey(cmd("KeyN", { shiftKey: true }), "mac")).toBeNull();
  });

  it("treats Command alone as the modifier being held", () => {
    expect(isModifierHeld(key("MetaLeft", { metaKey: true }), "mac")).toBe(true);
    expect(isModifierHeld(key("ControlLeft", { ctrlKey: true, altKey: true }), "mac")).toBe(false);
  });
});
