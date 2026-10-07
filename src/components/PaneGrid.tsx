import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import {
  evenSizes,
  evenSplit,
  moveDivider,
  offsets,
  pageSlice,
  rowCounts,
  sizesFit,
  withColumns,
  type PageSizes,
} from "../ipc/layout";
import type { TerminalId } from "../ipc/types";
import { cx } from "../lib/cx";
import { basename } from "../lib/format";
import { useAppActions, useAppState } from "../state/AppProvider";
import { toPaneView, type PaneViewContext } from "../state/model";
import { totalPages } from "../state/reducer";
import { terminalRegistry } from "../terminals/registry";
import { ReviewPanel } from "./review/ReviewPanel";
import { SessionNotes } from "./notes/SessionNotes";
import { TerminalPane } from "./TerminalPane";

/** Dense pages hide the per-agent detail in the header, as screen 1b does. */
const COMPACT_FROM = 7;

/** The smallest a divider drag leaves a pane, in px, so its header still fits. */
const MIN_PANE_W = 180;
const MIN_PANE_H = 96;

/** Start and length of item `index` along a track of `sizes` with a gap between items. */
function span(sizes: number[], index: number): { start: string; size: string } {
  const track = `(100% - ${sizes.length - 1} * var(--grid-gap))`;
  return {
    start: `calc(${track} * ${offsets(sizes)[index] ?? 0} + ${index} * var(--grid-gap))`,
    size: `calc(${track} * ${sizes[index] ?? 0})`,
  };
}

/** The gap after item `index`, where its divider sits. */
function gapAfter(sizes: number[], index: number): string {
  const track = `(100% - ${sizes.length - 1} * var(--grid-gap))`;
  return `calc(${track} * ${offsets(sizes)[index + 1] ?? 0} + ${index} * var(--grid-gap))`;
}

/**
 * Drags the divider after `sizes[index]` along `axis`, measured against the
 * page the handle sits in, and hands every new set of sizes to `apply`.
 */
function dragDivider(
  event: PointerEvent<HTMLDivElement>,
  axis: "x" | "y",
  sizes: number[],
  index: number,
  apply: (next: number[]) => void,
) {
  if (event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget;
  const page = handle.parentElement;
  if (!page) return;
  const rect = page.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(page).getPropertyValue("--grid-gap")) || 0;
  const length = (axis === "x" ? rect.width : rect.height) - (sizes.length - 1) * gap;
  if (length <= 0) return;
  const origin = axis === "x" ? event.clientX : event.clientY;
  const from = offsets(sizes)[index + 1] ?? 0;
  const min = (axis === "x" ? MIN_PANE_W : MIN_PANE_H) / length;
  handle.setPointerCapture(event.pointerId);
  const move = (e: globalThis.PointerEvent) => {
    const at = from + ((axis === "x" ? e.clientX : e.clientY) - origin) / length;
    apply(moveDivider(sizes, index, at, min));
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

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
  // Divider positions per page. A page whose shape changed starts even again.
  const [sizes, setSizes] = useState<Record<number, PageSizes>>({});

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
        onCreateWorktree={(branch) => actions.createWorktree(id, branch)}
        onRemoveWorktree={(worktree) => void actions.removeWorktree(id, worktree)}
        agents={state.installedAgents}
        onLaunchAgent={(agent) => void actions.launchAgent(id, agent)}
        onSaveSelection={() => void actions.saveSelection(id)}
        onCopySelection={() => void actions.copySelection(id)}
        savedNote={state.noteToast?.paneId === id ? basename(state.noteToast.relPath) : null}
        onUndoSave={() => void actions.undoSavedNote()}
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
        const counts = rowCounts(ids.length, state.layoutMode);
        const stored = sizes[page];
        const pageSizes = stored && sizesFit(stored, counts) ? stored : evenSizes(counts);
        const setPage = (next: PageSizes) => setSizes((all) => ({ ...all, [page]: next }));
        const ctx = contextFor(ids);
        const compact = ids.length >= COMPACT_FROM;
        const rowStarts = offsets(counts);
        return (
          <div
            key={page}
            className={cx("grid__page", page === state.page && !focusId && "grid__page--active")}
            aria-hidden={page !== state.page || focusId !== null}
          >
            {counts.map((count, row) => {
              const rowSpan = span(pageSizes.rows, row);
              const cols = pageSizes.cols[row] ?? evenSplit(count);
              return Array.from({ length: count }, (_, col) => {
                const index = (rowStarts[row] ?? 0) + col;
                const id = ids[index];
                if (!id || id === focusId) return null;
                const colSpan = span(cols, col);
                const style: CSSProperties = {
                  top: rowSpan.start,
                  height: rowSpan.size,
                  left: colSpan.start,
                  width: colSpan.size,
                };
                return (
                  <div key={id} className="grid__cell" style={style}>
                    {renderPane(id, index, ctx, compact)}
                  </div>
                );
              });
            })}

            {counts.map((count, row) => {
              const rowSpan = span(pageSizes.rows, row);
              const cols = pageSizes.cols[row] ?? evenSplit(count);
              return Array.from({ length: count - 1 }, (_, col) => (
                <div
                  key={`col-${row}-${col}`}
                  className="grid__divider grid__divider--col"
                  role="separator"
                  aria-orientation="vertical"
                  style={{ top: rowSpan.start, height: rowSpan.size, left: gapAfter(cols, col) }}
                  onPointerDown={(event) =>
                    dragDivider(event, "x", cols, col, (next) => setPage(withColumns(pageSizes, count, next)))
                  }
                  onDoubleClick={() => setPage(withColumns(pageSizes, count, evenSplit(count)))}
                />
              ));
            })}

            {counts.slice(1).map((_, row) => (
              <div
                key={`row-${row}`}
                className="grid__divider grid__divider--row"
                role="separator"
                aria-orientation="horizontal"
                style={{ top: gapAfter(pageSizes.rows, row) }}
                onPointerDown={(event) =>
                  dragDivider(event, "y", pageSizes.rows, row, (next) => setPage({ ...pageSizes, rows: next }))
                }
                onDoubleClick={() => setPage({ ...pageSizes, rows: evenSplit(counts.length) })}
              />
            ))}
          </div>
        );
      })}

      {focusId && (
        <div className="focus-mode">
          {/* Session notes stack under the terminal (screen 6b). */}
          <div className="focus-mode__left">
            <div className="focus-mode__terminal" onFocusCapture={() => setFocusSide("terminal")}>
              {renderPane(focusId, Math.max(0, focusIndex), contextFor(focusPage), false, focusSide === "terminal")}
            </div>
            <SessionNotes key={focusId} id={focusId} paneNumber={focusIndex + 1} />
          </div>
          <div className="focus-mode__review" onFocusCapture={() => setFocusSide("review")}>
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
