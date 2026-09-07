import { cx } from "../lib/cx";
import { isClaudeAgent, type PaneView } from "../state/model";
import { XtermSurface } from "./XtermSurface";

interface TerminalPaneProps {
  view: PaneView;
  /** Dense pages (3x3) drop the per-agent stats and the last command line. */
  compact: boolean;
  onFocus: () => void;
  onClose: () => void;
  onRestart: () => void;
}

export function TerminalPane({ view, compact, onFocus, onClose, onRestart }: TerminalPaneProps) {
  const showDetail = !compact && view.agent !== null && view.status !== "exited";
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
