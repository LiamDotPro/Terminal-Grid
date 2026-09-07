/** Small presentation helpers. Pure and side effect free. */

/** Last path segment of a Windows or POSIX path, without a trailing separator. */
export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

/** Compact elapsed time for the pane header: 4s, 2m, 1h12m. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

/** Memory in the pane header: "410 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Branch label for a worktree chip: the branch, or a short detached head. */
export function worktreeLabel(branch: string | null, head: string | null): string {
  if (branch) return branch;
  if (head) return head.slice(0, 7);
  return "detached";
}
