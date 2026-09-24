import { describe, expect, it } from "vitest";
import { clipboardIntent, type ClipboardKeyEvent } from "./clipboard";

const key = (code: string, mods: Partial<ClipboardKeyEvent> = {}): ClipboardKeyEvent => ({
  type: "keydown",
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("clipboardIntent", () => {
  it("pastes on Ctrl+V and Shift+Insert", () => {
    expect(clipboardIntent(key("KeyV", { ctrlKey: true }), false)).toEqual({ kind: "paste" });
    expect(clipboardIntent(key("KeyV", { ctrlKey: true, shiftKey: true }), false)).toEqual({
      kind: "paste",
    });
    expect(clipboardIntent(key("Insert", { shiftKey: true }), false)).toEqual({ kind: "paste" });
  });

  it("copies on Ctrl+C only while something is selected", () => {
    expect(clipboardIntent(key("KeyC", { ctrlKey: true }), true)).toEqual({ kind: "copy" });
    // No selection: Ctrl+C must still interrupt the running command.
    expect(clipboardIntent(key("KeyC", { ctrlKey: true }), false)).toBeNull();
    expect(clipboardIntent(key("Insert", { ctrlKey: true }), false)).toEqual({ kind: "copy" });
  });

  it("leaves everything else to the terminal", () => {
    expect(clipboardIntent(key("KeyV"), false)).toBeNull();
    expect(clipboardIntent(key("KeyV", { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(clipboardIntent(key("KeyV", { metaKey: true }), false)).toBeNull();
    expect(clipboardIntent(key("Insert"), false)).toBeNull();
    expect(clipboardIntent(key("KeyA", { ctrlKey: true }), true)).toBeNull();
  });
});
