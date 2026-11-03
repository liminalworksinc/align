// Evidence that a session's own tool call made the edit (or the commit) its PreToolUse hook recorded (E2E acycle2
// A2-local-1, 2, 5; acycle3 A3-local-1, 3 to 6). The hook records an edit before the harness's permission check, so a
// refused or failed call is recorded too; the file changing afterwards proves nothing by itself, since another session,
// the user or a script may have written it. One rule throughout: an exit status says nothing about which parts of a
// shell command ran, so each effect is decided from its artifact.
// - Claude Code with a plugin that installs PostToolUse (its PreToolUse command says so, `--post-tool-use`): an edit
//   tool's own PostToolUse says it ran (`ran`); a refused call fires nothing, a failed one PostToolUseFailure
//   (`failed`). A shell command's PostToolUse or PostToolUseFailure decides each file it was to write by whether the
//   file's content (or existence) now differs from what it was at PreToolUse, and its commit by HEAD's reflog.
// - Otherwise (Codex, whose PostToolUse is not installed and says nothing reliable about a refused `apply_patch`; an
//   older Claude Code plugin), and for a Claude Code call whose PostToolUse never came (the session was killed or
//   interrupted mid-tool): the content the call was to write is in the file and was not at PreToolUse (`v`), no other
//   session's edit, no unshared session's work and no change the git pass found explains it, and it appeared before
//   the session's next hook.
// Local files only: hook-safe.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { layout } from "../shared/layout.ts";
import type { Harness } from "../shared/types.ts";
import { privateChecker } from "./private.ts";
import { rawActs, type Act } from "./siblings.ts";

/** What a call is to change in one file, checked after it:
 *  - `w`: regions of lines the file is to hold afterwards, each `<lines>:<first line hash>:<hash>`, contiguous (blank
 *    lines and surrounding spaces aside), none of them in the file at PreToolUse: the whole content a `Write` or a
 *    patch's `Add File` writes, the changed part of an `Edit` with two lines of context on each side, a patch hunk's
 *    lines after it (context and added lines).
 *  - `r`: lines it removes that were in the file once (only when no region says anything).
 *  - `x`: whether the file then exists.
 *  - `k`: a shell write's file content (a hash; null: absent) at PreToolUse: it counts when the content differs.
 *  - `m`, `h`: the file's change time and content hash at PreToolUse, for a call that says nothing about lines.
 *  - `a`: lines it adds, as earlier builds wrote them (still read).
 *  - `no`: the call cannot change the file (an `Edit` whose `old_string` is not there, a write of the same content). */
export interface Expect {
  w?: string[];
  a?: string[];
  r?: string[];
  x?: 0 | 1;
  k?: string | null;
  /** The file's change time at PreToolUse (-1: absent). */
  m?: number;
  /** A hash of its content at PreToolUse (null: absent). */
  h?: string | null;
  no?: 1;
}

/** Edits and commits are pending for this long without a verdict; then they count as refused (C4-5). */
export const PENDING_MS = 60 * 60_000;
/** How long a call's own PostToolUse may still be on its way. */
const IN_FLIGHT_MS = 10_000;
/** A call the session's next hook found undecided this soon after it may still be running (a parallel call). */
const GRACE_MS = 2_000;
/** A Claude Code call whose PostToolUse has not come this long after it (the session was killed or interrupted
 *  mid-tool) is decided by the sync pass from its content evidence (A3-local-5). */
export const NO_VERDICT_MS = 60_000;
/** Files above this are not read: only their size, change time and inode count. */
const MAX_READ = 2 << 20;
/** Removed lines kept to check (only for an edit no region describes). */
const MAX_REMOVED = 32;
/** Context lines kept on each side of an `Edit`'s changed lines. */
const CONTEXT = 2;

const lineHash = (s: string) => crypto.createHash("sha256").update(s.trim(), "utf8").digest("hex").slice(0, 12);
const norm = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

interface FileNow {
  exists: boolean;
  m: number;
  h: string | null;
  /** Line hashes with their counts; null for a file too large to read. */
  lines: Map<string, number> | null;
  /** Its non-blank lines, trimmed; null for a file too large to read. */
  norm: string[] | null;
  text: string | null;
}

