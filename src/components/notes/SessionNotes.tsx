import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteLink, NoteNode, TerminalId } from "../../ipc/types";
import { cx } from "../../lib/cx";
import { basename } from "../../lib/format";
import { clock, folderFor, savedAgo, splitHeading } from "../../lib/sessionNotes";
import { shortcutLabel } from "../../lib/hotkeys";
import { useAppActions, useAppState, useHotkeyScheme } from "../../state/AppProvider";
import { MarkdownDoc } from "./NotePreview";

/** A note saved this recently gets the green "just saved" dot. */
const FRESH_MS = 2 * 60_000;

/** One row of the list: a note copied out of a terminal, or one written by hand. */
interface NoteItem {
  relPath: string;
  title: string;
  /** Set for a note copied out of a terminal, from this session or another. */
  copied: NoteLink | null;
  /** Copied out of this pane's session. */
  thisSession: boolean;
  /** When it was copied, or for a hand-written note when it was last saved. */
  at: number;
}

type Scope = "session" | "folder";

/**
 * Notes under the terminal in focus mode (design turn 6, screen 6b). Two
 * scopes: what was copied out of this terminal session, and every note in
 * the notes folder of the pane's repository, hand-written ones included.
 * The list is on the left, the selected note rendered on the right; notes
 * are edited in the Notes tab.
 */
