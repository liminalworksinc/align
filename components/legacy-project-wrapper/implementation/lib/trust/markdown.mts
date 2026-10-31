// A small Markdown reader for the public trust pages (/privacy and /trust, app/_trust). It turns the documents in
// docs/trust (and docs/RETENTION.md) into plain data, and React renders that data, so no HTML from a document ever
// reaches the page: raw HTML is shown as text, HTML comments (the source notes next to claims) are dropped, and a
// link keeps its target only if it is https, http, mailto, an anchor, or another trust document (`resolve`).
// It reads what those documents use: headings, paragraphs, lists (one level of nesting), tables, fenced code, block
// quotes, rules, and inline code, bold, italics and links. Node runs this file directly (test-v2 imports it), so it
// imports nothing and uses no TypeScript that needs compiling.

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export interface ListItem {
  c: Inline[];
  sub: List | null;
}
export interface List {
  t: "list";
  ordered: boolean;
  items: ListItem[];
}

export type Block =
  | { t: "heading"; level: number; id: string; c: Inline[] }
  | { t: "para"; c: Inline[] }
  | List
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "code"; v: string }
  | { t: "quote"; c: Block[] }
  | { t: "rule" };

/** Where another document lives: the page that shows it and the anchor prefix of its section there. */
export interface DocPlace {
  page: string;
  prefix: string;
}

export interface ParseOptions {
  /** Prefix for heading anchors, so several documents can share a page ("security" -> #security-architecture). */
  prefix: string;
  /** A relative link's target path (no fragment, no "./"), e.g. "../RETENTION.md", to the page that shows it. */
  resolve?: (path: string) => DocPlace | null;
  /** Placeholder tokens to fill in text, e.g. {"[LEGAL ENTITY]": "Example Ltd"}. An email address becomes a mailto link. */
  fill?: Record<string, string>;
}

const EMAIL = /^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[A-Za-z]{2,}$/;
const CONTROL = /[\u0000-\u001F\u007F\s]/;

