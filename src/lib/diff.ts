/**
 * Line diffs for the review panel. The core hands over two versions of a
 * file; everything the panel draws (hunks, the whole file view, the overview
 * strip, the editor's gutter) is derived here. Pure, unit tested.
 */

export type RowKind = "ctx" | "add" | "del";

export interface DiffRow {
  kind: RowKind;
  text: string;
  /** 1-based line in the old version, null for an added line. */
  old: number | null;
  /** 1-based line in the new version, null for a removed line. */
  new: number | null;
}

/** Lines of a file; a final newline does not start another, empty line. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Past this many edits the middle of the diff is drawn as replace-all. */
const MAX_EDIT_DISTANCE = 4000;

/**
 * Myers' O(ND) diff on lines, after trimming the common prefix and suffix.
 * Removals are placed before additions within a change, as git does.
 */
export function diffLines(a: readonly string[], b: readonly string[]): DiffRow[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: RowKind[] = [];
  for (let i = 0; i < start; i++) ops.push("ctx");
  ops.push(...middle(a.slice(start, endA), b.slice(start, endB)));
  for (let i = endA; i < a.length; i++) ops.push("ctx");

  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const kind of ops) {
    if (kind === "ctx") {
      rows.push({ kind, text: a[oldLine]!, old: oldLine + 1, new: newLine + 1 });
      oldLine++;
      newLine++;
    } else if (kind === "del") {
      rows.push({ kind, text: a[oldLine]!, old: oldLine + 1, new: null });
      oldLine++;
    } else {
      rows.push({ kind, text: b[newLine]!, old: null, new: newLine + 1 });
      newLine++;
    }
  }
  return normaliseOrder(rows);
}

function middle(a: readonly string[], b: readonly string[]): RowKind[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return Array<RowKind>(m).fill("add");
  if (m === 0) return Array<RowKind>(n).fill("del");

  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds v[-d..d] as it was before step d.
  const trace: Int32Array[] = [];
  let found = -1;

  outer: for (let d = 0; d <= Math.min(max, MAX_EDIT_DISTANCE); d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break outer;
      }
    }
  }

  if (found === -1) {
    return [...Array<RowKind>(n).fill("del"), ...Array<RowKind>(m).fill("add")];
  }

  const reversed: RowKind[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d]!;
    const at = (k: number) => prev[k + d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      reversed.push("ctx");
      x--;
      y--;
    }
    if (x === prevX) {
      reversed.push("add");
      y--;
    } else {
      reversed.push("del");
      x--;
    }
  }
  while (x > 0 && y > 0) {
    reversed.push("ctx");
    x--;
    y--;
  }
  return reversed.reverse();
}

/** Within each run of changes, removals first, then additions. */
function normaliseOrder(rows: DiffRow[]): DiffRow[] {
  const out: DiffRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i]!.kind === "ctx") {
      out.push(rows[i]!);
      i++;
      continue;
    }
    const run: DiffRow[] = [];
    while (i < rows.length && rows[i]!.kind !== "ctx") run.push(rows[i++]!);
    out.push(...run.filter((row) => row.kind === "del"), ...run.filter((row) => row.kind === "add"));
  }
  return out;
}

export function countChanges(rows: readonly DiffRow[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const row of rows) {
    if (row.kind === "add") additions++;
    else if (row.kind === "del") deletions++;
  }
  return { additions, deletions };
}

// Layout ----------------------------------------------------------------------

export type LayoutItem =
  /** A hunk header, or in the whole file view the marker for a collapsed gap. */
  | { kind: "sep"; header: string; hidden: number; gapStart: number | null }
  | { kind: "row"; index: number };

export interface LayoutOptions {
  /** "changes": only changed sections with context; "file": every line. */
  view: "changes" | "file";
  context?: number;
  /** Gaps (by first hidden row index) the user expanded. */
  expanded?: ReadonlySet<number>;
  /** Rows that must stay visible, such as lines with a comment. */
  pinned?: ReadonlySet<number>;
}

/** Hidden runs shorter than this are shown instead; a separator would not save space. */
const MIN_GAP = 4;

/**
 * Which rows to draw and where the separators go. The changes view shows
 * every change with `context` lines around it, the way the design's turn 2
 * does; the whole file view shows every row.
 */
