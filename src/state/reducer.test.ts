import { describe, expect, it } from "vitest";
import type { GitInfo, TerminalInfo, Worktree } from "../ipc/types";
import { paneStatus, toPaneView } from "./model";
import { initialState, reducer, totalPages, visibleIds, type AppState } from "./reducer";

const info = (id: string, cwd = `C:/dev/${id}`): TerminalInfo => ({
  id,
  cwd,
  shell: "pwsh",
  shellPid: 1,
  exited: false,
  exitCode: null,
});

function withTerminals(count: number): AppState {
  let state = initialState;
  for (let index = 0; index < count; index++) {
    state = reducer(state, { type: "terminal/added", info: info(`t${index}`), focus: index === 0 });
  }
  return state;
}

describe("terminals", () => {
  it("adds, focuses and pages", () => {
    const state = withTerminals(11);
    expect(state.order).toHaveLength(11);
    expect(totalPages(state)).toBe(2);
    expect(state.focusedId).toBe("t0");
    expect(visibleIds(state)).toHaveLength(9);
  });

  it("focusing a terminal on another page follows it there", () => {
    const state = reducer(withTerminals(11), { type: "terminal/focus", id: "t10" });
    expect(state.page).toBe(1);
    expect(visibleIds(state)).toEqual(["t9", "t10"]);
  });

  it("moves focus to a neighbour inside the page only", () => {
    // Four terminals lay out 2x2: right from t0 is t1, left from t0 is nothing.
    const four = reducer(withTerminals(4), { type: "terminal/focus", id: "t0" });
    expect(reducer(four, { type: "terminal/move-focus", dir: "right" }).focusedId).toBe("t1");
    expect(reducer(four, { type: "terminal/move-focus", dir: "down" }).focusedId).toBe("t2");
    expect(reducer(four, { type: "terminal/move-focus", dir: "left" }).focusedId).toBe("t0");
  });

  it("removing the focused terminal hands focus to its neighbour", () => {
    const three = reducer(withTerminals(3), { type: "terminal/focus", id: "t1" });
    const after = reducer(three, { type: "terminal/removed", id: "t1" });
    expect(after.order).toEqual(["t0", "t2"]);
    expect(after.focusedId).toBe("t2");
  });

  it("places a pane opened from another one right after it", () => {
    let state = withTerminals(3);
    state = reducer(state, { type: "terminal/added", info: info("x"), focus: true, after: "t0" });
    expect(state.order).toEqual(["t0", "x", "t1", "t2"]);
    expect(state.focusedId).toBe("x");
    expect(state.page).toBe(0);
  });

  it("switches stacking and restores it from the session", () => {
    let state = reducer(withTerminals(3), { type: "layout/set", mode: "rows" });
    expect(state.layoutMode).toBe("rows");
    state = reducer(state, { type: "layout/cycle" });
    expect(state.layoutMode).toBe("grid");

    const restored = reducer(initialState, {
      type: "ready",
      config: initialState.config,
      session: {
        version: 1,
        activeTab: "terminals",
        focusedId: null,
        page: 0,
        layoutMode: "columns",
        terminals: [],
        notes: { openRelPath: null, expandedFolders: [] },
      },
    });
    expect(restored.layoutMode).toBe("columns");
  });

  it("moves focus along the stack when panes are stacked vertically", () => {
    let state = reducer(withTerminals(4), { type: "layout/set", mode: "rows" });
    state = reducer(state, { type: "terminal/focus", id: "t0" });
    expect(reducer(state, { type: "terminal/move-focus", dir: "right" }).focusedId).toBe("t0");
    expect(reducer(state, { type: "terminal/move-focus", dir: "down" }).focusedId).toBe("t1");
    state = reducer(state, { type: "layout/set", mode: "columns" });
    expect(reducer(state, { type: "terminal/move-focus", dir: "down" }).focusedId).toBe("t0");
    expect(reducer(state, { type: "terminal/move-focus", dir: "right" }).focusedId).toBe("t1");
  });

  it("clamps the page when the last terminal on it goes away", () => {
    let state = withTerminals(10);
    state = reducer(state, { type: "page/set", page: 1 });
    state = reducer(state, { type: "terminal/removed", id: "t9" });
    expect(state.page).toBe(0);
  });
});

