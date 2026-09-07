import { useMemo, type KeyboardEvent } from "react";
import { cx } from "../../lib/cx";
import { classifyLines, type LineKind } from "../../lib/markdown";
import { useAppActions, useAppState } from "../../state/AppProvider";
import type { SaveState } from "../../state/reducer";

const STATUS_TEXT: Record<SaveState, string> = {
  clean: "Up to date",
  dirty: "Unsaved · saving…",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

/**
 * Markdown editor. A transparent textarea sits exactly on top of a highlighted
 * copy of the same text, so the line numbers stay aligned even when a long
 * paragraph wraps, and every real editing behaviour still comes from the
 * textarea itself.
 */
export function NoteEditor() {
  const { notes } = useAppState();
  const actions = useAppActions();

  const lines = useMemo(() => notes.content.split("\n"), [notes.content]);
  const kinds = useMemo(() => classifyLines(notes.content), [notes.content]);

  if (!notes.openPath) {
    return (
      <div className="notes__panel">
        <div className="panel-head">Editor</div>
        <p className="editor__placeholder">
          Pick a note on the left, or create one with + File.
        </p>
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      insertAtCursor(event.currentTarget, "  ", actions.editNote);
      return;
    }
    if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void actions.saveNote();
    }
  };

  return (
    <div className="notes__panel">
      <div className="panel-head">
        <span className="editor__path ellipsis" title={notes.openPath}>
          {notes.openPath}
        </span>
        <span className="spacer" />
        <span className={cx("editor__status", `editor__status--${notes.saveState}`)}>
          <span className="editor__status-dot" aria-hidden="true" />
          {STATUS_TEXT[notes.saveState]}
        </span>
      </div>

      {notes.conflict && (
        <div className="conflict" role="alert">
          <span className="conflict__text">This file changed on disk while you were editing.</span>
          <button
            type="button"
            className="conflict__primary"
            onClick={() => void actions.reloadNote()}
          >
            Reload
          </button>
          <button
            type="button"
            className="conflict__secondary"
            onClick={() => void actions.keepMine()}
          >
            Keep mine
          </button>
        </div>
      )}

      <div className="editor__scroll">
        <div className="editor__stack">
          <div className="editor__lines" aria-hidden="true">
            {lines.map((line, index) => (
              <div className="editor__line" key={index}>
                <span className="editor__gutter">{index + 1}</span>
                <span className={cx("editor__text", textClass(kinds[index]))}>
                  {line === "" ? " " : line}
                </span>
              </div>
            ))}
          </div>
          <textarea
            className="editor__input"
            aria-label={`Editing ${notes.openPath}`}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={notes.content}
            onChange={(event) => actions.editNote(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => void actions.saveNote()}
          />
        </div>
      </div>
    </div>
  );
}

function textClass(kind: LineKind | undefined): string | false {
  switch (kind) {
    case "heading":
      return "editor__text--heading";
    case "code":
      return "editor__text--code";
    case "quote":
      return "editor__text--quote";
    case "list":
      return "editor__text--list";
    default:
      return false;
  }
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  onChange: (value: string) => void,
): void {
  const { selectionStart, selectionEnd, value } = textarea;
  const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
  onChange(next);
  // React re-renders from state, so restore the caret after the commit.
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = selectionStart + text.length;
  });
}
