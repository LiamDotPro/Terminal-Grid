import { useEffect, useState } from "react";
import { TASK_REPORT_INSTRUCTIONS } from "../lib/agentTask";

const ASK_COOLDOWN_MS = 10_000;

interface TaskPopoverProps {
  agent: string | null;
  task: string | null;
  taskAge: string | null;
  onAsk: () => void;
}

/**
 * Drops down under the pane header from the task line (or the "task" button
 * before the agent has reported anything). The header line shows the task on
 * one row; this has the full text and the ways to get a report (design
 * section 5.5).
 */
export function TaskPopover({ agent, task, taskAge, onAsk }: TaskPopoverProps) {
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
    <div className="pane__task" role="dialog" aria-label="Current task" onMouseDown={(event) => event.stopPropagation()}>
      <div className="pane__task-head">
        <span className="pane__task-label">Current task</span>
        {taskAge && task && <span className="pane__task-age">{taskAge} ago</span>}
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
          onClick={() => {
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
            onClick={copyInstructions}
          >
            {copied ? "Copied" : "Copy instructions"}
          </button>
        )}
      </div>
    </div>
  );
}
