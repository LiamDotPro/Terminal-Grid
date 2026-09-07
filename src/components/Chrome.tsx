import { cx } from "../lib/cx";
import { useAppActions, useAppState } from "../state/AppProvider";
import { totalPages } from "../state/reducer";

/**
 * The window bar: brand, tab switcher, pager, pane/hotkey/settings actions and
 * the window controls. It is also the drag region, so the app can run without
 * native decorations the way the design draws it.
 */
export function Chrome() {
  const state = useAppState();
  const actions = useAppActions();
  const pages = totalPages(state);
  const isTerminals = state.activeTab === "terminals";
  const showPager = isTerminals && pages > 1;

  return (
    <header className="chrome" data-tauri-drag-region>
      <div className="chrome__brand" data-tauri-drag-region>
        <span className="chrome__mark" aria-hidden="true" />
        <span className="chrome__title">Terminal Grid</span>
      </div>

      <div className="chrome__center" data-tauri-drag-region>
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
          <button
            type="button"
            className="winbtn winbtn--maximize"
            aria-label="Maximize"
            onClick={() => void actions.toggleMaximize()}
          >
            ▢
          </button>
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
