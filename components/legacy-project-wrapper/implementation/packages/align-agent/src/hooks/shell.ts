// A small reader of POSIX shell commands for the hooks: which simple commands a command line runs, with their words
// (quotes removed) and redirections. Heredoc bodies, comments and the inside of quoted strings are data, never commands
// or redirections (E2E acycle3 A3-local-11: the `>` of an e-mail address in Claude Code's heredoc commit message,
// followed by the `EOF` line, read as a write to a file named `EOF`). Commands inside `$( ... )` are read too, since
// they run. Heuristic by design and never throws: anything it does not follow (backticks, `${...}`, `$((...))`) is kept
// as an opaque word that contains `$` or a backtick, so it is never taken for a path. Local strings only: hook-safe.

/** One simple command: its words, and its redirections (`op` normalized: `>`, `>>`, `>|`, `&>`, `&>>`, `>&`, `<`,
 *  `<>`, `<&`, `<<`, `<<<`; `target` null when the line ended first). */
export interface ShellCmd {
  words: string[];
  redirs: { op: string; target: string | null }[];
}

interface Heredoc {
  delim: string;
  strip: boolean;
}

/** The simple commands of a command line, in order (those inside `$( ... )` after the command that holds them). */
export function parseShell(src: string): ShellCmd[] {
  const out: ShellCmd[] = [];
  try {
    parseUntil(src, 0, false, out);
  } catch {
    /* a reader for hints: what was read so far stands */
  }
  return out;
}

/** Index just past the matching close of an opaque `open ... close` span starting at `i` (nesting counted). */
function skipBalanced(src: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") i++;
    else if (c === "'" && open !== "'") {
      const e = src.indexOf("'", i + 1);
      i = e < 0 ? src.length : e;
    } else if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  return src.length;
}

/**
 * Read commands from `i` until the end, or (nested) until the `)` that closes a `$(`. Returns the index after it.
 */
function parseUntil(src: string, i: number, nested: boolean, out: ShellCmd[]): number {
  let cur: ShellCmd = { words: [], redirs: [] };
  let word: string | null = null;
  let redir: string | null = null;
  let heredocs: Heredoc[] = [];
  let depth = 0;
  const later: ShellCmd[] = [];
  const endWord = () => {
    if (word === null) return;
    if (redir) cur.redirs.push({ op: redir, target: word });
    else cur.words.push(word);
    redir = null;
    word = null;
  };
  const endCmd = () => {
    endWord();
    if (redir) cur.redirs.push({ op: redir, target: null });
    redir = null;
    if (cur.words.length || cur.redirs.length) out.push(cur);
    out.push(...later.splice(0));
    cur = { words: [], redirs: [] };
  };
  /** At a newline: skip the bodies of the heredocs this line opened. */
  const bodies = (from: number): number => {
    let j = from;
    for (const h of heredocs) {
      for (;;) {
        if (j >= src.length) return src.length;
        const nl = src.indexOf("\n", j);
        const line = src.slice(j, nl < 0 ? src.length : nl);
        j = nl < 0 ? src.length : nl + 1;
        if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
      }
    }
    heredocs = [];
    return j;
  };
  const add = (s: string) => (word = (word ?? "") + s);
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      endCmd();
      i = bodies(i + 1);
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      i++;
      continue;
    }
    if (c === "#" && word === null) {
      const nl = src.indexOf("\n", i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    if (c === "\\") {
      if (src[i + 1] === "\n") i += 2; // a line continuation
      else {
        add(src[i + 1] ?? "");
        i += 2;
      }
      continue;
    }
    if (c === "'") {
      const e = src.indexOf("'", i + 1);
      add(src.slice(i + 1, e < 0 ? src.length : e));
      i = e < 0 ? src.length : e + 1;
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      while (i < src.length && src[i] !== '"') {
        const d = src[i];
        if (d === "\\" && i + 1 < src.length && '$`"\\\n'.includes(src[i + 1])) {
          s += src[i + 1] === "\n" ? "" : src[i + 1];
          i += 2;
        } else if (d === "$" || d === "`") {
          const r = dollar(src, i, later);
          s += r.text;
          i = r.next;
        } else {
          s += d;
          i++;
        }
      }
      add(s);
      i++;
      continue;
    }
    if (c === "$" || c === "`") {
      const r = dollar(src, i, later);
      add(r.text);
      i = r.next;
      continue;
    }
    if (c === "(") {
      endCmd();
      depth++;
      i++;
      continue;
    }
    if (c === ")") {
      endCmd();
      if (nested && depth === 0) return i + 1;
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (c === ";" || c === "|" || (c === "&" && src[i + 1] !== ">")) {
      endCmd();
      i += src.slice(i, i + 2) === ";;" || src.slice(i, i + 2) === "&&" || src.slice(i, i + 2) === "||" || src.slice(i, i + 2) === "|&" ? 2 : 1;
      continue;
    }
    if (c === ">" || c === "<" || (c === "&" && src[i + 1] === ">")) {
      // A word of digits right before the operator is its file descriptor (`2>`), not a word of the command.
      if (word !== null && /^\d+$/.test(word) && i > 0 && /\d/.test(src[i - 1])) word = null;
      endWord();
      const op = /^(?:&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<>|<&|<)/.exec(src.slice(i))![0];
      i += op.length;
      if (op === "<<" || op === "<<-") {
        while (src[i] === " " || src[i] === "\t") i++;
        let delim = "";
        while (i < src.length && !/[\s;&|<>()]/.test(src[i])) {
          if (src[i] === "'" || src[i] === '"') {
            const q = src[i];
            const e = src.indexOf(q, i + 1);
            delim += src.slice(i + 1, e < 0 ? src.length : e);
            i = e < 0 ? src.length : e + 1;
          } else if (src[i] === "\\") {
            delim += src[i + 1] ?? "";
            i += 2;
          } else delim += src[i++];
        }
        if (delim) heredocs.push({ delim, strip: op === "<<-" });
        cur.redirs.push({ op: "<<", target: null });
        continue;
      }
      redir = op === "<<-" ? "<<" : op;
      continue;
    }
    add(c);
    i++;
  }
  endCmd();
  return src.length;
}

/** A `$`-expansion or backtick span at `i`: `$(` commands are read into `into`; the text stands for it in its word. */
function dollar(src: string, i: number, into: ShellCmd[]): { text: string; next: number } {
  if (src[i] === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== "`") j += src[j] === "\\" ? 2 : 1;
    return { text: "`...`", next: j + 1 };
  }
  if (src.startsWith("$((", i)) return { text: "$((...))", next: skipBalanced(src, i + 1, "(", ")") };
  if (src.startsWith("$(", i)) return { text: "$(...)", next: parseUntil(src, i + 2, true, into) };
  if (src.startsWith("${", i)) return { text: "${...}", next: skipBalanced(src, i + 1, "{", "}") };
  return { text: "$", next: i + 1 };
}

/** Words that run the command that follows them, and variable assignments before a command. */
const PREFIXES = new Set(["sudo", "env", "command", "nohup", "time", "exec", "builtin", "xargs"]);

/** The command's name and its arguments, past `VAR=value` assignments and wrappers such as `sudo` and `env`. */
export function commandWords(words: string[]): string[] {
  let k = 0;
  while (k < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[k]) || PREFIXES.has(words[k]))) k++;
  return words.slice(k);
}
