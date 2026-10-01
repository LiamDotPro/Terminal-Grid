import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { isClaudeAgent, type PaneView } from "../state/model";
import { TaskOverlay } from "./TaskOverlay";
import { XtermSurface } from "./XtermSurface";

export type OpenFromHow = "same-folder" | "pick-folder";

interface TerminalPaneProps {
  view: PaneView;
  /** Dense pages (3x3) drop the per-agent stats and the last command line. */
  compact: boolean;
  onFocus: () => void;
  /** Opens a new pane next to this one. */
  onOpenFrom: (how: OpenFromHow) => void;
  onClose: () => void;
  onRestart: () => void;
  /** Asks the pane's agent to report what it is working on. */
  onAskForTask: () => void;
  /** Agent CLIs on PATH, offered as launchers while no agent runs. */
  agents: string[];
  onLaunchAgent: (agent: string) => void;
}

export function TerminalPane({
  view,
  compact,
  onFocus,
  onOpenFrom,
  onClose,
  onRestart,
  onAskForTask,
  agents,
  onLaunchAgent,
}: TerminalPaneProps) {
  const [taskOpen, setTaskOpen] = useState(false);
  const showDetail = !compact && view.agent !== null && view.status !== "exited";
  const showLaunchers = view.agent === null && view.status !== "exited";
  const showSecondRow = view.worktrees.length > 0 || (showDetail && view.lastCommand !== null);

  return (
    <section
      className={cx(
        "pane",
        view.focused && "pane--focused",
        view.status === "finished" && "pane--finished",
      )}
      aria-label={`Pane ${view.n}: ${view.title}`}
      onMouseDown={onFocus}
    >
      <div className="pane__header">
        <div className="pane__row">
          <span className="pane__index">{view.n}</span>
          <span className="pane__repo ellipsis" title={view.cwd}>
            {view.title}
          </span>
          {view.branch && <span className="pane__branch ellipsis">{view.branch}</span>}

          {(view.dirty || view.ahead > 0 || view.behind > 0) && (
            <span className="pane__git">
              {view.dirty && (
                <span className="pane__dirty" title="Uncommitted changes">
                  ●
                </span>
              )}
              {view.ahead > 0 && <span title={`${view.ahead} ahead of upstream`}>↑{view.ahead}</span>}
              {view.behind > 0 && (
                <span title={`${view.behind} behind upstream`}>↓{view.behind}</span>
              )}
            </span>
          )}

          {view.user && <span className="pane__user">{view.user}</span>}

          <span className="spacer" />

          {view.status === "finished" && (
            <span className="pane__chip pane__chip--finished">finished</span>
          )}
          {view.status === "idle" && (
            <span className="pane__chip pane__chip--idle">waiting for input</span>
          )}
          {view.agent && (
            <span
              className={cx(
                "pane__chip",
                "pane__chip--agent",
                isClaudeAgent(view.agent) && "pane__chip--agent-claude",
              )}
            >
              {view.agent}
            </span>
          )}

          {showDetail && (
            <span className="pane__stats">
              {view.elapsed && <span title="Time since the agent started">{view.elapsed}</span>}
              {view.cpu && <span title="CPU">{view.cpu}</span>}
              {view.mem && <span title="Memory">{view.mem}</span>}
            </span>
          )}

          {view.canShowTask && (
            <button
              type="button"
              className={cx(
                "pane__task-toggle",
                taskOpen && "pane__task-toggle--open",
                view.task !== null && "pane__task-toggle--reported",
              )}
              aria-label={`Current task in pane ${view.n}`}
              aria-pressed={taskOpen}
              title={view.task ?? "What is the agent working on?"}
              onClick={(event) => {
                event.stopPropagation();
                setTaskOpen((value) => !value);
              }}
            >
              task
            </button>
          )}

          {showLaunchers &&
            agents.map((agent) => (
              <button
                key={agent}
                type="button"
                className="pane__launch"
                title={`Run ${agent} in this pane`}
                onClick={(event) => {
                  event.stopPropagation();
                  onLaunchAgent(agent);
                }}
              >
                {agent}
              </button>
            ))}

          <OpenFromButton n={view.n} onOpenFrom={onOpenFrom} />

          <button
            type="button"
            className="btn btn--icon"
            aria-label={`Close pane ${view.n}`}
            title="Close pane"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        </div>

        {showSecondRow && (
          <div className="pane__row">
            {view.worktrees.map((worktree) => (
              <span
                key={worktree.key}
                className={cx(
                  "pane__worktree",
                  worktree.current && "pane__worktree--current",
                  worktree.prunable && "pane__worktree--prunable",
                )}
                title={worktree.key}
              >
                <span className="ellipsis">{worktree.name}</span>
                {worktree.locked && <span title="Locked">🔒</span>}
                {worktree.paneNumber !== null && (
                  <span className="pane__worktree-pane" title={`Open in pane ${worktree.paneNumber}`}>
                    {worktree.paneNumber}
                  </span>
                )}
              </span>
            ))}

            <span className="spacer" />

            {showDetail && view.lastCommand && (
              <span className="pane__last-command ellipsis" title={view.lastCommand}>
                <span className="pane__last-command-sigil">$ </span>
                {view.lastCommand}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="pane__body">
        <XtermSurface id={view.id} />

        {taskOpen && view.canShowTask && (
          <TaskOverlay
            agent={view.agent}
            task={view.task}
            taskAge={view.taskAge}
            onAsk={onAskForTask}
            onClose={() => setTaskOpen(false)}
          />
        )}

        {view.status === "exited" && (
          <div className="pane__exited">
            <div className="pane__exited-text">
              Shell exited · code {view.exitCode ?? "unknown"}
            </div>
            <button
              type="button"
              className="pane__restart"
              onClick={(event) => {
                event.stopPropagation();
                onRestart();
              }}
            >
              <span aria-hidden="true">⟳</span> Restart
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The header's "+": a click opens a pane in this pane's folder right next to
 * it; the small menu under it also offers a folder picker. Shift+click skips
 * the menu and picks a folder directly.
 */
function OpenFromButton({ n, onOpenFrom }: { n: number; onOpenFrom: (how: OpenFromHow) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node | null)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const choose = (how: OpenFromHow) => {
    setOpen(false);
    onOpenFrom(how);
  };

  return (
    <div className="pane__open" ref={root}>
      <button
        type="button"
        className={cx("btn", "btn--icon", open && "btn--icon-active")}
        aria-label={`New pane next to pane ${n}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="New pane next to this one (Shift+click: choose folder)"
        onClick={(event) => {
          event.stopPropagation();
          if (event.shiftKey) choose("pick-folder");
          else setOpen((value) => !value);
        }}
      >
        +
      </button>

      {open && (
        <div className="pane__menu" role="menu" onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" className="pane__menu-item" onClick={() => choose("same-folder")}>
            <span>New pane in this folder</span>
            <span className="pane__menu-hint">same cwd</span>
          </button>
          <button type="button" role="menuitem" className="pane__menu-item" onClick={() => choose("pick-folder")}>
            <span>New pane in another folder…</span>
          </button>
        </div>
      )}
    </div>
  );
}
