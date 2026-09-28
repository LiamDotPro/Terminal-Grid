import { useEffect, useMemo } from "react";
import { layoutFor, pageSlice } from "../ipc/layout";
import type { TerminalId } from "../ipc/types";
import { cx } from "../lib/cx";
import { useAppActions, useAppState } from "../state/AppProvider";
import { toPaneView, type PaneViewContext } from "../state/model";
import { totalPages } from "../state/reducer";
import { terminalRegistry } from "../terminals/registry";
import { TerminalPane } from "./TerminalPane";

/** Dense pages hide the per-agent detail in the header, as screen 1b does. */
const COMPACT_FROM = 7;

export function PaneGrid() {
  const state = useAppState();
  const actions = useAppActions();
  const pages = totalPages(state);

  // Every page keeps its terminals mounted; a page switch only flips visibility,
  // so scrollback survives and FitAddon can still measure (design section 6).
  const pageIds = useMemo<TerminalId[][]>(
    () => Array.from({ length: pages }, (_, page) => pageSlice(state.order, page)),
    [state.order, pages],
  );

  useEffect(() => {
    terminalRegistry.fitAll();
  }, [state.page, state.order, state.activeTab, state.layoutMode]);

  return (
    <div className="grid">
      {pageIds.map((ids, page) => {
        const layout = layoutFor(ids.length, state.layoutMode);
        const paneNumbers = new Map(ids.map((id, index) => [id, index + 1]));
        const ctx: PaneViewContext = {
          now: state.now,
          idleTimeoutMs: state.config.idleTimeoutMs,
          focusedId: state.focusedId,
          paneNumbers,
        };

        return (
          <div
            key={page}
            className={cx("grid__page", page === state.page && "grid__page--active")}
            aria-hidden={page !== state.page}
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
            }}
          >
            {ids.map((id, index) => {
              const term = state.terminals[id];
              if (!term) return null;
              return (
                <TerminalPane
                  key={id}
                  view={toPaneView(term, index, ctx)}
                  compact={ids.length >= COMPACT_FROM}
                  onFocus={() => actions.focusTerminal(id)}
                  onOpenFrom={(how) => void actions.newTerminalFrom(id, how)}
                  onClose={() => void actions.closeTerminal(id)}
                  onRestart={() => void actions.restartTerminal(id)}
                  onAskForTask={() => void actions.askAgentForTask(id)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
