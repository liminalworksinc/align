// Sharing, binding and history operations. Every server effect goes through the per-session outbox so it survives
// being offline; callers may flush the outbox right away.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Ctx } from "./context.ts";
import { nowIso, tx } from "./db.ts";
import { repoKey, sessionKey } from "./keys.ts";
import { getSession, type SessionRow } from "./ledger.ts";
import { addNotice, getShare, renderHot, snapshot } from "./hot.ts";
import { gitInfo } from "./shared/anchors.ts";
import { randomId } from "./shared/fsx.ts";
import type { Goal } from "./shared/types.ts";

export function enqueue(ctx: Ctx, lid: string, kind: string, payload: unknown): void {
  ctx.db.prepare("INSERT INTO outbox(local_id, kind, payload, created_at) VALUES(?,?,?,?)").run(lid, kind, JSON.stringify(payload), nowIso());
}

export function repoRoot(cwd: string | null): string | null {
  if (!cwd) return null;
  try {
    const top = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 2000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (top) return fs.realpathSync(top);
  } catch {
    /* not a repo or git missing */
  }
  const info = gitInfo(cwd);
  try {
    return fs.realpathSync(info ? info.toplevel : cwd);
  } catch {
    return info ? info.toplevel : cwd;
  }
}

export interface SharePlan {
  session: SessionRow;
  workspace: { id: string; name: string };
  goal: Goal | null;
  alias: string | null;
  from: "start" | "now";
  starts_at: string;
  session_key: string;
  repo_key: string;
  put_body: { harness: string; repo_key: string; repo_alias: string | null; started_at: string; title: null };
  epoch_body: { epoch_id: string; goal_id: string | null; starts_at: string; root_turn: null; cause: "manual" };
  rows_now: number;
  unfinalized_now: number;
}

export function planShare(ctx: Ctx, lid: string, workspace: { id: string; name: string }, goal: Goal | null, alias: string | null, from: "start" | "now"): SharePlan {
  const s = getSession(ctx.db, lid);
  if (!s) throw new Error("unknown session");
  const root = repoRoot(s.cwd) || s.cwd || "(unknown)";
  const now = nowIso();
  const started = s.started_at || now;
  const starts_at = from === "start" ? started : now;
  const skey = sessionKey(ctx.secret, workspace.id, s.harness, s.native_id);
  const rkey = repoKey(ctx.secret, workspace.id, root);
  const savedAlias = alias ?? ((ctx.db.prepare("SELECT alias FROM repo_aliases WHERE workspace_id=? AND repo_root=?").get(workspace.id, root) as { alias: string } | undefined)?.alias || null);
  const counts = ctx.db
    .prepare("SELECT SUM(CASE WHEN finalized=1 THEN 1 ELSE 0 END) AS fin, SUM(CASE WHEN finalized=0 THEN 1 ELSE 0 END) AS unf FROM requests WHERE local_id=? AND COALESCE(ts, created_at) >= ?")
    .get(lid, starts_at) as { fin: number | null; unf: number | null };
  return {
    session: s,
    workspace,
    goal,
    alias: savedAlias,
    from,
    starts_at,
    session_key: skey,
    repo_key: rkey,
    put_body: { harness: s.harness, repo_key: rkey, repo_alias: savedAlias, started_at: started, title: null },
    epoch_body: { epoch_id: randomId("ep_"), goal_id: goal ? goal.id : null, starts_at, root_turn: null, cause: "manual" },
    rows_now: counts.fin || 0,
    unfinalized_now: counts.unf || 0,
  };
}

