import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { pageSlice } from "../../ipc/layout";
import type { ChangedFile, ChangeStatus, FileVersions, ReviewStatus, TerminalId } from "../../ipc/types";
import { errorMessage } from "../../lib/appError";
import { cx } from "../../lib/cx";
import { diffLines, splitLines } from "../../lib/diff";
import { modifierLabel } from "../../lib/hotkeys";
import { clockTime, indentOf, languageOf, lineEndingOf, splitPath } from "../../lib/review";
import { commentStyle } from "../../lib/syntax";
import { useAppActions, useAppState } from "../../state/AppProvider";
import { DiffView, type DiffViewHandle } from "./DiffView";
import { FileEditor, hasDraft } from "./FileEditor";
import { RequestTray } from "./RequestTray";

/** How often the panel re-reads git while it is open. */
const POLL_MS = 2500;

interface Entry {
  file: ChangedFile;
  staged: boolean;
}

interface Selection {
  path: string;
  staged: boolean;
}

const STATUS_LABEL: Record<ChangeStatus, string> = {
  M: "M",
  A: "A",
  D: "D",
  R: "R",
  C: "C",
  T: "M",
  "?": "U",
  "!": "!",
};

const STATUS_TITLE: Record<ChangeStatus, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  T: "Type changed",
  "?": "Untracked",
  "!": "Conflict",
};

/**
 * The review panel of focus mode (design turns 2 to 4): the pane's
 * repository split into staged and unstaged files, a diff of the selected
 * file that takes line comments, an editor over the file on disk, and the
 * tray that sends the comments to the pane's agent.
 */
