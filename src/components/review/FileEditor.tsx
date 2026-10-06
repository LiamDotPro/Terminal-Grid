import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { editorMarks, overviewTicks, type TickKind } from "../../lib/diff";
import { isAppError, errorMessage } from "../../lib/appError";
import { indentOf } from "../../lib/review";
import type { CommentStyle } from "../../lib/syntax";
import { cx } from "../../lib/cx";
import { shortcutLabel } from "../../lib/hotkeys";
import { useHotkeyScheme } from "../../state/AppProvider";
import { CodeText, OverviewRuler, viewportOf } from "./code";

/**
 * Unsaved buffers by pane and file, so switching files or going back to the
 * grid does not throw an edit away.
 */
const drafts = new Map<string, string>();

export function hasDraft(key: string): boolean {
  return drafts.has(key);
}

interface FileEditorProps {
  draftKey: string;
  style: CommentStyle;
  /** The version the diff starts from; the gutter marks changes against it. */
  base: string;
  /** The file as it is on disk. */
  disk: string;
  diskMtimeMs: number | null;
  /** A staged file: a save shows up as an unstaged change on top of it. */
  staged: boolean;
  /** Comment count by line, shown as small badges. */
  commentLines: ReadonlyMap<number, number>;
  save(content: string, expectedMtimeMs: number | null): Promise<{ mtimeMs: number }>;
  onSaved(): void;
  onCursor(position: string): void;
  /** Escape: hand the keyboard back to the panel. */
  onLeave(): void;
}

const LINE_HEIGHT = 22;

/**
 * Edit mode (screen 3b): a plain editor over the file on disk. Removed lines
 * become red markers, the gutter tells added, modified and unsaved lines
 * apart, and saving writes the file back.
 */
