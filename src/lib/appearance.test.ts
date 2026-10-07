import { describe, expect, it, vi } from "vitest";

// The registry owns xterm, which needs a DOM; resolveTheme does not.
vi.mock("../terminals/registry", () => ({ terminalRegistry: { setTheme: vi.fn() } }));
vi.mock("./windowFrame", () => ({ useWindowFrame: () => "windowed" }));

const { hexToChannels, resolveTheme } = await import("./appearance");

describe("hexToChannels", () => {
  it("turns #rrggbb into the channels the tokens use", () => {
    expect(hexToChannels("#8ddcff")).toBe("141 220 255");
    expect(hexToChannels("#FF0080")).toBe("255 0 128");
  });

  it("gives null for no colour or a malformed one", () => {
    expect(hexToChannels(null)).toBeNull();
    expect(hexToChannels("#fff")).toBeNull();
    expect(hexToChannels("orange")).toBeNull();
  });
});

describe("resolveTheme", () => {
  it("follows the OS while the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });

  it("keeps an explicit choice whatever the OS says", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("black", true)).toBe("black");
  });

  it("only gives glass on macOS, falling back to dark elsewhere", () => {
    expect(resolveTheme("glass", true, true)).toBe("glass");
    expect(resolveTheme("glass", false, false)).toBe("dark");
  });

  it("shows glass as dark in fullscreen, where nothing is behind the window", () => {
    expect(resolveTheme("glass", false, true, true)).toBe("dark");
    expect(resolveTheme("dark", false, true, true)).toBe("dark");
  });
});
