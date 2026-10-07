import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { errorMessage } from "../lib/appError";
import { cx } from "../lib/cx";
import { basename } from "../lib/format";
import { shortcutLabel } from "../lib/hotkeys";
import { useSolePopover } from "../lib/popover";
import { useHotkeyScheme } from "../state/AppProvider";
import { isClaudeAgent, type PaneView, type WorktreeChip } from "../state/model";
import { terminalRegistry } from "../terminals/registry";
import { AgentIcon } from "./AgentIcon";
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
  /** Adds a worktree for the branch and opens a pane in it; rejects with git's reason. */
  onCreateWorktree: (branch: string) => Promise<void>;
  onRemoveWorktree: (worktree: WorktreeChip) => void;
  /** Agent CLIs on PATH, offered as launchers while no agent runs. */
  agents: string[];
  onLaunchAgent: (agent: string) => void;
  onSaveSelection: () => void;
  onCopySelection: () => void;
  /** The file name of a note just saved from this pane, while its message shows. */
  savedNote: string | null;
  onUndoSave: () => void;
}

/** Room the selection menu needs, to keep it inside the pane. */
const MENU_W = 236;
const MENU_H = 36;

export function TerminalPane({
  view,
  compact,
  onFocus,
  onOpenFrom,
  onClose,
  onRestart,
  onAskForTask,
  onPickWorktree,
  onCreateWorktree,
  onRemoveWorktree,
  agents,
  onLaunchAgent,
  onSaveSelection,
  onCopySelection,
  savedNote,
  onUndoSave,
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

  // Releasing a selection offers Save to note and Copy next to the mouse.
  const body = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(
    () =>
      terminalRegistry.onSelectionMenu(view.id, (at) => {
        const rect = body.current?.getBoundingClientRect();
        if (!at || !rect) {
          setMenu(null);
          return;
        }
        const clamp = (value: number, max: number) => Math.max(8, Math.min(value, max));
        setMenu({
          left: clamp(at.x - rect.left + 6, rect.width - MENU_W - 8),
          top: clamp(at.y - rect.top + 12, rect.height - MENU_H - 8),
        });
      }),
    [view.id],
  );

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
          {view.branch && (
            <BranchLabel
              view={view}
              onPick={onPickWorktree}
              onCreate={onCreateWorktree}
              onRemove={onRemoveWorktree}
            />
          )}

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
              role="img"
              aria-label={`${view.agent} is running`}
              title={view.agent}
            >
              <AgentIcon agent={view.agent} size={12} />
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
                aria-label={`Run ${agent} in this pane`}
                title={`Run ${agent} in this pane`}
                onClick={(event) => {
                  event.stopPropagation();
                  onLaunchAgent(agent);
                }}
              >
                <AgentIcon agent={agent} />
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

      <div className="pane__body" ref={body}>
        <XtermSurface id={view.id} />

        {menu && (
          <SelectionMenu
            at={menu}
            onSave={() => {
              setMenu(null);
              onSaveSelection();
            }}
            onCopy={() => {
              setMenu(null);
              onCopySelection();
            }}
            onDismiss={closeMenu}
          />
        )}

        {savedNote && (
          <div className="pane__toast" role="status">
            <span className="pane__toast-check" aria-hidden="true">
              ✓
            </span>
            Saved to session notes
            <span className="pane__toast-file ellipsis">{savedNote}</span>
            <span className="pane__toast-rule" aria-hidden="true" />
            <button
              type="button"
              className="pane__toast-undo"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={onUndoSave}
            >
              Undo
            </button>
          </div>
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
 * Open state for a menu or popover that closes on Escape or on a pointer
 * down anywhere outside `root`, and when another popover opens.
 */
function useDismissable(root: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  useSolePopover(open, () => setOpen(false));

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
 * The branch name, which opens the worktree menu: every worktree of the repo
 * (picking one moves this pane there; Shift+click: always a new pane), a
 * remove button on linked ones nobody is using, and "New worktree…". Inside
 * a linked worktree a small glyph sits in front of the branch.
 */
function BranchLabel({
  view,
  onPick,
  onCreate,
  onRemove,
}: {
  view: PaneView;
  onPick: (worktree: WorktreeChip, newPane: boolean) => void;
  onCreate: (branch: string) => Promise<void>;
  onRemove: (worktree: WorktreeChip) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useDismissable(root);
  const current = view.worktrees.find((worktree) => worktree.current);
  const worktreeTitle = view.inWorktree && current ? `Linked worktree · ${current.key}` : null;

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
        title={[
          worktreeTitle,
          view.worktrees.length > 1 ? `${view.worktrees.length} worktrees · switch or add` : "Worktrees · add one",
        ]
          .filter(Boolean)
          .join("\n")}
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
            // Never pull a folder out from under a pane, and leave locks to git.
            const removable = !worktree.main && !worktree.current && !worktree.openIn && !worktree.locked;
            return (
              <div key={worktree.key} className="pane__worktree-row">
                <button
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
                {removable && (
                  <button
                    type="button"
                    className="pane__worktree-remove"
                    aria-label={`Remove worktree ${worktree.name}`}
                    title="Remove this worktree (the branch stays)"
                    onClick={() => {
                      setOpen(false);
                      onRemove(worktree);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <span className="pane__menu-rule" aria-hidden="true" />
          <NewWorktree
            mainKey={view.worktrees.find((worktree) => worktree.main)?.key ?? null}
            onCreate={async (branch) => {
              await onCreate(branch);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * "New worktree…" at the foot of the worktree menu. It opens into a branch
 * name field; Enter creates the worktree next to the main checkout and opens
 * a pane in it. git's refusal (a bad name, a branch checked out elsewhere)
 * shows under the field.
 */
function NewWorktree({ mainKey, onCreate }: { mainKey: string | null; onCreate: (branch: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        role="menuitem"
        className="pane__menu-item"
        title="An existing branch is checked out; a new name branches from this pane's HEAD"
        onClick={() => setEditing(true)}
      >
        <span>New worktree…</span>
        <span className="pane__menu-hint">new pane</span>
      </button>
    );
  }

  const name = branch.trim();
  // Mirrors the backend: `app` and `feature/x` give `app-feature-x` beside it.
  const folder = mainKey && name ? `${basename(mainKey)}-${name.replace(/[\\/\s]/g, "-")}` : null;

  return (
    <form
      className="pane__worktree-new"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name || busy) return;
        setBusy(true);
        setError(null);
        try {
          await onCreate(name);
        } catch (failure) {
          setError(errorMessage(failure));
          setBusy(false);
        }
      }}
    >
      <input
        className="pane__worktree-input"
        aria-label="Branch for the new worktree"
        placeholder="branch name"
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={branch}
        disabled={busy}
        onChange={(event) => {
          setBranch(event.target.value);
          setError(null);
        }}
      />
      <div className={cx("pane__worktree-note", error && "pane__worktree-note--error")} role={error ? "alert" : undefined}>
        {error ?? (busy ? "Creating…" : folder ? `../${folder} · Enter to create` : "Existing or new branch")}
      </div>
    </form>
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

/**
 * Save to note and Copy for the text just selected (design turn 7). Goes on
 * Escape, a click elsewhere or typing (the registry reports that one).
 */
function SelectionMenu({
  at,
  onSave,
  onCopy,
  onDismiss,
}: {
  at: { left: number; top: number };
  onSave: () => void;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scheme = useHotkeyScheme();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node | null)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onDismiss]);

  return (
    <div
      className="pane__selection-menu"
      ref={root}
      role="menu"
      aria-label="Selection"
      style={{ left: at.left, top: at.top }}
      // Keep the terminal's focus and selection while a button is pressed.
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="pane__selection-item pane__selection-item--save"
        title="Save selection as a note linked to this session"
        onClick={onSave}
      >
        Save to note
        <span className="pane__selection-key">{shortcutLabel(scheme, "save-note")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="pane__selection-item"
        title="Copy to clipboard"
        onClick={onCopy}
      >
        Copy
        <span className="pane__selection-key">{shortcutLabel(scheme, "copy")}</span>
      </button>
    </div>
  );
}
