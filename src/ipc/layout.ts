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
