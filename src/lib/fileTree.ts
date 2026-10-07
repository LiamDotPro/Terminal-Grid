/**
 * The edit tree of the review panel (design turn 5): the pane's whole folder
 * as a tree, with changed files marked, folders that hold changes open by
 * default, and a "changed only" view that groups changed files by folder.
 * Pure helpers, unit tested.
 */
import type { ChangeStatus } from "../ipc/types";

export interface FileChange {
  status: ChangeStatus;
  staged: boolean;
}

export interface TreeRow {
  kind: "folder" | "file";
  /** Folder or file path relative to the repository root. */
  path: string;
  /** What the row shows: one segment, or a folder path in the changed view. */
  name: string;
  depth: number;
  /** Changed files inside a folder, at any depth. */
  count: number;
  open: boolean;
  change: FileChange | null;
}

interface Folder {
  folders: Map<string, Folder>;
  files: string[];
}

function emptyFolder(): Folder {
  return { folders: new Map(), files: [] };
}

const compare = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) || (a < b ? -1 : 1);

function build(paths: Iterable<string>): Folder {
  const root = emptyFolder();
  for (const path of paths) {
    const parts = path.split("/");
    const name = parts.pop()!;
    let folder = root;
    for (const part of parts) {
      let next = folder.folders.get(part);
      if (!next) {
        next = emptyFolder();
        folder.folders.set(part, next);
      }
      folder = next;
    }
    if (!folder.files.includes(name)) folder.files.push(name);
  }
  return root;
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
}

/** Every file in tree order: folders first, then files, each sorted by name. */
export function treeOrder(paths: Iterable<string>): string[] {
  const out: string[] = [];
  const walk = (folder: Folder, dir: string) => {
    for (const name of [...folder.folders.keys()].sort(compare)) walk(folder.folders.get(name)!, join(dir, name));
    for (const name of [...folder.files].sort(compare)) out.push(join(dir, name));
  };
  walk(build(paths), "");
  return out;
}

/** Changed files in tree order, for stepping through them with Alt+↑ / Alt+↓. */
export function changedInTreeOrder(paths: Iterable<string>, changes: ReadonlyMap<string, FileChange>): string[] {
  return treeOrder(new Set([...paths, ...changes.keys()])).filter((path) => changes.has(path));
}

/** Changed files under each folder path ("" is the root), at any depth. */
function changeCounts(changes: ReadonlyMap<string, FileChange>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const path of changes.keys()) {
    let dir = dirOf(path);
    for (;;) {
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
      if (!dir) break;
      dir = dirOf(dir);
    }
  }
  return counts;
}

/**
 * The rows on screen. `open` holds the folders the user opened or closed;
 * any other folder is open exactly when it holds a change. Deleted files are
 * not on disk any more but still belong in the tree, so changed paths are
 * merged in.
 */
export function treeRows(
  paths: Iterable<string>,
  changes: ReadonlyMap<string, FileChange>,
  open: ReadonlyMap<string, boolean>,
  filter: "all" | "changed",
): TreeRow[] {
  const counts = changeCounts(changes);
  if (filter === "changed") return changedRows(paths, changes, counts);

  const rows: TreeRow[] = [];
  const walk = (folder: Folder, dir: string, depth: number) => {
    for (const name of [...folder.folders.keys()].sort(compare)) {
      const path = join(dir, name);
      const count = counts.get(path) ?? 0;
      const isOpen = open.get(path) ?? count > 0;
      rows.push({ kind: "folder", path, name, depth, count, open: isOpen, change: null });
      if (isOpen) walk(folder.folders.get(name)!, path, depth + 1);
    }
    for (const name of [...folder.files].sort(compare)) {
      const path = join(dir, name);
      rows.push({ kind: "file", path, name, depth, count: 0, open: false, change: changes.get(path) ?? null });
    }
  };
  walk(build(new Set([...paths, ...changes.keys()])), "", 0);
  return rows;
}

/** Changed files only, under one row per folder path (screen 5b). */
function changedRows(
  paths: Iterable<string>,
  changes: ReadonlyMap<string, FileChange>,
  counts: ReadonlyMap<string, number>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  let currentDir: string | null = null;
  for (const path of changedInTreeOrder(paths, changes)) {
    const dir = dirOf(path);
    if (dir && dir !== currentDir) {
      rows.push({ kind: "folder", path: dir, name: dir, depth: 0, count: counts.get(dir) ?? 0, open: true, change: null });
    }
    currentDir = dir;
    const name = path.slice(dir ? dir.length + 1 : 0);
    rows.push({ kind: "file", path, name, depth: dir ? 1 : 0, count: 0, open: false, change: changes.get(path) ?? null });
  }
  return rows;
}

/** The folders that must be open for `path` to be on screen. */
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  let dir = dirOf(path);
  while (dir) {
    out.unshift(dir);
    dir = dirOf(dir);
  }
  return out;
}