describe("agent lifecycle", () => {
  const started = (state: AppState) =>
    reducer(state, {
      type: "terminal/agent",
      event: { id: "t0", event: "started", name: "Claude Code", source: "process" },
    });

  it("marks a pane finished and clears it once the pane is looked at", () => {
    let state = started(withTerminals(2));
    state = reducer(state, {
      type: "terminal/agent",
      event: { id: "t0", event: "finished", name: "Claude Code", source: "process" },
    });
    expect(state.terminals.t0.finished).not.toBeNull();
    expect(paneStatus(state.terminals.t0, state.now, 4000)).toBe("finished");

    state = reducer(state, { type: "terminal/focus", id: "t0" });
    expect(state.terminals.t0.finished).toBeNull();
  });

  it("drops a duplicate finish from a slower source", () => {
    let state = started(withTerminals(1));
    state = reducer(state, {
      type: "terminal/agent",
      event: { id: "t0", event: "finished", name: "Claude Code", source: "process" },
    });
    const first = state.terminals.t0.finished;
    state = reducer(state, {
      type: "terminal/agent",
      event: { id: "t0", event: "finished", name: "Claude Code", source: "bell" },
    });
    expect(state.terminals.t0.finished).toBe(first);
  });

  it("goes idle once output stops for longer than the timeout", () => {
    const state = started(withTerminals(1));
    const term = state.terminals.t0;
    expect(paneStatus(term, state.now, 4000)).toBe("running");
    expect(paneStatus(term, state.now + 5000, 4000)).toBe("idle");
  });

  it("an exited shell outranks every other status", () => {
    let state = started(withTerminals(1));
    state = reducer(state, { type: "terminal/exited", id: "t0", code: 1 });
    expect(paneStatus(state.terminals.t0, state.now, 4000)).toBe("exited");
    expect(state.terminals.t0.agent).toBeNull();
  });
});

describe("agent task", () => {
  const ctx = (state: AppState) => ({
    now: state.now,
    idleTimeoutMs: 4000,
    focusedId: state.focusedId,
    paneNumbers: new Map<string, number>(),
  });
  const report = (state: AppState, task: string | null) =>
    reducer(state, { type: "terminal/task", id: "t0", task, updatedAt: state.now - 12_000 });
  const started = (state: AppState) =>
    reducer(state, {
      type: "terminal/agent",
      event: { id: "t0", event: "started", name: "claude", source: "process" },
    });

  it("shows the reported task and how long ago it came in", () => {
    const state = report(started(withTerminals(1)), "Fixing the login test");
    const view = toPaneView(state.terminals.t0, 0, ctx(state));
    expect(view.canShowTask).toBe(true);
    expect(view.task).toBe("Fixing the login test");
    expect(view.taskAge).toBe("12s");
  });

  it("offers the task button while an agent runs, even before a report", () => {
    const idle = withTerminals(1);
    expect(toPaneView(idle.terminals.t0, 0, ctx(idle)).canShowTask).toBe(false);
    const running = started(idle);
    expect(toPaneView(running.terminals.t0, 0, ctx(running)).canShowTask).toBe(true);
  });

  it("an emptied file clears the task", () => {
    const state = report(report(started(withTerminals(1)), "Wiring IPC"), null);
    expect(state.terminals.t0.task).toBeNull();
  });

  it("a new agent run drops the previous run's task, an exit drops it too", () => {
    const reported = report(started(withTerminals(1)), "Old work");
    expect(started(reported).terminals.t0.task).toBeNull();
    const exited = reducer(reported, { type: "terminal/exited", id: "t0", code: 0 });
    expect(exited.terminals.t0.task).toBeNull();
  });
});

