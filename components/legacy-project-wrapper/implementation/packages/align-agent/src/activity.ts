// Pod activity inside the normal sync pass (no extra process): upload what this machine's shared sessions recorded in
// activity/<lid>.jsonl, and cache other machines' activity for the hooks. Repo-relative paths, commit subjects and
// task labels go up only with the user's "share work signals" consent; without it only keyed hashes do, which still
// let two sessions see they touched the same file. docs/v2/WIRE.md "Activity".
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { api } from "./api.ts";
import { kvGet, kvSet } from "./db.ts";
import { getSession } from "./ledger.ts";
import { pathHash, readActs, record, relTo, repoIdentity, type Act, type PodFeed, type RemoteItem } from "./hooks/siblings.ts";
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

/**
 * Files changed in a shared session's repo since the previous pass (working tree, and commits made since), recorded as
 * edits of the session most recently active there. Hooks see edit tools and plain shell writes; this catches the rest
 * (a script, a code-mode tool). The first pass only takes a baseline, so earlier changes are never attributed.
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
    const seen = new Set(readActs(ctx.home, owner.lid).filter((a) => a.t === "edit" && Date.parse(a.at) >= prev.at - 5_000).map((a) => a.p));
    const at = new Date().toISOString();
    const acts: Act[] = [...changed].map((f) => path.join(top, f)).filter((p) => !seen.has(p)).map((p) => ({ t: "edit", at, p, via: "git" }));
    record(ctx.home, owner.lid, acts);
    found += acts.length;
  }
  return found;
}

/** Complete lines appended to a session's activity file since the last upload, and the offset after them. */
function newActs(file: string, from: number): { acts: Act[]; next: number } {
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { acts: [], next: from };
  }
  if (size < from) from = 0; // the file was trimmed: start over (duplicates are harmless, they expire)
  if (size === from) return { acts: [], next: from };
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(size - from);
    fs.readSync(fd, buf, 0, buf.length, from);
    const text = buf.toString("utf8");
    const end = text.lastIndexOf("\n");
    if (end < 0) return { acts: [], next: from };
    const acts: Act[] = [];
    for (const line of text.slice(0, end).split("\n")) {
      try {
        const a = JSON.parse(line) as Act;
        if (a && typeof a.at === "string") acts.push(a);
      } catch {
        /* torn line */
      }
    }
    return { acts, next: from + Buffer.byteLength(text.slice(0, end + 1)) };
  } finally {
    fs.closeSync(fd);
  }
}

export async function uploadActivity(ctx: Ctx): Promise<number> {
  const shares = ctx.db.prepare("SELECT local_id, workspace_id, session_key FROM shares WHERE state='shared'").all() as { local_id: string; workspace_id: string; session_key: string }[];
  let sent = 0;
  for (const s of shares) {
    const offKey = `act_off:${s.local_id}`;
    const { acts, next } = newActs(layout.activity(ctx.home, s.local_id), Number(kvGet(ctx.db, offKey) || 0));
    const cwd = getSession(ctx.db, s.local_id)?.cwd ?? null;
    const repo = repoIdentity(s.workspace_id, cwd);
    if (!repo) {
      kvSet(ctx.db, offKey, String(next));
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
      const r = await api(ctx, "POST", `/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/activity`, { body: { items: items.slice(i, i + BATCH) } }).catch(() => null);
      ok = !!r && r.status >= 200 && r.status < 300;
      if (ok) sent += Math.min(BATCH, items.length - i);
    }
    if (ok) kvSet(ctx.db, offKey, String(next)); // on failure the same lines go up on the next pass
  }
  return sent;
}

/** Fetch new pod activity by cursor and keep the last 6 hours of unexpired items (at most 1,000). */
export async function fetchPod(ctx: Ctx, ws: string): Promise<number> {
  const prev = readJson<PodFeed>(layout.podFeed(ctx.home, ws));
  const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(ws)}/activity?after=${prev?.cursor ?? 0}`);
  if (r.status !== 200 || !Array.isArray(r.json?.items)) return 0;
  const now = Date.now();
  const fresh = r.json.items as RemoteItem[];
  if (!fresh.length && prev && now - Date.parse(prev.fetched_at) < 60_000) return 0;
  const items = [...(prev?.items || []), ...fresh].filter((i) => Date.parse(i.expires_at) > now && now - Date.parse(i.at) < KEEP_MS).slice(-1000);
  const next: PodFeed = { v: 1, workspace_id: ws, cursor: Number(r.json.cursor) || prev?.cursor || 0, fetched_at: new Date().toISOString(), items };
  writeJsonAtomic(layout.podFeed(ctx.home, ws), next);
  return fresh.length;
}
