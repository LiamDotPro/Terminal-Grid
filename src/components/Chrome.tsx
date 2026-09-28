import { LAYOUT_MODES, type LayoutMode } from "../ipc/layout";
import { cx } from "../lib/cx";
import { modifierLabel } from "../lib/hotkeys";
import type { WindowFrame } from "../lib/windowFrame";
import { useAppActions, useAppState } from "../state/AppProvider";
import { totalPages } from "../state/reducer";

const LAYOUT_LABELS: Record<LayoutMode, string> = {
  grid: "Grid: stack both ways",
  columns: "Side by side: stack horizontally",
  rows: "Stacked: stack vertically",
};

/**
 * The title bar version of the app icon (src-tauri/icons/app-icon.svg): a 2x2
 * pane grid with the active pane lit and carrying the prompt chevron.
 */
function BrandMark() {
  return (
    <svg
      className="chrome__mark"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brand-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8ddcff" />
          <stop offset="1" stopColor="#c8b6ff" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.25">
        <rect x="10.125" y="0.625" width="7.25" height="7.25" rx="2" />
        <rect x="0.625" y="10.125" width="7.25" height="7.25" rx="2" />
        <rect x="10.125" y="10.125" width="7.25" height="7.25" rx="2" />
      </g>
      <rect x="0" y="0" width="8.5" height="8.5" rx="2.4" fill="url(#brand-accent)" />
      <path
        d="M2.9 2.75l2.1 1.5-2.1 1.5"
        fill="none"
        stroke="#0b0f1c"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tiny pictograms of the three stacking modes. */
function LayoutGlyph({ mode }: { mode: LayoutMode }) {
  const rects =
    mode === "grid"
      ? [[1, 1, 5, 5], [8, 1, 5, 5], [1, 8, 5, 5], [8, 8, 5, 5]]
      : mode === "columns"
        ? [[1, 1, 5.5, 12], [7.5, 1, 5.5, 12]]
        : [[1, 1, 12, 5.5], [1, 7.5, 12, 5.5]];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      {rects.map(([x, y, w, h], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} rx="1.2" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Four corner brackets: pointing out to enter full screen, in to leave it. */
function FullscreenGlyph({ exit = false }: { exit?: boolean }) {
  const d = exit
    ? "M4.5 1v3.5H1M9.5 1v3.5H13M4.5 13V9.5H1M9.5 13V9.5H13"
    : "M1 4.5V1h3.5M13 4.5V1H9.5M1 9.5V13h3.5M13 9.5V13H9.5";
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The window bar: brand, tab switcher, pager, pane/hotkey/settings actions and
 * the window controls. It is also the drag region, so the app can run without
 * native decorations the way the design draws it.
 */
export function Chrome({ frame }: { frame: WindowFrame }) {
  const state = useAppState();
  const actions = useAppActions();
  const pages = totalPages(state);
  const isTerminals = state.activeTab === "terminals";
  const showPager = isTerminals && pages > 1;
  const fullscreen = frame === "fullscreen";
  // Nothing to drag while fullscreen, and a double-click there would maximize
  // the window underneath without anything visibly changing.
  const dragRegion = fullscreen ? undefined : "";

  return (
    <header className="chrome" data-tauri-drag-region={dragRegion}>
      <div className="chrome__brand" data-tauri-drag-region={dragRegion}>
        <BrandMark />
        <span className="chrome__title">Terminal Grid</span>
      </div>

      <div className="chrome__center" data-tauri-drag-region={dragRegion}>
        <div className="tabs" role="tablist" aria-label="Sections">
          <button
            type="button"
            role="tab"
            aria-selected={isTerminals}
            className={cx("tabs__item", isTerminals && "tabs__item--active")}
            onClick={() => actions.setTab("terminals")}
          >
            Terminals
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isTerminals}
            className={cx("tabs__item", !isTerminals && "tabs__item--active")}
            onClick={() => actions.setTab("notes")}
          >
            Notes
          </button>
        </div>
      </div>

      <div className="chrome__right">
        {showPager && (
          <div className="pager">
            <button
              type="button"
              className="pager__step"
              aria-label="Previous page"
              disabled={state.page === 0}
              onClick={() => actions.stepPage(-1)}
            >
              ‹
            </button>
            <span className="pager__label">
              {state.page + 1} / {pages}
            </span>
            <button
              type="button"
              className="pager__step"
              aria-label="Next page"
              disabled={state.page >= pages - 1}
              onClick={() => actions.stepPage(1)}
            >
              ›
            </button>
          </div>
        )}

        {isTerminals && state.order.length > 0 && (
          <div
            className="layout-switch"
            role="radiogroup"
            aria-label="Pane stacking"
            title={`Pane stacking (${modifierLabel(state.config.hotkeyModifier)}+L cycles)`}
          >
            {LAYOUT_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={state.layoutMode === mode}
                aria-label={LAYOUT_LABELS[mode]}
                title={LAYOUT_LABELS[mode]}
                className={cx("layout-switch__item", state.layoutMode === mode && "layout-switch__item--active")}
                onClick={() => actions.setLayoutMode(mode)}
              >
                <LayoutGlyph mode={mode} />
              </button>
            ))}
          </div>
        )}

        {isTerminals && (
          <button
            type="button"
            className="chrome__new"
            title="New pane"
            onClick={() => void actions.newTerminal()}
          >
            <span className="chrome__new-glyph" aria-hidden="true">
              +
            </span>
            Pane
          </button>
        )}

        <button
          type="button"
          className={cx("btn", "btn--quiet", "chrome__help", state.hotkeysOpen && "chrome__help--active")}
          data-hotkeys-toggle
          title="Hotkeys"
          aria-expanded={state.hotkeysOpen}
          onClick={() => actions.setHotkeysOpen(!state.hotkeysOpen)}
        >
          ?
        </button>

        <button
          type="button"
          className="btn btn--quiet"
          title="Settings"
          onClick={() => actions.setSettingsOpen(true)}
        >
          Settings
        </button>

        <span className="chrome__divider" aria-hidden="true" />

        <div className="winbtns">
          <button
            type="button"
            className="winbtn"
            aria-label="Minimize"
            onClick={() => void actions.minimize()}
          >
            —
          </button>
          {fullscreen ? (
            <button
              type="button"
              className="winbtn winbtn--fullscreen"
              title="Exit full screen (F11)"
              onClick={() => void actions.toggleFullscreen()}
            >
              <FullscreenGlyph exit />
              Full screen
            </button>
          ) : (
            <>
              <button
                type="button"
                className="winbtn"
                aria-label="Full screen"
                title="Full screen (F11)"
                onClick={() => void actions.toggleFullscreen()}
              >
                <FullscreenGlyph />
              </button>
              <button
                type="button"
                className="winbtn winbtn--maximize"
                aria-label={frame === "maximized" ? "Restore" : "Maximize"}
                title={frame === "maximized" ? "Restore" : "Maximize"}
                onClick={() => void actions.toggleMaximize()}
              >
                {frame === "maximized" ? "❐" : "▢"}
              </button>
            </>
          )}
          <button
            type="button"
            className="winbtn winbtn--close"
            aria-label="Close"
            onClick={() => void actions.closeWindow()}
          >
            ×
          </button>
        </div>
      </div>
    </header>
  );
}
