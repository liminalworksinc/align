// Hot files are a projection of the database, rewritten whole after every change, so the CLI, the sync job and the hooks can all
// update state without racing on the files. Hooks read only these files.
import type { Ctx } from "./context.ts";
import { kvGet } from "./db.ts";
import { getSession } from "./ledger.ts";
import { layout } from "./shared/layout.ts";
import { removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import { contextGoals, snapshot } from "./shared/goaltree.ts";
import type { EndedWhy, GoalSnapshot, HoldLatch, HotRequest, HotState, Latch, RequestState, ShareState } from "./shared/types.ts";

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
  const rows = ctx.db.prepare("SELECT json, directive_id FROM holds WHERE local_id=? AND held=0 ORDER BY seq DESC LIMIT 10").all(lid) as { json: string; directive_id: string }[];
  return rows
    .map((r) => ({ ...(JSON.parse(r.json) as { goal_title: string; by: string; released?: boolean }), directive_id: r.directive_id }))
    .filter((r) => r.released)
    .map((r) => ({ directive_id: r.directive_id, goal_title: r.goal_title, by: r.by }));
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
  const notices = ctx.db.prepare("SELECT id, text FROM notices WHERE local_id=? ORDER BY created_at").all(lid) as { id: string; text: string }[];
  const pendingDirs = (
    ctx.db
      .prepare("SELECT d.id AS id, d.kind AS kind FROM directive_sessions ds JOIN directives d ON d.id=ds.directive_id WHERE ds.local_id=? AND ds.state='received' ORDER BY d.seq")
      .all(lid) as { id: string; kind: string }[]
  )
    .filter((r) => CONTEXT_KINDS.has(r.kind))
    .map((r) => r.id);
  const live = share && share.state !== "error" ? share : null;
  const hot: HotState = {
    v: 1,
    local_id: lid,
    harness: s.harness,
    native_session_id: s.native_id,
    cwd: s.cwd,
    share: live ? { workspace_id: live.workspace_id, workspace_name: live.workspace_name, session_key: live.session_key, state: live.state as ShareState } : null,
    goal: live && live.goal_json ? (JSON.parse(live.goal_json) as GoalSnapshot) : null,
    binding: live && live.binding_epoch ? { epoch_id: live.binding_epoch, goal_id: live.binding_goal } : null,
    pending_binding:
      live && pending
        ? { id: pending.id, goal_id: pending.goal_id, goal: pending.goal_json ? JSON.parse(pending.goal_json) : null, cause: pending.cause, directive_id: pending.directive_id }
        : null,
    pending_directives: live ? pendingDirs : [],
    notices,
    context_goals: live && live.goal_json ? contextGoals(ctx.home, live.workspace_id, (JSON.parse(live.goal_json) as GoalSnapshot).id) : [],
    requests: live ? hotRequests(ctx, lid) : [],
    released_holds: live ? releasedHolds(ctx, lid) : [],
    resumed: resumedBy(ctx, lid),
    epochs_seen: (ctx.db.prepare("SELECT epoch_id FROM epochs WHERE local_id=? ORDER BY rowid DESC LIMIT 10").all(lid) as { epoch_id: string }[]).map((e) => e.epoch_id),
    updated_at: new Date().toISOString(),
  };
  writeJsonAtomic(layout.hot(ctx.home, lid), hot);
  // A latch whose share has ended (this machine signed out, or the server no longer has the share) can't be lifted from
  // the web any more: the latch says so, so the deny tells the user how to get out (`align stop-sharing`).
  const ended = endedReason(share);
  const latch = ctx.db.prepare("SELECT * FROM latches WHERE local_id=?").get(lid) as { stopped: number; directive_id: string; seq: number; at: string } | undefined;
  if (latch && latch.stopped) {
    const l: Latch = { v: 1, stopped: true, directive_id: latch.directive_id, seq: latch.seq, at: latch.at, ...(ended ? { ended } : {}) };
    writeJsonAtomic(layout.latch(ctx.home, lid), l);
  } else {
    removeFile(layout.latch(ctx.home, lid));
  }
  // Goal holds: a latch of their own, so a stop and a hold are set and lifted independently.
  const holds = ctx.db.prepare("SELECT goal_id, json, directive_id, seq, at FROM holds WHERE local_id=? AND held=1 ORDER BY seq").all(lid) as {
    goal_id: string;
    json: string;
    directive_id: string;
    seq: number;
    at: string;
  }[];
  if (holds.length) {
    const h: HoldLatch = {
      v: 1,
      ...(ended ? { ended } : {}),
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

/** Why a share can no longer receive directives (a resume or a release), or null while it can. */
export function endedReason(share: ShareRow | null): EndedWhy | null {
  if (!share || (share.state !== "stopped" && share.state !== "error")) return null;
  return share.error === DEVICE_SIGNED_OUT ? "device_signed_out" : share.error === ACCESS_LOST ? "access_lost" : "sharing_ended";
}

/** `shares.error` of a share ended because this machine signed out of Align (logout, or the device was revoked). */
export const DEVICE_SIGNED_OUT = "device_signed_out";
/** `shares.error` of a share ended because this device can no longer reach its workspace (its person was removed from
 *  it or left, or a new pairing did not include it). */
export const ACCESS_LOST = "workspace_access_lost";

/** A user notice for one session, once per `id` and session: one directive that reaches several sessions (a release,
 *  a suspension) leaves each its own notice, so the stored id is scoped to the session. */
export function addNotice(ctx: Ctx, lid: string, id: string, text: string): void {
  ctx.db.prepare("INSERT OR IGNORE INTO notices(id, local_id, text, created_at) VALUES(?,?,?,?)").run(`${lid}/${id}`, lid, text, new Date().toISOString());
}