const statSig = (st: fs.Stats) => `s:${st.size}:${Math.floor(st.mtimeMs)}:${st.ino}:${Math.floor(st.ctimeMs)}`;

function fileNow(file: string): FileNow {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return { exists: false, m: -1, h: null, lines: new Map(), norm: [], text: null };
  }
  const big = { exists: true, m: Math.floor(st.mtimeMs), h: statSig(st), lines: null, norm: null, text: null };
  if (!st.isFile() || st.size > MAX_READ) return big;
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return big;
  }
  return { exists: true, m: Math.floor(st.mtimeMs), h: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16), lines: countLines(text), norm: norm(text), text };
}

/** A file's content as a key: a hash of it (a size, change time and inode above 2 MB or past the hook's read budget),
 *  null when it does not exist. A move keeps the change time, never the content key of the file it replaces. */
function contentKey(file: string, budget: { bytes: number }): string | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > MAX_READ || st.size > budget.bytes) return statSig(st);
  try {
    const buf = fs.readFileSync(file);
    budget.bytes -= buf.length;
    return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  } catch {
    return statSig(st);
  }
}

function countLines(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of text.split("\n")) if (l.trim()) out.set(lineHash(l), (out.get(lineHash(l)) || 0) + 1);
  return out;
}

const regionKey = (lines: string[]) => `${lines.length}:${lineHash(lines[0])}:${crypto.createHash("sha256").update(lines.join("\n"), "utf8").digest("hex").slice(0, 16)}`;

/** Whether `lines` (trimmed, non-blank) holds the region `key` contiguously. */
function holds(lines: string[], key: string): boolean {
  const [n, first] = key.split(":");
  const len = Number(n);
  if (!(len > 0)) return false;
  for (let k = 0; k + len <= lines.length; k++) {
    if (lineHash(lines[k]) !== first) continue;
    if (regionKey(lines.slice(k, k + len)) === key) return true;
  }
  return false;
}

/** The expectation from regions the file is to hold and lines it is to lose, against the file as it is now: regions
 *  already in it say nothing and are dropped; with none left, lines removed that are there once. */
function fromRegions(now: FileNow, regions: string[][], removed: string[], exists: 0 | 1 | null): Expect {
  const out: Expect = { m: now.m, h: now.h };
  if (exists !== null && (exists === 1) !== now.exists) out.x = exists;
  if (!now.norm || !now.lines) return out;
  const w = [...new Set(regions.filter((r) => r.length).map(regionKey))].filter((k) => !holds(now.norm!, k));
  if (w.length) out.w = w;
  else {
    const r = [...new Set(removed.filter((l) => l.trim()).map(lineHash))].filter((h) => now.lines!.get(h) === 1).slice(0, MAX_REMOVED);
    if (r.length) out.r = r;
  }
  return out;
}

/** The changed part of `after` against `before` (both trimmed, non-blank lines), with context on each side. */
function changedRegion(before: string[], after: string[]): string[] {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let s = 0;
  while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  return after.slice(Math.max(0, p - CONTEXT), Math.min(after.length, after.length - s + CONTEXT));
}

/** Claude Code's edit tools, simulated on the file as it is now: what the file is to hold afterwards. */
function claudeExpect(tool: string, input: Record<string, unknown>, now: FileNow): Expect {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (tool === "Write") {
    const content = str(input.content);
    if (content === null) return { m: now.m, h: now.h };
    if (now.text !== null && now.text === content) return { no: 1 };
    return fromRegions(now, [norm(content)], now.text?.split("\n") ?? [], 1);
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
    const removedLines = now.text.split("\n").filter((l) => l.trim() && !after.has(lineHash(l)));
    return fromRegions(now, [changedRegion(now.norm || [], norm(text))], removedLines, 1);
  }
  return { m: now.m, h: now.h };
}

interface PatchFile {
  /** Each hunk's lines after it (context and added), in order. */
  hunks: string[][];
  removed: string[];
  exists: 0 | 1 | null;
}

