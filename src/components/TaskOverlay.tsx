import { useEffect, useState } from "react";
import { TASK_REPORT_INSTRUCTIONS } from "../lib/agentTask";

const ASK_COOLDOWN_MS = 10_000;

interface TaskOverlayProps {
  agent: string | null;
  task: string | null;
  taskAge: string | null;
  onAsk: () => void;
  onClose: () => void;
}

/**
 * The card over the top right of the terminal that shows what the pane's agent
 * last reported through TERMINAL_GRID_TASK_FILE (design section 5.5).
 */
export function TaskOverlay({ agent, task, taskAge, onAsk, onClose }: TaskOverlayProps) {
  const [asked, setAsked] = useState(false);
  const [copied, setCopied] = useState(false);

  // A fresh report answers the question; let the button ask again. An agent
  // that never answers should not leave the button dead either.
  useEffect(() => setAsked(false), [task]);
  useEffect(() => {
    if (!asked) return;
    const timer = window.setTimeout(() => setAsked(false), ASK_COOLDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [asked]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyInstructions = () => {
    void navigator.clipboard.writeText(TASK_REPORT_INSTRUCTIONS).then(() => setCopied(true));
  };

  return (
    <div className="pane__task" role="status" aria-live="polite">
      <div className="pane__task-head">
        <span className="pane__task-label">Current task</span>
        {taskAge && <span className="pane__task-age">{taskAge} ago</span>}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn--icon"
          aria-label="Hide task"
          title="Hide task"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>

      {task ? (
        <p className="pane__task-text">{task}</p>
      ) : (
        <p className="pane__task-empty">
          {agent ?? "The agent"} has not reported a task yet. Ask it, or add the instructions to
          your CLAUDE.md or AGENTS.md so it reports on its own.
        </p>
      )}

      <div className="pane__task-actions">
        <button
          type="button"
          className="btn btn--quiet"
          disabled={asked}
          title="Types a short request into this pane asking the agent to report its task"
          onClick={(event) => {
            event.stopPropagation();
            setAsked(true);
            onAsk();
          }}
        >
          {asked ? "Asked…" : task ? "Ask for an update" : "Ask agent"}
        </button>
        {!task && (
          <button
            type="button"
            className="btn btn--quiet"
            title="Copies a CLAUDE.md / AGENTS.md section that makes agents report their task"
            onClick={(event) => {
              event.stopPropagation();
              copyInstructions();
            }}
          >
            {copied ? "Copied" : "Copy instructions"}
          </button>
        )}
      </div>
    </div>
  );
}