describe("worktree menu", () => {
  const worktree = (path: string, branch: string, extra: Partial<Worktree> = {}): Worktree => ({
    path,
    head: "3f2a91c",
    branch,
    isMain: false,
    isCurrent: false,
    detached: false,
    locked: false,
    prunable: false,
    openIn: [],
    ...extra,
  });
  const git = (worktrees: Worktree[], isWorktree: boolean): GitInfo => ({
    inRepo: true,
    repoRoot: "C:/dev/app-feature",
    commonDir: "C:/dev/app/.git",
    repoName: "app",
    branch: "feature",
    headShort: "3f2a91c",
    userName: null,
    userEmail: null,
    remoteUrl: null,
    dirty: false,
    ahead: 0,
    behind: 0,
    isWorktree,
    worktrees,
  });
  const repo = (state: AppState, info: GitInfo) => reducer(state, { type: "terminal/git", id: "t0", info });
  const view = (state: AppState) =>
    toPaneView(state.terminals.t0, 0, {
      now: state.now,
      idleTimeoutMs: 4000,
      focusedId: state.focusedId,
      paneNumbers: new Map([
        ["t0", 1],
        ["t1", 2],
      ]),
    });
  const worktrees = [
    worktree("C:/dev/app", "main", { isMain: true }),
    worktree("C:/dev/app-feature", "feature", { isCurrent: true }),
    worktree("C:/dev/app-fix", "fix", { openIn: ["t1"] }),
    worktree("C:/dev/app-spike", "spike"),
    worktree("C:/dev/app-gone", "gone", { prunable: true }),
  ];

  it("marks a linked worktree and says what picking each entry does", () => {
    const pane = view(repo(withTerminals(2), git(worktrees, true)));
    expect(pane.inWorktree).toBe(true);
    expect(pane.worktrees.map((w) => [w.name, w.move, w.paneNumber])).toEqual([
      ["main", "cd", null],
      ["feature", "here", null],
      ["fix", "focus", 2],
      ["spike", "cd", null],
      ["gone", "none", null],
    ]);
  });

  it("opens a new pane instead of typing a cd into a running agent", () => {
    const state = reducer(repo(withTerminals(2), git(worktrees, true)), {
      type: "terminal/agent",
      event: { id: "t0", event: "started", name: "claude", source: "process" },
    });
    expect(view(state).worktrees.find((w) => w.name === "spike")?.move).toBe("new-pane");
  });

  it("only types a cd while the shell sits at its prompt", () => {
    const spike = (state: AppState) => view(state).worktrees.find((w) => w.name === "spike")?.move;
    const prompt = (state: AppState, atPrompt: boolean) =>
      reducer(state, { type: "terminal/prompt", id: "t0", atPrompt });
    const state = repo(withTerminals(2), git(worktrees, true));
    expect(spike(prompt(state, false))).toBe("new-pane");
    expect(spike(prompt(prompt(state, false), true))).toBe("cd");
  });
});

describe("notes", () => {
  it("folds the tree and the preview away independently", () => {
    let state = reducer(initialState, { type: "notes/toggle-panel", panel: "preview" });
    expect(state.notes.previewCollapsed).toBe(true);
    expect(state.notes.treeCollapsed).toBe(false);
    state = reducer(state, { type: "notes/toggle-panel", panel: "tree" });
    expect(state.notes.treeCollapsed).toBe(true);
    state = reducer(state, { type: "notes/collapse", panel: "preview", collapsed: false });
    expect(state.notes.previewCollapsed).toBe(false);
    expect(state.notes.treeCollapsed).toBe(true);
  });

  it("restores the folded panels from the session", () => {
    const state = reducer(initialState, {
      type: "ready",
      config: initialState.config,
      session: {
        version: 1,
        activeTab: "notes",
        focusedId: null,
        page: 0,
        terminals: [],
        notes: { openRelPath: null, expandedFolders: [], treeCollapsed: true },
      },
    });
    expect(state.notes.treeCollapsed).toBe(true);
    expect(state.notes.previewCollapsed).toBe(false);
  });

  it("tracks the dirty flag against the last saved content", () => {
    let state = reducer(initialState, {
      type: "notes/opened",
      relPath: "todo.md",
      content: "# Todo",
      mtimeMs: 10,
    });
    expect(state.notes.saveState).toBe("clean");

    state = reducer(state, { type: "notes/edit", content: "# Todo\n- one" });
    expect(state.notes.saveState).toBe("dirty");

    state = reducer(state, { type: "notes/edit", content: "# Todo" });
    expect(state.notes.saveState).toBe("clean");
  });

  it("settles on saved once the written content is the buffer", () => {
    let state = reducer(initialState, {
      type: "notes/opened",
      relPath: "todo.md",
      content: "a",
      mtimeMs: 10,
    });
    state = reducer(state, { type: "notes/edit", content: "ab" });
    state = reducer(state, { type: "notes/saving" });
    state = reducer(state, { type: "notes/saved", mtimeMs: 11, content: "ab" });
    expect(state.notes.saveState).toBe("saved");
    expect(state.notes.baseline).toBe("ab");
  });

  it("stays dirty when the buffer changed again while the save was in flight", () => {
    let state = reducer(initialState, {
      type: "notes/opened",
      relPath: "todo.md",
      content: "a",
      mtimeMs: 10,
    });
    state = reducer(state, { type: "notes/edit", content: "ab" });
    state = reducer(state, { type: "notes/saving" });
    state = reducer(state, { type: "notes/edit", content: "abc" });
    state = reducer(state, { type: "notes/saved", mtimeMs: 11, content: "ab" });
    expect(state.notes.saveState).toBe("dirty");
    expect(state.notes.baseline).toBe("ab");
    expect(state.notes.content).toBe("abc");
  });

  it("parks after a failed save so autosave does not retry in a loop", () => {
    let state = reducer(initialState, {
      type: "notes/opened",
      relPath: "todo.md",
      content: "a",
      mtimeMs: 10,
    });
    state = reducer(state, { type: "notes/edit", content: "ab" });
    state = reducer(state, { type: "notes/save-failed" });
    expect(state.notes.saveState).toBe("error");
    state = reducer(state, { type: "notes/edit", content: "abc" });
    expect(state.notes.saveState).toBe("dirty");
  });

  it("surfaces a conflict and keeps the buffer", () => {
    let state = reducer(initialState, {
      type: "notes/opened",
      relPath: "todo.md",
      content: "a",
      mtimeMs: 10,
    });
    state = reducer(state, { type: "notes/edit", content: "mine" });
    state = reducer(state, { type: "notes/conflict", currentMtimeMs: 99 });
    expect(state.notes.conflict).toEqual({ currentMtimeMs: 99 });
    expect(state.notes.content).toBe("mine");
  });
});

