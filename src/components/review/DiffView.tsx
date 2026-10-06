import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { changeStarts, layoutRows, overviewTicks, type DiffRow } from "../../lib/diff";
import { reanchor, relativeTime } from "../../lib/review";
import type { CommentStyle } from "../../lib/syntax";
import { cx } from "../../lib/cx";
import type { ReviewComment } from "../../state/reducer";
import { shortcutLabel } from "../../lib/hotkeys";
import { useHotkeyScheme } from "../../state/AppProvider";
import { CodeText, OverviewRuler, viewportOf } from "./code";

export interface DiffViewHandle {
  /** Moves the cursor to the next (1) or previous (-1) change. */
  step(direction: 1 | -1): void;
  /** Opens the comment box on the cursor's line. */
  commentAtCursor(): void;
}

interface DiffViewProps {
  rows: DiffRow[];
  view: "changes" | "file";
  style: CommentStyle;
  /** Only staged files take comments. */
  commentable: boolean;
  /** Comments on this file. */
  comments: ReviewComment[];
  /** Lines of the version comments are anchored to. */
  newLines: string[];
  author: string;
  now: number;
  onAdd(row: DiffRow, text: string): void;
  onEdit(id: string, text: string): void;
  onDelete(id: string): void;
}

interface ComposerState {
  row: number;
  /** The comment being reworded, or null for a new one. */
  commentId: string | null;
  text: string;
}

/**
 * The review side of the file view (screens 2a and 3a): changed sections with
 * context, or the whole file with an overview strip, and line comments.
 */
