// Hot files are a projection of the database, rewritten whole after every change, so the CLI, the sync job and the hooks can all
// update state without racing on the files. Hooks read only these files.
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { loadCredentials, signedIn } from "./api.ts";
import { kvGet, kvSet, nowIso } from "./db.ts";
import { getSession } from "./ledger.ts";
import { layout } from "./shared/layout.ts";
import { removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import { contextGoals, snapshot } from "./shared/goaltree.ts";
import { clean } from "./shared/envelope.ts";
import { readJson } from "./shared/fsx.ts";
import { storedText, type ReleaseReaches, type ShareFacts, type ShareNow } from "./shared/ended.ts";
import { isShareStateNotice, noticeKind } from "./shared/notices.ts";
import { NEWEST_BUILD, selfBuild, WRITER_GEN, type BuildMark } from "./build.ts";
import type { EndedWhy, GoalSnapshot, HoldLatch, HotRequest, HotState, Latch, MeFile, RequestState, ShareState } from "./shared/types.ts";

export { snapshot };

export interface ShareRow {
  local_id: string;
  workspace_id: string;
  workspace_name: string;
  session_key: string;
  goal_id: string | null;
  state: ShareState | "error";
  alias: string | null;
  from_mode: string;
  suspended_at: string | null;
  stopped_at: string | null;
  created_at: string;
  accepted: number;
  duplicates: number;
  conflicts: number;
  goal_json: string | null;
  binding_epoch: string | null;
  binding_goal: string | null;
  error: string | null;
}

export function getShare(ctx: Ctx, lid: string): ShareRow | null {
  return (ctx.db.prepare("SELECT * FROM shares WHERE local_id=?").get(lid) as unknown as ShareRow) || null;
}

// ---------- shared before ----------
/**
 * The local record that a session was shared from this machine before, kept apart from its share and its epochs (both go
 * when its shared history is deleted, on the web or with `align delete-history`), and whether its person stopped that
 * share (`align stop-sharing`, `::align unshare`, Stop sharing on the web) or deleted its history. So a later share
 * counts from now, never from the session's start, and only an explicit share (`align share <session>`, `::align share`
 * in it) shares a stopped one again (C6-1).
 */
interface PriorShare {
  at: string;
  stopped_at: string | null;
}

const priorKey = (lid: string) => `shared_before:${lid}`;

function priorShare(ctx: Ctx, lid: string): PriorShare | null {
  const v = kvGet(ctx.db, priorKey(lid));
  if (!v) return null;
  try {
    return JSON.parse(v) as PriorShare;
  } catch {
    return { at: v, stopped_at: null };
  }
}

/** Record that `lid` is shared now (`stopped` false) or that its person stopped it (`stopped` true). */
export function notePriorShare(ctx: Ctx, lid: string, stopped: boolean, at = nowIso()): void {
  const prev = priorShare(ctx, lid);
  kvSet(ctx.db, priorKey(lid), JSON.stringify({ at: prev?.at ?? at, stopped_at: stopped ? (prev?.stopped_at ?? at) : null } satisfies PriorShare));
}

/** Was `lid` ever shared from this machine (a share, an epoch, the record, or history it deleted)? */
export function sharedBefore(ctx: Ctx, lid: string): boolean {
  return !!(
    priorShare(ctx, lid) ||
    kvGet(ctx.db, `history_deleted:${lid}`) ||
    ctx.db.prepare("SELECT 1 FROM shares WHERE local_id=?").get(lid) ||
    ctx.db.prepare("SELECT 1 FROM epochs WHERE local_id=?").get(lid)
  );
}

/** Did its person stop sharing `lid`, or delete its shared history, with no explicit share since? */
export function stoppedByPerson(ctx: Ctx, lid: string): boolean {
  if (priorShare(ctx, lid)?.stopped_at) return true;
  const share = getShare(ctx, lid);
  return !share && !!kvGet(ctx.db, `history_deleted:${lid}`);
}

const CONTEXT_KINDS = new Set(["goal_version", "binding_changed", "binding_suspended"]);

/** Answered and withdrawn requests stay in the hot file this long, so the hooks can still tell the session. */
const REQUEST_KEEP_MS = 14 * 86_400_000;

function hotRequests(ctx: Ctx, lid: string): HotRequest[] {
  const since = new Date(Date.now() - REQUEST_KEEP_MS).toISOString();
  const rows = ctx.db
    .prepare("SELECT json, state, answered_at, directive_id FROM goal_requests WHERE local_id=? AND (state='pending' OR created_at>=?) ORDER BY created_at DESC LIMIT 20")
    .all(lid, since) as { json: string; state: RequestState; answered_at: string | null; directive_id: string }[];
  return rows
    .reverse()
    .map((r) => ({ ...(JSON.parse(r.json) as Omit<HotRequest, "state" | "answered_at">), state: r.state, answered_at: r.answered_at, directive_id: r.directive_id }));
}

/** Holds a release lifted on this session (newest 10). */
function releasedHolds(ctx: Ctx, lid: string): NonNullable<HotState["released_holds"]> {
  const rows = ctx.db.prepare("SELECT goal_id, json, directive_id FROM holds WHERE local_id=? AND held=0 ORDER BY seq DESC LIMIT 10").all(lid) as { goal_id: string; json: string; directive_id: string }[];
  return rows
    .map((r) => ({ ...(JSON.parse(r.json) as { goal_title: string; by: string; released?: boolean }), directive_id: r.directive_id, goal_id: r.goal_id }))
    .filter((r) => r.released)
    .map((r) => ({ directive_id: r.directive_id, goal_id: r.goal_id, goal_title: r.goal_title, by: r.by }));
}

/** The releases still in force on this session, whatever its share's state: a later hold on the same goal withdraws a
 *  release, so its notice is not told while the goal is held again (E2E-AGENT cycle 14 C14-2). */
function releasesNow(ctx: Ctx, lid: string): string[] {
  return (ctx.db.prepare("SELECT directive_id FROM holds WHERE local_id=? AND held=0").all(lid) as { directive_id: string }[]).map((r) => r.directive_id);
}

/** The resume that lifted this session's stop, while no later stop replaced it. */
function resumedBy(ctx: Ctx, lid: string): string | null {
  const latch = ctx.db.prepare("SELECT stopped, directive_id FROM latches WHERE local_id=?").get(lid) as { stopped: number; directive_id: string } | undefined;
  const id = kvGet(ctx.db, `resumed:${lid}`);
  return latch && !latch.stopped && id && latch.directive_id === id ? id : null;
}

export function renderHot(ctx: Ctx, lid: string): HotState | null {
  const s = getSession(ctx.db, lid);
  if (!s) return null;
  const share = getShare(ctx, lid);
  const pending = ctx.db.prepare("SELECT * FROM pending_bindings WHERE local_id=?").get(lid) as
    | { id: string; goal_id: string | null; goal_json: string | null; cause: string; directive_id: string | null }
    | undefined;
  // Notices about the share's state go with what happened (`facts`): the hook words them from `share_now` (cycle 11).
  // One an older build stored (no facts, or facts of an older generation stored after this one first wrote here) is
  // only that its share's state changed: the hook tells it, worded from the state now, when the session's situation
  // differs from what it was last told (E2E-AGENT cycle 14 C14-1).
  const since = buildMark(ctx)?.since ?? null;
  const notices = (ctx.db.prepare("SELECT id, text, facts, created_at FROM notices WHERE local_id=? ORDER BY created_at, rowid").all(lid) as { id: string; text: string; facts: string | null; created_at: string }[]).map(
    (n) => {
      const f = n.facts ? (JSON.parse(n.facts) as ShareFacts) : null;
      if (isShareStateNotice(noticeKind(n.id)) && (!f || (olderGen(f) && !!since && n.created_at >= since))) return { id: n.id, text: n.text, facts: changedFacts(ctx, lid, f) };
      return { id: n.id, text: n.text, ...(f ? { facts: f } : {}) };
    },
  );
  const pendingDirs = (
    ctx.db
      .prepare("SELECT d.id AS id, d.kind AS kind FROM directive_sessions ds JOIN directives d ON d.id=ds.directive_id WHERE ds.local_id=? AND ds.state='received' ORDER BY d.seq")
      .all(lid) as { id: string; kind: string }[]
  )
    .filter((r) => CONTEXT_KINDS.has(r.kind))
    .map((r) => r.id);
  const live = share && share.state !== "error" ? share : null;
  const shareSince = kvGet(ctx.db, `share_since:${lid}`);
  // Why the share ended so nothing from the web can lift its latches, whether `::align share` shares it again now, and
  // whether a release still reaches its holds: one reading, for its latch files and its notices alike (C6-2, C10-4).
  const end = endedState(ctx, share);
  const release = end && !end.reshare ? releaseOf(ctx, lid, share) : null;
  const hot: HotState = {
    v: 1,
    local_id: lid,
    harness: s.harness,
    native_session_id: s.native_id,
    cwd: s.cwd,
    share: live
      ? {
          workspace_id: live.workspace_id,
          workspace_name: live.workspace_name,
          session_key: live.session_key,
          state: live.state as ShareState,
          ...(shareSince ? { since: shareSince } : {}),
          ...(live.state === "stopped" ? { ended: endedReason(live) ?? "sharing_ended" } : {}),
        }
      : null,
    goal: live && live.goal_json ? (JSON.parse(live.goal_json) as GoalSnapshot) : null,
    binding: live && live.binding_epoch ? { epoch_id: live.binding_epoch, goal_id: live.binding_goal } : null,
    pending_binding:
      live && pending
        ? { id: pending.id, goal_id: pending.goal_id, goal: pending.goal_json ? JSON.parse(pending.goal_json) : null, cause: pending.cause, directive_id: pending.directive_id }
        : null,
    pending_directives: live ? pendingDirs : [],
    notices,
    share_now: shareNow(ctx, lid, share, end, release),
    context_goals: live && live.goal_json ? contextGoals(ctx.home, live.workspace_id, (JSON.parse(live.goal_json) as GoalSnapshot).id) : [],
    requests: live ? hotRequests(ctx, lid) : [],
    released_holds: live ? releasedHolds(ctx, lid) : [],
    releases_now: releasesNow(ctx, lid),
    resumed: resumedBy(ctx, lid),
    prior_share: sharedBefore(ctx, lid) ? { stopped: stoppedByPerson(ctx, lid) } : null,
    epochs_seen: (ctx.db.prepare("SELECT epoch_id FROM epochs WHERE local_id=? ORDER BY rowid DESC LIMIT 10").all(lid) as { epoch_id: string }[]).map((e) => e.epoch_id),
    updated_at: new Date().toISOString(),
    by: { gen: WRITER_GEN, build: selfBuild().build },
  };
  // A newer build has written here: the sessions' files are its to write (cycle 14). Marked, so it rewrites them.
  if (ctx.superseded) {
    kvSet(ctx.db, `${OLDER_RENDER}${lid}`, nowIso());
    return hot;
  }
  writeJsonAtomic(layout.hot(ctx.home, lid), hot);
  // A latch whose share has ended (this machine signed out, or the server no longer has the share) can't be lifted from
  // the web any more: the latch says so, so the deny tells the user how to get out (`align stop-sharing`). When the
  // session can be shared there again now (signed in again, its workspace in reach again), the latch says that instead,
  // so the deny gives the same advice as the session's notice: `::align share` (C6-2).
  const latch = ctx.db.prepare("SELECT * FROM latches WHERE local_id=?").get(lid) as { stopped: number; directive_id: string; seq: number; at: string } | undefined;
  // Goal holds: a latch of their own, so a stop and a hold are set and lifted independently.
  const holds = ctx.db.prepare("SELECT goal_id, json, directive_id, seq, at FROM holds WHERE local_id=? AND held=1 ORDER BY seq").all(lid) as {
    goal_id: string;
    json: string;
    directive_id: string;
    seq: number;
    at: string;
  }[];
  // A hold whose release still reaches the session though its share ended: both latch files say so, so every deny and
  // notice names the release as a way out of the hold, and none says it lifts the stop (C10-4).
  // While the ended shares are unread since this sign-in, `align sync` comes first (`unread`); signed out, a new
  // `align login` may offer `::align share` (`login`): the deny says so as the status views do (cycle 12, section 6).
  const unread = !!end?.reshare && hot.share_now?.unread === true;
  // Ended by a new `align login` that replaced this machine's pairing, while signed in: the deny says so, never that this
  // machine signed out (E2E-AGENT cycle 13, section 5).
  const relogin = end?.why === "device_signed_out" && hot.share_now?.signed_in === true && endedByLogin(ctx, lid);
  const ended = end
    ? {
        ended: end.why,
        ...(end.reshare ? { reshare: true as const } : {}),
        ...(relogin ? { relogin: true as const } : {}),
        ...(unread ? { unread: true as const } : {}),
        ...(end.login ? { login: true as const } : {}),
        ...(release ? { release } : {}),
      }
    : {};
  if (latch && latch.stopped) {
    const l: Latch = { v: 1, stopped: true, directive_id: latch.directive_id, seq: latch.seq, at: latch.at, ...ended };
    writeJsonAtomic(layout.latch(ctx.home, lid), l);
  } else {
    removeFile(layout.latch(ctx.home, lid));
  }
  if (holds.length) {
    const h: HoldLatch = {
      v: 1,
      ...ended,
      holds: holds.map((r) => {
        const j = JSON.parse(r.json) as { goal_title: string; by: string; reason: string | null };
        return { goal_id: r.goal_id, goal_title: j.goal_title, by: j.by, reason: j.reason, directive_id: r.directive_id, seq: r.seq, at: r.at };
      }),
    };
    writeJsonAtomic(layout.hold(ctx.home, lid), h);
  } else {
    removeFile(layout.hold(ctx.home, lid));
  }
  return hot;
}

/** The newest notice about a sign-out that ended the share of `lid` says a new `align login` ended it (cycle 12), and
 *  this machine has not signed out since (`out_since`, cycle 13). */
export function endedByLogin(ctx: Ctx, lid: string): boolean {
  const r = ctx.db.prepare("SELECT facts FROM notices WHERE local_id=? AND id LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(lid, `${lid}/signed_out_%`) as { facts: string | null } | undefined;
  try {
    const f = r?.facts ? (JSON.parse(r.facts) as ShareFacts) : null;
    return f?.via === "login" && !f.out_since;
  } catch {
    return false;
  }
}

/**
 * The share of `lid` that a sign-out (or a lost workspace) ended had not reached the server yet (it was still pending):
 * it was never shared, so no view says it ended or is shared "again" (E2E-AGENT cycle 14 C14-4). From the newest notice
 * about that end, as `endedByLogin` reads the new sign-in.
 */
export function endedUnsent(ctx: Ctx, lid: string, share = getShare(ctx, lid)): boolean {
  const kind = share?.error === DEVICE_SIGNED_OUT ? "signed_out_" : share?.error === ACCESS_LOST ? "access_lost_" : null;
  if (!kind || share?.state !== "stopped") return false;
  const r = ctx.db.prepare("SELECT facts FROM notices WHERE local_id=? AND id LIKE ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(lid, `${lid}/${kind}%`) as { facts: string | null } | undefined;
  try {
    return !!(r?.facts && (JSON.parse(r.facts) as ShareFacts).unsent);
  } catch {
    return false;
  }
}

/** Stopped (a stop latch) or held (a goal hold) from the web: what a notice about its ended share ends with. */
export function latchedFromWeb(ctx: Ctx, lid: string): boolean {
  return !!(ctx.db.prepare("SELECT 1 FROM latches WHERE local_id=? AND stopped=1").get(lid) || ctx.db.prepare("SELECT 1 FROM holds WHERE local_id=? AND held=1").get(lid));
}

/**
 * The share's state now, as its latch files have it (`end`, `release`: the same reading), plus what a notice about it
 * needs besides: this machine's sign-in, whether the cached `/me` reaches the share's workspace, and whether the ended
 * shares were read since this sign-in. The hook words the session's notices about its share from it (cycle 11).
 */
export function shareNow(
  ctx: Ctx,
  lid: string,
  share = getShare(ctx, lid),
  end = endedState(ctx, share),
  release = end && !end.reshare ? releaseOf(ctx, lid, share) : null,
): ShareNow {
  const signed = signedIn(ctx.home);
  const me = readJson<MeFile>(layout.me(ctx.home));
  const member = !share || !notMember(me, share.workspace_id);
  return {
    live: !!share && (share.state === "shared" || share.state === "pending" || share.state === "suspended"),
    ended: end?.why ?? null,
    signed_in: signed,
    reaches: !!share && !!me && me.workspaces.some((w) => w.id === share.workspace_id),
    reshare: !!end?.reshare,
    unread: signed && !!kvGet(ctx.db, ENDED_UNREAD),
    login: !!end?.login,
    latched: latchedFromWeb(ctx, lid),
    release,
    ...(member ? {} : { member: false as const }),
  };
}

/** Its person is no longer a member of workspace `ws` (removed, or they left): the cached `/me` lists it neither as this
 *  device's nor among the person's other workspaces. False when that is not known (an older server sends no
 *  `other_workspaces`). E2E-AGENT cycle 13, section 5. */
export function notMember(me: MeFile | null, ws: string): boolean {
  return !!me && Array.isArray(me.other_workspaces) && ![...me.workspaces, ...me.other_workspaces].some((w) => w.id === ws);
}

/** Why a share can no longer receive directives (a resume or a release), or null while it can. */
export function endedReason(share: ShareRow | null): EndedWhy | null {
  if (!share || (share.state !== "stopped" && share.state !== "error")) return null;
  return share.error === DEVICE_SIGNED_OUT ? "device_signed_out" : share.error === ACCESS_LOST ? "access_lost" : "sharing_ended";
}

/**
 * Why a share ended so nothing from the web can lift its latches, and whether this machine can share it there again now
 * (`reshare`): for a share that ended because this machine signed out or lost the workspace, once it is signed in and
 * reaches that workspace again (`::align share` shares it again, and then the web can resume or release it). Null while
 * the share lasts. Read afresh from the credentials and `me.json` each time, so the latch, `align latch status` and the
 * notices all say what is true now (C6-2). `login`: signed out, and a new sign-in would offer it `::align share` (it
 * ended at a sign-out, or at a lost workspace the cached `/me` reaches again), as its sign-out notice says (cycle 12).
 */
export function endedState(ctx: Ctx, share: ShareRow | null): { why: EndedWhy; reshare: boolean; login: boolean } | null {
  const why = endedReason(share);
  if (!why || !share) return null;
  const me = readJson<MeFile>(layout.me(ctx.home));
  const reaches = !!me && me.workspaces.some((w) => w.id === share.workspace_id);
  if (why === "sharing_ended") return { why, reshare: false, login: false };
  if (!signedIn(ctx.home)) return { why, reshare: false, login: why === "device_signed_out" || reaches };
  return { why, reshare: !!me && !me.signed_out && reaches, login: false };
}

/** kv: set when a new pairing commits, cleared once the directives answer's `ended_sessions` were read as that pairing
 *  (`align login`, or the next pass): until then no session is told this machine is signed in again, nor shown a
 *  sign-out notice that says to type `::align share` after signing in (cycle 10, section 5). */
export const ENDED_UNREAD = "ended_sessions_unread";

/** kv: the device this machine was signed in as when a live share of `lid` stopped (`markStopped`): the server's session
 *  row still names it, so the goal holds' releases still reach the session there (C10-4). */
export const stoppedOnDeviceKey = (lid: string) => `stopped_on_device:${lid}`;

/**
 * A goal's release still reaches this ended share: its sharing was stopped (Stop sharing on the web, or the server
 * refused its usage as stopped) while it was live on this machine's current device, which reaches its workspace. The
 * server sends a release to every session its hold reached, and lists directives for the device its session row names;
 * a share ended at a sign-out or a lost workspace, or stopped under an earlier pairing, hears none (C10-4).
 */
export function releaseReaches(ctx: Ctx, share: ShareRow | null): boolean {
  if (!share || share.state !== "stopped" || endedReason(share) !== "sharing_ended") return false;
  const dev = kvGet(ctx.db, stoppedOnDeviceKey(share.local_id));
  const c = loadCredentials(ctx.home);
  if (!dev || !c || c.signed_out || c.device_id !== dev) return false;
  const me = readJson<MeFile>(layout.me(ctx.home));
  return !!me && !me.signed_out && me.workspaces.some((w) => w.id === share.workspace_id);
}

/** The holds whose release still reaches `lid` though its share ended, by goal title, and whether a stop blocks it too
 *  (C10-4); null when none does. What its latch files, its notices and the status views all say. */
export function releaseOf(ctx: Ctx, lid: string, share: ShareRow | null): ReleaseReaches | null {
  if (!releaseReaches(ctx, share)) return null;
  const goals = (ctx.db.prepare("SELECT json FROM holds WHERE local_id=? AND held=1 ORDER BY seq").all(lid) as { json: string }[]).map((r) =>
    clean((JSON.parse(r.json) as { goal_title: string }).goal_title, 100),
  );
  if (!goals.length) return null;
  return { goals, stopped: !!ctx.db.prepare("SELECT 1 FROM latches WHERE local_id=? AND stopped=1").get(lid) };
}

/** Rewrite the hot and latch files of every session whose share ended, after this machine's sign-in or reach changed
 *  (a new `/me`, a sign-out, a sign-in, the ended shares read), so their denies (C6-2) and the notices worded from the
 *  same state (cycle 11) follow. */
export function renderEndedShares(ctx: Ctx): void {
  const rows = ctx.db.prepare("SELECT local_id FROM shares WHERE state IN ('stopped','error')").all() as { local_id: string }[];
  for (const r of rows) renderHot(ctx, r.local_id);
}

/** `shares.error` of a share ended because this machine signed out of Align (logout, or the device was revoked). */
export const DEVICE_SIGNED_OUT = "device_signed_out";
/** `shares.error` of a share ended because this device can no longer reach its workspace (its person was removed from
 *  it or left, or a new pairing did not include it). */
export const ACCESS_LOST = "workspace_access_lost";

/** A user notice for one session, once per `id` and session: one directive that reaches several sessions (a release,
 *  a suspension) leaves each its own notice, so the stored id is scoped to the session. */
export function addNotice(ctx: Ctx, lid: string, id: string, text: string, facts: ShareFacts | null = null): void {
  // A newer build has written here: a notice about a share's state is left for it to store, worded its way (cycle 14).
  if (ctx.superseded && (facts || isShareStateNotice(id))) {
    kvSet(ctx.db, `${OLDER_NOTICE}${lid}/${id}`, JSON.stringify(facts));
    return;
  }
  ctx.db
    .prepare("INSERT OR IGNORE INTO notices(id, local_id, text, created_at, facts) VALUES(?,?,?,?,?)")
    .run(`${lid}/${id}`, lid, text, new Date().toISOString(), facts ? JSON.stringify(facts) : null);
}

/** A notice about what happened to the share of `lid` (`facts`), worded when it is shown, from the state then (cycle
 *  11); its stored text, which only an older hook shows, is true whenever it is shown (`storedText`, C12-1). */
export function addShareNotice(ctx: Ctx, lid: string, id: string, facts: ShareFacts): void {
  const f = { ...facts, g: WRITER_GEN };
  addNotice(ctx, lid, id, storedText(f), f);
}

// ---------- another build writing to the same ALIGN_HOME (E2E-AGENT cycle 14) ----------

/** kv prefix: a session whose hot and latch files a build that saw a newer one's mark did not write. */
export const OLDER_RENDER = "older_render:";
/** kv prefix (`<lid>/<notice id>`): a notice about a share's state such a build left for the newest one to store. */
export const OLDER_NOTICE = "older_notice:";
/** kv: when a pass last looked for hot files another build wrote. */
const OLDER_SCAN_AT = "older_scan_at";

/** The newest build that has written to this database (`markBuild`), or null before any did. */
export function buildMark(ctx: Ctx): BuildMark | null {
  try {
    const m = JSON.parse(kvGet(ctx.db, NEWEST_BUILD) || "null") as BuildMark | null;
    return m && typeof m.gen === "number" ? m : null;
  } catch {
    return null;
  }
}

/**
 * Record this build as the newest that has written here, unless a newer one did: then return that one's mark, and this
 * build leaves the sessions' notices about their share, hot files and latch files to it (`ctx.superseded`).
 */
export function markBuild(ctx: Ctx): BuildMark | null {
  const mine = selfBuild();
  const cur = buildMark(ctx);
  if (cur && cur.gen > mine.gen) return cur;
  if (!cur || cur.gen < mine.gen) kvSet(ctx.db, NEWEST_BUILD, JSON.stringify({ ...mine, since: nowIso() } satisfies BuildMark));
  return null;
}

/** A notice's facts stored by a build of an older generation (one from before builds were recorded has none). */
const olderGen = (f: ShareFacts): boolean => (f.g ?? 0) < WRITER_GEN;

/**
 * What an older build's notice about the share of `lid` still says: only that its state changed, with its workspace and
 * goal, and how its end came as every view reads it (a replacing `align login`, a share that never reached the server),
 * so the hook words it from the state now and never contradicts the deny (C14-1, C14-4).
 */
function changedFacts(ctx: Ctx, lid: string, own: ShareFacts | null): ShareFacts {
  const s = getShare(ctx, lid);
  const g = s?.goal_json ? (JSON.parse(s.goal_json) as GoalSnapshot) : null;
  const login = own ? own.via === "login" && !own.out_since : endedByLogin(ctx, lid);
  const unsent = own ? !!own.unsent : endedUnsent(ctx, lid, s);
  return {
    e: "changed",
    ws: clean(s?.workspace_name ?? own?.ws ?? "its workspace", 80),
    goal: g ? clean(g.title, 100) : (own?.goal ?? null),
    ...(login ? { via: "login" as const } : {}),
    ...(unsent ? { unsent: true as const } : {}),
    g: WRITER_GEN,
  };
}

/**
 * The newest build catches up with what another build wrote here: it stores the notices a build that saw its mark left
 * (`OLDER_NOTICE`, as "changed"), and when anything shows another build wrote (those, a session it did not render, a hot
 * file not stamped with this generation), re-renders every session's hot and latch files, so each is told and denied
 * from the state now and an older build's rows read as "changed" (E2E-AGENT cycle 14 C14-1, C14-3). Run by every pass
 * (`full`: every hot file is looked at) and every command (only hot files changed since the last pass looked).
 * Returns how many sessions it re-rendered.
 */
export function catchUpOtherBuilds(ctx: Ctx, full = false): number {
  if (ctx.superseded) return 0;
  let other = false;
  const left = ctx.db.prepare("SELECT key, value FROM kv WHERE key LIKE ? ORDER BY key").all(`${OLDER_NOTICE}%`) as { key: string; value: string }[];
  for (const r of left) {
    const rest = r.key.slice(OLDER_NOTICE.length);
    const lid = rest.slice(0, rest.indexOf("/"));
    const id = rest.slice(rest.indexOf("/") + 1);
    let own: ShareFacts | null = null;
    try {
      own = JSON.parse(r.value) as ShareFacts | null;
    } catch {
      /* worded from the state alone */
    }
    if (lid && id && getSession(ctx.db, lid)) {
      const f = changedFacts(ctx, lid, own);
      ctx.db.prepare("INSERT OR IGNORE INTO notices(id, local_id, text, created_at, facts) VALUES(?,?,?,?,?)").run(`${lid}/${id}`, lid, storedText(f), nowIso(), JSON.stringify(f));
    }
    ctx.db.prepare("DELETE FROM kv WHERE key=?").run(r.key);
    other = true;
  }
  if (ctx.db.prepare("DELETE FROM kv WHERE key LIKE ?").run(`${OLDER_RENDER}%`).changes) other = true;
  const dir = layout.hotDir(ctx.home);
  const scanned = Number(kvGet(ctx.db, OLDER_SCAN_AT) || 0);
  const scanStart = Date.now();
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    /* no hot files yet */
  }
  for (const f of files) {
    if (other) break;
    const file = path.join(dir, f);
    try {
      if (!full && fs.statSync(file).mtimeMs < scanned - 5_000) continue;
    } catch {
      continue;
    }
    const h = readJson<HotState>(file);
    if (h && !(h.by && h.by.gen >= WRITER_GEN)) other = true;
  }
  if (full) kvSet(ctx.db, OLDER_SCAN_AT, String(scanStart));
  if (!other) return 0;
  const lids = new Set(files.map((f) => f.slice(0, -".json".length)));
  for (const r of ctx.db.prepare("SELECT local_id FROM shares").all() as { local_id: string }[]) lids.add(r.local_id);
  let n = 0;
  for (const lid of lids) if (renderHot(ctx, lid)) n++;
  ctx.log(`another Align build wrote to this machine's Align data: ${n} session(s) re-rendered from the state now`);
  return n;
}