export function layoutRows(rows: readonly DiffRow[], options: LayoutOptions): LayoutItem[] {
  const n = rows.length;
  const context = options.context ?? 3;
  const visible = new Array<boolean>(n).fill(options.view === "file");

  if (options.view === "changes") {
    rows.forEach((row, i) => {
      if (row.kind === "ctx" && !options.pinned?.has(i)) return;
      for (let j = Math.max(0, i - context); j <= Math.min(n - 1, i + context); j++) visible[j] = true;
    });
    let i = 0;
    while (i < n) {
      if (visible[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && !visible[j]) j++;
      if (j - i < MIN_GAP || options.expanded?.has(i)) for (let q = i; q < j; q++) visible[q] = true;
      i = j;
    }
  }

  const items: LayoutItem[] = [];
  let hidden = 0;
  let gapStart: number | null = null;
  for (let i = 0; i < n; i++) {
    if (!visible[i]) {
      if (hidden === 0) gapStart = i;
      hidden++;
      continue;
    }
    const startsBlock = i === 0 || !visible[i - 1];
    if (startsBlock && (options.view === "changes" || hidden > 0)) {
      items.push({
        kind: "sep",
        header: options.view === "changes" ? hunkHeader(rows, i, visible) : "",
        hidden,
        gapStart: hidden > 0 ? gapStart : null,
      });
      hidden = 0;
      gapStart = null;
    }
    items.push({ kind: "row", index: i });
  }
  if (hidden > 0) items.push({ kind: "sep", header: "", hidden, gapStart });
  return items;
}

function hunkHeader(rows: readonly DiffRow[], start: number, visible: readonly boolean[]): string {
  let oldCount = 0;
  let newCount = 0;
  let oldStart: number | null = null;
  let newStart: number | null = null;
  for (let j = start; j < rows.length && visible[j]; j++) {
    const row = rows[j]!;
    if (row.old !== null) {
      oldStart ??= row.old;
      oldCount++;
    }
    if (row.new !== null) {
      newStart ??= row.new;
      newCount++;
    }
  }
  // An empty side is numbered after the line it would follow, as git does.
  const before = (pick: (row: DiffRow) => number | null) => {
    for (let j = start - 1; j >= 0; j--) {
      const line = pick(rows[j]!);
      if (line !== null) return line;
    }
    return 0;
  };
  const o = oldStart ?? before((row) => row.old);
  const nw = newStart ?? before((row) => row.new);
  return `@@ -${o},${oldCount} +${nw},${newCount} @@`;
}

/** Index of the first row of each change, in order. */
export function changeStarts(rows: readonly DiffRow[]): number[] {
  const starts: number[] = [];
  rows.forEach((row, i) => {
    if (row.kind !== "ctx" && (i === 0 || rows[i - 1]!.kind === "ctx")) starts.push(i);
  });
  return starts;
}

// Editor gutter ------------------------------------------------------------------

export type LineMark = "none" | "add" | "mod" | "edit";

export interface EditorLine {
  mark: LineMark;
  /** Lines of the base version removed just above this one. */
  removedAbove: number;
}

/**
 * Gutter marks for the editor (design screen 3b). `base` is what the diff
 * starts from, `disk` the file as saved, `buffer` the text being edited.
 * Lines the user changed and has not saved are "edit"; otherwise the line
 * carries its mark in the base-to-disk diff, where an addition that replaces
 * a removal counts as modified.
 */
export function editorMarks(
  base: readonly string[],
  disk: readonly string[],
  buffer: readonly string[],
): EditorLine[] {
  const diskLines: EditorLine[] = disk.map(() => ({ mark: "none", removedAbove: 0 }));
  // Removals not paired with an addition, waiting for the next kept line.
  let pendingRemovals = 0;
  for (const row of diffLines(base, disk)) {
    if (row.kind === "del") {
      pendingRemovals++;
      continue;
    }
    const line = diskLines[row.new! - 1]!;
    if (row.kind === "add") {
      line.mark = pendingRemovals > 0 ? "mod" : "add";
      if (pendingRemovals > 0) pendingRemovals--;
      continue;
    }
    line.removedAbove = pendingRemovals;
    pendingRemovals = 0;
  }

  const out: EditorLine[] = buffer.map(() => ({ mark: "none", removedAbove: 0 }));
  // Lines the user deleted without typing a replacement, as above.
  let userRemoved = 0;
  for (const row of diffLines(disk, buffer)) {
    if (row.kind === "del") {
      userRemoved++;
      continue;
    }
    const line = out[row.new! - 1]!;
    if (row.kind === "add") {
      line.mark = "edit";
      if (userRemoved > 0) userRemoved--;
      continue;
    }
    const fromDisk = diskLines[row.old! - 1]!;
    line.mark = fromDisk.mark;
    line.removedAbove = fromDisk.removedAbove + userRemoved;
    userRemoved = 0;
  }
  return out;
}

// Overview strip -------------------------------------------------------------------

export type TickKind = "add" | "del" | "mod" | "edit";

export interface Tick {
  kind: TickKind;
  /** Fraction of the strip's height. */
  top: number;
  height: number;
}

/** Runs of equal marks, positioned as fractions of the list's length. */
export function overviewTicks(marks: readonly (TickKind | "none")[]): Tick[] {
  const total = marks.length;
  const ticks: Tick[] = [];
  for (let i = 0; i < total; i++) {
    const kind = marks[i]!;
    if (kind === "none") continue;
    let j = i;
    while (j + 1 < total && marks[j + 1] === kind) j++;
    ticks.push({ kind, top: i / total, height: (j - i + 1) / total });
    i = j;
  }
  return ticks;
}