export function SessionNotes({ id, paneNumber }: { id: TerminalId; paneNumber: number }) {
  const state = useAppState();
  const actions = useAppActions();
  const scheme = useHotkeyScheme();
  const term = state.terminals[id];

  const repo = term?.git?.repoName ?? (term ? basename(term.info.cwd) : "");
  const folder = folderFor(repo);
  const folderLabel = `${state.notes.root ? basename(state.notes.root) : "notes"}/${folder}/`;

  const files = useMemo(() => fileNodes(state.notes.tree), [state.notes.tree]);
  const links = term?.notes;

  // Notes deleted or moved outside the app drop out of both lists.
  const sessionItems = useMemo<NoteItem[]>(
    () =>
      [...(links ?? [])]
        .filter((link) => files.has(link.relPath))
        .reverse()
        .map((link) => ({ relPath: link.relPath, title: link.title, copied: link, thisSession: true, at: link.at })),
    [links, files],
  );
  const folderItems = useMemo<NoteItem[]>(() => {
    const mine = new Set((links ?? []).map((link) => link.relPath));
    const prefix = `${folder}/`;
    return [...files.values()]
      .filter((node) => node.relPath.startsWith(prefix))
      .map((node) => {
        const copied = state.copiedNotes[node.relPath] ?? null;
        return {
          relPath: node.relPath,
          title: copied?.title ?? titleOfFile(node.name),
          copied,
          thisSession: mine.has(node.relPath),
          at: copied?.at ?? node.mtimeMs,
        };
      })
      .sort((a, b) => b.at - a.at);
  }, [files, folder, links, state.copiedNotes]);

  // Opens on this session's notes when it has any, else on the folder's.
  const [scope, setScope] = useState<Scope>(() => (sessionItems.length > 0 ? "session" : "folder"));
  const items = scope === "session" ? sessionItems : folderItems;

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selected = items.find((item) => item.relPath === selectedPath) ?? items[0] ?? null;

  // A note just copied out of the terminal shows straight away.
  const newest = sessionItems[0];
  const newestKey = newest ? `${newest.relPath}@${newest.at}` : null;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!newest) return;
    setScope("session");
    setSelectedPath(newest.relPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestKey]);

  const [renaming, setRenaming] = useState<string | null>(null);
  const content = useNoteContent(selected?.relPath ?? null);
  const empty = sessionItems.length === 0 && folderItems.length === 0;

  return (
    <section className={cx("session-notes", empty && "session-notes--empty")} aria-label="Notes">
      <div className="session-notes__head">
        <div className="review__seg" role="radiogroup" aria-label="Which notes">
          <ScopeButton
            label="This session"
            count={sessionItems.length}
            on={scope === "session"}
            title="Notes copied out of this terminal"
            onClick={() => setScope("session")}
          />
          <ScopeButton
            label={`All in ${repo || "folder"}`}
            count={folderItems.length}
            on={scope === "folder"}
            title={`Every note in ${folderLabel}`}
            onClick={() => setScope("folder")}
          />
        </div>
        <span className="session-notes__folder ellipsis">{folderLabel}</span>
        <span className="spacer" />
        <button
          type="button"
          className="review-btn"
          title={`New note in ${folderLabel}`}
          onClick={() => {
            setScope("folder");
            void actions.newFolderNote(id);
          }}
        >
          <span className="session-notes__plus" aria-hidden="true">
            +
          </span>
          Note
        </button>
        {selected && (
          <button
            type="button"
            className="review-btn"
            title="Open in the Notes tab"
            onClick={() => void actions.openInNotes(selected.relPath)}
          >
            Open in Notes ↗
          </button>
        )}
      </div>

      {!empty && (
        <div className="session-notes__body">
          <div className="session-notes__list" role="listbox" aria-label="Notes">
            {items.length === 0 && (
              <p className="session-notes__none">
                {scope === "session"
                  ? `Nothing copied from this terminal yet. Select text and choose Save to note (${shortcutLabel(scheme, "save-note")}).`
                  : `No notes in ${folderLabel} yet.`}
              </p>
            )}
            {items.map((item) =>
              renaming === item.relPath ? (
                <RenameField
                  key={item.relPath}
                  initial={item.title}
                  onDone={(title) => {
                    setRenaming(null);
                    if (title && title !== item.title) void actions.renameFolderNote(item.relPath, title);
                  }}
                />
              ) : (
                <button
                  key={item.relPath}
                  type="button"
                  role="option"
                  aria-selected={item === selected}
                  className={cx("session-notes__item", item === selected && "session-notes__item--selected")}
                  title={`${item.relPath}\nDouble-click to rename`}
                  onClick={() => setSelectedPath(item.relPath)}
                  onDoubleClick={() => setRenaming(item.relPath)}
                >
                  <span className="session-notes__item-row">
                    <KindMark copied={item.copied !== null} />
                    <span className="session-notes__item-title ellipsis">{item.title}</span>
                    {item.copied && state.now - item.at < FRESH_MS && (
                      <span className="session-notes__fresh" title="Just saved" aria-label="Just saved" />
                    )}
                  </span>
                  <span className="session-notes__item-meta ellipsis">
                    {item.copied ? item.copied.source : "Note"} · {savedAgo(item.at, state.now)}
                    {scope === "folder" && item.thisSession && " · this session"}
                  </span>
                </button>
              ),
            )}
          </div>

          <div className="session-notes__view">
            {selected ? (
              <>
                <div className="session-notes__view-head">
                  <span className="session-notes__file ellipsis">{basename(selected.relPath)}</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="session-notes__edit"
                    title="Edit in the Notes tab"
                    onClick={() => void actions.openInNotes(selected.relPath)}
                  >
                    Edit
                  </button>
                </div>
                <NoteView item={selected} content={content} paneNumber={paneNumber} now={state.now} />
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function ScopeButton({
  label,
  count,
  on,
  title,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      title={title}
      className={cx("review__seg-item", on && "review__seg-item--on")}
      onClick={onClick}
    >
      {label} · {count}
    </button>
  );
}

/** Tells a note copied out of a terminal from one written by hand. */
function KindMark({ copied }: { copied: boolean }) {
  return copied ? (
    <span className="session-notes__kind session-notes__kind--copied" title="Copied from a terminal">
      ›_
    </span>
  ) : (
    <span className="session-notes__kind" title="Written by hand">
      ✎
    </span>
  );
}

function NoteView({
  item,
  content,
  paneNumber,
  now,
}: {
  item: NoteItem;
  content: string | null;
  paneNumber: number;
  now: number;
}) {
  const { heading, body } = useMemo(() => splitHeading(content ?? ""), [content]);
  const copied = item.copied;
  const meta = copied
    ? [
        item.thisSession ? `pane ${paneNumber}` : "another session",
        copied.source,
        copied.branch,
        clock(new Date(copied.at)),
      ]
        .filter(Boolean)
        .join(" · ")
    : `Note · saved ${savedAgo(item.at, now)}`;
  return (
    <div className="session-notes__doc">
      <div className="session-notes__doc-title">{heading ?? item.title}</div>
      <div className="session-notes__doc-meta">{meta}</div>
      {content === null ? <p className="session-notes__loading">Loading…</p> : <MarkdownDoc content={body} />}
    </div>
  );
}

/**
 * The selected note's text. The Notes tab's buffer wins while that note is
 * open there, so unsaved edits show; otherwise it is read again whenever the
 * notes folder changes.
 */
function useNoteContent(relPath: string | null): string | null {
  const { notes } = useAppState();
  const actions = useAppActions();
  const [loaded, setLoaded] = useState<{ relPath: string; content: string } | null>(null);
  const openHere = relPath !== null && notes.openPath === relPath && !notes.loading;

  useEffect(() => {
    if (!relPath || openHere) return;
    let cancelled = false;
    actions
      .readNote(relPath)
      .then((content) => {
        if (!cancelled) setLoaded({ relPath, content });
      })
      .catch(() => {
        // The list drops a note that is gone once the tree catches up.
      });
    return () => {
      cancelled = true;
    };
  }, [actions, relPath, openHere, notes.tree]);

  if (openHere) return notes.content;
  return loaded?.relPath === relPath ? loaded.content : null;
}

function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title?.trim() || null);
  };

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <input
      ref={input}
      className="session-notes__rename"
      defaultValue={initial}
      aria-label="Note title"
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

/** Every note file by path. */
function fileNodes(nodes: NoteNode[]): Map<string, NoteNode> {
  const out = new Map<string, NoteNode>();
  const walk = (list: NoteNode[]) => {
    for (const node of list) {
      if (node.kind === "file") out.set(node.relPath, node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** "webgl-context-loss.md" reads as "Webgl context loss" until it is opened. */
function titleOfFile(name: string): string {
  const stem = name.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim();
  return stem ? stem[0]!.toUpperCase() + stem.slice(1) : name;
}