export function FileEditor({
  draftKey,
  style,
  base,
  disk,
  diskMtimeMs,
  staged,
  commentLines,
  save,
  onSaved,
  onCursor,
  onLeave,
}: FileEditorProps) {
  // The textarea only ever holds LF; a CRLF file gets its endings back on save.
  const crlf = /\r\n/.test(disk);
  const diskText = normalise(disk);
  const [baseline, setBaseline] = useState(diskText);
  const [buffer, setBuffer] = useState(() => drafts.get(draftKey) ?? diskText);
  const [mtime, setMtime] = useState(diskMtimeMs);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 1 });
  const scheme = useHotkeyScheme();
  const input = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const dirty = buffer !== baseline;

  // The file moved on disk: follow it when nothing is unsaved, ask otherwise.
  useEffect(() => {
    if (diskText === baseline) return;
    if (buffer === baseline) {
      setBaseline(diskText);
      setBuffer(diskText);
      setMtime(diskMtimeMs);
    } else {
      setConflict(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diskText]);

  useEffect(() => {
    if (dirty) drafts.set(draftKey, buffer);
    else drafts.delete(draftKey);
  }, [buffer, dirty, draftKey]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const deferred = useDeferredValue(buffer);
  const lines = useMemo(() => deferred.split("\n"), [deferred]);
  const baseLines = useMemo(() => normalise(base).split("\n"), [base]);
  const diskLines = useMemo(() => baseline.split("\n"), [baseline]);
  const marks = useMemo(() => editorMarks(baseLines, diskLines, lines), [baseLines, diskLines, lines]);
  const indent = useMemo(() => indentOf(baseline).unit, [baseline]);

  const unsavedChanges = useMemo(() => {
    let runs = 0;
    marks.forEach((line, index) => {
      if (line.mark === "edit" && marks[index - 1]?.mark !== "edit") runs++;
    });
    return Math.max(runs, dirty ? 1 : 0);
  }, [marks, dirty]);

  const ticks = useMemo(
    () =>
      overviewTicks(
        marks.map((line): TickKind | "none" =>
          line.mark !== "none" ? line.mark : line.removedAbove > 0 ? "del" : "none",
        ),
      ),
    [marks],
  );

  const sync = () => {
    const area = input.current;
    if (!area) return;
    if (highlight.current) {
      highlight.current.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`;
    }
    if (gutter.current) gutter.current.style.transform = `translateY(${-area.scrollTop}px)`;
    setViewport(viewportOf(area));
  };
  useLayoutEffect(sync, [lines.length]);

  const reportCursor = () => {
    const area = input.current;
    if (!area) return;
    const before = area.value.slice(0, area.selectionStart);
    const line = before.split("\n").length;
    const col = area.selectionStart - before.lastIndexOf("\n");
    onCursor(`Ln ${line}, Col ${col}`);
  };

  const write = async (force: boolean) => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    const written = buffer;
    try {
      const result = await save(crlf ? written.replace(/\n/g, "\r\n") : written, force ? null : mtime);
      setBaseline(written);
      setMtime(result.mtimeMs);
      setConflict(false);
      drafts.delete(draftKey);
      onSaved();
    } catch (error) {
      if (isAppError(error, "Conflict")) setConflict(true);
      else setFailure(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const reload = () => {
    setBaseline(diskText);
    setBuffer(diskText);
    setMtime(diskMtimeMs);
    setConflict(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Plain keys belong to the text, not the panel's shortcuts.
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (dirty) void write(false);
    } else if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      // execCommand keeps the edit on the textarea's undo stack.
      document.execCommand("insertText", false, indent);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onLeave();
    }
  };

  const contentHeight = lines.length * LINE_HEIGHT;

  return (
    <div className="file-editor">
      {conflict ? (
        <div className="review__notice review__notice--warn">
          <span className="spacer">This file changed on disk while you were editing.</span>
          <button type="button" className="review-btn review-btn--strong" onClick={reload}>
            Reload
          </button>
          <button type="button" className="review-btn" onClick={() => void write(true)}>
            Keep mine
          </button>
        </div>
      ) : (
        <div className="review__notice review__notice--accent">
          <span className={cx("review__notice-dot", dirty && "review__notice-dot--dirty")} aria-hidden="true" />
          <span className="spacer">
            {failure
              ? `Could not save: ${failure}`
              : dirty
                ? `${unsavedChanges} unsaved ${unsavedChanges === 1 ? "change" : "changes"}. Saving writes to disk${
                    staged ? ", and the change shows as unstaged on top of the staged version." : "."
                  }`
                : "Editing the file on disk. A saved change shows up as unstaged."}
          </span>
          <button type="button" className="review-btn" disabled={!dirty} onClick={() => setBuffer(baseline)}>
            Revert
          </button>
          <button
            type="button"
            className="review-btn review-btn--accent"
            disabled={!dirty || saving}
            onClick={() => void write(false)}
          >
            Save<span className="review-btn__key">{shortcutLabel(scheme, "save")}</span>
          </button>
        </div>
      )}

      <div className="file-editor__body">
        <div className="file-editor__gutter" aria-hidden="true">
          <div className="file-editor__gutter-inner" ref={gutter} style={{ height: contentHeight }}>
            {marks.map((line, index) => {
              const count = commentLines.get(index + 1);
              return (
                <div key={index} className={cx("file-editor__gline", `file-editor__gline--${line.mark}`)}>
                  <span className="file-editor__num">{index + 1}</span>
                  <span className="file-editor__bar" />
                  <span className="file-editor__badge-slot">
                    {count ? <span className="file-editor__badge" title="Comments on this line">{count}</span> : null}
                  </span>
                  {line.removedAbove > 0 && (
                    <span
                      className="file-editor__removed"
                      title={`${line.removedAbove} ${line.removedAbove === 1 ? "line" : "lines"} removed`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="file-editor__code">
          <div className="file-editor__highlight" ref={highlight} aria-hidden="true">
            {lines.map((text, index) => (
              <div key={index} className={cx("file-editor__line", marks[index]?.mark === "edit" && "file-editor__line--edit")}>
                <CodeText text={text} style={style} />
              </div>
            ))}
          </div>
          <textarea
            ref={input}
            className="file-editor__input"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            value={buffer}
            onChange={(event) => setBuffer(event.target.value)}
            onScroll={sync}
            onKeyDown={onKeyDown}
            onKeyUp={reportCursor}
            onClick={reportCursor}
            onSelect={reportCursor}
            onFocus={reportCursor}
          />
        </div>
        <OverviewRuler
          ticks={ticks}
          viewport={viewport}
          onJump={(fraction) => {
            const area = input.current;
            if (area) area.scrollTop = fraction * area.scrollHeight - area.clientHeight / 2;
          }}
        />
      </div>
    </div>
  );
}

function normalise(text: string): string {
  return text.replace(/\r\n/g, "\n");
}
