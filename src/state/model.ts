/**
 * View models. The reducer keeps raw IPC payloads; these functions fold them
 * into exactly what the pane header in the design needs, so components stay
 * free of derivation logic.
 */
import type { GitInfo, TerminalId, TerminalInfo } from "../ipc/types";
import { basename, formatBytes, formatElapsed, formatPercent, worktreeLabel } from "../lib/format";

export interface AgentRun {
  name: string;
  startedAt: number;
}

export interface FinishedMark {
  name: string;
  at: number;
  durationMs: number | null;
}

export interface TerminalStats {
  cpuPercent: number;
  memBytes: number;
}

export interface AgentTask {
  text: string;
  updatedAt: number;
}

export interface TerminalState {
  info: TerminalInfo;
  git: GitInfo | null;
  agent: AgentRun | null;
  /** Last task line the agent reported through its task file. */
  task: AgentTask | null;
  /** Set when an agent finished and the user has not looked at the pane yet. */
  finished: FinishedMark | null;
  lastCommand: string | null;
  /**
   * Whether the shell sits at its prompt: set by the shell integration's
   * prompt mark, cleared when Enter is typed. Null until a prompt mark has
   * been seen (cmd never sends one).
   */
  atPrompt: boolean | null;
  stats: TerminalStats | null;
  lastOutputAt: number;
}

export type PaneStatus = "running" | "idle" | "finished" | "exited";

/**
 * What picking a worktree in the branch menu does: cd this pane into it, jump
 * to the pane that already has it open, or open a new pane there (when an
 * agent owns this pane's input, so a typed cd would land in its prompt).
 */
export type WorktreeMove = "here" | "cd" | "focus" | "new-pane" | "none";

export interface WorktreeChip {
  /** The worktree's path. */
  key: string;
  name: string;
  current: boolean;
  main: boolean;
  /** Another pane whose cwd is inside this worktree, on any page. */
  openIn: TerminalId | null;
  /** That pane's number when it is on the same page. */
  paneNumber: number | null;
  locked: boolean;
  prunable: boolean;
  move: WorktreeMove;
}

export interface PaneView {
  id: TerminalId;
  /** 1-based position on the current page; drives the badge and the focus-pane hotkeys (Ctrl+Alt+1…9, ⌘1…9). */
  n: number;
  title: string;
  cwd: string;
  branch: string | null;
  user: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  agent: string | null;
  status: PaneStatus;
  focused: boolean;
  exitCode: number | null;
  elapsed: string | null;
  cpu: string | null;
  mem: string | null;
  lastCommand: string | null;
  /** True when the cwd is in a linked worktree rather than the main checkout. */
  inWorktree: boolean;
  /** Every worktree of the repo; the branch menu lists them once there are two. */
  worktrees: WorktreeChip[];
  /** The header's task button shows while an agent runs or a task is known. */
  canShowTask: boolean;
  task: string | null;
  /** How long ago the task was reported: "12s", "3m". */
  taskAge: string | null;
}

export function paneStatus(term: TerminalState, now: number, idleTimeoutMs: number): PaneStatus {
  if (term.info.exited) return "exited";
  if (term.finished) return "finished";
  if (term.agent && now - term.lastOutputAt >= idleTimeoutMs) return "idle";
  return "running";
}

export interface PaneViewContext {
  now: number;
  idleTimeoutMs: number;
  focusedId: TerminalId | null;
  /** Page-local pane number for every terminal currently on screen. */
  paneNumbers: ReadonlyMap<TerminalId, number>;
}

export function toPaneView(term: TerminalState, index: number, ctx: PaneViewContext): PaneView {
  const { info, git } = term;
  const status = paneStatus(term, ctx.now, ctx.idleTimeoutMs);
  const showStats = status !== "exited" && term.agent !== null;

  return {
    id: info.id,
    n: index + 1,
    title: git?.repoName ?? basename(info.cwd) ?? info.cwd,
    cwd: info.cwd,
    branch: git?.branch ?? git?.headShort ?? null,
    user: git?.userName ?? null,
    dirty: git?.dirty ?? false,
    ahead: git?.ahead ?? 0,
    behind: git?.behind ?? 0,
    agent: status === "exited" ? null : (term.agent?.name ?? term.finished?.name ?? null),
    status,
    focused: ctx.focusedId === info.id,
    exitCode: info.exitCode,
    elapsed: showStats && term.agent ? formatElapsed(ctx.now - term.agent.startedAt) : null,
    cpu: showStats && term.stats ? formatPercent(term.stats.cpuPercent) : null,
    mem: showStats && term.stats ? formatBytes(term.stats.memBytes) : null,
    lastCommand: status === "exited" ? null : term.lastCommand,
    inWorktree: git?.isWorktree ?? false,
    worktrees: toWorktreeChips(term, status, ctx.paneNumbers),
    canShowTask: status !== "exited" && (term.agent !== null || term.task !== null),
    task: status === "exited" ? null : (term.task?.text ?? null),
    taskAge: term.task ? formatElapsed(ctx.now - term.task.updatedAt) : null,
  };
}

function toWorktreeChips(
  term: TerminalState,
  status: PaneStatus,
  paneNumbers: ReadonlyMap<TerminalId, number>,
): WorktreeChip[] {
  const worktrees = term.git?.worktrees ?? [];
  // A cd is only typed at a shell prompt: never into an agent, a running
  // program or a dead shell.
  const canCd = status !== "exited" && term.agent === null && term.atPrompt !== false;

  return worktrees.map((worktree) => {
    const others = worktree.openIn.filter((id) => id !== term.info.id);
    // Prefer a pane on this page so the menu can name it.
    const onPage = others.find((id) => paneNumbers.has(id));
    const openIn = onPage ?? others[0] ?? null;

    let move: WorktreeMove;
    if (worktree.isCurrent) move = "here";
    else if (worktree.prunable) move = "none";
    else if (openIn) move = "focus";
    else move = canCd ? "cd" : "new-pane";

    return {
      key: worktree.path,
      name: worktreeLabel(worktree.branch, worktree.head),
      current: worktree.isCurrent,
      main: worktree.isMain,
      openIn,
      paneNumber: onPage ? (paneNumbers.get(onPage) ?? null) : null,
      locked: worktree.locked,
      prunable: worktree.prunable,
      move,
    };
  });
}

/** True when the agent badge should use the Claude tint rather than the generic one. */
export function isClaudeAgent(agent: string): boolean {
  return /claude/i.test(agent);
}
