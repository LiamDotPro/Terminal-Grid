import { shortcutLabel } from "../lib/hotkeys";
import { useAppActions, useAppState, useHotkeyScheme } from "../state/AppProvider";

export function EmptyState() {
  const { busy } = useAppState();
  const scheme = useHotkeyScheme();
  const actions = useAppActions();

  return (
    <div className="empty">
      <div className="empty__card">
        <div className="empty__icon" aria-hidden="true">
          &gt;_
        </div>
        <h1 className="empty__title">No terminals yet</h1>
        <p className="empty__body">
          Open a folder to start the first terminal. Its git repo, branch and worktrees show up in
          the pane header.
        </p>
        <button
          type="button"
          className="empty__action"
          disabled={busy}
          onClick={() => void actions.newTerminal()}
        >
          Open folder…
        </button>
        <div className="empty__hint">{shortcutLabel(scheme, "new-pane")}</div>
      </div>
    </div>
  );
}
