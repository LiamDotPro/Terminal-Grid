import { Fragment, useMemo, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../../lib/markdown";
import { useAppState } from "../../state/AppProvider";

/**
 * Rendered view of the open note. The parser hands back a tree and this turns
 * it into elements, so note content is never interpreted as HTML.
 */
export function NotePreview() {
  const { notes } = useAppState();
  const blocks = useMemo(() => parseMarkdown(notes.content), [notes.content]);

  return (
    <div className="notes__panel">
      <div className="panel-head">Preview</div>
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

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1";
      return <Tag key={index}>{block.children.map(renderInline)}</Tag>;
    }
    case "paragraph":
      return <p key={index}>{block.children.map(renderInline)}</p>;
    case "list": {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{item.map(renderListChild)}</li>
      ));
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
