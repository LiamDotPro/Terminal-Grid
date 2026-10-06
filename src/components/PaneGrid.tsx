import { useEffect, useMemo, useState } from "react";
import { layoutFor, pageSlice } from "../ipc/layout";
import type { TerminalId } from "../ipc/types";
import { cx } from "../lib/cx";
import { useAppActions, useAppState } from "../state/AppProvider";
import { toPaneView, type PaneViewContext } from "../state/model";
import { totalPages } from "../state/reducer";
import { terminalRegistry } from "../terminals/registry";
import { ReviewPanel } from "./review/ReviewPanel";
import { TerminalPane } from "./TerminalPane";

/** Dense pages hide the per-agent detail in the header, as screen 1b does. */
const COMPACT_FROM = 7;

export function PaneGrid() {
  const state = useAppState();
  const actions = useAppActions();
  const pages = totalPages(state);
  // Focus + review (screen 2a) lifts the focused pane out of its page and
  // puts it next to the review panel; every other pane stays mounted.
  const focusId =
    state.focusMode && state.focusedId && state.terminals[state.focusedId] ? state.focusedId : null;
  // Which side of focus mode has the keyboard, so only that one wears the ring.
  const [focusSide, setFocusSide] = useState<"terminal" | "review">("review");

  // Every page keeps its terminals mounted; a page switch only flips visibility,
  // so scrollback survives and FitAddon can still measure (design section 6).
  const pageIds = useMemo<TerminalId[][]>(
    () => Array.from({ length: pages }, (_, page) => pageSlice(state.order, page)),
    [state.order, pages],
  );

  useEffect(() => {
    terminalRegistry.fitAll();
  }, [state.page, state.order, state.activeTab, state.layoutMode, focusId]);

  useEffect(() => {
    if (focusId) setFocusSide("review");
  }, [focusId]);

  const renderPane = (id: TerminalId, index: number, ctx: PaneViewContext, compact: boolean, focused?: boolean) => {
    const term = state.terminals[id];
    if (!term) return null;
    const view = toPaneView(term, index, ctx);
    return (
      <TerminalPane
        key={id}
        view={focused === undefined ? view : { ...view, focused }}
        compact={compact}
        onFocus={() => actions.focusTerminal(id)}
        onOpenFrom={(how) => void actions.newTerminalFrom(id, how)}
        onClose={() => void actions.closeTerminal(id)}
        onRestart={() => void actions.restartTerminal(id)}
        onAskForTask={() => void actions.askAgentForTask(id)}
        onPickWorktree={(worktree, newPane) => {
          if (newPane) void actions.newTerminalIn(id, worktree.key);
          else if (worktree.move === "focus" && worktree.openIn) actions.focusTerminal(worktree.openIn);
          else if (worktree.move === "cd") void actions.changeDirectory(id, worktree.key);
          else if (worktree.move === "new-pane") void actions.newTerminalIn(id, worktree.key);
        }}
        agents={state.installedAgents}
        onLaunchAgent={(agent) => void actions.launchAgent(id, agent)}
      />
    );
  };

  const contextFor = (ids: TerminalId[]): PaneViewContext => ({
    now: state.now,
    idleTimeoutMs: state.config.idleTimeoutMs,
    focusedId: state.focusedId,
    paneNumbers: new Map(ids.map((id, index) => [id, index + 1])),
  });

  const focusPage = focusId ? pageSlice(state.order, state.page) : [];
  const focusIndex = focusId ? focusPage.indexOf(focusId) : -1;

  return (
    <div className="grid">
      {pageIds.map((ids, page) => {
        const layout = layoutFor(ids.length, state.layoutMode);
        const ctx = contextFor(ids);
        return (
          <div
            key={page}
            className={cx("grid__page", page === state.page && !focusId && "grid__page--active")}
            aria-hidden={page !== state.page || focusId !== null}
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
            }}
          >
            {ids.map((id, index) =>
              id === focusId ? null : renderPane(id, index, ctx, ids.length >= COMPACT_FROM),
            )}
          </div>
        );
      })}

      {focusId && (
        <div className="focus">
          <div className="focus__terminal" onFocusCapture={() => setFocusSide("terminal")}>
            {renderPane(focusId, Math.max(0, focusIndex), contextFor(focusPage), false, focusSide === "terminal")}
          </div>
          <div className="focus__review" onFocusCapture={() => setFocusSide("review")}>
            <ReviewPanel
              key={focusId}
              id={focusId}
              paneNumber={focusIndex + 1}
              active={focusSide === "review"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
