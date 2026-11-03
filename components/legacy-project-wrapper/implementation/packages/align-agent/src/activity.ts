// Team activity inside the normal sync pass (no extra process): upload what this machine's shared sessions recorded in
// activity/<lid>.jsonl, and cache other machines' activity for the hooks. Repo-relative paths, commit subjects and
// task labels go up only with the user's "share work signals" consent; without it only keyed hashes do, which still
// let two sessions see they touched the same file. docs/v2/WIRE.md "Activity".
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { api, clockOffset, postTimed } from "./api.ts";
import { kvGet, kvSet } from "./db.ts";
import { getSession } from "./ledger.ts";
import { activityBase, confirming, madeActs, pathHash, rawActs, record, relTo, repoIdentity, type Act, type PodFeed, type RemoteItem } from "./hooks/siblings.ts";
import { activityLids, PENDING_MS, settle, verdictFor, verdictsOf } from "./hooks/evidence.ts";
import { gitInfo } from "./shared/anchors.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";
import { matchRule, readRules } from "./shared/rules.ts";

const KEEP_MS = 6 * 3_600_000;
const DEFAULT_BRANCHES = new Set(["main", "master", "trunk", "develop", "dev"]);
const BATCH = 200;

/** Consent to share paths and text: the session's own setting, else the folder rule it was shared under. */
export function signalsAllowed(ctx: Ctx, lid: string, cwd: string | null): boolean {
  const own = kvGet(ctx.db, `signals:${lid}`);
  if (own !== null) return own === "1";
  return !!matchRule(readRules(ctx.home), cwd)?.signals;
}

interface Item {
  session_key: string;
  kind: "edit" | "commit" | "task" | "claim";
  at: string;
  repo_id: string;
  path_hash?: string | null;
  path?: string | null;
  text?: string | null;
}

interface GitSnap {
  head: string | null;
  files: Record<string, number>;
  at: number;
}

function git(top: string, args: string[]): string {
  return execFileSync("git", ["-C", top, ...args], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 4 << 20 });
}

/** HEAD plus every changed or untracked file in the working tree with its mtime. */
function gitState(top: string): GitSnap | null {
  try {
    let head: string | null = null;
    try {
      head = git(top, ["rev-parse", "HEAD"]).trim();
    } catch {
      /* no commits yet */
    }
    const parts = git(top, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
    const files: Record<string, number> = {};
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i];
      if (!e || e.length < 4) continue;
      const st = e.slice(0, 2);
      if (st[0] === "R" || st[0] === "C") i++; // the next entry is the original path
      if (st.includes("D")) continue;
      try {
        files[e.slice(3)] = Math.floor(fs.statSync(path.join(top, e.slice(3))).mtimeMs);
      } catch {
        /* gone meanwhile */
      }
    }
    return { head, files, at: Date.now() };
  } catch {
    return null;
  }
}

/** Hook-seen edits by file: the file's change time when the sync pass took the edit as made (`act_cover`). */
const COVER_KEY = "act_cover";

