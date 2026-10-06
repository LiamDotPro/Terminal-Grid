/**
 * A small, forgiving highlighter for the review panel, after the tokenizer in
 * ReviewPanel.dc.html. It works line by line, so a diff row can be coloured
 * on its own; block comments and multi-line strings are not tracked.
 */

export type TokenClass = "kw" | "str" | "num" | "type" | "fn" | "com" | "pun" | "id" | "prop" | "ws";

export interface Token {
  text: string;
  cls: TokenClass;
}

const KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "var", "return", "if", "else", "function", "type",
  "interface", "new", "await", "async", "for", "of", "in", "as", "default", "null", "undefined",
  "true", "false", "typeof", "extends", "void", "class", "while", "do", "switch", "case", "break",
  "continue", "try", "catch", "finally", "throw", "this", "super", "static", "public", "private",
  "protected", "readonly", "enum", "implements", "yield", "delete", "instanceof",
  // Rust, Python, shell and friends share enough of these to be worth it.
  "fn", "pub", "mod", "use", "struct", "impl", "trait", "match", "mut", "ref", "self", "Self",
  "crate", "where", "loop", "move", "unsafe", "dyn", "def", "elif", "lambda", "pass", "None",
  "True", "False", "and", "or", "not", "is", "with", "raise", "except", "global", "then", "fi",
  "done", "esac", "local", "echo",
]);

const PRIMITIVES = new Set([
  "string", "number", "boolean", "bigint", "symbol", "unknown", "never", "any", "object",
  "u8", "u16", "u32", "u64", "usize", "i8", "i16", "i32", "i64", "isize", "f32", "f64", "bool",
  "str", "char", "int", "float",
]);

export type CommentStyle = "slash" | "hash" | "dash" | "none";

/** Line comment marker by file extension. */
export function commentStyle(path: string): CommentStyle {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (["py", "sh", "bash", "zsh", "rb", "yml", "yaml", "toml", "ps1", "r", "pl", "conf", "ini", "dockerfile", "mk", "makefile"].includes(ext)) {
    return "hash";
  }
  if (["sql", "lua", "hs"].includes(ext)) return "dash";
  if (["md", "txt", "json", "csv", "html", "xml", "svg"].includes(ext)) return "none";
  return "slash";
}

const PATTERNS: Record<CommentStyle, RegExp> = {
  slash:
    /(\/\/.*$)|(`(?:[^`\\]|\\.)*`?|'(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g,
  hash: /(#.*$)|(`(?:[^`\\]|\\.)*`?|'(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g,
  dash: /(--.*$)|(`(?:[^`\\]|\\.)*`?|'(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g,
  none: /()("(?:[^"\\]|\\.)*"?)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g,
};

/** Lines longer than this are left plain; minified files are not worth colouring. */
const MAX_LINE = 2000;

export function tokenize(line: string, style: CommentStyle): Token[] {
  if (line.length > MAX_LINE) return [{ text: line, cls: "id" }];
  const re = new RegExp(PATTERNS[style].source, "g");
  const out: Token[] = [];
  let prev = "";
  let prev2 = "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    const [text, com, str, num, id, ws] = match;
    if (text === "") {
      re.lastIndex++;
      continue;
    }
    let cls: TokenClass = "pun";
    if (com) cls = "com";
    else if (str) cls = "str";
    else if (num) cls = "num";
    else if (ws) cls = "ws";
    else if (id) {
      const rest = line.slice(re.lastIndex);
      if (KEYWORDS.has(text) && style !== "none") cls = "kw";
      else if (PRIMITIVES.has(text) || /^[A-Z]/.test(text) || prev === "<" || (prev === "/" && prev2 === "<")) cls = "type";
      else if (/^=[{"']/.test(rest)) cls = "prop";
      else if (/^\s*\(/.test(rest)) cls = "fn";
      else if (prev === ".") cls = "prop";
      else cls = "id";
    }
    // Merge neighbours of the same class so a row renders fewer spans.
    const last = out[out.length - 1];
    if (last && last.cls === cls && (cls === "pun" || cls === "ws")) last.text += text;
    else out.push({ text, cls });
    if (!ws) {
      prev2 = prev;
      prev = text;
    }
  }
  return out;
}