describe("focus + review", () => {
  const comment = (id: string, path = "src/a.ts") => ({
    id,
    repoRoot: "C:/dev/app",
    path,
    line: 3,
    lineText: "const a = 1;",
    text: "rename this",
    status: "pending" as const,
    createdAt: 0,
  });

  it("toggles focus mode on the focused pane and back", () => {
    const state = reducer(withTerminals(3), { type: "review/toggle" });
    expect(state.focusMode).toBe(true);
    expect(state.activeTab).toBe("terminals");
    expect(reducer(state, { type: "review/toggle" }).focusMode).toBe(false);
  });

  it("does nothing without a pane", () => {
    expect(reducer(initialState, { type: "review/toggle" }).focusMode).toBe(false);
  });

  it("opens on another pane by focusing it", () => {
    const state = reducer(withTerminals(3), { type: "review/open", id: "t2" });
    expect(state.focusMode).toBe(true);
    expect(state.focusedId).toBe("t2");
  });

  it("leaves focus mode when the last pane closes", () => {
    let state = reducer(withTerminals(1), { type: "review/toggle" });
    state = reducer(state, { type: "terminal/removed", id: "t0" });
    expect(state.focusMode).toBe(false);
  });

  it("marks a sent batch and re-pends a reworded comment", () => {
    let state = reducer(initialState, { type: "review/comment-add", comment: comment("a") });
    state = reducer(state, { type: "review/comment-add", comment: comment("b") });
    state = reducer(state, { type: "review/sent", ids: ["a", "b"], repoRoot: "C:/dev/app", paneId: "t0", at: 5 });
    expect(state.review.comments.map((c) => c.status)).toEqual(["sent", "sent"]);
    expect(state.review.sent).toEqual({ repoRoot: "C:/dev/app", paneId: "t0", count: 2, at: 5 });
    state = reducer(state, { type: "review/comment-edit", id: "a", text: "again" });
    expect(state.review.comments[0]).toMatchObject({ text: "again", status: "pending" });
  });

  it("forgets the comments on committed files only", () => {
    let state = reducer(initialState, { type: "review/comment-add", comment: comment("a", "src/a.ts") });
    state = reducer(state, { type: "review/comment-add", comment: comment("b", "src/b.ts") });
    state = reducer(state, { type: "review/forget", repoRoot: "C:/dev/app", paths: ["src/a.ts"] });
    expect(state.review.comments.map((c) => c.id)).toEqual(["b"]);
  });
});
