import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { NoteNode } from "../../ipc/types";
import { cx } from "../../lib/cx";
import { useAppActions, useAppState } from "../../state/AppProvider";
import { CollapseButton } from "./CollapseButton";

const INDENT_PX = 16;
const BASE_PAD_PX = 8;

export function NoteTree() {
  const { notes } = useAppState();
  const actions = useAppActions();
  const [renaming, setRenaming] = useState<string | null>(null);

  return (
    <div className="notes__panel">
      <div className="tree__head">
        <CollapseButton
          side="left"
          label="Hide the notes list"
          onClick={() => actions.collapseNotesPanel("tree", true)}
        />
        <div className="tree__title">Notes</div>
        <button
          type="button"
          className="tree__add"
          title="New file"
          onClick={() => void actions.createNode(null, "file")}
        >
          + File
        </button>
        <button
          type="button"
          className="tree__add"
          title="New folder"
          onClick={() => void actions.createNode(null, "folder")}
        >
          + Folder
        </button>
      </div>

      <div className="tree__body" role="tree" aria-label="Notes">
        {notes.tree.length === 0 ? (
          <p className="tree__empty">
            {notes.root
              ? "No notes yet. Create the first one with + File."
              : "No notes folder configured yet."}
          </p>
        ) : (
          <TreeLevel
            nodes={notes.tree}
            depth={0}
            renaming={renaming}
            onRenaming={setRenaming}
            expanded={notes.expanded}
            openPath={notes.openPath}
            onOpen={(relPath) => void actions.openNote(relPath)}
            onToggle={actions.toggleFolder}
            onRename={(relPath, name) => void actions.renameNode(relPath, name)}
            onDelete={(node) => void actions.deleteNode(node.relPath, node.kind)}
          />
        )}
      </div>
    </div>
  );
}

interface TreeLevelProps {
  nodes: NoteNode[];
  depth: number;
  expanded: string[];
  openPath: string | null;
  renaming: string | null;
  onRenaming: (relPath: string | null) => void;
  onOpen: (relPath: string) => void;
  onToggle: (relPath: string) => void;
  onRename: (relPath: string, name: string) => void;
  onDelete: (node: NoteNode) => void;
}

function TreeLevel(props: TreeLevelProps) {
  const { nodes, depth, expanded, openPath, renaming } = props;

  return (
    <>
      {nodes.map((node) => {
        const isFolder = node.kind === "folder";
        const isOpen = expanded.includes(node.relPath);
        const selected = openPath === node.relPath;

        return (
          <div key={node.relPath} role="treeitem" aria-expanded={isFolder ? isOpen : undefined}>
            <div
              className={cx(
                "tree__row",
                isFolder && "tree__row--folder",
                selected && "tree__row--selected",
              )}
              style={{ paddingLeft: BASE_PAD_PX + depth * INDENT_PX }}
            >
              <span className="tree__glyph" aria-hidden="true">
                {isFolder ? (isOpen ? "▾" : "▸") : ""}
              </span>

              {renaming === node.relPath ? (
                <RenameInput
                  initial={node.name}
                  onCommit={(name) => {
                    props.onRenaming(null);
                    props.onRename(node.relPath, name);
                  }}
                  onCancel={() => props.onRenaming(null)}
                />
              ) : (
                <button
                  type="button"
                  className="tree__name ellipsis"
                  style={{ textAlign: "left" }}
                  onClick={() =>
                    isFolder ? props.onToggle(node.relPath) : props.onOpen(node.relPath)
                  }
                >
                  {node.name}
                </button>
              )}

              <button
                type="button"
                className="tree__action"
                onClick={() => props.onRenaming(node.relPath)}
              >
                Rename
              </button>
              <button
                type="button"
                className="tree__action tree__action--danger"
                onClick={() => props.onDelete(node)}
              >
                Delete
              </button>
            </div>

            {isFolder && isOpen && node.children && node.children.length > 0 && (
              <TreeLevel {...props} nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  // Escape closes the input, which also fires blur; only one of them may win.
  const settled = useRef(false);

  const finish = (commit: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  useEffect(() => {
    const node = input.current;
    if (!node) return;
    node.focus();
    const dot = initial.lastIndexOf(".");
    node.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") finish(true);
    if (event.key === "Escape") finish(false);
  };

  return (
    <input
      ref={input}
      className="tree__rename"
      value={value}
      aria-label="New name"
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  );
}