/** A Codex patch per file (absolute paths): its hunks' lines after the patch, the lines it removes, and whether the file
 *  then exists (`Add File` is one hunk, the whole file). */
function patchFiles(command: string, cwd: string): Map<string, PatchFile> {
  const out = new Map<string, PatchFile>();
  let cur: PatchFile | null = null;
  let hunk: string[] = [];
  const close = () => {
    if (cur && hunk.length) cur.hunks.push(hunk);
    hunk = [];
  };
  for (const line of command.split("\n")) {
    const head = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (head) {
      close();
      cur = { hunks: [], removed: [], exists: head[1] === "Delete" ? 0 : head[1] === "Add" ? 1 : null };
      out.set(path.resolve(cwd, head[2].trim()), cur);
      continue;
    }
    const move = line.match(/^\*\*\* Move to: (.+)$/);
    if (move && cur) {
      // The old path goes, the new one holds the lines.
      const moved: PatchFile = { hunks: cur.hunks, removed: [], exists: 1 };
      cur.exists = 0;
      cur.hunks = [];
      out.set(path.resolve(cwd, move[1].trim()), moved);
      cur = moved;
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("@@") || line.startsWith("***")) {
      close();
      continue;
    }
    if (line.startsWith("-")) cur.removed.push(line.slice(1));
    else if (line.startsWith("+") || line.startsWith(" ")) {
      if (line.trim().length > 1 || line.slice(1).trim()) hunk.push(line.slice(1).trim());
    }
  }
  close();
  for (const f of out.values()) for (const h of f.hunks) h.splice(0, h.length, ...h.filter(Boolean));
  return out;
}

/**
 * What each file an edit call names should look like after it, from the file as it is now (at PreToolUse); for a shell
 * write (`shell`), the file's content key, since a shell command says nothing about content (A3-local-1).
 */
export function expectations(harness: Harness, tool: string | undefined, input: Record<string, unknown> | undefined, cwd: string | null, files: string[], shell: string[]): Map<string, Expect> {
  const out = new Map<string, Expect>();
  const patch = harness === "codex" && tool === "apply_patch" && typeof input?.command === "string" ? patchFiles(input.command, cwd || "/") : null;
  for (const f of files) {
    const now = fileNow(f);
    if (patch) {
      const p = patch.get(f);
      out.set(f, p ? fromRegions(now, p.hunks, p.removed, p.exists) : { m: now.m, h: now.h });
    } else out.set(f, claudeExpect(tool || "", input || {}, now));
  }
  // Hashing stays within the hook's deadline: one `touch` of a thousand small files reads well under the budget, and
  // past it a file's size, change time and inode stand for its content.
  const budget = { bytes: 16 << 20 };
  for (const f of shell) out.set(f, { k: contentKey(f, budget) });
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
  // Compared the way it was taken: a file past the hook's read budget then is compared by its size, change time and inode.
  if (e.k !== undefined) {
    if (!e.k?.startsWith("s:")) return contentKey(file, { bytes: MAX_READ }) !== e.k;
    try {
      return statSig(fs.statSync(file)) !== e.k;
    } catch {
      return true; // gone
    }
  }
  if (!e.w && !e.a && !e.r && e.x === undefined && e.h === undefined) return e.m !== undefined && mtimeOf(file) !== e.m;
  const now = fileNow(file);
  if (e.x !== undefined && now.exists !== (e.x === 1)) return false;
  if (e.w) {
    if (!now.norm) return now.m !== e.m;
    return e.w.every((k) => holds(now.norm!, k));
  }
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

/** A session's activity read for a card or hold: its edits still waiting for their next hook are decided lazily. */
export interface Lazy {
  home: string;
  lid: string;
  explains?: (a: Act) => boolean;
}

/**
 * Whether an edit or commit happened. `confirmed`: the session's PostToolUse hook ran (an older plugin than the one
 * whose PreToolUse says `--post-tool-use`), so edits carrying a tool call id wait for it. `lazy`: an edit still waiting
 * for its own session's next hook counts if its file already shows it and no other session's edit explains that.
 */
export function happened(a: Act, v: Verdicts, confirmed: boolean, lazy: Lazy | null): boolean {
  if (a.t === "commit") {
    if (!a.u) return true; // an older build's line
    const d = verdictFor(a, v);
    if (d !== null) return d;
    return !a.c && !!lazy && !!a.d && !!a.s && Date.now() - Date.parse(a.at) < PENDING_MS && committed(a.d, a.s, a.at, a.rl);
  }
  if (a.t !== "edit" || a.via || !a.p) return true;
  const d = verdictFor(a, v);
  if (d !== null) {
    // A `ran` for a whole shell command (an older build's) still needs its file changed.
    if (d && a.sh && a.u && !v.has(`${a.u}\0${a.p}`)) return changedSince(a);
    return d;
  }
  if (a.c || (confirmed && a.u && !a.v)) return false; // waits for its own PostToolUse
  if (a.v) return !!lazy && Date.now() - Date.parse(a.at) < PENDING_MS && shows(a.p, a.v) && !(lazy.explains ??= explainer(lazy.home, lazy.lid))(a);
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
 * Something other than `a`'s own call explains a change of its file, so `a` must not be credited with it (A2-local-1,
 * A3-local-3, 4): another session's edit of the file that ran after `a` was recorded (whatever its lines: when two
 * changes meet in one file there is no telling them apart, and missed credit beats wrong credit), one still waiting
 * whose own evidence is in the file, a change the git pass found in it since (a script, the user, any session), or an
 * unshared session working in its repo since (A3-local-2).
 */