export function ReviewPanel({
  id,
  paneNumber,
  active,
}: {
  id: TerminalId;
  /** The pane's number on its page, as the bar's pills show it. */
  paneNumber: number;
  /** The panel, not the terminal next to it, has the keyboard. */
  active: boolean;
}) {
  const state = useAppState();
  const actions = useAppActions();
  const term = state.terminals[id];
  const mod = modifierLabel(state.config.hotkeyModifier);

  const root = useRef<HTMLDivElement>(null);
  const diff = useRef<DiffViewHandle>(null);
  const statusRef = useRef<ReviewStatus | null>(null);
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [versions, setVersions] = useState<FileVersions | null>(null);
  const [view, setView] = useState<"changes" | "file">("changes");
  const [mode, setMode] = useState<"review" | "edit">("review");
  const [trayOpen, setTrayOpen] = useState(false);
  const [committed, setCommitted] = useState<{ headShort: string; cleared: number } | null>(null);
  const [cursorPos, setCursorPos] = useState("");
  const [busy, setBusy] = useState(false);

  // Status ------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    let next: ReviewStatus;
    try {
      next = await actions.reviewStatus(id);
    } catch (error) {
      setFailure(errorMessage(error));
      setStatus(null);
      statusRef.current = null;
      return;
    }
    setFailure(null);
    const previous = statusRef.current;
    if (previous && previous.repoRoot === next.repoRoot) {
      const stillStaged = new Set(next.staged.map((file) => file.path));
      const wasStaged = new Set(previous.staged.map((file) => file.path));
      const cleared = previous.staged.filter((file) => !stillStaged.has(file.path));
      // A new HEAD that took staged files with it is a commit (screen 2b).
      if (next.head !== previous.head && cleared.length > 0) {
        setCommitted({ headShort: next.headShort ?? "", cleared: cleared.length });
        actions.forgetComments(next.repoRoot, cleared.map((file) => file.path));
      } else if (next.staged.some((file) => !wasStaged.has(file.path))) {
        setCommitted(null);
      }
    }
    statusRef.current = next;
    setStatus((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [actions, id]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // A command finishing in the pane (its git labels refresh) is a good moment too.
  const gitStamp = term?.git;
  useEffect(() => {
    if (gitStamp) void refresh();
  }, [gitStamp, refresh]);

  useEffect(() => {
    root.current?.focus();
  }, []);

  // Selection ---------------------------------------------------------------------

  const entries = useMemo<Entry[]>(
    () =>
      status
        ? [
            ...status.staged.map((file) => ({ file, staged: true })),
            ...status.unstaged.map((file) => ({ file, staged: false })),
          ]
        : [],
    [status],
  );

  const current =
    entries.find((entry) => entry.file.path === selection?.path && entry.staged === selection.staged) ??
    entries.find((entry) => entry.file.path === selection?.path) ??
    entries[0] ??
    null;

  useEffect(() => {
    if (current && (current.file.path !== selection?.path || current.staged !== selection.staged)) {
      setSelection({ path: current.file.path, staged: current.staged });
    }
  }, [current, selection]);

  const select = useCallback((entry: Entry) => {
    setSelection({ path: entry.file.path, staged: entry.staged });
    setCursorPos("");
  }, []);

  // File versions -------------------------------------------------------------------

  const currentFile = current?.file ?? null;
  const currentStaged = current?.staged ?? false;
  const fileKey = currentFile ? `${currentStaged ? "staged" : "unstaged"}:${currentFile.path}` : null;

  useEffect(() => {
    setVersions(null);
    if (!currentFile) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await actions.reviewFile(id, currentFile, currentStaged);
        if (cancelled) return;
        setVersions((previous) => (previous && sameVersions(previous, next) ? previous : next));
      } catch (error) {
        if (!cancelled) setFailure(errorMessage(error));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // The file entry's identity changes with every status read; its key does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, id, fileKey]);

  const canEdit = versions !== null && versions.disk !== null && !versions.binary && !versions.tooLarge;
  const editing = mode === "edit" && canEdit;
  const shownView = editing ? "file" : view;

  useEffect(() => {
    if (!editing) setCursorPos("");
  }, [editing]);

  const rows = useMemo(
    () => (versions ? diffLines(splitLines(versions.old ?? ""), splitLines(versions.new ?? "")) : []),
    [versions],
  );
  const newLines = useMemo(() => splitLines(versions?.new ?? ""), [versions]);

  // Comments ------------------------------------------------------------------------

  const repoRoot = status?.repoRoot ?? null;
  const repoComments = useMemo(
    () => state.review.comments.filter((comment) => comment.repoRoot === repoRoot),
    [state.review.comments, repoRoot],
  );
  const pending = useMemo(() => repoComments.filter((comment) => comment.status === "pending"), [repoComments]);
  const fileComments = useMemo(
    () => (currentFile && currentStaged ? repoComments.filter((comment) => comment.path === currentFile.path) : []),
    [repoComments, currentFile, currentStaged],
  );
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of repoComments) counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
    return counts;
  }, [repoComments]);
  const commentLines = useMemo(() => {
    const lines = new Map<number, number>();
    for (const comment of fileComments) lines.set(comment.line, (lines.get(comment.line) ?? 0) + 1);
    return lines;
  }, [fileComments]);

  const sent = state.review.sent && state.review.sent.repoRoot === repoRoot ? state.review.sent : null;
  const sentPane = sent ? pageSlice(state.order, state.page).indexOf(sent.paneId) + 1 : 0;
  const author = term?.git?.userName ?? "You";

  // Staging -----------------------------------------------------------------------------

  const stageOrUnstage = async (files: ChangedFile[], staged: boolean) => {
    if (files.length === 0 || busy) return;
    const paths = files.flatMap((file) => (file.oldPath ? [file.path, file.oldPath] : [file.path]));
    setBusy(true);
    if (staged) await actions.unstageFiles(id, paths);
    else await actions.stageFiles(id, paths);
    // The selection follows a single file to the other list.
    if (files.length === 1 && current && files[0]!.path === current.file.path) {
      setSelection({ path: current.file.path, staged: !staged });
    }
    await refresh();
    setBusy(false);
  };

  // Keyboard ------------------------------------------------------------------------------

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("textarea, input")) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (entries.length === 0) return;
        event.preventDefault();
        const index = current ? entries.indexOf(current) : -1;
        const next = entries[(index + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length];
        if (next) select(next);
        break;
      }
      case "n":
      case "N":
        event.preventDefault();
        diff.current?.step(event.shiftKey ? -1 : 1);
        break;
      case "f":
      case "F":
        if (editing) return;
        event.preventDefault();
        setView((value) => (value === "changes" ? "file" : "changes"));
        break;
      case "e":
      case "E":
        if (!canEdit) return;
        event.preventDefault();
        setMode((value) => (value === "edit" ? "review" : "edit"));
        break;
      case "c":
      case "C":
        if (editing || !currentStaged) return;
        event.preventDefault();
        diff.current?.commentAtCursor();
        break;
      case "Escape":
        if (trayOpen) {
          event.preventDefault();
          setTrayOpen(false);
        }
        break;
    }
  };

  const closeTray = useCallback(() => setTrayOpen(false), []);

  // Render ---------------------------------------------------------------------------------

  const fileMeta = useMemo(() => {
    const text = versions?.new ?? versions?.disk ?? versions?.old ?? "";
    return { eol: lineEndingOf(text), indent: indentOf(text).label };
  }, [versions]);

  const draftKeyFor = (path: string) => `${id}:${path}`;

  return (
    <div
      className={cx("review", active && "review--active")}
      ref={root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label={`Review for pane ${paneNumber}`}
    >
      <div className="review__head">
        <span className="review__title">Review</span>
        {term?.git?.repoName && <span className="review__repo">{term.git.repoName}</span>}
        {(status?.branch ?? status?.headShort) && (
          <span className="review__branch">{status?.branch ?? status?.headShort}</span>
        )}
        <span className="review__pane">pane {paneNumber}</span>
        <span className="spacer" />

        {committed && (
          <span className="review__badge review__badge--ok">
            <span className="review__badge-dot" aria-hidden="true" />
            {committed.headShort && <span className="mono">{committed.headShort}</span>}
            committed · {committed.cleared} staged {committed.cleared === 1 ? "file" : "files"} cleared
          </span>
        )}

        {pending.length > 0 ? (
          <button
            type="button"
            data-request-toggle
            className={cx("review__request", trayOpen && "review__request--open")}
            title="Send pending comments to the focused terminal"
            aria-expanded={trayOpen}
            onClick={() => setTrayOpen((open) => !open)}
          >
            Request changes
            <span className="review__request-count">{pending.length}</span>
          </button>
        ) : (
          sent && (
            <span className="review__badge review__badge--sent">
              <span className="review__badge-check" aria-hidden="true">
                ✓
              </span>
              {sent.count} {sent.count === 1 ? "comment" : "comments"} sent to {sentPane > 0 ? `pane ${sentPane}` : "its pane"}
              <span className="review__badge-time">{clockTime(sent.at)}</span>
            </span>
          )
        )}

        <button
          type="button"
          className="review-icon"
          title={`Close review (${mod}+Enter)`}
          aria-label="Close review"
          onClick={actions.closeReview}
        >
          ×
        </button>
      </div>

      {failure && !status ? (
        <div className="review__message review__message--center">{failure}</div>
      ) : !status ? (
        <div className="review__message review__message--center">Reading git status…</div>
      ) : (
        <div className="review__body">
          <aside className="review__side">
            <div className="review__groups">
              {entries.length === 0 && (
                <div className="review__empty">
                  <div className="review__empty-title">Nothing to review</div>
                  The working tree is clean.
                </div>
              )}
              {status.staged.length > 0 && (
                <FileGroup
                  title="Staged"
                  files={status.staged}
                  staged
                  action="Unstage all"
                  onAction={() => void stageOrUnstage(status.staged, true)}
                  current={current}
                  counts={commentCounts}
                  drafts={(path) => hasDraft(draftKeyFor(path))}
                  onSelect={select}
                />
              )}
              {status.unstaged.length > 0 && (
                <FileGroup
                  title="Unstaged"
                  note="Stage a file to comment on it"
                  files={status.unstaged}
                  staged={false}
                  action="Stage all"
                  onAction={() => void stageOrUnstage(status.unstaged, false)}
                  current={current}
                  counts={new Map()}
                  drafts={(path) => hasDraft(draftKeyFor(path))}
                  onSelect={select}
                />
              )}
            </div>
            <div className="review__hints">
              {[
                ["↑↓", "file"],
                ["N", "next change"],
                ["F", "whole file"],
                ["E", "edit"],
                ["C", "comment"],
                [`${mod}+Enter`, "back to grid"],
              ].map(([key, label]) => (
                <span key={key} className="review__hint">
                  <span className="review__key">{key}</span>
                  {label}
                </span>
              ))}
            </div>
          </aside>

          <section className="review__main">
            {current ? (
              <>
                <FileToolbar
                  entry={current}
                  editing={editing}
                  view={shownView}
                  canEdit={canEdit}
                  busy={busy}
                  onView={(next) => {
                    setMode("review");
                    setView(next);
                  }}
                  onMode={setMode}
                  onStage={() => void stageOrUnstage([current.file], current.staged)}
                />

                {!current.staged && !editing && (
                  <div className="review__notice">
                    <span className="spacer">
                      Unstaged changes can't take comments. Stage the file to comment on it.
                    </span>
                    <button
                      type="button"
                      className="review-btn review-btn--strong"
                      disabled={busy}
                      onClick={() => void stageOrUnstage([current.file], false)}
                    >
                      Stage
                    </button>
                  </div>
                )}

                {!versions ? (
                  <div className="review__message">Loading…</div>
                ) : versions.binary ? (
                  <div className="review__message">Binary file, not shown.</div>
                ) : versions.tooLarge ? (
                  <div className="review__message">This file is too large to show.</div>
                ) : editing ? (
                  <FileEditor
                    key={`${fileKey}`}
                    draftKey={draftKeyFor(current.file.path)}
                    style={commentStyle(current.file.path)}
                    base={versions.old ?? ""}
                    disk={versions.disk ?? ""}
                    diskMtimeMs={versions.diskMtimeMs}
                    staged={current.staged}
                    commentLines={commentLines}
                    save={(content, expected) => actions.writeReviewFile(id, current.file.path, content, expected)}
                    onSaved={() => void refresh()}
                    onCursor={setCursorPos}
                    onLeave={() => root.current?.focus()}
                  />
                ) : (
                  <DiffView
                    key={`${fileKey}`}
                    ref={diff}
                    rows={rows}
                    view={shownView}
                    style={commentStyle(current.file.path)}
                    commentable={current.staged && versions.new !== null}
                    comments={fileComments}
                    newLines={newLines}
                    author={author}
                    now={state.now}
                    onAdd={(row, text) =>
                      actions.addComment({
                        repoRoot: status.repoRoot,
                        path: current.file.path,
                        line: row.new ?? 1,
                        lineText: row.text,
                        text,
                      })
                    }
                    onEdit={actions.editComment}
                    onDelete={actions.deleteComment}
                  />
                )}

                <div className="review__status">
                  {editing ? (
                    <>
                      <Legend kind="add" label="Added" />
                      <Legend kind="mod" label="Modified" />
                      <Legend kind="del" label="Removed" />
                      <Legend kind="edit" label="Your edit" />
                    </>
                  ) : (
                    shownView === "file" && (
                      <>
                        <Legend kind="add" label="Added" />
                        <Legend kind="del" label="Removed" />
                      </>
                    )
                  )}
                  <span className="spacer" />
                  {editing && cursorPos && <span className="review__cursor">{cursorPos}</span>}
                  <span>{languageOf(current.file.path)}</span>
                  <span>{fileMeta.eol}</span>
                  <span>UTF-8</span>
                  <span>{fileMeta.indent}</span>
                </div>
              </>
            ) : (
              <div className="review__message review__message--center">
                {entries.length === 0 ? "No changes in this repository." : "Pick a file."}
              </div>
            )}
          </section>
        </div>
      )}

      {trayOpen && pending.length > 0 && (
        <RequestTray
          comments={pending}
          paneNumber={paneNumber}
          onRemove={actions.deleteComment}
          onSend={(note) =>
            actions.sendReview(
              id,
              pending.map((comment) => comment.id),
              note,
            )
          }
          onClose={closeTray}
        />
      )}
    </div>
  );
}

