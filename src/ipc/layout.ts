// Grid and paging logic from docs/technical-design.md section 6. Pure functions, unit test them.
import type { TerminalId } from "./types";

export const PAGE_SIZE = 9;

export interface LayoutSpec { cols: number; rows: number }

/**
 * How the panes on a page are stacked.
 * - "grid": both directions, the responsive table from the design.
 * - "columns": side by side, one row (horizontal stacking).
 * - "rows": on top of each other, one column (vertical stacking).
 */
export type LayoutMode = "grid" | "columns" | "rows";

export const LAYOUT_MODES: readonly LayoutMode[] = ["grid", "columns", "rows"];

export function layoutFor(count: number, mode: LayoutMode = "grid"): LayoutSpec {
  const n = Math.max(1, count);
  if (mode === "columns") return { cols: n, rows: 1 };
  if (mode === "rows") return { cols: 1, rows: n };
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/**
 * Panes in each row of a page, top to bottom. When the count does not fill the
 * grid the last row is short, and its panes widen to cover the whole row.
 */
export function rowCounts(count: number, mode: LayoutMode = "grid"): number[] {
  const { cols, rows } = layoutFor(count, mode);
  const n = Math.max(1, count);
  return Array.from({ length: rows }, (_, row) => Math.min(cols, n - row * cols));
}

/**
 * The share of the page each row takes, and of its row each pane takes. Each
 * list sums to 1. Rows with the same pane count share their column sizes, so
 * the full rows of a grid stay aligned.
 */
export interface PageSizes { rows: number[]; cols: number[][] }

export const evenSplit = (n: number): number[] => Array.from({ length: n }, () => 1 / n);

export function evenSizes(counts: number[]): PageSizes {
  return { rows: evenSplit(counts.length), cols: counts.map(evenSplit) };
}

/** True when `sizes` was made for a page with these row counts. */
export function sizesFit(sizes: PageSizes, counts: number[]): boolean {
  return sizes.rows.length === counts.length && sizes.cols.every((row, index) => row.length === counts[index]);
}

/** Where each size starts along its track, plus the end: [0, a, a + b, ..., 1]. */
export function offsets(sizes: number[]): number[] {
  const out = [0];
  for (const size of sizes) out.push((out[out.length - 1] ?? 0) + size);
  return out;
}

/**
 * Moves the divider after `sizes[index]` to `at` (0..1 along the track). Only
 * its two neighbours change, and neither drops below `min`.
 */
export function moveDivider(sizes: number[], index: number, at: number, min: number): number[] {
  const a = sizes[index];
  const b = sizes[index + 1];
  if (a === undefined || b === undefined) return sizes;
  const start = offsets(sizes)[index] ?? 0;
  const pair = a + b;
  const floor = Math.min(min, pair / 2);
  const first = Math.min(Math.max(at - start, floor), pair - floor);
  const next = sizes.slice();
  next[index] = first;
  next[index + 1] = pair - first;
  return next;
}

/** Applies new column sizes to every row with `count` panes. */
export function withColumns(sizes: PageSizes, count: number, cols: number[]): PageSizes {
  return { ...sizes, cols: sizes.cols.map((row) => (row.length === count ? cols : row)) };
}

/** The mode after `mode` in the order the chrome's segmented control shows them. */
export function nextLayoutMode(mode: LayoutMode): LayoutMode {
  const index = LAYOUT_MODES.indexOf(mode);
  return LAYOUT_MODES[(index + 1) % LAYOUT_MODES.length] ?? "grid";
}

export const pageOf = (index: number) => Math.floor(index / PAGE_SIZE);
export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

export function pageSlice(order: TerminalId[], page: number): TerminalId[] {
  return order.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
}

export type Direction = "up" | "down" | "left" | "right";

// Returns a new order array with the focused terminal moved, or the same array if the move is not possible.
export function moveTerminal(
  order: TerminalId[],
  id: TerminalId,
  dir: Direction,
  mode: LayoutMode = "grid",
): TerminalId[] {
  const index = order.indexOf(id);
  if (index < 0) return order;
  const page = pageOf(index);
  const local = index - page * PAGE_SIZE;
  const onPage = pageSlice(order, page).length;
  const { cols } = layoutFor(onPage, mode);
  const row = Math.floor(local / cols);

  // In a single column the vertical arrows walk the order (and cross pages),
  // the way the horizontal ones do in a grid.
  if (mode === "rows") {
    if (dir === "left" || dir === "right") return order;
    dir = dir === "up" ? "left" : "right";
  }
  if (mode === "columns" && (dir === "up" || dir === "down")) return order;

  let target: number | null = null;
  if (dir === "up" && row > 0) target = index - cols;
  if (dir === "down" && local + cols < onPage) target = index + cols;
  if (dir === "left") target = local > 0 ? index - 1 : page > 0 ? index - 1 : null;
  if (dir === "right") target = local < onPage - 1 || index < order.length - 1 ? index + 1 : null;
  if (target === null || target < 0 || target >= order.length) return order;

  const next = order.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Inserts `id` into `order` directly after `after`, or at the end when
 * `after` is null or unknown. Used when a pane is opened from another pane, so
 * the new one lands next to its origin instead of at the end of the last page.
 */
export function insertAfter(order: TerminalId[], id: TerminalId, after: TerminalId | null): TerminalId[] {
  const index = after === null ? -1 : order.indexOf(after);
  if (index === -1) return [...order, id];
  return [...order.slice(0, index + 1), id, ...order.slice(index + 1)];
}
