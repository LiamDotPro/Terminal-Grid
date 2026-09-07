// Grid and paging logic from docs/technical-design.md section 6. Pure functions, unit test them.
import type { TerminalId } from "./types";

export const PAGE_SIZE = 9;

export interface LayoutSpec { cols: number; rows: number }

export function layoutFor(count: number): LayoutSpec {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count <= 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

export const pageOf = (index: number) => Math.floor(index / PAGE_SIZE);
export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE));

export function pageSlice(order: TerminalId[], page: number): TerminalId[] {
  return order.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
}

export type Direction = "up" | "down" | "left" | "right";

// Returns a new order array with the focused terminal moved, or the same array if the move is not possible.
export function moveTerminal(order: TerminalId[], id: TerminalId, dir: Direction): TerminalId[] {
  const index = order.indexOf(id);
  if (index < 0) return order;
  const page = pageOf(index);
  const local = index - page * PAGE_SIZE;
  const onPage = pageSlice(order, page).length;
  const { cols } = layoutFor(onPage);
  const row = Math.floor(local / cols);
  const col = local % cols;

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