function FileGroup({
  title,
  note,
  files,
  staged,
  action,
  onAction,
  current,
  counts,
  drafts,
  onSelect,
}: {
  title: string;
  note?: string;
  files: ChangedFile[];
  staged: boolean;
  action: string;
  onAction: () => void;
  current: Entry | null;
  counts: ReadonlyMap<string, number>;
  drafts: (path: string) => boolean;
  onSelect: (entry: Entry) => void;
}) {
  return (
    <div className="review__group">
      <div className="review__group-head">
        <span className="review__group-title">
          {title} · {files.length}
        </span>
        <button type="button" className="review__group-action" onClick={onAction}>
          {action}
        </button>
      </div>
      {note && <div className="review__group-note">{note}</div>}
      {files.map((file) => {
        const { dir, name } = splitPath(file.path);
        const selected = current?.file.path === file.path && current.staged === staged;
        const comments = counts.get(file.path) ?? 0;
        return (
          <button
            key={file.path}
            type="button"
            className={cx("review__file", selected && "review__file--selected")}
            title={`${STATUS_TITLE[file.status]}: ${file.oldPath ? `${file.oldPath} → ` : ""}${file.path}`}
            onClick={() => onSelect({ file, staged })}
          >
            <span className={cx("review__file-status", `review__file-status--${statusClass(file.status)}`)}>
              {STATUS_LABEL[file.status]}
            </span>
            <span className="review__file-names">
              <span className="review__file-name ellipsis">{name}</span>
              {dir && <span className="review__file-dir ellipsis">{dir}</span>}
            </span>
            <span className="review__file-stats">
              {drafts(file.path) && <span className="review__file-draft" title="Unsaved edit" />}
              {comments > 0 && (
                <span className="review__file-comments" title="Comments">
                  {comments}
                </span>
              )}
              {file.binary ? (
                <span className="review__file-binary">bin</span>
              ) : (
                <>
                  {file.additions ? <span className="review__add">+{file.additions}</span> : null}
                  {file.deletions ? <span className="review__del">−{file.deletions}</span> : null}
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FileToolbar({
  entry,
  editing,
  view,
  canEdit,
  busy,
  onView,
  onMode,
  onStage,
}: {
  entry: Entry;
  editing: boolean;
  view: "changes" | "file";
  canEdit: boolean;
  busy: boolean;
  onView: (view: "changes" | "file") => void;
  onMode: (mode: "review" | "edit") => void;
  onStage: () => void;
}) {
  const { dir, name } = splitPath(entry.file.path);
  const state = editing ? `${entry.staged ? "Staged" : "Unstaged"} · editing` : entry.staged ? "Staged" : "Unstaged";
  return (
    <div className="review__toolbar">
      <div className="review__path ellipsis" title={entry.file.path}>
        {dir && <span className="review__path-dir">{dir}/</span>}
        <span className="review__path-name">{name}</span>
      </div>
      {entry.file.additions ? <span className="review__add">+{entry.file.additions}</span> : null}
      {entry.file.deletions ? <span className="review__del">−{entry.file.deletions}</span> : null}
      <span
        className={cx(
          "review__state",
          editing ? "review__state--editing" : entry.staged ? "review__state--staged" : "review__state--unstaged",
        )}
      >
        {state}
      </span>
      <span className="spacer" />
      <div className="review__seg" role="radiogroup" aria-label="View" title="F">
        <SegButton label="Changes" on={view === "changes"} dim={editing} onClick={() => onView("changes")} />
        <SegButton label="Whole file" on={view === "file"} onClick={() => onView("file")} />
      </div>
      <div className="review__seg" role="radiogroup" aria-label="Mode" title="E">
        <SegButton label="Review" on={!editing} onClick={() => onMode("review")} />
        <SegButton label="Edit" on={editing} dim={!canEdit} disabled={!canEdit} onClick={() => onMode("edit")} />
      </div>
      {!editing && (
        <button type="button" className="review-btn" disabled={busy} onClick={onStage}>
          {entry.staged ? "Unstage" : "Stage"}
        </button>
      )}
    </div>
  );
}

function SegButton({
  label,
  on,
  dim,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  dim?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      className={cx("review__seg-item", on && "review__seg-item--on", dim && !on && "review__seg-item--dim")}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Legend({ kind, label }: { kind: string; label: string }) {
  return (
    <span className="review__legend">
      <span className={`review__legend-bar review__legend-bar--${kind}`} />
      {label}
    </span>
  );
}

function statusClass(status: ChangeStatus): string {
  switch (status) {
    case "A":
      return "added";
    case "D":
    case "!":
      return "deleted";
    case "?":
      return "untracked";
    case "R":
    case "C":
      return "renamed";
    default:
      return "modified";
  }
}

function sameVersions(a: FileVersions, b: FileVersions): boolean {
  return (
    a.old === b.old &&
    a.new === b.new &&
    a.disk === b.disk &&
    a.diskMtimeMs === b.diskMtimeMs &&
    a.binary === b.binary &&
    a.tooLarge === b.tooLarge
  );
}
