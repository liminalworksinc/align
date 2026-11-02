// Evidence that a session's own tool call made the edit (or the commit) its PreToolUse hook recorded (E2E acycle2
// A2-local-1, 2, 5). The hook records an edit before the harness's permission check, so a refused or failed call is
// recorded too; the file changing afterwards proves nothing, since another session may have written it. An edit counts
// only on evidence about this session's own call:
// - Claude Code with a plugin that installs PostToolUse (its PreToolUse command says so, `--post-tool-use`): that
//   hook saw the call run (`ran`); a refused call fires nothing, a failed one PostToolUseFailure (`failed`).
// - Otherwise (Codex, whose PostToolUse is not installed and says nothing reliable about a refused `apply_patch`; an
//   older Claude Code plugin): the content the call was to write is in the file afterwards and was not before
//   (`v`, checked at the session's next hook), and no other session's edit of that file explains the change.
// Local files only: hook-safe.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { layout } from "../shared/layout.ts";
import type { Harness } from "../shared/types.ts";
import { rawActs, type Act } from "./siblings.ts";

/** What a call is to change in one file, checked after it: lines it adds (absent before), lines it removes (present
 *  once before), whether the file then exists; else, with none of those, that the file changed at all (`m`, `h`).
 *  `no`: the call cannot change the file (an `Edit` whose `old_string` is not there, a write of the same content). */
export interface Expect {
  a?: string[];
  r?: string[];
  x?: 0 | 1;
  /** The file's change time at PreToolUse (-1: absent). */
  m?: number;
  /** A hash of its content at PreToolUse (null: absent; left out for a shell write, which only checks `m`). */
  h?: string | null;
  no?: 1;
}

/** Edits and commits are pending for this long without a verdict; then they count as refused (C4-5). */
export const PENDING_MS = 60 * 60_000;
/** How long a call's own PostToolUse may still be on its way. */
const IN_FLIGHT_MS = 10_000;
/** Files above this are not read: only their change time and size count. */
const MAX_READ = 2 << 20;
const MAX_HASHES = 8;

const lineHash = (s: string) => crypto.createHash("sha256").update(s.trim(), "utf8").digest("hex").slice(0, 12);

interface FileNow {
  exists: boolean;
  m: number;
  h: string | null;
  /** Line hashes with their counts; null for a file too large to read. */
  lines: Map<string, number> | null;
  text: string | null;
}

function fileNow(file: string): FileNow {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { exists: false, m: -1, h: null, lines: new Map(), text: null };
  }
  if (!st.isFile() || st.size > MAX_READ) return { exists: true, m: Math.floor(st.mtimeMs), h: `${st.size}:${Math.floor(st.mtimeMs)}`, lines: null, text: null };
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { exists: true, m: Math.floor(st.mtimeMs), h: `${st.size}:${Math.floor(st.mtimeMs)}`, lines: null, text: null };
  }
  return { exists: true, m: Math.floor(st.mtimeMs), h: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16), lines: countLines(text), text };
}

function countLines(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of text.split("\n")) if (l.trim()) out.set(lineHash(l), (out.get(lineHash(l)) || 0) + 1);
  return out;
}

/** The expectation from the lines a call adds and removes, against the file as it is now. */
function fromLines(now: FileNow, added: string[], removed: string[], exists: 0 | 1 | null): Expect {
  const base: Expect = { m: now.m, h: now.h };
  if (!now.lines) return base;
  const before = now.lines;
  const addedSet = new Set(added.filter((l) => l.trim()).map(lineHash));
  const a = [...addedSet].filter((h) => !before.has(h)).slice(0, MAX_HASHES);
  const r = [...new Set(removed.filter((l) => l.trim()).map(lineHash))].filter((h) => before.get(h) === 1 && !addedSet.has(h)).slice(0, MAX_HASHES);
  const out: Expect = { ...base };
  if (a.length) out.a = a;
  else if (r.length) out.r = r;
  if (exists !== null && (exists === 1) !== now.exists) out.x = exists;
  return out;
}

