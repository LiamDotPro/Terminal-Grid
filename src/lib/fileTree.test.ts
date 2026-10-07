import { describe, expect, it } from "vitest";
import { ancestorsOf, changedInTreeOrder, treeRows, type FileChange } from "./fileTree";

const paths = [
  "README.md",
  "docs/architecture.md",
  "src/App.tsx",
  "src/components/PaneGrid.tsx",
  "src/components/EmptyGrid.tsx",
  "src/ipc/types.ts",
  "src/hooks/useX.ts",
];

const changes = new Map<string, FileChange>([
  ["src/components/PaneGrid.tsx", { status: "M", staged: true }],
  ["src/ipc/types.ts", { status: "M", staged: false }],
  ["docs/focus-mode.md", { status: "?", staged: false }],
]);

const show = (rows: ReturnType<typeof treeRows>) =>
  rows.map((row) => `${"  ".repeat(row.depth)}${row.kind === "folder" ? `${row.open ? "▾" : "▸"} ` : ""}${row.name}${row.count ? ` (${row.count})` : ""}${row.change ? ` ${row.change.status}` : ""}`);

describe("treeRows", () => {
  it("lists folders first, opens the ones holding changes and counts them", () => {
    expect(show(treeRows(paths, changes, new Map(), "all"))).toEqual([
      "▾ docs (1)",
      "  architecture.md",
      "  focus-mode.md ?",
      "▾ src (2)",
      "  ▾ components (1)",
      "    EmptyGrid.tsx",
      "    PaneGrid.tsx M",
      "  ▸ hooks",
      "  ▾ ipc (1)",
      "    types.ts M",
      "  App.tsx",
      "README.md",
    ]);
  });

  it("follows folders the user opened or closed", () => {
    const open = new Map([
      ["src", false],
      ["docs", true],
    ]);
    expect(show(treeRows(paths, changes, open, "all"))).toEqual([
      "▾ docs (1)",
      "  architecture.md",
      "  focus-mode.md ?",
      "▸ src (2)",
      "README.md",
    ]);
  });

  it("groups changed files by folder in the changed view", () => {
    expect(show(treeRows(paths, changes, new Map(), "changed"))).toEqual([
      "▾ docs (1)",
      "  focus-mode.md ?",
      "▾ src/components (1)",
      "  PaneGrid.tsx M",
      "▾ src/ipc (1)",
      "  types.ts M",
    ]);
  });
});

describe("changedInTreeOrder", () => {
  it("walks changed files the way the tree shows them", () => {
    expect(changedInTreeOrder(paths, changes)).toEqual([
      "docs/focus-mode.md",
      "src/components/PaneGrid.tsx",
      "src/ipc/types.ts",
    ]);
  });
});

describe("ancestorsOf", () => {
  it("lists the folders above a file, outermost first", () => {
    expect(ancestorsOf("src/ipc/types.ts")).toEqual(["src", "src/ipc"]);
    expect(ancestorsOf("README.md")).toEqual([]);
  });
});
