import { cx } from "../../lib/cx";
import { modifierLabel } from "../../lib/hotkeys";
import { useAppActions, useAppState } from "../../state/AppProvider";
import { NoteEditor } from "./NoteEditor";
import { NotePreview } from "./NotePreview";
import { NoteTree } from "./NoteTree";

/**
 * Tree, editor and preview. The tree folds away to the left and the preview
 * to the right, each into a slim rail that brings it back; the editor in the
 * middle always stays and takes whatever width is freed.
 */
export function NotesView() {
  const { notes, config } = useAppState();
  const actions = useAppActions();
  const mod = modifierLabel(config.hotkeyModifier);

  return (
    <div
      className={cx(
        "notes",
        notes.treeCollapsed && "notes--no-tree",
        notes.previewCollapsed && "notes--no-preview",
      )}
    >
      {notes.treeCollapsed ? (
        <PanelRail
          side="left"
          label="Notes"
          hint={`${mod}+B`}
          onExpand={() => actions.collapseNotesPanel("tree", false)}
        />
      ) : (
        <NoteTree />
      )}

      <NoteEditor />

      {notes.previewCollapsed ? (
        <PanelRail
          side="right"
          label="Preview"
          hint={`${mod}+P`}
          onExpand={() => actions.collapseNotesPanel("preview", false)}
        />
      ) : (
        <NotePreview />
      )}
    </div>
  );
}

interface PanelRailProps {
  side: "left" | "right";
  label: string;
  hint: string;
  onExpand: () => void;
}

/** A collapsed panel: one narrow strip with its name and an expand chevron. */
function PanelRail({ side, label, hint, onExpand }: PanelRailProps) {
  return (
    <button
      type="button"
      className={cx("rail", `rail--${side}`)}
      title={`Show ${label.toLowerCase()} (${hint})`}
      aria-label={`Show ${label.toLowerCase()}`}
      onClick={onExpand}
    >
      <span className="rail__chevron" aria-hidden="true">
        {side === "left" ? "›" : "‹"}
      </span>
      <span className="rail__label">{label}</span>
    </button>
  );
}
