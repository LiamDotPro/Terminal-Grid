import { describe, expect, it, vi } from "vitest";

// The registry owns xterm, which needs a DOM; resolveTheme does not.
vi.mock("../terminals/registry", () => ({ terminalRegistry: { setTheme: vi.fn() } }));

const { resolveTheme } = await import("./appearance");

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
});
