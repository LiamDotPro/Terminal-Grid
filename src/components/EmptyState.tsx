import { modifierLabel } from "../lib/hotkeys";
import { useAppActions, useAppState } from "../state/AppProvider";

export function EmptyState() {
  const { config, busy } = useAppState();
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
        <div className="empty__hint">{modifierLabel(config.hotkeyModifier)}+N</div>
      </div>
    </div>
  );
}
