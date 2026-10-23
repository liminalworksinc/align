// Hot files are a projection of the database, rewritten whole after every change, so the CLI, the sync job and the hooks can all
// update state without racing on the files. Hooks read only these files.
import type { Ctx } from "./context.ts";
import { getSession } from "./ledger.ts";
import { layout } from "./shared/layout.ts";
import { removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import type { GoalSnapshot, HotState, Latch, ShareState } from "./shared/types.ts";

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

export function snapshot(goal: { id: string; version: number; title: string; measures: unknown; status: string } | null | undefined): GoalSnapshot | null {
  if (!goal) return null;
  return {
    id: goal.id,
    version: goal.version,
    title: goal.title,
    measures: Array.isArray(goal.measures) ? (goal.measures as GoalSnapshot["measures"]) : [],
    status: goal.status as GoalSnapshot["status"],
  };
}

const CONTEXT_KINDS = new Set(["goal_version", "binding_changed", "binding_suspended"]);

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
    updated_at: new Date().toISOString(),
  };
  writeJsonAtomic(layout.hot(ctx.home, lid), hot);
  const latch = ctx.db.prepare("SELECT * FROM latches WHERE local_id=?").get(lid) as { stopped: number; directive_id: string; seq: number; at: string } | undefined;
  if (latch && latch.stopped) {
    const l: Latch = { v: 1, stopped: true, directive_id: latch.directive_id, seq: latch.seq, at: latch.at };
    writeJsonAtomic(layout.latch(ctx.home, lid), l);
  } else {
    removeFile(layout.latch(ctx.home, lid));
  }
  return hot;
}

export function addNotice(ctx: Ctx, lid: string, id: string, text: string): void {
  ctx.db.prepare("INSERT OR IGNORE INTO notices(id, local_id, text, created_at) VALUES(?,?,?,?)").run(id, lid, text, new Date().toISOString());
}
