import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { cx } from "../lib/cx";
import { isClaudeAgent, type PaneView, type WorktreeChip } from "../state/model";
import { TaskPopover } from "./TaskPopover";
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
  /** A worktree picked in the branch menu; `newPane` forces a new pane there. */
  onPickWorktree: (worktree: WorktreeChip, newPane: boolean) => void;
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
  onPickWorktree,
  agents,
  onLaunchAgent,
}: TerminalPaneProps) {
  const header = useRef<HTMLDivElement>(null);
  const [taskOpen, setTaskOpen] = useDismissable(header);
  const showDetail = !compact && view.agent !== null && view.status !== "exited";
  const showLaunchers = view.agent === null && view.status !== "exited";
  // A reported task takes the second row; otherwise the last command may.
  const showTaskLine = view.canShowTask && view.task !== null;
  const showLastCommand = !showTaskLine && showDetail && view.lastCommand !== null;

  useEffect(() => {
    if (!view.canShowTask) setTaskOpen(false);
  }, [view.canShowTask, setTaskOpen]);

  const toggleTask = (event: MouseEvent) => {
    event.stopPropagation();
    setTaskOpen((value) => !value);
  };

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
      <div className="pane__header" ref={header}>
        <div className="pane__row">
          <span className="pane__index">{view.n}</span>
          <span className="pane__repo ellipsis" title={view.cwd}>
            {view.title}
          </span>
          {view.branch && <BranchLabel view={view} onPick={onPickWorktree} />}

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

          {/* Until the agent reports, the task lives behind this button. */}
          {view.canShowTask && !showTaskLine && (
            <button
              type="button"
              className={cx("pane__task-toggle", taskOpen && "pane__task-toggle--open")}
              aria-label={`Current task in pane ${view.n}`}
              aria-expanded={taskOpen}
              title="What is the agent working on?"
              onClick={toggleTask}
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

        {showTaskLine && (
          <button
            type="button"
            className={cx("pane__row", "pane__task-line", taskOpen && "pane__task-line--open")}
            aria-label={`Current task in pane ${view.n}: ${view.task}`}
            aria-expanded={taskOpen}
            title={view.task ?? undefined}
            onClick={toggleTask}
          >
            <span className="pane__task-dot" aria-hidden="true" />
            <span className="pane__task-line-text ellipsis">{view.task}</span>
            {view.taskAge && <span className="pane__task-line-age">{view.taskAge}</span>}
          </button>
        )}

        {showLastCommand && (
          <div className="pane__row">
            <span className="pane__last-command ellipsis" title={view.lastCommand ?? undefined}>
              <span className="pane__last-command-sigil">$ </span>
              {view.lastCommand}
            </span>
          </div>
        )}

        {taskOpen && view.canShowTask && (
          <TaskPopover agent={view.agent} task={view.task} taskAge={view.taskAge} onAsk={onAskForTask} />
        )}
      </div>

      <div className="pane__body">
        <XtermSurface id={view.id} />

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
 * Open state for a menu or popover that closes on Escape or on a pointer
 * down anywhere outside `root`.
 */
function useDismissable(root: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);

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
  }, [open, root]);

  return [open, setOpen] as const;
}

/** Marks the branch when the pane sits in a linked worktree. */
function WorktreeGlyph() {
  return (
    <svg className="pane__worktree-glyph" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1.75" />
      <circle cx="4.5" cy="12.5" r="1.75" />
      <circle cx="11.5" cy="5.5" r="1.75" />
      <path d="M4.5 5.25v5.5M11.5 7.25c0 2.6-7 1.6-7 3.5" />
    </svg>
  );
}

const MOVE_HINT: Record<WorktreeChip["move"], string> = {
  here: "here",
  cd: "cd",
  focus: "go to pane",
  "new-pane": "new pane",
  none: "missing",
};

/**
 * The branch name. Inside a linked worktree a small glyph sits in front of
 * it; once the repo has more than one worktree it opens a menu that moves
 * this pane to another one (Shift+click an entry: always a new pane).
 */
function BranchLabel({
  view,
  onPick,
}: {
  view: PaneView;
  onPick: (worktree: WorktreeChip, newPane: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useDismissable(root);
  const current = view.worktrees.find((worktree) => worktree.current);
  const worktreeTitle = view.inWorktree && current ? `Linked worktree · ${current.key}` : null;

  if (view.worktrees.length < 2) {
    return (
      <span className="pane__branch" title={worktreeTitle ?? undefined}>
        {view.inWorktree && <WorktreeGlyph />}
        <span className="ellipsis">{view.branch}</span>
      </span>
    );
  }

  const pick = (worktree: WorktreeChip, newPane: boolean) => {
    setOpen(false);
    onPick(worktree, newPane);
  };

  return (
    <div className="pane__branch-wrap" ref={root}>
      <button
        type="button"
        className={cx("pane__branch", "pane__branch--menu", open && "pane__branch--open")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={[worktreeTitle, `${view.worktrees.length} worktrees · switch`].filter(Boolean).join("\n")}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {view.inWorktree && <WorktreeGlyph />}
        <span className="ellipsis">{view.branch}</span>
        <span className="pane__branch-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div
          className="pane__menu pane__menu--start"
          role="menu"
          aria-label="Worktrees"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="pane__menu-label">Worktrees</div>
          {view.worktrees.map((worktree) => {
            const inert = worktree.move === "here" || worktree.move === "none";
            return (
              <button
                key={worktree.key}
                type="button"
                role="menuitem"
                className={cx(
                  "pane__menu-item",
                  "pane__worktree-item",
                  worktree.current && "pane__worktree-item--current",
                  worktree.prunable && "pane__worktree-item--prunable",
                )}
                disabled={inert}
                title={inert ? worktree.key : `${worktree.key}\nShift+click: open in a new pane`}
                onClick={(event) => pick(worktree, event.shiftKey)}
              >
                <span className="pane__worktree-mark" aria-hidden="true" />
                <span className="pane__worktree-name ellipsis">{worktree.name}</span>
                {worktree.main && worktree.name !== "main" && <span className="pane__worktree-tag">main</span>}
                {worktree.locked && <span title="Locked">🔒</span>}
                <span className="spacer" />
                <span className="pane__menu-hint">
                  {worktree.move === "focus" && worktree.paneNumber !== null
                    ? `pane ${worktree.paneNumber}`
                    : MOVE_HINT[worktree.move]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The header's "+": a click opens a pane in this pane's folder right next to
 * it; the small menu under it also offers a folder picker. Shift+click skips
 * the menu and picks a folder directly.
 */
function OpenFromButton({ n, onOpenFrom }: { n: number; onOpenFrom: (how: OpenFromHow) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useDismissable(root);

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