/** Claude Code's edit tools, simulated on the file as it is now: the lines the call adds and removes. */
function claudeExpect(tool: string, input: Record<string, unknown>, now: FileNow): Expect {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (tool === "Write") {
    const content = str(input.content);
    if (content === null) return { m: now.m, h: now.h };
    if (now.text !== null && now.text === content) return { no: 1 };
    return fromLines(now, content.split("\n"), now.text?.split("\n") ?? [], 1);
  }
  if (tool === "Edit" || tool === "MultiEdit") {
    const edits = tool === "Edit" ? [input] : Array.isArray(input.edits) ? (input.edits as Record<string, unknown>[]) : [];
    if (!edits.length || edits.some((e) => str(e?.old_string) === null || str(e?.new_string) === null)) return { m: now.m, h: now.h };
    if (now.text === null) return now.lines ? { no: 1 } : { m: now.m, h: now.h };
    let text = now.text;
    for (const e of edits) {
      const o = str(e?.old_string);
      const n = str(e?.new_string);
      if (o === null || n === null) return { m: now.m, h: now.h };
      if (o === "" ? text !== "" : !text.includes(o)) return { no: 1 }; // the tool refuses an old_string that is not there
      text = e.replace_all ? text.split(o).join(n) : o === "" ? n : text.replace(o, () => n);
    }
    if (text === now.text) return { no: 1 };
    const after = countLines(text);
    const addedLines = text.split("\n").filter((l) => l.trim() && !now.lines!.has(lineHash(l)));
    const removedLines = now.text.split("\n").filter((l) => l.trim() && !after.has(lineHash(l)));
    return fromLines(now, addedLines, removedLines, 1);
  }
  return { m: now.m, h: now.h };
}

/** A Codex patch's lines per file (absolute paths): added, removed, and whether the file then exists. */
function patchFiles(command: string, cwd: string): Map<string, { added: string[]; removed: string[]; exists: 0 | 1 | null }> {
  const out = new Map<string, { added: string[]; removed: string[]; exists: 0 | 1 | null }>();
  let cur: { added: string[]; removed: string[]; exists: 0 | 1 | null } | null = null;
  for (const line of command.split("\n")) {
    const head = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (head) {
      cur = { added: [], removed: [], exists: head[1] === "Delete" ? 0 : head[1] === "Add" ? 1 : null };
      out.set(path.resolve(cwd, head[2].trim()), cur);
      continue;
    }
    const move = line.match(/^\*\*\* Move to: (.+)$/);
    if (move && cur) {
      // The old path goes, the new one holds the lines.
      const moved: { added: string[]; removed: string[]; exists: 0 | 1 | null } = { added: cur.added, removed: [], exists: 1 };
      cur.exists = 0;
      cur.added = [];
      out.set(path.resolve(cwd, move[1].trim()), moved);
      cur = moved;
      continue;
    }
    if (!cur || line.startsWith("***") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) cur.added.push(line.slice(1));
    else if (line.startsWith("-")) cur.removed.push(line.slice(1));
  }
  return out;
}

/**
 * What each file an edit call names should look like after it, from the file as it is now (at PreToolUse). Shell
 * writes (`shell`) can only be checked for a change.
 */
export function expectations(harness: Harness, tool: string | undefined, input: Record<string, unknown> | undefined, cwd: string | null, files: string[], shell: string[]): Map<string, Expect> {
  const out = new Map<string, Expect>();
  const patch = harness === "codex" && tool === "apply_patch" && typeof input?.command === "string" ? patchFiles(input.command, cwd || "/") : null;
  for (const f of files) {
    const now = fileNow(f);
    if (patch) {
      const p = patch.get(f);
      out.set(f, p ? fromLines(now, p.added, p.removed, p.exists) : { m: now.m, h: now.h });
    } else out.set(f, claudeExpect(tool || "", input || {}, now));
  }
  // A shell write says nothing about content: only whether its file changed, from its change time (a stat, so one
  // `touch` of a thousand files stays within the hook's deadline).
  for (const f of shell) out.set(f, { m: mtimeOf(f) });
  return out;
}

function mtimeOf(file: string): number {
  try {
    return Math.floor(fs.statSync(file).mtimeMs);
  } catch {
    return -1;
  }
}

/** Whether the file now shows what the call was to do. */
export function shows(file: string, e: Expect): boolean {
  if (e.no) return false;
  if (!e.a && !e.r && e.x === undefined && e.h === undefined) return e.m !== undefined && mtimeOf(file) !== e.m;
  const now = fileNow(file);
  if (e.x !== undefined && now.exists !== (e.x === 1)) return false;
  if (e.a || e.r) {
    if (!now.lines) return now.m !== e.m;
    return (e.a || []).every((h) => now.lines!.has(h)) && (e.r || []).every((h) => !now.lines!.has(h));
  }
  if (e.x !== undefined) return true;
  return now.m !== e.m || now.h !== e.h;
}

