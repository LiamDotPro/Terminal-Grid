import { memo } from "react";
import { tokenize, type CommentStyle, type Token } from "../../lib/syntax";

/** Tokenized lines, shared by every row with the same text and comment style. */
const cache = new Map<string, Token[]>();
const CACHE_LIMIT = 20000;

function tokensOf(text: string, style: CommentStyle): Token[] {
  const key = `${style}\u0000${text}`;
  let tokens = cache.get(key);
  if (!tokens) {
    if (cache.size > CACHE_LIMIT) cache.clear();
    tokens = tokenize(text, style);
    cache.set(key, tokens);
  }
  return tokens;
}

/** One line of code, coloured. */
export const CodeText = memo(function CodeText({ text, style }: { text: string; style: CommentStyle }) {
  return (
    <>
      {tokensOf(text, style).map((token, index) =>
        token.cls === "ws" ? token.text : (
          <span key={index} className={`tok tok--${token.cls}`}>
            {token.text}
          </span>
        ),
      )}
    </>
  );
});

/** The strip at the right edge that marks where the changes are (screens 3a, 3b). */
export function OverviewRuler({
  ticks,
  viewport,
  onJump,
}: {
  ticks: { kind: string; top: number; height: number }[];
  viewport: { top: number; height: number };
  /** Called with the clicked position as a fraction of the strip. */
  onJump: (fraction: number) => void;
}) {
  return (
    <div
      className="ruler"
      title="Change overview"
      onMouseDown={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        onJump((event.clientY - box.top) / Math.max(1, box.height));
      }}
    >
      <div
        className="ruler__viewport"
        style={{ top: `${viewport.top * 100}%`, height: `${Math.max(viewport.height, 0.01) * 100}%` }}
      />
      {ticks.map((tick, index) => (
        <div
          key={index}
          className={`ruler__tick ruler__tick--${tick.kind}`}
          style={{ top: `${tick.top * 100}%`, height: `${tick.height * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Where a scroller's visible window sits, as fractions of its content. */
export function viewportOf(element: HTMLElement): { top: number; height: number } {
  const total = Math.max(1, element.scrollHeight);
  return { top: element.scrollTop / total, height: Math.min(1, element.clientHeight / total) };
}