export function renderPreview(p: SharePlan): string {
  const g = p.goal ? `${p.goal.title} (${p.goal.id}, v${p.goal.version})` : "none (usage counts as unallocated)";
  return [
    "Share preview. Nothing has been uploaded yet.",
    `  Workspace:  ${p.workspace.name} (${p.workspace.id})`,
    `  Goal:       ${g}`,
    `  Session:    ${p.session.harness} ${p.session.native_id.slice(0, 8)}, started ${p.session.started_at || "unknown"}`,
    `  Counting:   ${p.from === "start" ? "from session start" : "from now"} (${p.starts_at})`,
    "",
    "These fields will be sent:",
    `  session  harness=${p.put_body.harness} repo_key=${p.repo_key} (keyed hash, not the path)`,
    `           repo_alias=${p.put_body.repo_alias ?? "none"} started_at=${p.put_body.started_at} title=none`,
    `  epoch    epoch_id=${p.epoch_body.epoch_id} goal_id=${p.epoch_body.goal_id ?? "none"} starts_at=${p.starts_at} root_turn=none cause=manual`,
    `  usage    ${p.rows_now} finalized request rows now, more as the session continues. Each row: request_key (keyed hash),`,
    "           ts, epoch_id, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h,",
    "           cache_write_unsplit, basis, est_list_usd_micros (an estimate), price_table_version, source",
    "Never sent: prompts, responses, tool input or output, file paths, repo path, branch names, transcript text.",
    p.unfinalized_now ? `${p.unfinalized_now} unfinished request rows stay local until they finish.` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function applyShare(ctx: Ctx, p: SharePlan): void {
  const lid = p.session.local_id;
  tx(ctx.db, () => {
    const other = ctx.db.prepare("SELECT workspace_id, state FROM shares WHERE local_id=?").get(lid) as { workspace_id: string; state: string } | undefined;
    if (other && other.workspace_id !== p.workspace.id && (other.state === "shared" || other.state === "pending" || other.state === "suspended")) {
      throw new Error("this session is already shared with another workspace; stop sharing it there first");
    }
    const goalJson = p.goal ? JSON.stringify(snapshot(p.goal)) : null;
    ctx.db
      .prepare(
        `INSERT INTO shares(local_id, workspace_id, workspace_name, session_key, goal_id, state, alias, from_mode, created_at, goal_json, binding_epoch, binding_goal)
         VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?)
         ON CONFLICT(local_id) DO UPDATE SET workspace_id=excluded.workspace_id, workspace_name=excluded.workspace_name, session_key=excluded.session_key,
           goal_id=excluded.goal_id, state='pending', alias=excluded.alias, from_mode=excluded.from_mode, goal_json=excluded.goal_json,
           binding_epoch=excluded.binding_epoch, binding_goal=excluded.binding_goal, stopped_at=NULL, suspended_at=NULL, error=NULL`,
      )
      .run(lid, p.workspace.id, p.workspace.name, p.session_key, p.goal?.id ?? null, p.alias, p.from, nowIso(), goalJson, p.epoch_body.epoch_id, p.goal?.id ?? null);
    if (p.alias) {
      const root = repoRoot(p.session.cwd) || p.session.cwd || "(unknown)";
      ctx.db.prepare("INSERT INTO repo_aliases(workspace_id, repo_root, alias) VALUES(?,?,?) ON CONFLICT DO UPDATE SET alias=excluded.alias").run(p.workspace.id, root, p.alias);
    }
    ctx.db
      .prepare("INSERT INTO epochs(epoch_id, local_id, workspace_id, goal_id, starts_at, root_turn, cause, created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(p.epoch_body.epoch_id, lid, p.workspace.id, p.epoch_body.goal_id, p.starts_at, null, "manual", nowIso());
    ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
    enqueue(ctx, lid, "put_session", { ws: p.workspace.id, session_key: p.session_key, body: p.put_body });
    enqueue(ctx, lid, "post_epoch", { ws: p.workspace.id, session_key: p.session_key, body: p.epoch_body });
  });
  renderHot(ctx, lid);
}

/** Bind takes effect at the next root turn: the UserPromptSubmit hook opens the epoch. */
export function bind(ctx: Ctx, lid: string, goal: Goal | null, cause = "manual", directiveId: string | null = null, id = randomId("pb_")): void {
  const share = getShare(ctx, lid);
  if (!share || (share.state !== "shared" && share.state !== "suspended" && share.state !== "pending")) throw new Error("session is not shared; share it first");
  ctx.db
    .prepare(
      `INSERT INTO pending_bindings(local_id, id, goal_id, goal_json, cause, directive_id, created_at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(local_id) DO UPDATE SET id=excluded.id, goal_id=excluded.goal_id, goal_json=excluded.goal_json, cause=excluded.cause, directive_id=excluded.directive_id, created_at=excluded.created_at`,
    )
    .run(lid, id, goal?.id ?? null, goal ? JSON.stringify(snapshot(goal)) : null, cause, directiveId, nowIso());
  renderHot(ctx, lid);
}

export function stopSharing(ctx: Ctx, lid: string): void {
  const share = getShare(ctx, lid);
  if (!share) throw new Error("session is not shared");
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=? WHERE local_id=?").run(nowIso(), lid);
    ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM latches WHERE local_id=?").run(lid);
    enqueue(ctx, lid, "stop_sharing", { ws: share.workspace_id, session_key: share.session_key });
  });
  renderHot(ctx, lid);
}

export function deleteHistory(ctx: Ctx, lid: string): void {
  const share = getShare(ctx, lid);
  if (!share) throw new Error("session was never shared");
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=COALESCE(stopped_at, ?) WHERE local_id=?").run(nowIso(), lid);
    ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM latches WHERE local_id=?").run(lid);
    enqueue(ctx, lid, "delete_session", { ws: share.workspace_id, session_key: share.session_key });
  });
  renderHot(ctx, lid);
}

/** Local cleanup after the server confirmed a hard delete: local metering stays, server links go. */
export function forgetShare(ctx: Ctx, lid: string): void {
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE requests SET uploaded=0, epoch_id=NULL WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM epochs WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM shares WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM notices WHERE local_id=?").run(lid);
  });
  renderHot(ctx, lid);
}

export function notify(ctx: Ctx, lid: string, id: string, text: string): void {
  addNotice(ctx, lid, id, text);
  renderHot(ctx, lid);
}
