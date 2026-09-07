import { describe, expect, it } from "vitest";
import { hotkeyHints, isModifierHeld, matchHotkey, type HotkeyEventLike } from "./hotkeys";

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
    expect(hints).toHaveLength(8);
    expect(hints.every((hint) => hint.key.startsWith("Ctrl+Shift"))).toBe(true);
  });
});
