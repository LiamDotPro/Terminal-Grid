/**
 * A small CommonMark subset parser for the notes preview.
 *
 * It produces a document tree rather than an HTML string on purpose: the
 * renderer turns the tree into React elements, so nothing a note contains can
 * ever reach `dangerouslySetInnerHTML`. The supported subset is the one the
 * design's preview pane shows — headings, paragraphs, lists, blockquotes,
 * fenced code, thematic breaks, and inline emphasis/code/links.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "strike"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "quote"; children: Block[] }
  | { type: "code"; lang: string | null; value: string }
  | { type: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^(?:```|~~~)\s*([\w+-]*)\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;

export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, "\n").split("\n"));
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = FENCE.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i].trim())) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ type: "code", lang: fence[1] || null, value: body.join("\n") });
      continue;
    }

    if (RULE.test(line.trim())) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2].replace(/\s+#+\s*$/, "")),
      });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        const quoted = QUOTE.exec(lines[i]);
        body.push(quoted ? quoted[1] : lines[i]);
        i++;
      }
      blocks.push({ type: "quote", children: parseBlocks(body) });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !FENCE.test(lines[i].trim()) &&
      !RULE.test(lines[i].trim()) &&
      !QUOTE.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i])
    ) {
      paragraph.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}

/** Collects one list, folding indented continuation lines and nested lists into each item. */
function parseList(lines: string[], from: number): [Block, number] {
  const first = ORDERED.exec(lines[from]);
  const ordered = first !== null;
  const start = ordered ? Number(first[2]) : 1;
  const items: Block[][] = [];
  let i = from;
  let current: string[] | null = null;

  const flush = () => {
    if (current) items.push(parseBlocks(current));
    current = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const bullet = ordered ? ORDERED.exec(line) : BULLET.exec(line);
    const otherKind = ordered ? BULLET.exec(line) : ORDERED.exec(line);

    if (bullet && bullet[1].length < 2) {
      flush();
      current = [ordered ? bullet[3] : bullet[2]];
      i++;
      continue;
    }
    if (line.trim() === "") {
      // A blank line ends the list unless the next line is still indented.
      const next = lines[i + 1];
      if (next === undefined || (next.trim() !== "" && !/^\s{2,}/.test(next))) break;
      current?.push("");
      i++;
      continue;
    }
    if (current && /^\s{2,}/.test(line)) {
      current.push(line.replace(/^\s{2}/, ""));
      i++;
      continue;
    }
    if (otherKind && otherKind[1].length < 2) break;
    if (current && !HEADING.test(line) && !FENCE.test(line.trim()) && !RULE.test(line.trim())) {
      // Lazy continuation of the previous item.
      current.push(line.trim());
      i++;
      continue;
    }
    break;
  }

  flush();
  return [{ type: "list", ordered, start, items }, i];
}

const INLINE = /(`+)([\s\S]*?)\1|(\*\*|__)([\s\S]+?)\3|(\*|_)([\s\S]+?)\5|~~([\s\S]+?)~~|\[([^\]]*)\]\(([^()\s]*)\)/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) break;

    if (match.index > 0) out.push({ type: "text", value: rest.slice(0, match.index) });

    if (match[1] !== undefined) out.push({ type: "code", value: match[2].trim() });
    else if (match[3] !== undefined) out.push({ type: "strong", children: parseInline(match[4]) });
    else if (match[5] !== undefined) out.push({ type: "em", children: parseInline(match[6]) });
    else if (match[7] !== undefined) out.push({ type: "strike", children: parseInline(match[7]) });
    else out.push({ type: "link", href: safeHref(match[9]), children: parseInline(match[8]) });

    rest = rest.slice(match.index + match[0].length);
  }

  if (rest.length > 0) out.push({ type: "text", value: rest });
  return out;
}

/** Only http(s), mailto and note-relative links survive; everything else becomes inert. */
function safeHref(href: string): string {
  const value = href.trim();
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  return value;
}

export type LineKind = "heading" | "code" | "quote" | "list" | "text";

/**
 * Line level classification for the editor gutter highlighting. The design
 * colours whole lines rather than tokens, so this is deliberately coarse.
 */
export function classifyLines(source: string): LineKind[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const kinds: LineKind[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line.trim())) {
      kinds.push("code");
      inFence = !inFence;
      continue;
    }
    if (inFence || /^ {4,}\S/.test(line)) kinds.push("code");
    else if (HEADING.test(line)) kinds.push("heading");
    else if (QUOTE.test(line)) kinds.push("quote");
    else if (BULLET.test(line) || ORDERED.test(line)) kinds.push("list");
    else kinds.push("text");
  }

  return kinds;
}