/** A verdict on one tool call (`u`), for one of its files (`p`) or all of them. */
export type Verdicts = Map<string, boolean>;

/** The `p` of a verdict on the commit a shell command made (its file writes have their own). */
export const COMMIT = "#commit";

/** Verdicts recorded in a session's activity: `ran` (made) wins over `failed` for the same call and file. */
export function verdictsOf(acts: Act[]): Verdicts {
  const out: Verdicts = new Map();
  for (const a of acts) {
    if ((a.t !== "ran" && a.t !== "failed") || !a.u) continue;
    const k = a.p ? `${a.u}\0${a.p}` : a.u;
    if (a.t === "ran") out.set(k, true);
    else if (!out.has(k)) out.set(k, false);
  }
  return out;
}

/** The verdict on an edit or commit: true made, false not, null none yet. */
export function verdictFor(a: Act, v: Verdicts): boolean | null {
  if (!a.u) return null;
  if (a.t === "commit") return v.has(`${a.u}\0${COMMIT}`) ? v.get(`${a.u}\0${COMMIT}`)! : null;
  if (a.p && v.has(`${a.u}\0${a.p}`)) return v.get(`${a.u}\0${a.p}`)!;
  return v.has(a.u) ? v.get(a.u)! : null;
}

/** Changed at or after the time the edit was recorded (a second of slack): the rule for lines older builds wrote. */
export function changedSince(a: Act): boolean {
  try {
    return fs.statSync(a.p as string).mtimeMs >= Date.parse(a.at) - 1000;
  } catch {
    return false;
  }
}

/**
 * Whether an edit or commit happened. `confirmed`: the session's PostToolUse hook ran (an older plugin than the one
 * whose PreToolUse says `--post-tool-use`), so edits carrying a tool call id wait for it. `lazy`: an edit still waiting
 * for its own session's next hook counts if its file already shows it and no other session's edit explains that.
 */
export function happened(a: Act, v: Verdicts, confirmed: boolean, lazy: { home: string; lid: string } | null): boolean {
  if (a.t === "commit") {
    if (!a.u) return true; // an older build's line
    const d = verdictFor(a, v);
    if (d !== null) return d;
    return !a.c && !!lazy && !!a.d && !!a.s && Date.now() - Date.parse(a.at) < PENDING_MS && committed(a.d, a.s, a.at);
  }
  if (a.t !== "edit" || a.via || !a.p) return true;
  const d = verdictFor(a, v);
  if (d !== null) {
    // A `ran` for a whole shell command (an older build's) still needs its file changed.
    if (d && a.sh && a.u && !v.has(`${a.u}\0${a.p}`)) return changedSince(a);
    return d;
  }
  if (a.c || (confirmed && a.u && !a.v)) return false; // waits for its own PostToolUse
  if (a.v) return !!lazy && Date.now() - Date.parse(a.at) < PENDING_MS && shows(a.p, a.v) && !explained(lazy.home, lazy.lid, a);
  return changedSince(a); // a line an older build wrote
}

/** Shared sessions' activity files on this machine changed in the last 6 hours, by local id. */
export function activityLids(home: string, maxAgeMs = 6 * 3_600_000): string[] {
  const dir = layout.activityDir(home);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const now = Date.now();
  const out: string[] = [];
  for (const n of names) {
    try {
      if (now - fs.statSync(path.join(dir, n)).mtimeMs < maxAgeMs) out.push(n.slice(0, -".jsonl".length));
    } catch {
      /* gone */
    }
  }
  return out;
}

/**
 * Another session's edit `b` of the same file accounts for the change that would credit `a`: it wrote (or removed) the
 * same lines `a` is to show, or, when either says nothing about lines, it happened after `a` was recorded.
 */
function explains(a: Act, b: Act, done: number | null): boolean {
  const mine = a.v?.a?.length ? a.v.a : a.v?.r?.length ? a.v.r : null;
  if (mine && b.v && (b.v.a || b.v.r)) {
    const theirs = new Set([...(b.v.a || []), ...(b.v.r || [])]);
    return mine.some((h) => theirs.has(h));
  }
  return (done ?? Date.parse(b.at)) > Date.parse(a.at);
}

