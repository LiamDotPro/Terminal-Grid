import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  insertAfter,
  evenSizes,
  layoutFor,
  moveDivider,
  moveTerminal,
  nextLayoutMode,
  pageCount,
  pageOf,
  pageSlice,
  rowCounts,
  sizesFit,
  withColumns,
} from "./layout";

describe("layoutFor", () => {
  it("follows the grid table from the design", () => {
    expect(layoutFor(0)).toEqual({ cols: 1, rows: 1 });
    expect(layoutFor(1)).toEqual({ cols: 1, rows: 1 });
    expect(layoutFor(2)).toEqual({ cols: 2, rows: 1 });
    expect(layoutFor(3)).toEqual({ cols: 2, rows: 2 });
    expect(layoutFor(4)).toEqual({ cols: 2, rows: 2 });
    expect(layoutFor(5)).toEqual({ cols: 3, rows: 2 });
    expect(layoutFor(6)).toEqual({ cols: 3, rows: 2 });
    expect(layoutFor(7)).toEqual({ cols: 3, rows: 3 });
    expect(layoutFor(9)).toEqual({ cols: 3, rows: 3 });
  });

  it("stacks side by side or on top of each other in the other modes", () => {
    expect(layoutFor(1, "columns")).toEqual({ cols: 1, rows: 1 });
    expect(layoutFor(3, "columns")).toEqual({ cols: 3, rows: 1 });
    expect(layoutFor(3, "rows")).toEqual({ cols: 1, rows: 3 });
    expect(layoutFor(9, "rows")).toEqual({ cols: 1, rows: 9 });
  });

  it("cycles grid, side by side, stacked", () => {
    expect(nextLayoutMode("grid")).toBe("columns");
    expect(nextLayoutMode("columns")).toBe("rows");
    expect(nextLayoutMode("rows")).toBe("grid");
  });
});

describe("rowCounts", () => {
  it("leaves a short last row that spans the page instead of a gap", () => {
    expect(rowCounts(1)).toEqual([1]);
    expect(rowCounts(3)).toEqual([2, 1]);
    expect(rowCounts(4)).toEqual([2, 2]);
    expect(rowCounts(5)).toEqual([3, 2]);
    expect(rowCounts(7)).toEqual([3, 3, 1]);
    expect(rowCounts(8)).toEqual([3, 3, 2]);
    expect(rowCounts(9)).toEqual([3, 3, 3]);
  });

  it("follows the stacking modes", () => {
    expect(rowCounts(3, "columns")).toEqual([3]);
    expect(rowCounts(3, "rows")).toEqual([1, 1, 1]);
  });
});

describe("pane sizes", () => {
  it("starts even and knows which page shape it fits", () => {
    const sizes = evenSizes([2, 1]);
    expect(sizes).toEqual({ rows: [0.5, 0.5], cols: [[0.5, 0.5], [1]] });
    expect(sizesFit(sizes, [2, 1])).toBe(true);
    expect(sizesFit(sizes, [2, 2])).toBe(false);
    expect(sizesFit(sizes, [3])).toBe(false);
  });

  it("moves a divider between its two neighbours only", () => {
    const next = moveDivider([0.25, 0.25, 0.5], 1, 0.75, 0.1);
    expect(next[0]).toBeCloseTo(0.25);
    expect(next[1]).toBeCloseTo(0.5);
    expect(next[2]).toBeCloseTo(0.25);
  });

  it("keeps both neighbours at least the minimum", () => {
    expect(moveDivider([0.5, 0.5], 0, 0.01, 0.1)).toEqual([0.1, 0.9]);
    expect(moveDivider([0.5, 0.5], 0, 2, 0.1)[1]).toBeCloseTo(0.1);
    // A minimum the pair cannot hold splits it evenly.
    expect(moveDivider([0.1, 0.1, 0.8], 0, 0, 0.3)).toEqual([0.1, 0.1, 0.8]);
    expect(moveDivider([0.5, 0.5], 1, 0.3, 0.1)).toEqual([0.5, 0.5]);
  });

  it("resizes every full row together and leaves the short row alone", () => {
    const sizes = withColumns(evenSizes([3, 3, 2]), 3, [0.5, 0.25, 0.25]);
    expect(sizes.cols).toEqual([[0.5, 0.25, 0.25], [0.5, 0.25, 0.25], [0.5, 0.5]]);
  });
});

