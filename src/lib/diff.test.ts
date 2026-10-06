import { describe, expect, it } from "vitest";
import {
  changeStarts,
  countChanges,
  diffLines,
  editorMarks,
  layoutRows,
  overviewTicks,
  splitLines,
  type DiffRow,
} from "./diff";

const kinds = (rows: DiffRow[]) => rows.map((row) => row.kind).join(" ");

/** Applying the diff to the old lines has to give the new lines back. */
function apply(rows: DiffRow[]): { old: string[]; new: string[] } {
  return {
    old: rows.filter((row) => row.kind !== "add").map((row) => row.text),
    new: rows.filter((row) => row.kind !== "del").map((row) => row.text),
  };
}

describe("splitLines", () => {
  it("does not add an empty line for the final newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("diffLines", () => {
  it("marks identical files as context only", () => {
    expect(kinds(diffLines(["a", "b"], ["a", "b"]))).toBe("ctx ctx");
  });

  it("finds a replaced line with removals before additions", () => {
    const rows = diffLines(["a", "b", "c"], ["a", "B", "c"]);
    expect(kinds(rows)).toBe("ctx del add ctx");
    expect(rows[1]).toMatchObject({ old: 2, new: null, text: "b" });
    expect(rows[2]).toMatchObject({ old: null, new: 2, text: "B" });
    expect(rows[3]).toMatchObject({ old: 3, new: 3 });
  });

  it("handles files created and deleted", () => {
    expect(kinds(diffLines([], ["a", "b"]))).toBe("add add");
    expect(kinds(diffLines(["a"], []))).toBe("del");
  });

  it("produces a minimal, reversible script on scattered edits", () => {
    const a = "the quick brown fox jumps over the lazy dog".split(" ");
    const b = "the slow brown cat jumps over a lazy dog today".split(" ");
    const rows = diffLines(a, b);
    expect(apply(rows)).toEqual({ old: a, new: b });
    expect(countChanges(rows)).toEqual({ additions: 4, deletions: 3 });
  });

  it("stays correct on random edits", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let round = 0; round < 50; round++) {
      const a = Array.from({ length: 30 }, () => String(Math.floor(random() * 6)));
      const b = a.filter(() => random() > 0.2).map((line) => (random() > 0.85 ? `${line}!` : line));
      expect(apply(diffLines(a, b))).toEqual({ old: a, new: b });
    }
  });
});

describe("layoutRows", () => {
  const old = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  const next = old.map((line, i) => (i === 14 ? "changed" : line));
  const rows = diffLines(old, next);

  it("shows a change with three lines of context and a hunk header", () => {
    const items = layoutRows(rows, { view: "changes" });
    expect(items[0]).toEqual({ kind: "sep", header: "@@ -12,7 +12,7 @@", hidden: 11, gapStart: 0 });
    expect(items.filter((item) => item.kind === "row")).toHaveLength(8);
    expect(items[items.length - 1]).toMatchObject({ kind: "sep", hidden: 12 });
  });

  it("opens a gap the user expanded", () => {
    const items = layoutRows(rows, { view: "changes", expanded: new Set([0]) });
    expect(items[0]).toMatchObject({ kind: "sep", hidden: 0, gapStart: null });
    expect(items.filter((item) => item.kind === "row")).toHaveLength(19);
  });

  it("keeps a pinned line visible", () => {
    const items = layoutRows(rows, { view: "changes", pinned: new Set([1]) });
    expect(items.some((item) => item.kind === "row" && item.index === 1)).toBe(true);
  });

  it("draws every line in the whole file view", () => {
    const items = layoutRows(rows, { view: "file" });
    expect(items.every((item) => item.kind === "row")).toBe(true);
    expect(items).toHaveLength(rows.length);
  });

  it("finds where each change starts", () => {
    expect(changeStarts(rows)).toEqual([14]);
  });
});

describe("editorMarks", () => {
  it("tells added, modified and unsaved lines apart", () => {
    const base = ["a", "b", "c"];
    const disk = ["a", "B", "c", "d"];
    const buffer = ["a", "B", "C!", "d"];
    expect(editorMarks(base, disk, buffer).map((line) => line.mark)).toEqual(["none", "mod", "edit", "add"]);
  });

  it("does not mark a retyped line as removed", () => {
    const marks = editorMarks(["a", "b", "c"], ["a", "b", "c"], ["a", "B", "c"]);
    expect(marks.map((line) => line.removedAbove)).toEqual([0, 0, 0]);
    expect(marks[1]!.mark).toBe("edit");
  });

  it("puts a removal marker on the line below the removed ones", () => {
    const marks = editorMarks(["a", "b", "c", "d"], ["a", "d"], ["a", "d"]);
    expect(marks[1]).toEqual({ mark: "none", removedAbove: 2 });
  });
});

describe("overviewTicks", () => {
  it("merges runs and positions them as fractions", () => {
    expect(overviewTicks(["none", "add", "add", "none"])).toEqual([{ kind: "add", top: 0.25, height: 0.5 }]);
  });
});