export const DiffView = forwardRef<DiffViewHandle, DiffViewProps>(function DiffView(
  { rows, view, style, commentable, comments, newLines, author, now, onAdd, onEdit, onDelete },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 1 });

  // Each comment follows its line if the file moved since it was written.
  const threads = useMemo(() => {
    const rowByLine = new Map<number, number>();
    rows.forEach((row, index) => {
      if (row.new !== null) rowByLine.set(row.new, index);
    });
    const byRow = new Map<number, ReviewComment[]>();
    for (const comment of comments) {
      const line = reanchor(newLines, comment.line, comment.lineText);
      const index = rowByLine.get(line);
      if (index === undefined) continue;
      byRow.set(index, [...(byRow.get(index) ?? []), comment]);
    }
    return byRow;
  }, [rows, comments, newLines]);

  const pinned = useMemo(() => {
    const set = new Set(threads.keys());
    if (composer) set.add(composer.row);
    return set;
  }, [threads, composer]);

  const items = useMemo(() => layoutRows(rows, { view, expanded, pinned }), [rows, view, expanded, pinned]);
  const starts = useMemo(() => changeStarts(rows), [rows]);

  const scrollToRow = useCallback((index: number) => {
    scroller.current
      ?.querySelector(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const openComposer = useCallback(
    (index: number) => {
      if (!commentable) return;
      // A removed line has no place in the staged file; use the line after it.
      let target = index;
      while (target < rows.length && rows[target]!.new === null) target++;
      if (target >= rows.length) return;
      setCursor(target);
      setComposer({ row: target, commentId: null, text: "" });
    },
    [commentable, rows],
  );

  useImperativeHandle(
    ref,
    () => ({
      step(direction) {
        if (starts.length === 0) return;
        const from = cursor ?? (direction === 1 ? -1 : rows.length);
        const next =
          direction === 1
            ? (starts.find((start) => start > from) ?? starts[0]!)
            : ([...starts].reverse().find((start) => start < from) ?? starts[starts.length - 1]!);
        setCursor(next);
        scrollToRow(next);
      },
      commentAtCursor() {
        openComposer(cursor ?? starts[0] ?? 0);
      },
    }),
    [cursor, openComposer, rows.length, scrollToRow, starts],
  );

  const onScroll = () => {
    if (scroller.current && view === "file") setViewport(viewportOf(scroller.current));
  };
  useLayoutEffect(onScroll, [view, items]);

  const ticks = useMemo(
    () => overviewTicks(rows.map((row) => (row.kind === "ctx" ? "none" : row.kind))),
    [rows],
  );

  const onRowClick = useCallback((index: number) => setCursor(index), []);

  if (rows.length === 0) {
    return <div className="review__message">This file is empty.</div>;
  }

  return (
    <div className="diff">
      <div className="diff__scroll" ref={scroller} onScroll={onScroll}>
        {starts.length === 0 && view === "changes" && (
          <div className="review__message">No line changes: only the mode or the name changed.</div>
        )}
        {items.map((item) => {
          if (item.kind === "sep") {
            if (view === "changes" && starts.length === 0) return null;
            const expand = item.gapStart !== null ? () => setExpanded((set) => new Set(set).add(item.gapStart!)) : undefined;
            return (
              <div key={`sep-${item.gapStart ?? "x"}-${item.header}`} className="diff__sep">
                <button type="button" className="diff__sep-expand" title="Show unchanged lines" disabled={!expand} onClick={expand}>
                  ⋯
                </button>
                <span className="diff__sep-header ellipsis">{item.header}</span>
                {item.hidden > 0 && (
                  <button type="button" className="diff__sep-label" onClick={expand}>
                    ⋯ {item.hidden} unchanged {item.hidden === 1 ? "line" : "lines"}
                  </button>
                )}
              </div>
            );
          }
          const row = rows[item.index]!;
          const rowThreads = threads.get(item.index);
          const composing = composer?.row === item.index;
          return (
            <div key={item.index} data-row={item.index}>
              <DiffLine
                row={row}
                index={item.index}
                style={style}
                selected={cursor === item.index}
                composing={composing}
                commentable={commentable && row.new !== null}
                onClick={onRowClick}
                onComment={openComposer}
              />
              {rowThreads?.map((comment) =>
                composer?.commentId === comment.id ? null : (
                  <Thread
                    key={comment.id}
                    comment={comment}
                    line={row.new ?? comment.line}
                    author={author}
                    now={now}
                    onEdit={() => setComposer({ row: item.index, commentId: comment.id, text: comment.text })}
                    onDelete={() => onDelete(comment.id)}
                  />
                ),
              )}
              {composing && composer && (
                <Composer
                  line={row.new ?? 0}
                  text={composer.text}
                  editing={composer.commentId !== null}
                  onChange={(text) => setComposer({ ...composer, text })}
                  onCancel={() => setComposer(null)}
                  onSubmit={() => {
                    const text = composer.text.trim();
                    if (!text) return;
                    if (composer.commentId) onEdit(composer.commentId, text);
                    else onAdd(row, text);
                    setComposer(null);
                    scroller.current?.closest<HTMLElement>(".review")?.focus();
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {view === "file" && (
        <OverviewRuler
          ticks={ticks}
          viewport={viewport}
          onJump={(fraction) => scrollToRow(Math.min(rows.length - 1, Math.floor(fraction * rows.length)))}
        />
      )}
    </div>
  );
});

const DiffLine = memo(function DiffLine({
  row,
  index,
  style,
  selected,
  composing,
  commentable,
  onClick,
  onComment,
}: {
  row: DiffRow;
  index: number;
  style: CommentStyle;
  selected: boolean;
  composing: boolean;
  commentable: boolean;
  onClick: (index: number) => void;
  onComment: (index: number) => void;
}) {
  return (
    <div
      className={cx(
        "diff__line",
        `diff__line--${row.kind}`,
        selected && "diff__line--cursor",
        composing && "diff__line--composing",
      )}
      onMouseDown={() => onClick(index)}
    >
      <span className="diff__num">{row.old ?? ""}</span>
      {commentable ? (
        <button
          type="button"
          className="diff__num diff__num--new diff__num--commentable"
          title={`Comment on line ${row.new}`}
          onClick={() => onComment(index)}
        >
          {row.new}
        </button>
      ) : (
        <span className="diff__num diff__num--new">{row.new ?? ""}</span>
      )}
      <span className="diff__sign">{row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""}</span>
      <span className="diff__code">
        <CodeText text={row.text} style={style} />
      </span>
    </div>
  );
});

function Thread({
  comment,
  line,
  author,
  now,
  onEdit,
  onDelete,
}: {
  comment: ReviewComment;
  line: number;
  author: string;
  now: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sent = comment.status === "sent";
  return (
    <div className="thread">
      <div className="thread__head">
        <span className="thread__author">{author}</span>
        <span className="thread__where">line {line}</span>
        <span className="thread__when">{relativeTime(comment.createdAt, now)}</span>
        <span className={cx("thread__pill", sent ? "thread__pill--sent" : "thread__pill--pending")}>
          {sent ? "Sent" : "Pending"}
        </span>
        <span className="spacer" />
        <button type="button" className="thread__action" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="thread__action" onClick={onDelete}>
          Delete
        </button>
      </div>
      <div className="thread__text">{comment.text}</div>
    </div>
  );
}

function Composer({
  line,
  text,
  editing,
  onChange,
  onCancel,
  onSubmit,
}: {
  line: number;
  text: string;
  editing: boolean;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const scheme = useHotkeyScheme();
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <div className="composer">
      <textarea
        className="composer__input"
        autoFocus
        rows={2}
        value={text}
        placeholder="Leave a comment for the agent"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer__foot">
        <span className="composer__where">line {line}</span>
        <span className="spacer" />
        <span className="composer__hint">{shortcutLabel(scheme, "submit")}</span>
        <button type="button" className="review-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="review-btn review-btn--accent" disabled={!text.trim()} onClick={onSubmit}>
          {editing ? "Save" : "Comment"}
        </button>
      </div>
    </div>
  );
}
