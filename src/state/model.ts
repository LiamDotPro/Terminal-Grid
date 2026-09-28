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
  stats: TerminalStats | null;
  lastOutputAt: number;
}

export type PaneStatus = "running" | "idle" | "finished" | "exited";

export interface WorktreeChip {
  key: string;
  name: string;
  current: boolean;
  paneNumber: number | null;
  locked: boolean;
  prunable: boolean;
}

export interface PaneView {
  id: TerminalId;
  /** 1-based position on the current page; drives the badge and Ctrl+Alt+1..9. */
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
    worktrees: toWorktreeChips(term, ctx.paneNumbers),
    canShowTask: status !== "exited" && (term.agent !== null || term.task !== null),
    task: status === "exited" ? null : (term.task?.text ?? null),
    taskAge: term.task ? formatElapsed(ctx.now - term.task.updatedAt) : null,
  };
}

function toWorktreeChips(term: TerminalState, paneNumbers: ReadonlyMap<TerminalId, number>): WorktreeChip[] {
  const worktrees = term.git?.worktrees ?? [];
  return worktrees.map((worktree) => {
    const otherPane = worktree.openIn
      .filter((id) => id !== term.info.id)
      .map((id) => paneNumbers.get(id))
      .find((n): n is number => n !== undefined);

    return {
      key: worktree.path,
      name: worktreeLabel(worktree.branch, worktree.head),
      current: worktree.isCurrent,
      paneNumber: otherPane ?? null,
      locked: worktree.locked,
      prunable: worktree.prunable,
    };
  });
}

/** True when the agent badge should use the Claude tint rather than the generic one. */
export function isClaudeAgent(agent: string): boolean {
  return /claude/i.test(agent);
}
