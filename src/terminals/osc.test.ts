import { describe, expect, it } from "vitest";
import { matchesAgentPattern, parseOsc7, parseOsc52, parseOsc133, parseOsc7777 } from "./osc";

describe("parseOsc7", () => {
  it("reads a Windows path", () => {
    expect(parseOsc7("file://localhost/C:/Users/liam/dev/app")).toBe("C:/Users/liam/dev/app");
  });

  it("reads a POSIX path", () => {
    expect(parseOsc7("file://localhost/home/liam/dev")).toBe("/home/liam/dev");
  });

  it("decodes percent escapes", () => {
    expect(parseOsc7("file://localhost/C:/dev/my%20repo")).toBe("C:/dev/my repo");
  });

  it("rejects anything that is not a file url", () => {
    expect(parseOsc7("https://example.com/x")).toBeNull();
    expect(parseOsc7("")).toBeNull();
  });
});

describe("parseOsc133", () => {
  it("reads the prompt and command marks", () => {
    expect(parseOsc133("A")).toEqual({ kind: "prompt-start" });
    expect(parseOsc133("B")).toEqual({ kind: "prompt-end" });
    expect(parseOsc133("C")).toEqual({ kind: "command-start" });
  });

  it("reads the exit code from a command end", () => {
    expect(parseOsc133("D;0")).toEqual({ kind: "command-end", exitCode: 0 });
    expect(parseOsc133("D;130")).toEqual({ kind: "command-end", exitCode: 130 });
    expect(parseOsc133("D")).toEqual({ kind: "command-end", exitCode: null });
    expect(parseOsc133("D;nope")).toEqual({ kind: "command-end", exitCode: null });
  });

  it("ignores marks it does not know", () => {
    expect(parseOsc133("P;k=i")).toBeNull();
  });
});

describe("parseOsc7777", () => {
  const encode = (value: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(value)));

  it("decodes the last command line", () => {
    expect(parseOsc7777(`cmd;${encode("claude --resume")}`)).toBe("claude --resume");
  });

  it("survives non-ascii command lines", () => {
    expect(parseOsc7777(`cmd;${encode("git commit -m 'café ☕'")}`)).toBe(
      "git commit -m 'café ☕'",
    );
  });

  it("rejects a different sub-command or broken base64", () => {
    expect(parseOsc7777(`other;${encode("x")}`)).toBeNull();
    expect(parseOsc7777("cmd")).toBeNull();
  });
});

describe("parseOsc52", () => {
  const encode = (value: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(value)));

  it("decodes the text a program put on the clipboard", () => {
    expect(parseOsc52(`c;${encode("Selected — text")}`)).toBe("Selected — text");
  });

  it("ignores read requests, empty writes and missing targets", () => {
    expect(parseOsc52("c;?")).toBeNull();
    expect(parseOsc52("c;")).toBeNull();
    expect(parseOsc52(`c;${encode("   ")}`)).toBeNull();
    expect(parseOsc52("nothing")).toBeNull();
  });
});

describe("matchesAgentPattern", () => {
  const patterns = ["claude", "codex", "aider"];

  it("matches anywhere in the command line, case insensitively", () => {
    expect(matchesAgentPattern("node C:/npm/Claude/cli.js", patterns)).toBe("claude");
    expect(matchesAgentPattern("codex --full-auto", patterns)).toBe("codex");
  });

  it("returns null when nothing matches", () => {
    expect(matchesAgentPattern("pnpm test", patterns)).toBeNull();
    expect(matchesAgentPattern("claude", [])).toBeNull();
  });
});