/**
 * Another session's edit of the same file explains its change, so `a` must not be credited with it (a refused edit
 * whose file another session then wrote, the same content included): one with a `ran` verdict, one still waiting whose
 * own evidence is in the file, or a line an older build wrote whose file changed since.
 */
export function explained(home: string, lid: string, a: Act): boolean {
  for (const other of activityLids(home)) {
    if (other === lid) continue;
    const acts = rawActs(home, other);
    if (!acts.some((b) => b.t === "edit" && b.p === a.p)) continue;
    const v = verdictsOf(acts);
    const ranAt = new Map<string, number>();
    for (const r of acts) if (r.t === "ran" && r.u) ranAt.set(r.p ? `${r.u}\0${r.p}` : r.u, Date.parse(r.at));
    for (const b of acts) {
      if (b.t !== "edit" || b.via || !b.p || b.p !== a.p) continue;
      const d = verdictFor(b, v);
      if (d === true) {
        if (explains(a, b, ranAt.get(`${b.u}\0${b.p}`) ?? ranAt.get(b.u as string) ?? Date.parse(b.at))) return true;
      } else if (d === null) {
        // One its PostToolUse decides counts only while that hook may still be on its way (it fires within a second of
        // the call): one refused never gets it, and must not take another session's credit.
        const window = b.c ? IN_FLIGHT_MS : PENDING_MS;
        const pending = b.v ? Date.now() - Date.parse(b.at) < window && shows(b.p, b.v) : !b.c && changedSince(b);
        if (pending && explains(a, b, null)) return true;
      }
    }
  }
  return false;
}

/** The git directory of the repo `dir` is in (a worktree's own), with no git binary: hooks start no process. */
function gitDir(dir: string): string | null {
  let d = path.resolve(dir);
  for (let i = 0; i < 40; i++) {
    const dotgit = path.join(d, ".git");
    try {
      const st = fs.statSync(dotgit);
      if (!st.isFile()) return dotgit;
      const m = /^gitdir:\s*(.+)\s*$/m.exec(fs.readFileSync(dotgit, "utf8"));
      return m ? path.resolve(d, m[1].trim()) : null;
    } catch {
      /* not here */
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

/** A commit with this subject made in the repo at `dir` at or after `at` (a minute of slack), from HEAD's reflog. */
function committed(dir: string, subject: string, at: string): boolean {
  const g = gitDir(dir);
  if (!g) return false;
  let text = "";
  try {
    const file = path.join(g, "logs", "HEAD");
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, "r");
    try {
      const len = Math.min(size, 256 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      text = buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
  const since = Math.floor(Date.parse(at) / 1000) - 60;
  for (const line of text.split("\n")) {
    const m = /^[0-9a-f]+ [0-9a-f]+ .*> (\d+) [+-]\d{4}\tcommit(?: \([^)]*\))?: (.*)$/.exec(line);
    if (m && Number(m[1]) >= since && m[2].trim().slice(0, 120) === subject) return true;
  }
  return false;
}

/**
 * Record verdicts for a session's waiting edits and commits that carry no PostToolUse confirmation (Codex, an older
 * Claude Code plugin): `ran` once the file shows the call's content and no other session explains it (a commit: the
 * repo has it), and, when `final` (the turn is over, so every earlier call is done), `failed` for the rest. Run at the
 * session's own next hook, and by the sync pass (never `final` there). Returns how many were decided.
 */
export function settle(home: string, lid: string, final: boolean, record: (acts: Act[]) => void): number {
  const acts = rawActs(home, lid);
  const v = verdictsOf(acts);
  const now = Date.now();
  const out: Act[] = [];
  const at = new Date().toISOString();
  for (const a of acts) {
    if (!a.u || now - Date.parse(a.at) >= PENDING_MS || verdictFor(a, v) !== null || a.c) continue;
    if (a.t === "edit" && a.v && a.p && !a.via) {
      if (shows(a.p, a.v) && !explained(home, lid, a)) out.push({ t: "ran", at, u: a.u, p: a.p });
      else if (final) out.push({ t: "failed", at, u: a.u, p: a.p });
    } else if (a.t === "commit" && a.s && a.d) {
      if (committed(a.d, a.s, a.at)) out.push({ t: "ran", at, u: a.u, p: COMMIT });
      else if (final) out.push({ t: "failed", at, u: a.u, p: COMMIT });
    }
  }
  if (out.length) record(out);
  return out.length;
}
