/**
 * Notes saved from a pane's selection (design turns 6 and 7): the title comes
 * from the first line, the file goes to `<repo>/<slug>.md` under the notes
 * root. Pure helpers, unit tested.
 */

/** Bullets agent TUIs put in front of a message (Claude Code's ⏺, plain ● and •). */
const LEAD_MARK = /^[⏺●•◦▪∙]\s*/u;
const TITLE_MAX = 72;
const SLUG_WORDS = 6;
const SLUG_MAX = 48;

/**
 * Cleans terminal text up for a note: unified line endings, no trailing
 * spaces (xterm pads lines to the width of the pane), no blank lines around
 * it, the common indentation removed and the agent's bullet dropped.
 */
export function cleanSelection(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return "";

  // The first line starts wherever the drag began, often right after the
  // bullet; the rest keep the message's hanging indent, which goes.
  const [first, ...rest] = lines;
  const indents = rest.filter((line) => line.trim() !== "").map((line) => /^ */.exec(line)![0].length);
  const hanging = indents.length > 0 ? Math.min(...indents) : 0;
  return [first!.trimStart().replace(LEAD_MARK, ""), ...rest.map((line) => line.slice(hanging))].join("\n");
}

/** The note's title: its first line without markdown marks, cut at a word. */
export function titleFrom(text: string): string {
  const first = text.split("\n").find((line) => line.trim() !== "") ?? "";
  let title = first
    .trim()
    .replace(LEAD_MARK, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s:;,.]+$/, "")
    .trim();
  if (title.length > TITLE_MAX) {
    const cut = title.lastIndexOf(" ", TITLE_MAX);
    title = `${title.slice(0, cut > TITLE_MAX / 2 ? cut : TITLE_MAX).trimEnd()}…`;
  }
  return title || "Note";
}

/**
 * Title and body for a note made from a selection. A first line that fits in
 * the title moves there instead of being repeated under it.
 */
export function noteFromSelection(text: string): { title: string; body: string } | null {
  const cleaned = cleanSelection(text);
  if (!cleaned) return null;
  const title = titleFrom(cleaned);
  if (title.endsWith("…")) return { title, body: cleaned };
  const rest = cleaned.split("\n").slice(1);
  while (rest.length > 0 && rest[0]!.trim() === "") rest.shift();
  return { title, body: rest.join("\n") };
}

/** A file name stem: lower case words joined by dashes, a few words long. */
export function slugFrom(title: string): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, SLUG_WORDS);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > SLUG_MAX) break;
    slug = next;
  }
  return slug || "note";
}

/** A folder name for the repository: anything a file system might refuse becomes a dash. */
export function folderFor(repo: string): string {
  const name = repo.trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").replace(/^\.+/, "");
  return name || "notes";
}

/** `<folder>/<slug>.md` (or `<slug>.md` at the root), numbered when that name is taken. */
export function uniqueNotePath(folder: string, slug: string, taken: ReadonlySet<string>): string {
  const prefix = folder ? `${folder}/` : "";
  let relPath = `${prefix}${slug}.md`;
  for (let n = 2; taken.has(relPath); n++) relPath = `${prefix}${slug}-${n}.md`;
  return relPath;
}

export function noteContent(title: string, body: string): string {
  return body ? `# ${title}\n\n${body}\n` : `# ${title}\n`;
}

/**
 * Splits a note into the heading it starts with and the rest, so the session
 * notes panel can put its own meta line between them.
 */
export function splitHeading(content: string): { heading: string | null; body: string } {
  const match = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(content);
  if (!match) return { heading: null, body: content };
  return { heading: match[1]!, body: content.slice(match[0].length).replace(/^\s*\n/, "") };
}

/** When a note was saved, as the session notes list says it: "just now", "14:32", "yesterday". */
export function savedAgo(at: number, now: number): string {
  if (now - at < 60_000) return "just now";
  const then = new Date(at);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at >= startOfToday) return clock(then);
  if (at >= startOfToday - 86_400_000) return "yesterday";
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
