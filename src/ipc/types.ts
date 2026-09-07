// IPC contract between the Rust core and the frontend.
// This is the one file the frontend imports from. Keep it in sync with docs/technical-design.md section 10.
// Rust structs use serde(rename_all = "camelCase"); command arguments are camelCase on this side.

export type TerminalId = string;

export type ShellKind = "pwsh" | "windowsPowerShell" | "cmd" | "bash" | "zsh" | "other";

export interface TerminalInfo {
  id: TerminalId;
  cwd: string;
  shell: ShellKind;
  shellPid: number | null;
  exited: boolean;
  exitCode: number | null;
}

// Git ---------------------------------------------------------------------

export interface Worktree {
  path: string;
  head: string | null;
  branch: string | null;
  isMain: boolean;
  isCurrent: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  openIn: TerminalId[];
}

export interface GitInfo {
  inRepo: boolean;
  repoRoot: string | null;
  commonDir: string | null;
  repoName: string | null;
  branch: string | null;
  headShort: string | null;
  userName: string | null;
  userEmail: string | null;
  remoteUrl: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  isWorktree: boolean;
  worktrees: Worktree[];
}

// Notes -------------------------------------------------------------------

export type NodeKind = "file" | "folder";

export interface NoteNode {
  name: string;
  relPath: string;
  kind: NodeKind;
  mtimeMs: number;
  size: number;
  children: NoteNode[] | null;
}

// Config and session ------------------------------------------------------

export type HotkeyModifier = "ctrl+alt" | "ctrl+shift";

export interface Config {
  version: 1;
  shell: string | null;
  shellArgs: string[];
  notesRoot: string | null;
  agentPatterns: string[];
  idleTimeoutMs: number;
  hotkeyModifier: HotkeyModifier;
  fontFamily: string | null;
  fontSize: number;
  scrollback: number;
  restoreSessionOnLaunch: boolean;
}

export interface SavedTerminal {
  id: TerminalId;
  cwd: string;
  labelOverride: string | null;
}

export interface Session {
  version: 1;
  activeTab: "terminals" | "notes";
  focusedId: TerminalId | null;
  page: number;
  terminals: SavedTerminal[];
  notes: { openRelPath: string | null; expandedFolders: string[] };
}

// Errors ------------------------------------------------------------------

export type AppErrorCode =
  | "NotFound"
  | "SpawnFailed"
  | "Io"
  | "OutsideRoot"
  | "Conflict"
  | "InvalidName"
  | "GitTimeout"
  | "GitNotInstalled";

export interface AppError {
  code: AppErrorCode;
  message: string;
  currentMtimeMs?: number; // present on Conflict
}

// Events (Rust to frontend) -------------------------------------------------

export const EVENTS = {
  output: "terminal://output",
  exit: "terminal://exit",
  cwd: "terminal://cwd",
  git: "terminal://git",
  agent: "terminal://agent",
  stats: "terminal://stats",
  notesChanged: "notes://changed",
} as const;

export interface OutputEvent { id: TerminalId; dataB64: string }
export interface ExitEvent { id: TerminalId; code: number | null }
export interface CwdEvent { id: TerminalId; cwd: string }
export interface GitEvent { id: TerminalId; info: GitInfo }

export type AgentSource = "process" | "shell" | "bell" | "idle";
export interface AgentEvent {
  id: TerminalId;
  event: "started" | "finished";
  name: string;
  durationMs?: number;
  source: AgentSource;
}

// Resource usage of the process tree behind a session. Emitted on the AgentWatcher
// tick (design section 5.1) for every session with a live shell; the pane header
// renders cpu/mem next to the agent badge.
export interface StatsEvent {
  id: TerminalId;
  cpuPercent: number;
  memBytes: number;
}

export interface NotesChangedEvent {
  relPath: string;
  kind: "create" | "modify" | "remove" | "rename";
}

// Commands (frontend to Rust) ---------------------------------------------
// Keyed by command name. Use with a typed invoke wrapper, e.g.
//   invoke<Commands["create_terminal"]["out"]>("create_terminal", args)

export interface Commands {
  // pty
  create_terminal: { in: { cwd?: string; cols: number; rows: number }; out: TerminalInfo };
  write_terminal: { in: { id: TerminalId; data: string }; out: void };
  write_terminal_bytes: { in: { id: TerminalId; dataB64: string }; out: void };
  resize_terminal: { in: { id: TerminalId; cols: number; rows: number }; out: void };
  close_terminal: { in: { id: TerminalId }; out: void };
  restart_terminal: { in: { id: TerminalId }; out: TerminalInfo };
  list_terminals: { in: Record<string, never>; out: TerminalInfo[] };
  set_terminal_cwd: { in: { id: TerminalId; cwd: string }; out: void };
  report_cwd: { in: { id: TerminalId; cwd: string }; out: void };
  set_focused_terminal: { in: { id: TerminalId | null }; out: void };

  // git
  get_git_info: { in: { id: TerminalId }; out: GitInfo };
  refresh_git_info: { in: { id: TerminalId }; out: void };

  // notes
  notes_get_root: { in: Record<string, never>; out: { root: string } };
  notes_set_root: { in: { root: string }; out: { root: string } };
  notes_tree: { in: Record<string, never>; out: NoteNode[] };
  notes_read: { in: { relPath: string }; out: { content: string; mtimeMs: number } };
  notes_write: { in: { relPath: string; content: string; expectedMtimeMs?: number }; out: { mtimeMs: number } };
  notes_create: { in: { relPath: string; kind: NodeKind }; out: NoteNode };
  notes_rename: { in: { relPath: string; newRelPath: string }; out: NoteNode };
  notes_delete: { in: { relPath: string; force?: boolean }; out: void };
  notes_reveal: { in: { relPath: string }; out: void };

  // config and session
  config_get: { in: Record<string, never>; out: Config };
  config_set: { in: { patch: Partial<Config> }; out: Config };
  session_get: { in: Record<string, never>; out: Session | null };
  session_set: { in: { session: Session }; out: void };
}

export type CommandName = keyof Commands;