export function explained(home: string, lid: string, a: Act): boolean {
  return explainer(home, lid)(a);
}

/** `explained` for many edits of one session at once (a shell command that wrote a thousand files): every activity
 *  file is read once. */
export function explainer(home: string, lid: string): (a: Act) => boolean {
  const byPath = new Map<string, { lid: string; b: Act; done: number | null; d: boolean | null }[]>();
  for (const other of activityLids(home)) {
    const acts = rawActs(home, other);
    const v = verdictsOf(acts);
    const ranAt = new Map<string, number>();
    for (const r of acts) if (r.t === "ran" && r.u) ranAt.set(r.p ? `${r.u}\0${r.p}` : r.u, Date.parse(r.at));
    for (const b of acts) {
      if (b.t !== "edit" || !b.p || (other === lid && !b.via)) continue;
      const list = byPath.get(b.p) || [];
      list.push({ lid: other, b, d: b.u ? verdictFor(b, v) : null, done: b.u ? (ranAt.get(`${b.u}\0${b.p}`) ?? ranAt.get(b.u) ?? null) : null });
      byPath.set(b.p, list);
    }
  }
  const priv = privateChecker(home);
  return (a: Act) => {
    const since = Date.parse(a.at);
    for (const { b, d, done } of byPath.get(a.p as string) || []) {
      if (b.via) {
        if (Date.parse(b.at) > since) return true;
        continue;
      }
      if (!b.u) {
        if (Date.parse(b.at) > since && changedSince(b)) return true; // a line an older build wrote
      } else if (d === true) {
        if ((done ?? Date.parse(b.at)) > since) return true;
      } else if (d === null && b.v) {
        // One its PostToolUse decides counts only while that hook may still be on its way (it fires within a second of
        // the call): one refused never gets it, and must not take another session's credit.
        if (Date.now() - Date.parse(b.at) < (b.c ? IN_FLIGHT_MS : PENDING_MS) && shows(b.p as string, b.v)) return true;
      }
    }
    return priv(a.p as string, since - 1000);
  };
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

/** The byte length of HEAD's reflog in the repo at `dir` now (null: no repo or no reflog yet, counted as 0 when a repo
 *  exists), recorded with a commit at its PreToolUse so the check below reads only what was logged after it. */
export function reflogMark(dir: string): number | null {
  const g = gitDir(dir);
  if (!g) return null;
  try {
    return fs.statSync(path.join(g, "logs", "HEAD")).size;
  } catch {
    return 0;
  }
}

/**
 * A commit with this subject made in the repo at `dir` since its call was seen, from HEAD's reflog. With `mark` (the
 * reflog's length at PreToolUse) only the lines logged after it count, whatever their dates say: a reflog line carries
 * the committer date, which `GIT_COMMITTER_DATE` (a rebase with `--committer-date-is-author-date`, a reproducible-build
 * environment) can set to any time. Without one (a line an older build wrote), a line dated at or after `at`, less a
 * minute, counts. A reflog shorter than the mark (expired or rewritten) falls back to the dates.
 */
function committed(dir: string, subject: string, at: string, mark?: number): boolean {
  const g = gitDir(dir);
  if (!g) return false;
  let text = "";
  let byMark = false;
  try {
    const file = path.join(g, "logs", "HEAD");
    const size = fs.statSync(file).size;
    byMark = typeof mark === "number" && mark <= size;
    const from = byMark ? Math.max(mark as number, size - 256 * 1024) : Math.max(0, size - 256 * 1024);
    const len = size - from;
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, from);
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
    if (m && (byMark || Number(m[1]) >= since) && m[2].trim().slice(0, 120) === subject) return true;
  }
  return false;
}

