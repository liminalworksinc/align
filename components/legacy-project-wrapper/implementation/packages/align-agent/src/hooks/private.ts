// Sessions that are not shared (private, a share stopped with `::align unshare`, `align stop-sharing` or from the web,
// one a sign-out ended) record nothing of their work. The git pass still has to know such a session was working in a
// repo, or it credits that work to a shared session there and uploads its path (E2E acycle3 A3-local-2). So their hooks
// keep one local mark per session: the repos it was active in and the files its calls wrote, with when, as keys made
// with the device secret (never a path or any content). The mark never leaves this machine; the pass reads it and leaves
// the repo's changes of that time to no one, and a shared session's edit is never credited with a file it wrote.
// Local files only: hook-safe.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readJson, writeJsonAtomic } from "../shared/fsx.ts";
import { layout } from "../shared/layout.ts";

/** Marks older than this are dropped. */
const KEEP_MS = 7 * 86_400_000;
const MAX_REPOS = 200;
const MAX_FILES = 500;

export interface PrivateMark {
  v: 1;
  /** Repo key → when the session was last seen working in it (ms). */
  repos: Record<string, number>;
  /** File key → when one of its calls last wrote the file (ms). */
  files?: Record<string, number>;
}

/** The device secret, read only (a hook never creates it: a machine without one has shared nothing). */
function secret(home: string): Buffer | null {
  try {
    const b = fs.readFileSync(layout.deviceSecret(home));
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

/** The repo's key: a keyed hash of its top folder's real path, the same for the hook and the pass. */
export function repoMarkKey(key: Buffer, toplevel: string): string {
  return crypto.createHmac("sha256", key).update(`private\0repo\0${toplevel}`, "utf8").digest("hex").slice(0, 32);
}

/** A file's key: a keyed hash of its absolute path. */
const fileMarkKey = (key: Buffer, file: string): string => crypto.createHmac("sha256", key).update(`private\0file\0${path.resolve(file)}`, "utf8").digest("hex").slice(0, 32);

/** Entries younger than 7 days, newest first, at most `max`, with `fresh` set to `now`. */
function keep(prev: Record<string, number> | undefined, fresh: string[], now: number, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, at] of Object.entries(prev || {})) if (typeof at === "number" && now - at < KEEP_MS) out[k] = at;
  for (const k of fresh) out[k] = now;
  return Object.fromEntries(
    Object.entries(out)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max),
  );
}

/** The top folder of the git work tree `p` is in (a folder or a file), with no git binary: hooks start no process. */
export function workTree(p: string): string | null {
  let d: string;
  try {
    d = fs.realpathSync(p);
    if (!fs.statSync(d).isDirectory()) d = path.dirname(d);
  } catch {
    // Not there (yet): its folder.
    try {
      d = fs.realpathSync(path.dirname(p));
    } catch {
      return null;
    }
  }
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(d, ".git"))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

/** Note that this unshared session is working now in the repo of `cwd` and of each file it is about to write. */
export function markPrivate(home: string, lid: string, cwd: string | null, files: string[] = []): void {
  const key = secret(home);
  if (!key) return;
  const tops = new Set<string>();
  for (const p of [cwd, ...files]) {
    const top = p ? workTree(p) : null;
    if (top) tops.add(top);
  }
  if (!tops.size) return;
  const file = layout.privateMark(home, lid);
  const now = Date.now();
  const prev = readJson<PrivateMark>(file);
  const mark: PrivateMark = { v: 1, repos: keep(prev?.repos, [...tops].map((t) => repoMarkKey(key, t)), now, MAX_REPOS) };
  const written = keep(prev?.files, files.map((f) => fileMarkKey(key, f)), now, MAX_FILES);
  if (Object.keys(written).length) mark.files = written;
  try {
    fs.mkdirSync(layout.privateMarks(home), { recursive: true, mode: 0o700 });
    writeJsonAtomic(file, mark);
  } catch {
    /* best effort: the pass also reads the sessions table */
  }
}

/** Sessions whose marks say they worked in the repo at `toplevel` at or after `since` (ms), by local id, with when. */
export function privateActivity(home: string, key: Buffer, toplevel: string, since: number): { lid: string; at: number }[] {
  const k = repoMarkKey(key, toplevel);
  let names: string[] = [];
  try {
    names = fs.readdirSync(layout.privateMarks(home)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: { lid: string; at: number }[] = [];
  for (const n of names) {
    const at = readJson<PrivateMark>(path.join(layout.privateMarks(home), n))?.repos?.[k];
    if (typeof at === "number" && at >= since) out.push({ lid: n.slice(0, -".json".length), at });
  }
  return out;
}

/** Whether an unshared session's call wrote a file at or after a time (ms): the marks read once for many files. */
export function privateChecker(home: string): (file: string, since: number) => boolean {
  const key = secret(home);
  let names: string[] = [];
  try {
    names = key ? fs.readdirSync(layout.privateMarks(home)).filter((n) => n.endsWith(".json")) : [];
  } catch {
    names = [];
  }
  if (!key || !names.length) return () => false;
  const latest = new Map<string, number>();
  for (const n of names) {
    const lid = n.slice(0, -".json".length);
    if (sharedNow(home, lid)) continue;
    for (const [k, at] of Object.entries(readJson<PrivateMark>(path.join(layout.privateMarks(home), n))?.files || {})) latest.set(k, Math.max(latest.get(k) || 0, at));
  }
  return (file, since) => (latest.get(fileMarkKey(key, file)) || 0) >= since;
}

/** The session is shared now (its hooks record its work): a mark it left while private no longer stands for it. */
export function sharedNow(home: string, lid: string): boolean {
  const state = readJson<{ share?: { state?: string } | null }>(layout.hot(home, lid))?.share?.state;
  return state === "shared" || state === "pending";
}
