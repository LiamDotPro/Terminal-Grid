import { useEffect, useMemo, useRef, useState } from "react";
import { shortcutLabel } from "../../lib/hotkeys";
import { splitPath } from "../../lib/review";
import { useHotkeyScheme } from "../../state/AppProvider";
import type { ReviewComment } from "../../state/reducer";

interface RequestTrayProps {
  comments: ReviewComment[];
  paneNumber: number;
  onRemove(id: string): void;
  onSend(note: string): Promise<boolean>;
  onClose(): void;
}

/**
 * "Request changes" (screen 4a): the pending comments across files, an
 * optional note and one button that sends them to the focused terminal.
 */
export function RequestTray({ comments, paneNumber, onRemove, onSend, onClose }: RequestTrayProps) {
  const scheme = useHotkeyScheme();
  const root = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const groups = useMemo(() => {
    const byPath = new Map<string, ReviewComment[]>();
    for (const comment of [...comments].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)) {
      byPath.set(comment.path, [...(byPath.get(comment.path) ?? []), comment]);
    }
    return [...byPath.entries()];
  }, [comments]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-request-toggle]")) return;
      if (!root.current?.contains(target)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  useEffect(() => {
    if (comments.length === 0) onClose();
  }, [comments.length, onClose]);

  const send = async () => {
    if (sending || comments.length === 0) return;
    setSending(true);
    const sent = await onSend(note);
    setSending(false);
    if (sent) onClose();
  };

  return (
    <div
      className="tray"
      ref={root}
      role="dialog"
      aria-label="Request changes"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void send();
        }
      }}
    >
      <div className="tray__head">
        <span className="tray__title">
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </span>
        <button type="button" className="review-icon" title="Close (Esc)" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="tray__body">
        {groups.map(([path, items]) => {
          const { dir, name } = splitPath(path);
          return (
            <div key={path} className="tray__group">
              <div className="tray__path">
                {dir && `${dir}/`}
                <span className="tray__name">{name}</span>
              </div>
              {items.map((comment) => (
                <div key={comment.id} className="tray__item">
                  <span className="tray__line">L{comment.line}</span>
                  <span className="tray__text">{comment.text}</span>
                  <button
                    type="button"
                    className="tray__remove"
                    title="Remove"
                    aria-label={`Remove the comment on line ${comment.line}`}
                    onClick={() => onRemove(comment.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}
        <textarea
          className="tray__note"
          rows={2}
          autoFocus
          placeholder="Add a note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="tray__foot">
        <span className="tray__hint">Sends to the focused terminal</span>
        <button
          type="button"
          className="review-btn review-btn--accent review-btn--large"
          disabled={sending}
          onClick={() => void send()}
        >
          Send to pane {paneNumber}
          <span className="review-btn__key">{shortcutLabel(scheme, "submit")}</span>
        </button>
      </div>
    </div>
  );
}
