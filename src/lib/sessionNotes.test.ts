import { describe, expect, it } from "vitest";
import {
  cleanSelection,
  folderFor,
  noteContent,
  noteFromSelection,
  savedAgo,
  slugFrom,
  splitHeading,
  titleFrom,
  uniqueNotePath,
} from "./sessionNotes";

describe("cleanSelection", () => {
  it("drops the agent bullet, trailing padding and the hanging indent", () => {
    const text = "\r\n⏺ WebGL context loss after sleep.   \r\n  The addon loses its context.\r\n\r\n    1. listen   \r\n\r\n";
    expect(cleanSelection(text)).toBe("WebGL context loss after sleep.\nThe addon loses its context.\n\n  1. listen");
  });

  it("returns nothing for a blank selection", () => {
    expect(cleanSelection("  \n \n")).toBe("");
  });
});

describe("titleFrom", () => {
  it("takes the first line without markdown marks or a closing colon", () => {
    expect(titleFrom("\n## The `WebGL` fix:\nbody")).toBe("The WebGL fix");
    expect(titleFrom("- **first** item")).toBe("first item");
  });

  it("cuts a long line at a word", () => {
    const title = titleFrom("word ".repeat(40));
    expect(title.length).toBeLessThanOrEqual(73);
    expect(title.endsWith("word…")).toBe(true);
  });

  it("falls back to Note", () => {
    expect(titleFrom("")).toBe("Note");
  });
});

describe("noteFromSelection", () => {
  it("moves the first line into the title", () => {
    expect(noteFromSelection("⏺ WebGL context loss after sleep\n\n  Fix:\n  1. listen")).toEqual({
      title: "WebGL context loss after sleep",
      body: "Fix:\n1. listen",
    });
    expect(noteFromSelection("one line")).toEqual({ title: "one line", body: "" });
    expect(noteFromSelection("   ")).toBeNull();
  });

  it("keeps a first line that was cut short in the body", () => {
    const long = "word ".repeat(30).trim();
    expect(noteFromSelection(long)?.body).toBe(long);
  });
});

describe("slugFrom", () => {
  it("keeps a few lower case words", () => {
    expect(slugFrom("WebGL context loss after sleep")).toBe("webgl-context-loss-after-sleep");
    expect(slugFrom("Crème brûlée: one, two, three, four, five, six")).toBe("creme-brulee-one-two-three-four");
    expect(slugFrom("…")).toBe("note");
  });
});

describe("paths", () => {
  it("cleans the repo folder and numbers a taken name", () => {
    expect(folderFor("my/repo:x")).toBe("my-repo-x");
    expect(folderFor(".hidden")).toBe("hidden");
    const taken = new Set(["repo/a.md", "repo/a-2.md"]);
    expect(uniqueNotePath("repo", "a", taken)).toBe("repo/a-3.md");
    expect(uniqueNotePath("repo", "b", taken)).toBe("repo/b.md");
    expect(uniqueNotePath("", "b", taken)).toBe("b.md");
  });
});

describe("note content", () => {
  it("round trips the heading", () => {
    const content = noteContent("Title", "Body\n\nMore");
    expect(content).toBe("# Title\n\nBody\n\nMore\n");
    expect(splitHeading(content)).toEqual({ heading: "Title", body: "Body\n\nMore\n" });
    expect(splitHeading("No heading")).toEqual({ heading: null, body: "No heading" });
  });
});

describe("savedAgo", () => {
  it("says just now, a clock time, yesterday", () => {
    const now = new Date(2026, 9, 7, 15, 0).getTime();
    expect(savedAgo(now - 10_000, now)).toBe("just now");
    expect(savedAgo(new Date(2026, 9, 7, 14, 2).getTime(), now)).toBe("14:02");
    expect(savedAgo(new Date(2026, 9, 6, 9, 0).getTime(), now)).toBe("yesterday");
  });
});