function readCover(ctx: Ctx): Record<string, number> {
  try {
    const v = JSON.parse(kvGet(ctx.db, COVER_KEY) || "{}");
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Remember that a hook (or an earlier git pass) saw these files' latest change (6 hours, at most 5,000 files). */
function addCover(ctx: Ctx, edits: Act[]): void {
  if (!edits.length) return;
  const cover = readCover(ctx);
  for (const a of edits) {
    let m = Date.parse(a.at) || 0;
    try {
      m = Math.max(m, Math.floor(fs.statSync(a.p as string).mtimeMs));
    } catch {
      /* gone since */
    }
    cover[a.p as string] = Math.max(cover[a.p as string] || 0, m);
  }
  const now = Date.now();
  const kept = Object.entries(cover)
    .filter(([, m]) => now - m < KEEP_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5000);
  kvSet(ctx.db, COVER_KEY, JSON.stringify(Object.fromEntries(kept)));
}

/**
 * Decide, by their evidence, the waiting edits and commits of every session that recorded activity here (those whose
 * own next hook has not come yet): made ones only, the rest wait for that hook or for their hour (A2-local-1).
 */
export function settleActivity(ctx: Ctx): number {
  let n = 0;
  for (const lid of activityLids(ctx.home, PENDING_MS)) {
    try {
      n += settle(ctx.home, lid, false, (acts) => record(ctx.home, lid, acts));
    } catch {
      /* the next pass */
    }
  }
  return n;
}

/**
 * What hooks on this machine saw, for the git pass: files whose latest change a hook recorded since `since` (made, or
 * still waiting for its verdict), from every session that recorded activity here, whether or not it is still shared
 * (A2-local-6: an edit a share's sign-out left un-uploaded was credited to another session after the next sign-in).
 */
function hookSeen(ctx: Ctx, since: number): { paths: Set<string>; made: Act[] } {
  const paths = new Set<string>();
  const made: Act[] = [];
  const now = Date.now();
  const lids = new Set([...activityLids(ctx.home), ...(ctx.db.prepare("SELECT local_id FROM shares").all() as { local_id: string }[]).map((r) => r.local_id)]);
  for (const lid of lids) {
    for (const a of undecidedEdits(ctx, lid)) if (a.p) paths.add(a.p);
    const raw = rawActs(ctx.home, lid);
    if (!raw.length) continue;
    const v = verdictsOf(raw);
    const confirmed = confirming(ctx.home, lid);
    for (const a of madeActs(raw, confirmed, v)) {
      if (a.t === "edit" && !a.via && a.p && Date.parse(a.at) >= since) {
        paths.add(a.p);
        made.push(a);
      }
    }
    for (const a of raw) {
      if (a.t !== "edit" || a.via || !a.p || now - Date.parse(a.at) >= PENDING_MS || verdictFor(a, v) !== null) continue;
      if (a.c || a.v || (confirmed && a.u)) paths.add(a.p); // waiting for its verdict
    }
  }
  return { paths, made };
}

/**
 * Files changed in a shared session's repo since the previous pass (working tree, and commits made since), recorded as
 * edits of the session most recently active there. Hooks see edit tools and plain shell writes; this catches the rest
 * (a script, a code-mode tool). The first pass only takes a baseline, so earlier changes are never attributed. A file
 * whose latest change a hook already recorded, in any session here, is never credited again, whenever it is committed
 * (A1-local-2, A2-local-6); nor is one an earlier pass already credited, when it is committed later (A2-local-6).
 */
export function detectGitEdits(ctx: Ctx): number {
  const rows = ctx.db
    .prepare("SELECT s.local_id AS lid, s.cwd AS cwd, s.last_active AS last FROM shares h JOIN sessions s ON s.local_id = h.local_id WHERE h.state = 'shared'")
    .all() as { lid: string; cwd: string | null; last: string | null }[];
  const byRepo = new Map<string, { lid: string; last: string | null }[]>();
  for (const r of rows) {
    const top = r.cwd ? gitInfo(r.cwd)?.toplevel : null;
    if (!top) continue;
    byRepo.set(top, [...(byRepo.get(top) || []), r]);
  }
  let found = 0;
  let seenAt = Infinity;
  let hooks: { paths: Set<string>; made: Act[] } | null = null;
  for (const [top, sessions] of byRepo) {
    const key = `git_snap:${crypto.createHash("sha256").update(top).digest("hex").slice(0, 16)}`;
    const cur = gitState(top);
    if (!cur) continue;
    const prevRaw = kvGet(ctx.db, key);
    kvSet(ctx.db, key, JSON.stringify(cur));
    if (!prevRaw) continue;
    const prev = JSON.parse(prevRaw) as GitSnap;
    const changed = new Set(Object.keys(cur.files).filter((f) => cur.files[f] !== prev.files[f]));
    if (prev.head && cur.head && prev.head !== cur.head) {
      try {
        for (const f of git(top, ["diff", "--name-only", prev.head, cur.head]).split("\n")) if (f && fs.existsSync(path.join(top, f))) changed.add(f);
      } catch {
        /* history rewritten */
      }
    }
    if (!changed.size) continue;
    const owner = sessions.filter((s) => s.last && Date.parse(s.last) >= prev.at - 120_000).sort((a, b) => Date.parse(b.last!) - Date.parse(a.last!))[0];
    if (!owner) continue;
    // A change a hook already recorded, in any session here (shared now or not), is that session's edit and goes up
    // with it once: one recorded since the last pass, one recorded earlier whose file was only written later (an edit
    // approved after a pass read it, C4-5), or one an earlier pass took as made, while the file has not changed since
    // (a commit of it, A1-local-2). Only the rest is credited to the session most recently active here.
    if (!hooks || prev.at - 5_000 < seenAt) {
      seenAt = prev.at - 5_000;
      hooks = hookSeen(ctx, seenAt);
      addCover(ctx, hooks.made);
    }
    const seen = hooks.paths;
    const cover = readCover(ctx);
    const covered = (p: string) => {
      if (cover[p] === undefined) return false;
      try {
        return fs.statSync(p).mtimeMs <= cover[p] + 1000;
      } catch {
        return false;
      }
    };
    const at = new Date().toISOString();
    const acts: Act[] = [...changed]
      .map((f) => path.join(top, f))
      .filter((p) => !seen.has(p) && !covered(p))
      .map((p) => ({ t: "edit", at, p, via: "git" }));
    record(ctx.home, owner.lid, acts);
    // Credited once: a commit of the same change later credits nobody (A2-local-6).
    addCover(ctx, acts);
    found += acts.length;
  }
  return found;
}

/**
 * How long an edit a hook recorded waits for its file to change (the user may sit on the harness's permission prompt)
 * before it counts as refused and is dropped. Until then it is neither uploaded nor lost (C4-5).
 */
const UNDECIDED_EDIT_MS = 60 * 60_000;

const actKey = (a: Act) => `${a.t}\0${a.at}\0${a.p ?? ""}\0${a.u ?? ""}`;

/** Edits of a session that a pass read before their file changed: kept, not uploaded yet (C4-5). */
function undecidedEdits(ctx: Ctx, lid: string): Act[] {
  try {
    const list = JSON.parse(kvGet(ctx.db, `act_undecided:${lid}`) || "[]") as Act[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Edits and commits a hook recorded that have not happened (no verdict yet, or their file has not changed) and may
 *  still; one decided as not made never will. */
function stillUndecided(all: Act[], made: Act[], v: Map<string, boolean>, now = Date.now()): Act[] {
  const done = new Set(made.map(actKey));
  return all.filter(
    (a) => ((a.t === "edit" && !a.via && a.p) || (a.t === "commit" && a.u)) && !done.has(actKey(a)) && verdictFor(a, v) !== false && now - Date.parse(a.at) < UNDECIDED_EDIT_MS,
  );
}

/**
 * Complete lines appended to a session's activity file since the last upload, and the offset after them. Offsets are
 * logical: the bytes a trim dropped (the file's `base` line) plus the position in what is left, so a trim never makes
 * the pass resume mid-file (A1-local-8). The hook drops only lines up to the uploaded offset (below 4 MB).
 */
function newActs(file: string, from: number): { acts: Act[]; next: number } {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return { acts: [], next: from };
  }
  const head = activityBase(buf.subarray(0, 128));
  let start = head.len + Math.max(0, from - head.base);
  if (start > buf.length) start = head.len; // a different file than the offset is about: start over
  const rest = buf.subarray(start);
  const end = rest.lastIndexOf(10);
  const at = head.base + (start - head.len);
  if (end < 0) return { acts: [], next: at };
  const acts: Act[] = [];
  for (const line of rest.subarray(0, end).toString("utf8").split("\n")) {
    try {
      const a = JSON.parse(line) as Act;
      if (a && typeof a.at === "string") acts.push(a);
    } catch {
      /* torn line */
    }
  }
  return { acts, next: at + end + 1 };
}

/** Save how far the session's activity went up: in the database for the pass, and beside the file for the hook's trim. */
function saveOffset(ctx: Ctx, lid: string, next: number): void {
  kvSet(ctx.db, `act_off:${lid}`, String(next));
  try {
    fs.writeFileSync(layout.activityUploaded(ctx.home, lid), String(next), { mode: 0o600 });
  } catch {
    /* the hook then keeps more lines */
  }
}

/** Activity items this machine's shared sessions recorded that wait to upload (what the next pass would send, branch
 *  label aside): counted when a pass could not reach the server, so its message does not say nothing waits. */
export function waitingActivity(ctx: Ctx): number {
  // Shares the server has not confirmed yet (`pending`) wait too: their activity goes up once it does (E2E acycle3
  // A3-cross-6, where a count of 0 was printed while a commit and an edit waited).
  const shares = ctx.db.prepare("SELECT local_id, workspace_id FROM shares WHERE state IN ('shared','pending')").all() as { local_id: string; workspace_id: string }[];
  let n = 0;
  for (const s of shares) {
    const all = [...undecidedEdits(ctx, s.local_id), ...newActs(layout.activity(ctx.home, s.local_id), Number(kvGet(ctx.db, `act_off:${s.local_id}`) || 0)).acts];
    const cwd = getSession(ctx.db, s.local_id)?.cwd ?? null;
    const repo = repoIdentity(s.workspace_id, cwd);
    if (!repo) continue;
    const named = signalsAllowed(ctx, s.local_id, cwd);
    const v = verdictsOf([...rawActs(ctx.home, s.local_id), ...all]);
    const made = madeActs(all, confirming(ctx.home, s.local_id), v);
    // Edits and commits held for their call's verdict (or their file's change) wait as well, until they are decided.
    for (const a of [...made, ...stillUndecided(all, made, v)]) {
      if ((a.t === "edit" || a.t === "claim") && a.p) n += relTo(repo.toplevel, a.p) ? 1 : 0;
      else if (a.t === "commit" || (a.t === "task" && named && a.s)) n++;
    }
  }
  return n;
}

export async function uploadActivity(ctx: Ctx): Promise<number> {
  const shares = ctx.db.prepare("SELECT local_id, workspace_id, session_key FROM shares WHERE state='shared'").all() as { local_id: string; workspace_id: string; session_key: string }[];
  let sent = 0;
  for (const s of shares) {
    const offKey = `act_off:${s.local_id}`;
    const waitKey = `act_undecided:${s.local_id}`;
    const fresh = newActs(layout.activity(ctx.home, s.local_id), Number(kvGet(ctx.db, offKey) || 0));
    const next = fresh.next;
    // Edits read by an earlier pass before their file changed come first; each counts once its file has changed (an
    // edit the user refused never does, C3-9), and is kept until then rather than skipped for good (C4-5).
    const all = [...undecidedEdits(ctx, s.local_id), ...fresh.acts];
    // Verdicts on the session's tool calls: an edit or commit counts once its own call is known to have made it
    // (A1-local-1, A2-local-1, 5); the pass decided what it could just before (`settleActivity`).
    const v = verdictsOf([...rawActs(ctx.home, s.local_id), ...fresh.acts]);
    const acts = madeActs(all, confirming(ctx.home, s.local_id), v);
    const waiting = stillUndecided(all, acts, v);
    addCover(ctx, acts.filter((a) => a.t === "edit" && !a.via && a.p));
    const cwd = getSession(ctx.db, s.local_id)?.cwd ?? null;
    const repo = repoIdentity(s.workspace_id, cwd);
    if (!repo) {
      saveOffset(ctx, s.local_id, next);
      kvSet(ctx.db, waitKey, "[]");
      continue;
    }
    const named = signalsAllowed(ctx, s.local_id, cwd);
    const items: Item[] = [];
    const base = { session_key: s.session_key, repo_id: repo.repo_id };
    // The branch name is a useful default label, except for the default branch, which says nothing about the work.
    if (named && repo.branch && !DEFAULT_BRANCHES.has(repo.branch) && kvGet(ctx.db, `act_branch:${s.local_id}`) !== repo.branch) {
      items.push({ ...base, kind: "task", at: new Date().toISOString(), text: `branch ${repo.branch}` });
      kvSet(ctx.db, `act_branch:${s.local_id}`, repo.branch);
    }
    for (const a of acts) {
      if ((a.t === "edit" || a.t === "claim") && a.p) {
        const rel = relTo(repo.toplevel, a.p);
        if (!rel) continue;
        items.push({ ...base, kind: a.t, at: a.at, path_hash: pathHash(repo.repo_id, rel), path: named ? rel : null, text: a.t === "claim" && named ? a.s ?? null : null });
      } else if (a.t === "commit") items.push({ ...base, kind: "commit", at: a.at, text: named ? a.s ?? null : null });
      else if (a.t === "task" && named && a.s) items.push({ ...base, kind: "task", at: a.at, text: a.s });
    }
    let ok = true;
    for (let i = 0; i < items.length && ok; i += BATCH) {
      // Times go up on the server's clock; refusals are logged, never dropped silently (C3-4).
      const batch = items.slice(i, i + BATCH);
      const { r, refused } = await postTimed(ctx, `/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/activity`, "items", batch, "activity");
      ok = !!r && r.status >= 200 && r.status < 300;
      if (ok) sent += batch.length - refused.length;
    }
    if (ok) {
      // On failure the same lines (and the same waiting edits) go up on the next pass.
      saveOffset(ctx, s.local_id, next);
      kvSet(ctx.db, waitKey, JSON.stringify(waiting));
    }
  }
  return sent;
}

/** Fetch new team activity by cursor and keep the last 6 hours of other machines' unexpired items (at most 1,000), with the clock offset
 *  this machine knows, so hooks read the items' server times on the server's clock (E2E acycle1 A1-cross-5). */
export async function fetchPod(ctx: Ctx, ws: string): Promise<number> {
  const prev = readJson<PodFeed>(layout.podFeed(ctx.home, ws));
  const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(ws)}/activity?after=${prev?.cursor ?? 0}`);
  if (r.status !== 200 || !Array.isArray(r.json?.items)) return 0;
  const offset = clockOffset(ctx.home);
  const now = Date.now();
  const snow = now + offset;
  const fresh = r.json.items as RemoteItem[];
  if (!fresh.length && prev && now - Date.parse(prev.fetched_at) < 60_000 && (prev.clock_offset_ms || 0) === offset) return 0;
  // This machine's own items are never shown back (its sessions are read locally), so they are not kept: they would push
  // other people's recent work out of the 1,000 (A2-local-8).
  const own = new Set((ctx.db.prepare("SELECT session_key FROM shares").all() as { session_key: string }[]).map((r) => r.session_key));
  const items = [...(prev?.items || []), ...fresh].filter((i) => !own.has(i.session_key) && Date.parse(i.expires_at) > snow && snow - Date.parse(i.at) < KEEP_MS).slice(-1000);
  const next: PodFeed = { v: 1, workspace_id: ws, cursor: Number(r.json.cursor) || prev?.cursor || 0, fetched_at: new Date().toISOString(), items };
  if (offset) next.clock_offset_ms = offset;
  writeJsonAtomic(layout.podFeed(ctx.home, ws), next);
  return fresh.length;
}