describe("insertAfter", () => {
  it("places the new id right behind its origin", () => {
    expect(insertAfter(["a", "b", "c"], "x", "a")).toEqual(["a", "x", "b", "c"]);
    expect(insertAfter(["a", "b", "c"], "x", "c")).toEqual(["a", "b", "c", "x"]);
  });

  it("appends without an origin or with an unknown one", () => {
    expect(insertAfter(["a", "b"], "x", null)).toEqual(["a", "b", "x"]);
    expect(insertAfter(["a", "b"], "x", "zz")).toEqual(["a", "b", "x"]);
  });
});

describe("paging", () => {
  const eleven = Array.from({ length: 11 }, (_, index) => `t${index}`);

  it("counts pages", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(9)).toBe(1);
    expect(pageCount(10)).toBe(2);
    expect(pageCount(19)).toBe(3);
  });

  it("maps an index to its page", () => {
    expect(pageOf(0)).toBe(0);
    expect(pageOf(PAGE_SIZE - 1)).toBe(0);
    expect(pageOf(PAGE_SIZE)).toBe(1);
  });

  it("slices a page and lays the remainder out on its own count", () => {
    expect(pageSlice(eleven, 0)).toHaveLength(9);
    expect(pageSlice(eleven, 1)).toEqual(["t9", "t10"]);
    // Page two holds two terminals, so it renders 2x1 rather than a gappy 3x3.
    expect(layoutFor(pageSlice(eleven, 1).length)).toEqual({ cols: 2, rows: 1 });
  });
});

describe("moveTerminal", () => {
  const six = ["a", "b", "c", "d", "e", "f"];

  it("swaps horizontally inside a row", () => {
    expect(moveTerminal(six, "a", "right")).toEqual(["b", "a", "c", "d", "e", "f"]);
  });

  it("swaps vertically by the column count of the page", () => {
    // Six terminals lay out 3x2, so "down" from index 0 lands on index 3.
    expect(moveTerminal(six, "a", "down")).toEqual(["d", "b", "c", "a", "e", "f"]);
  });

  it("refuses a move off the top row", () => {
    expect(moveTerminal(six, "b", "up")).toBe(six);
  });

  it("refuses a move past the last cell", () => {
    expect(moveTerminal(six, "f", "right")).toBe(six);
    expect(moveTerminal(six, "f", "down")).toBe(six);
  });

  it("carries a terminal across a page boundary", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `t${index}`);
    const moved = moveTerminal(ten, "t8", "right");
    expect(moved[8]).toBe("t9");
    expect(moved[9]).toBe("t8");
    expect(pageOf(moved.indexOf("t8"))).toBe(1);
  });

  it("walks the list with the vertical arrows when stacked", () => {
    expect(moveTerminal(six, "a", "down", "rows")).toEqual(["b", "a", "c", "d", "e", "f"]);
    expect(moveTerminal(six, "b", "up", "rows")).toEqual(["b", "a", "c", "d", "e", "f"]);
    expect(moveTerminal(six, "a", "right", "rows")).toBe(six);
  });

  it("only moves sideways when side by side", () => {
    expect(moveTerminal(six, "a", "right", "columns")).toEqual(["b", "a", "c", "d", "e", "f"]);
    expect(moveTerminal(six, "a", "down", "columns")).toBe(six);
  });

  it("returns the same array for an unknown id", () => {
    expect(moveTerminal(six, "zz", "left")).toBe(six);
  });
});
