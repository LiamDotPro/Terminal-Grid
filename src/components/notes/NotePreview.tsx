import { Fragment, useMemo, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../../lib/markdown";
import { useAppActions, useAppState } from "../../state/AppProvider";
import { CollapseButton } from "./CollapseButton";

/**
 * Rendered view of the open note. The parser hands back a tree and this turns
 * it into elements, so note content is never interpreted as HTML.
 */
export function NotePreview() {
  const { notes } = useAppState();
  const actions = useAppActions();
  const blocks = useMemo(() => parseMarkdown(notes.content), [notes.content]);

  return (
    <div className="notes__panel">
      <div className="panel-head">
        <span>Preview</span>
        <span className="spacer" />
        <CollapseButton
          side="right"
          label="Hide preview, show only the editor"
          onClick={() => actions.collapseNotesPanel("preview", true)}
        />
      </div>
      <div className="preview">
        {notes.openPath ? (
          <article className="preview__doc">{blocks.map(renderBlock)}</article>
        ) : (
          <p className="editor__placeholder">Nothing open.</p>
        )}
      </div>
    </div>
  );
}

/** Markdown rendered the way the preview does it, for other views of a note. */
export function MarkdownDoc({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return <article className="preview__doc">{blocks.map(renderBlock)}</article>;
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1";
      return <Tag key={index}>{block.children.map(renderInline)}</Tag>;
    }
    case "paragraph":
      return <p key={index}>{block.children.map(renderInline)}</p>;
    case "list": {
      const items = block.items.map((item, itemIndex) => {
        const checked = block.tasks[itemIndex] ?? null;
        if (checked === null) return <li key={itemIndex}>{item.map(renderListChild)}</li>;
        return (
          <li key={itemIndex} className="task">
            <span
              className="task__box"
              role="checkbox"
              aria-checked={checked}
              aria-disabled="true"
              data-checked={checked || undefined}
            />
            {item.map(renderListChild)}
          </li>
        );
      });
      return block.ordered ? (
        <ol key={index} start={block.start}>
          {items}
        </ol>
      ) : (
        <ul key={index}>{items}</ul>
      );
    }
    case "quote":
      return <blockquote key={index}>{block.children.map(renderBlock)}</blockquote>;
    case "code":
      return (
        <pre key={index}>
          <code>{block.value}</code>
        </pre>
      );
    case "rule":
      return <hr key={index} />;
  }
}

/** A single paragraph inside a list item renders inline, so bullets stay tight. */
function renderListChild(block: Block, index: number): ReactNode {
  if (block.type === "paragraph") {
    return <Fragment key={index}>{block.children.map(renderInline)}</Fragment>;
  }
  return renderBlock(block, index);
}

function renderInline(node: Inline, index: number): ReactNode {
  switch (node.type) {
    case "text":
      return <Fragment key={index}>{node.value}</Fragment>;
    case "code":
      return <code key={index}>{node.value}</code>;
    case "strong":
      return <strong key={index}>{node.children.map(renderInline)}</strong>;
    case "em":
      return <em key={index}>{node.children.map(renderInline)}</em>;
    case "strike":
      return <s key={index}>{node.children.map(renderInline)}</s>;
    case "link":
      return node.href ? (
        <a key={index} href={node.href} target="_blank" rel="noreferrer noopener">
          {node.children.map(renderInline)}
        </a>
      ) : (
        <Fragment key={index}>{node.children.map(renderInline)}</Fragment>
      );
  }
}
