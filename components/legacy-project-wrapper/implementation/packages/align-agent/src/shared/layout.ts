// ALIGN_HOME layout. Hook-safe (node:path, node:crypto, node:fs only).
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { b64url, writeJsonAtomic } from "./fsx.ts";
import type { Harness, SpoolRecord } from "./types.ts";

/** Default ALIGN_HOME: $HOME/.align. */
export function defaultAlignHome(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.HOME || "/";
  return path.join(home, ".align");
}

/**
 * Hooks run from ALIGN_HOME/bin/<version>/hook.js. Prefer an explicit ALIGN_HOME, else derive it from the hook's own
 * location, else the default. This keeps hook commands free of env prefixes.
 */
export function alignHomeForHook(scriptPath: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.ALIGN_HOME) return env.ALIGN_HOME;
  const dir = path.dirname(scriptPath);
  const parent = path.dirname(dir);
  if (path.basename(parent) === "bin") return path.dirname(parent);
  return defaultAlignHome(env);
}

/** Deterministic local id for a harness session, computable by hooks without the database. */
export function localId(harness: Harness, nativeId: string): string {
  return b64url(crypto.createHash("sha256").update(`align-local\0${harness}\0${nativeId}`).digest()).slice(0, 22);
}

export const layout = {
  config: (h: string) => path.join(h, "config.json"),
  credentials: (h: string) => path.join(h, "credentials.json"),
  /** A device this machine signed out of while the server could not be reached, kept until it is revoked (0600). */
  pendingRevoke: (h: string) => path.join(h, "revoke.json"),
  deviceKey: (h: string) => path.join(h, "device_key"),
  deviceSecret: (h: string) => path.join(h, "device_secret"),
  db: (h: string) => path.join(h, "align.db"),
  me: (h: string) => path.join(h, "me.json"),
  install: (h: string) => path.join(h, "install.json"),
  lastSync: (h: string) => path.join(h, "last-sync.json"),
  spawnLock: (h: string) => path.join(h, "spawn.lock"),
  refreshLock: (h: string) => path.join(h, "refresh.lock"),
  logs: (h: string) => path.join(h, "logs"),
  bin: (h: string) => path.join(h, "bin"),
  feeds: (h: string) => path.join(h, "feeds"),
  feed: (h: string, ws: string) => path.join(h, "feeds", `${safe(ws)}.json`),
  hotDir: (h: string) => path.join(h, "hot"),
  hot: (h: string, lid: string) => path.join(h, "hot", `${safe(lid)}.json`),
  injectedDir: (h: string) => path.join(h, "injected"),
  injected: (h: string, lid: string) => path.join(h, "injected", `${safe(lid)}.json`),
  latchDir: (h: string) => path.join(h, "latch"),
  latch: (h: string, lid: string) => path.join(h, "latch", `${safe(lid)}.json`),
  /** Goal holds on a session (REQ-002), a latch independent of the stop latch. */
  hold: (h: string, lid: string) => path.join(h, "latch", `${safe(lid)}.hold.json`),
  spool: (h: string) => path.join(h, "spool"),
  activityDir: (h: string) => path.join(h, "activity"),
  activity: (h: string, lid: string) => path.join(h, "activity", `${safe(lid)}.jsonl`),
  /** Present once the session's PostToolUse hook ran: its edits then count only when that hook confirms them. */
  activityConfirmed: (h: string, lid: string) => path.join(h, "activity", `${safe(lid)}.confirmed`),
  /** A session a folder rule shared at its start, until the sync pass makes its share: its hooks record and hold as
   *  shared from its first tool call (E2E acycle2 A2-local-7). */
  activityStarting: (h: string, lid: string) => path.join(h, "activity", `${safe(lid)}.starting`),
  /** How far the sync pass has uploaded the session's activity (a logical byte offset), so the hook trims only that. */
  activityUploaded: (h: string, lid: string) => path.join(h, "activity", `${safe(lid)}.uploaded`),
  /** A session that is not shared: which repos it was active in and when, as keyed hashes (never paths, never content,
   *  never uploaded), so the git pass credits no one with its changes (A3-local-2). */
  privateMarks: (h: string) => path.join(h, "private"),
  privateMark: (h: string, lid: string) => path.join(h, "private", `${safe(lid)}.json`),
  /** Team activity fetched from the server for one workspace (other machines' sessions). */
  podFeed: (h: string, ws: string) => path.join(h, "feeds", `activity-${safe(ws)}.json`),
  /** Asks of this person's teams and their own, for one workspace (`align asks`, `align team`, the envelope). */
  asksFeed: (h: string, ws: string) => path.join(h, "feeds", `asks-${safe(ws)}.json`),
  driftDir: (h: string) => path.join(h, "drift"),
  /** A local drift notice waiting for the session's next prompt. */
  drift: (h: string, lid: string) => path.join(h, "drift", `${safe(lid)}.json`),
  /** Steering lines shown, one file each, until the sync pass reports them. */
  steeringDir: (h: string) => path.join(h, "steering"),
  /** This machine's agent time outside shared sessions, last 7 days (computed by sync, read by hooks; never uploaded). */
  unsharedDigest: (h: string) => path.join(h, "unshared-digest.json"),
  /** The week (Monday, UTC) the unshared-work note was last shown. */
  unsharedShown: (h: string) => path.join(h, "unshared-shown.json"),
};

function safe(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

let spoolSeq = 0;
/** Append one record to the spool. Each record is its own file, renamed into place atomically. */
export function spoolWrite(alignHome: string, record: SpoolRecord): void {
  const name = `${Date.now().toString().padStart(14, "0")}-${process.pid}-${(spoolSeq++).toString().padStart(4, "0")}-${crypto
    .randomBytes(3)
    .toString("hex")}.json`;
  writeJsonAtomic(path.join(layout.spool(alignHome), name), record);
}

export function listSpool(alignHome: string): string[] {
  try {
    return fs
      .readdirSync(layout.spool(alignHome))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => path.join(layout.spool(alignHome), f));
  } catch {
    return [];
  }
}
