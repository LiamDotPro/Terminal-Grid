import { describe, expect, it } from "vitest";
import { cdCommand, clearLineKey } from "./shellCommand";

describe("cdCommand", () => {
  it("uses Set-Location with literal quoting in PowerShell", () => {
    expect(cdCommand("pwsh", "C:/dev/app's tree")).toBe("Set-Location -LiteralPath 'C:/dev/app''s tree'");
    expect(cdCommand("windowsPowerShell", "C:/dev/app")).toBe("Set-Location -LiteralPath 'C:/dev/app'");
  });

  it("switches drives and uses backslashes in cmd", () => {
    expect(cdCommand("cmd", "D:/work/my app")).toBe('cd /d "D:\\work\\my app"');
  });

  it("single quotes the path in bash and zsh", () => {
    expect(cdCommand("bash", "/home/me/it's here")).toBe("cd '/home/me/it'\\''s here'");
    expect(cdCommand("zsh", "/srv/app")).toBe("cd '/srv/app'");
  });

  it("falls back to a plain double quoted cd", () => {
    expect(cdCommand("other", "/srv/app")).toBe('cd "/srv/app"');
  });
});

describe("clearLineKey", () => {
  it("is Escape on Windows shells, Ctrl+U on POSIX ones, nothing when unknown", () => {
    expect(clearLineKey("pwsh")).toBe("\x1b");
    expect(clearLineKey("cmd")).toBe("\x1b");
    expect(clearLineKey("bash")).toBe("\x15");
    expect(clearLineKey("other")).toBeNull();
  });
});