/** An anchor id from heading text: lowercase letters, digits and single hyphens. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "-") || "section"
  );
}

/** The href a link may keep, or null (then only its text is shown). */
export function safeHref(href: string, opts: ParseOptions): string | null {
  const h = href.trim();
  if (!h || CONTROL.test(h)) return null;
  if (/^https?:\/\/[^/]/i.test(h) || /^mailto:[^:]+@/i.test(h)) return h;
  if (h.startsWith("#")) return h.length > 1 ? `#${opts.prefix}-${slug(h.slice(1))}` : null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith("//")) return null; // javascript:, data:, protocol-relative, ...
  const [rawPath, frag] = h.split("#", 2);
  const place = opts.resolve?.(rawPath.replace(/^\.\//, "")) ?? null;
  if (!place) return null;
  return `${place.page}#${frag ? `${place.prefix}-${slug(frag)}` : place.prefix}`;
}

function fillText(v: string, opts: ParseOptions): Inline[] {
  const fill = opts.fill ?? {};
  const keys = Object.keys(fill).filter((k) => v.includes(k));
  if (!keys.length) return v ? [{ t: "text", v }] : [];
  const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const out: Inline[] = [];
  let at = 0;
  for (const m of v.matchAll(re)) {
    if (m.index! > at) out.push({ t: "text", v: v.slice(at, m.index) });
    const value = fill[m[0]];
    out.push(EMAIL.test(value) ? { t: "link", href: `mailto:${value}`, c: [{ t: "text", v: value }] } : { t: "text", v: value });
    at = m.index! + m[0].length;
  }
  if (at < v.length) out.push({ t: "text", v: v.slice(at) });
  return out;
}

/** Inline Markdown: `code`, **bold**, *italics*, [text](href), <https://autolink>, and \-escapes. */
export function parseInline(s: string, opts: ParseOptions): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    out.push(...fillText(buf, opts));
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length && /[\\`*_[\]()#|<>!-]/.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ t: "code", v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "*" && s[i + 1] === "*") {
      const end = s.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "strong", c: parseInline(s.slice(i + 2, end), opts) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" && s[i + 1] && s[i + 1] !== " " && s[i + 1] !== "*") {
      const end = s.indexOf("*", i + 1);
      if (end > i + 1 && s[end - 1] !== " ") {
        flush();
        out.push({ t: "em", c: parseInline(s.slice(i + 1, end), opts) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const close = s.indexOf("](", i + 1);
      const end = close > i ? s.indexOf(")", close + 2) : -1;
      if (close > i && end > close && !/[[\]]/.test(s.slice(i + 1, close))) {
        flush();
        const text = parseInline(s.slice(i + 1, close), opts);
        const href = safeHref(s.slice(close + 2, end), opts);
        if (href) out.push({ t: "link", href, c: text });
        else out.push(...text);
        i = end + 1;
        continue;
      }
    }
    if (ch === "<") {
      const m = /^<(https?:\/\/[^\s<>]+)>/i.exec(s.slice(i));
      if (m) {
        flush();
        const href = safeHref(m[1], opts);
        out.push(href ? { t: "link", href, c: [{ t: "text", v: m[1] }] } : { t: "text", v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** The text of inline content (for heading anchors). */
export function plain(c: Inline[]): string {
  return c.map((x) => (x.t === "text" || x.t === "code" ? x.v : plain(x.c))).join("");
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*```/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

const startsBlock = (line: string, next: string | undefined) =>
  HEADING.test(line) || FENCE.test(line) || RULE.test(line) || ITEM.test(line) || /^\s*>/.test(line) || (line.trim().startsWith("|") && next !== undefined && TABLE_SEP.test(next));

function parseBlocks(lines: string[], opts: ParseOptions, ids: Map<string, number>): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence (or the end)
      out.push({ t: "code", v: body.join("\n") });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      const c = parseInline(h[2], opts);
      const base = `${opts.prefix}-${slug(plain(c))}`;
      const n = (ids.get(base) ?? 0) + 1;
      ids.set(base, n);
      out.push({ t: "heading", level: h[1].length, id: n === 1 ? base : `${base}-${n}`, c });
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line).map((c) => parseInline(c, opts));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]).map((c) => parseInline(c, opts)));
      out.push({ t: "table", head, rows });
      continue;
    }
    if (RULE.test(line)) {
      out.push({ t: "rule" });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ t: "quote", c: parseBlocks(inner, opts, ids) });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      const list: List = { t: "list", ordered: /\d/.test(item[2]), items: [] };
      // Each item: its text lines, and nested items (indented markers) with their own text lines.
      let cur: { text: string[]; sub: { ordered: boolean; items: string[][] } | null } | null = null;
      const done = () => {
        if (!cur) return;
        const sub = cur.sub ? { t: "list" as const, ordered: cur.sub.ordered, items: cur.sub.items.map((t) => ({ c: parseInline(t.join(" "), opts), sub: null })) } : null;
        list.items.push({ c: parseInline(cur.text.join(" "), opts), sub });
      };
      while (i < lines.length) {
        const l = lines[i];
        const m = ITEM.exec(l);
        if (m && m[1].length < 2) {
          if (/\d/.test(m[2]) !== list.ordered) break;
          done();
          cur = { text: [m[3]], sub: null };
          i++;
        } else if (m && cur) {
          cur.sub ??= { ordered: /\d/.test(m[2]), items: [] };
          cur.sub.items.push([m[3]]);
          i++;
        } else if (l.trim() && /^\s/.test(l) && cur) {
          const tail = cur.sub ? cur.sub.items[cur.sub.items.length - 1] : cur.text;
          tail.push(l.trim());
          i++;
        } else if (!l.trim() && i + 1 < lines.length && ITEM.exec(lines[i + 1])) {
          i++; // a blank line between items keeps the list going
        } else break;
      }
      done();
      out.push(list);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    out.push({ t: "para", c: parseInline(para.join(" "), opts) });
  }
  return out;
}

/** A Markdown document as blocks. HTML comments are removed first; any other HTML stays as text. */
export function parseMarkdown(md: string, opts: ParseOptions): Block[] {
  // A comment alone on its line goes with its line, so it never splits a table or a paragraph.
  const text = md
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*(?:\n|$)/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return parseBlocks(text.split("\n"), opts, new Map());
}