/**
 * Who decides a waiting call now: the session's own next hook (`hook`, from `agent`: a subagent's id, or null for the
 * main agent), the end of its turn or a new start (`final`: every earlier call is done), or the sync pass (`pass`).
 */
export type SettleBy = { by: "hook"; agent: string | null } | { by: "final" } | { by: "pass" };

/** The verdict on a commit from HEAD's reflog (one recorded without its folder: what the command's exit said). */
export function commitMade(a: Act, exitOk: boolean): boolean {
  return a.d && a.s ? committed(a.d, a.s, a.at, a.rl) : exitOk;
}

/**
 * Record verdicts for a session's waiting edits and commits from their evidence (`ran` once the file shows the call's
 * content and nothing else explains it; a commit, once HEAD's reflog has it after the call's mark), and `failed` once
 * the call is over without it, so content that appears later (the user or a script writing the same lines) never
 * counts (A3-local-4):
 * - With no PostToolUse to wait for (Codex, an older Claude Code plugin): the session's next hook, from the same agent
 *   and at least 2 seconds after the call (a call running beside it may not have written yet), decides it either way;
 *   the end of the turn decides the rest; the pass only records those it finds made.
 * - Waiting for its own PostToolUse (`c`), which never comes for a call refused at the prompt or one whose session was
 *   killed or interrupted mid-tool (A3-local-5): the same, from the session's next hook (its later calls run after it),
 *   and the pass, a minute on, records it made when its content shows.
 * Returns how many were decided.
 */
export function settle(home: string, lid: string, when: SettleBy, record: (acts: Act[]) => void): number {
  const acts = rawActs(home, lid);
  const v = verdictsOf(acts);
  const now = Date.now();
  const out: Act[] = [];
  const at = new Date().toISOString();
  let explains: ((a: Act) => boolean) | null = null;
  for (const a of acts) {
    const age = now - Date.parse(a.at);
    if (!a.u || age >= PENDING_MS || verdictFor(a, v) !== null) continue;
    const edit = a.t === "edit" && !!a.v && !!a.p && !a.via;
    const commit = a.t === "commit" && !!a.s && !!a.d;
    if (!edit && !commit) continue;
    // Over: the call cannot still write.
    const over = when.by === "final" || (when.by === "hook" && age >= GRACE_MS && (a.ai ?? null) === when.agent);
    if (a.c && !(over || (when.by === "pass" && age >= NO_VERDICT_MS))) continue;
    const made = edit ? shows(a.p as string, a.v as Expect) && !(explains ??= explainer(home, lid))(a) : committed(a.d as string, a.s as string, a.at, a.rl);
    if (made) out.push({ t: "ran", at, u: a.u, p: edit ? a.p : COMMIT });
    else if (over) out.push({ t: "failed", at, u: a.u, p: edit ? a.p : COMMIT });
  }
  if (out.length) record(out);
  return out.length;
}
