// Sharing, binding and history operations. Every server effect goes through the per-session outbox so it survives
// being offline; callers may flush the outbox right away.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { Ctx } from "./context.ts";
import { kvGet, kvSet, nowIso, tx } from "./db.ts";
import { repoKey, sessionKey } from "./keys.ts";
import path from "node:path";
import { endEpochs, getSession, sessionCwds, type SessionRow } from "./ledger.ts";
import { ACCESS_LOST, addNotice, DEVICE_SIGNED_OUT, endedState, getShare, notePriorShare, renderEndedLatches, renderHot, sharedBefore, snapshot } from "./hot.ts";

export { notePriorShare, sharedBefore, stoppedByPerson } from "./hot.ts";
import { loadCredentials, signedIn } from "./api.ts";
import { gitInfo } from "./shared/anchors.ts";
import { clean } from "./shared/envelope.ts";
import { randomId, readJson, removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";
import type { FeedFile, Goal, GoalSnapshot, MeFile } from "./shared/types.ts";
import type { PodFeed } from "./hooks/siblings.ts";

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

/** An epoch id as the server takes it. */
const EPOCH_ID = /^ep_[A-Za-z0-9_-]{22,64}$/;

/**
 * `epochId`: the share's first epoch when the caller chose it (a folder rule's share, whose hook told the model about it
 * by that id, cycle 7); a fresh one when it is not a well-formed id or this machine has used it already.
 */
export function planShare(ctx: Ctx, lid: string, workspace: { id: string; name: string }, goal: Goal | null, alias: string | null, from: "start" | "now", epochId?: string | null): SharePlan {
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
    epoch_body: { epoch_id: freshEpochId(ctx, epochId), goal_id: goal ? goal.id : null, starts_at, root_turn: null, cause: "manual" },
    rows_now: counts.fin || 0,
    unfinalized_now: counts.unf || 0,
  };
}

function freshEpochId(ctx: Ctx, wanted: string | null | undefined): string {
  if (wanted && EPOCH_ID.test(wanted) && !ctx.db.prepare("SELECT 1 FROM epochs WHERE epoch_id=?").get(wanted)) return wanted;
  return randomId("ep_");
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
    // Shared before: its earlier epochs end where that share ended (when it was stopped, or now for one that never
    // took), so usage from the time it was not shared never falls into them (C5-1).
    const ended = ctx.db.prepare("SELECT stopped_at FROM shares WHERE local_id=?").get(lid) as { stopped_at: string | null } | undefined;
    endEpochs(ctx.db, lid, ended?.stopped_at || nowIso());
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
    notePriorShare(ctx, lid, false);
    // Which share this is: a share made again after an earlier one ended is told to the model as bound (cycle 6).
    kvSet(ctx.db, `share_since:${lid}`, p.epoch_body.epoch_id);
    // Notices about an earlier share that ended (and how to share again) are stale once it is shared again: one the
    // session has not seen yet would otherwise show after this share, next to whatever ends it later.
    for (const kind of ["signed_out_", "signed_in_", "access_lost_", "workspace_back_", "workspace_added_"]) {
      const prefix = `${lid}/${kind}`;
      ctx.db.prepare("DELETE FROM notices WHERE local_id=? AND substr(id, 1, length(?))=?").run(lid, prefix, prefix);
    }
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
  const at = nowIso();
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=? WHERE local_id=?").run(at, lid);
    endEpochs(ctx.db, lid, at);
    notePriorShare(ctx, lid, true, at);
    ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM latches WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM holds WHERE local_id=?").run(lid);
    enqueue(ctx, lid, "stop_sharing", { ws: share.workspace_id, session_key: share.session_key });
  });
  renderHot(ctx, lid);
}

/** The share of `lid` is stopped (here, or the server says so), from when it first stopped: its epochs end there, so
 *  usage after it stays on this machine (C5-1). */
export function markStopped(ctx: Ctx, lid: string): void {
  ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=COALESCE(stopped_at, ?) WHERE local_id=?").run(nowIso(), lid);
  const row = ctx.db.prepare("SELECT stopped_at FROM shares WHERE local_id=?").get(lid) as { stopped_at: string } | undefined;
  if (row) endEpochs(ctx.db, lid, row.stopped_at);
}

export function deleteHistory(ctx: Ctx, lid: string): void {
  const share = getShare(ctx, lid);
  if (!share) throw new Error("session was never shared");
  tx(ctx.db, () => {
    markStopped(ctx, lid);
    notePriorShare(ctx, lid, true);
    ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM latches WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM holds WHERE local_id=?").run(lid);
    // Asked again: one deletion, tried now (a refused one waits an hour on its own).
    ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind='delete_session'").run(lid);
    ctx.db.prepare("DELETE FROM kv WHERE key=?").run(`delete_refused:${lid}`);
    enqueue(ctx, lid, "delete_session", { ws: share.workspace_id, session_key: share.session_key });
  });
  renderHot(ctx, lid);
}

/** Why the server last refused to delete this session's shared history (its error code), or null (C4-1). */
export function deleteRefused(ctx: Ctx, lid: string): string | null {
  return kvGet(ctx.db, `delete_refused:${lid}`);
}

/**
 * Local cleanup after the server confirmed a hard delete: local metering stays, server links go. The session is
 * remembered as deleted, so `align share --dir --past` never offers it again, and its items in the cached team activity
 * go too (the server deleted them with it), so it never shows as "you, on another machine" (C4-1). Its record of having
 * been shared (and stopped) stays: an explicit share later counts from now, so nothing from before it goes up (C6-1).
 */
export function forgetShare(ctx: Ctx, lid: string): void {
  const share = getShare(ctx, lid);
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE requests SET uploaded=0, epoch_id=NULL WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM epochs WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM shares WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM notices WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind='delete_session'").run(lid);
    ctx.db.prepare("DELETE FROM kv WHERE key=?").run(`delete_refused:${lid}`);
    kvSet(ctx.db, `history_deleted:${lid}`, nowIso());
    notePriorShare(ctx, lid, true);
  });
  if (share) {
    const file = layout.podFeed(ctx.home, share.workspace_id);
    const feed = readJson<PodFeed>(file);
    if (feed?.items.some((i) => i.session_key === share.session_key)) writeJsonAtomic(file, { ...feed, items: feed.items.filter((i) => i.session_key !== share.session_key) });
  }
  renderHot(ctx, lid);
}

/**
 * This machine signed out (logout, a revoked device, or a new pairing that replaced the old device): the server can no
 * longer reach its shares, so each live one ends here too and its session is told once how to share it again. Queued
 * share and epoch calls are dropped (they belonged to the old device). Stop latches and goal holds stay: a stopped
 * session stays blocked until the developer runs `align stop-sharing`. Returns how many shares ended.
 */
export function endSharesSignedOut(ctx: Ctx): number {
  // "Signed in again" is no longer true: a session that has not seen that notice yet gets its sign-out notice again
  // (C7-2).
  const back = ctx.db.prepare(`SELECT DISTINCT local_id FROM notices WHERE ${SIGNED_IN_NOTICE}`).all() as { local_id: string }[];
  if (back.length) {
    ctx.db.prepare(`DELETE FROM notices WHERE ${SIGNED_IN_NOTICE}`).run();
    for (const b of back) renderHot(ctx, b.local_id);
  }
  const live = ctx.db.prepare("SELECT local_id, goal_json FROM shares WHERE state IN ('shared','pending','suspended')").all() as { local_id: string; goal_json: string | null }[];
  const at = nowIso();
  for (const { local_id: lid, goal_json } of live) {
    // Typed in the session after a new `align login`, `::align share` shares it toward the goal it had (N8).
    const goal = goal_json ? (JSON.parse(goal_json) as GoalSnapshot) : null;
    endShare(
      ctx,
      lid,
      DEVICE_SIGNED_OUT,
      `signed_out_${at}`,
      `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${goal ? ` (it counts toward "${clean(goal.title, 100)}" again)` : ""}.`,
      at,
    );
  }
  if (live.length) ctx.log(`signed out: ${live.length} shares ended on this machine`);
  // A stopped session whose share had ended already (its workspace lost, say) can no longer be shared again from here
  // either: its deny says so (C6-2).
  renderEndedLatches(ctx);
  return live.length;
}

/** SQL: a row of `notices` (`t`: its table alias and a dot) of the given kind, whose id is `<lid>/<kind>...`. */
const noticeOfKind = (kind: string, t = "") => `substr(${t}id, length(${t}local_id) + 2, ${kind.length})='${kind}'`;
const SIGNED_IN_NOTICE = noticeOfKind("signed_in_");

/** Stopped from the web (or held), so the web can lift that only once the session is shared again. */
function latchedFromWeb(ctx: Ctx, lid: string): boolean {
  return !!(ctx.db.prepare("SELECT 1 FROM latches WHERE local_id=? AND stopped=1").get(lid) || ctx.db.prepare("SELECT 1 FROM holds WHERE local_id=? AND held=1").get(lid));
}

/**
 * This machine is signed in again after a sign-out ended sessions' shares: each such session with a sign-out notice
 * (one sharing it again has none) gets the "signed in again" counterpart, which supersedes it as "can reach ... again"
 * supersedes "lost access" (C7-2). Worded from the same `reshare` state as the deny and the status views: `::align
 * share` shares it again, after which the web can lift a stop or hold; or, when this sign-in does not reach its
 * workspace, that it can't be shared there from here. Told once per sign-in, and again only when that answer changes;
 * the next sign-out takes it back.
 */
export function noticeSignedInAgain(ctx: Ctx): void {
  if (!signedIn(ctx.home)) return;
  const rows = ctx.db
    .prepare(`SELECT DISTINCT s.local_id AS lid FROM shares s JOIN notices n ON n.local_id=s.local_id WHERE s.state IN ('stopped','error') AND s.error=? AND ${noticeOfKind("signed_out_", "n.")}`)
    .all(DEVICE_SIGNED_OUT) as { lid: string }[];
  for (const { lid } of rows) {
    const share = getShare(ctx, lid);
    const end = endedState(ctx, share);
    if (!share || !end) continue;
    const last = ctx.db.prepare(`SELECT id FROM notices WHERE local_id=? AND ${SIGNED_IN_NOTICE} ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(lid) as { id: string } | undefined;
    if (last && last.id.slice(lid.length + 1).startsWith("signed_in_noreach_") === !end.reshare) continue;
    const goal = share.goal_json ? (JSON.parse(share.goal_json) as GoalSnapshot) : null;
    const latched = latchedFromWeb(ctx, lid);
    const text = end.reshare
      ? `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here${goal ? ` (it counts toward "${clean(goal.title, 100)}" again)` : ""}.${latched ? " It was stopped or held from the web: once it is shared again, that can be lifted there; until then its tools stay blocked." : ""}`
      : `Align: this machine is signed in to Align again, but this sign-in does not reach ${clean(share.workspace_name, 80)}, so this session can't be shared there again from here; its usage stays on this machine.${latched ? ` It was stopped or held from the web, so tools stay blocked until you run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.` : ""}`;
    notify(ctx, lid, `${end.reshare ? "signed_in_" : "signed_in_noreach_"}${nowIso()}`, text);
  }
}

/** End one live share here (the server already ended it, or can no longer be reached for it): stopped with `why`,
 *  its pending binding and queued session and epoch calls dropped, one notice. Its stop latch and goal holds stay, so
 *  it fails closed, and the notice says how to get out. */
function endShare(ctx: Ctx, lid: string, why: string, noticeId: string, text: string, at = nowIso()): void {
  const latched = ctx.db.prepare("SELECT 1 FROM latches WHERE local_id=? AND stopped=1").get(lid) || ctx.db.prepare("SELECT 1 FROM holds WHERE local_id=? AND held=1").get(lid);
  tx(ctx.db, () => {
    ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=?, error=? WHERE local_id=?").run(at, why, lid);
    endEpochs(ctx.db, lid, at);
    ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=?").run(lid);
    ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind IN ('put_session','post_epoch')").run(lid);
    // A session that can be shared there again at once (its person is back in the workspace) gets out the way its
    // latch says: by sharing it again (C6-2).
    const again = latched && endedState(ctx, getShare(ctx, lid))?.reshare;
    const tail = !latched
      ? ""
      : again
        ? " It was stopped or held from the web: once it is shared again, that can be lifted there; until then its tools stay blocked."
        : ` It was stopped or held from the web, so tools stay blocked until you run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;
    addNotice(ctx, lid, noticeId, `${text}${tail}`);
  });
  renderHot(ctx, lid);
}

/**
 * The server refused this session's usage as `sharing_stopped` because its person was removed from the workspace (or
 * left it) and this device never saw it: `/me` lists the workspace again, as they are back (E2E-AGENT cycle 6 C6-3).
 * Not a stop by its person: the share ends here as a lost workspace does, and the notice says `::align share` shares it
 * there again (the server shares a `member_removed` session again for its own device).
 */
export function endShareRemoved(ctx: Ctx, lid: string): void {
  const s = getShare(ctx, lid);
  if (!s || (s.state !== "shared" && s.state !== "pending" && s.state !== "suspended")) return;
  const goal = s.goal_json ? (JSON.parse(s.goal_json) as GoalSnapshot) : null;
  const at = nowIso();
  endShare(
    ctx,
    lid,
    ACCESS_LOST,
    `access_lost_${s.workspace_id}_${at}`,
    `Align: this session stopped sharing because you were removed from ${clean(s.workspace_name, 80)} in Align (or left it) while this machine was not in touch; its usage from then on stays on this machine. You are a member again, so to share it there again, type \`::align share\` here${goal ? ` (it counts toward "${clean(goal.title, 100)}" again)` : ""}.`,
    at,
  );
  ctx.log(`usage refused: session ${lid.slice(0, 8)} ended on the server when its person was removed from ${s.workspace_name}; ended here too`);
}

/**
 * The server refused this session's usage as `sharing_stopped` because its share ended when this machine signed out
 * (`ended_reason: "device_signed_out"`: a sign-out of an earlier pairing this machine never saw end it). Not a stop by
 * its person: the share ends here as a sign-out ends it (`align sessions` and the latch say so), and the notice says
 * `::align share` shares it again, as the sign-out notice does once signed in (C7-5).
 */
export function endShareSignedOutByServer(ctx: Ctx, lid: string): void {
  const s = getShare(ctx, lid);
  if (!s || (s.state !== "shared" && s.state !== "pending" && s.state !== "suspended")) return;
  const goal = s.goal_json ? (JSON.parse(s.goal_json) as GoalSnapshot) : null;
  const at = nowIso();
  endShare(
    ctx,
    lid,
    DEVICE_SIGNED_OUT,
    `upload_refused_signed_out_${at}`,
    `Align: this session stopped sharing because the Align server ended its share when this machine signed out of Align (an earlier sign-in); its usage stays on this machine from now on. This machine is signed in now, so to share it again, type \`::align share\` here${goal ? ` (it counts toward "${clean(goal.title, 100)}" again)` : ""}.`,
    at,
  );
  ctx.log(`usage refused: session ${lid.slice(0, 8)} ended on the server when this machine signed out; ended here too`);
}

/**
 * This device can no longer reach a workspace (`/me` no longer lists it: its person was removed from it or left, or a
 * new pairing did not include it). The server ended those sessions (`member_removed`), so each live share in it ends
 * here too, with one notice; its cached goals and asks go, so no envelope or `::align goals` shows them. Stop latches
 * and goal holds stay until `align stop-sharing`. Returns how many shares ended.
 */
export function endSharesWithoutAccess(ctx: Ctx, me: MeFile): number {
  const reach = new Set(me.workspaces.map((w) => w.id));
  const live = (ctx.db.prepare("SELECT local_id, workspace_id, workspace_name FROM shares WHERE state IN ('shared','pending','suspended')").all() as {
    local_id: string;
    workspace_id: string;
    workspace_name: string;
  }[]).filter((s) => !reach.has(s.workspace_id));
  const at = nowIso();
  for (const s of live) {
    endShare(
      ctx,
      s.local_id,
      ACCESS_LOST,
      `access_lost_${s.workspace_id}_${at}`,
      `Align: this session stopped sharing because you no longer have access to ${clean(s.workspace_name, 80)} in Align (you were removed from it or left it); its usage stays on this machine from now on.`,
      at,
    );
  }
  // Cached feeds of every workspace out of reach go too (with or without a live share in it).
  const gone = new Set(live.map((s) => s.workspace_id));
  try {
    for (const f of fs.readdirSync(layout.feeds(ctx.home))) {
      if (!f.endsWith(".json") || f.startsWith("activity-") || f.startsWith("asks-")) continue;
      const ws = readJson<FeedFile>(path.join(layout.feeds(ctx.home), f))?.workspace_id;
      if (ws && !reach.has(ws)) gone.add(ws);
    }
  } catch {
    /* no feeds yet */
  }
  for (const ws of gone) {
    for (const f of [layout.feed(ctx.home, ws), layout.asksFeed(ctx.home, ws), layout.podFeed(ctx.home, ws)]) removeFile(f);
  }
  if (live.length) ctx.log(`workspace access lost: ${live.length} shares ended on this machine`);
  return live.length;
}

/**
 * Workspaces this device reaches now and did not at its last `/me` (its person accepted an invite and gave this device
 * the workspace there, owner decision 2026-11-01). Logged, and told once to the sessions it matters to: each session
 * whose share in it ended because the access was lost, with how to share it again (`::align share` shares it there,
 * toward the goal it had), and each other session active in the last hour that is not shared, with how to share it
 * there. Returns the workspaces, for `align sync` to print.
 */
export function noticeWorkspacesAdded(ctx: Ctx, me: MeFile, added: { id: string; name: string }[]): { id: string; name: string }[] {
  const at = nowIso();
  const solo = (ws: string) => me.default_workspace === ws || me.workspaces.length === 1;
  for (const w of added) {
    const told = new Set<string>();
    const name = clean(w.name, 80);
    ctx.log(`workspace added: this device can now reach ${w.name} (${w.id})`);
    const ended = ctx.db.prepare("SELECT local_id, goal_json FROM shares WHERE workspace_id=? AND state IN ('stopped','error') AND error=?").all(w.id, ACCESS_LOST) as { local_id: string; goal_json: string | null }[];
    for (const s of ended) {
      const goal = s.goal_json ? (JSON.parse(s.goal_json) as GoalSnapshot) : null;
      told.add(s.local_id);
      // Stopped or held from the web: sharing it again is also how the web gets to lift that (C6-2).
      const latched = ctx.db.prepare("SELECT 1 FROM latches WHERE local_id=? AND stopped=1").get(s.local_id) || ctx.db.prepare("SELECT 1 FROM holds WHERE local_id=? AND held=1").get(s.local_id);
      notify(
        ctx,
        s.local_id,
        `workspace_back_${w.id}_${at}`,
        `Align: this machine can reach ${name} in Align again. To share this session there again, type \`::align share\` here${goal ? ` (it counts toward "${clean(goal.title, 100)}" again)` : ""}.${latched ? " It was stopped or held from the web: once it is shared again, that can be lifted there; until then its tools stay blocked." : ""}`,
      );
    }
    // A session whose share there a sign-out ended hears it from its "signed in again" notice, toward the goal it had
    // (`noticeSignedInAgain`, C7-2), not from a second notice next to it.
    const signedOutThere = ctx.db
      .prepare(`SELECT DISTINCT s.local_id FROM shares s JOIN notices n ON n.local_id=s.local_id WHERE s.workspace_id=? AND s.state IN ('stopped','error') AND s.error=? AND ${noticeOfKind("signed_out_", "n.")}`)
      .all(w.id, DEVICE_SIGNED_OUT) as { local_id: string }[];
    for (const r of signedOutThere) told.add(r.local_id);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    // A session this pass recorded first started with it (its own SessionStart spooled it and started the pass): it
    // starts out with the workspace in reach, so it is not told (cycle 5).
    const fresh = new Date(ctx.passStartedAt ?? Date.now()).toISOString();
    const recent = ctx.db
      .prepare(
        "SELECT s.local_id FROM sessions s LEFT JOIN shares h ON h.local_id=s.local_id WHERE COALESCE(s.last_active, s.created_at) >= ? AND s.created_at < ? AND (h.local_id IS NULL OR h.state IN ('stopped','error'))",
      )
      .all(since, fresh) as { local_id: string }[];
    for (const { local_id: lid } of recent) {
      if (told.has(lid)) continue;
      told.add(lid);
      const how = solo(w.id) ? "type `::align share <goal>` here" : `run \`align share ${lid.slice(0, 8)} --workspace "${name}" --goal <goal>\` in a terminal`;
      notify(ctx, lid, `workspace_added_${w.id}_${at}`, `Align: this machine can now reach ${name} in Align. To share this session there, ${how}.`);
    }
  }
  return added.map((w) => ({ id: w.id, name: w.name }));
}

/** `endSharesSignedOut` when the credentials say this machine is signed out (a revocation the server reported). */
export function endSharesIfSignedOut(ctx: Ctx): number {
  return loadCredentials(ctx.home)?.signed_out ? endSharesSignedOut(ctx) : 0;
}

export function notify(ctx: Ctx, lid: string, id: string, text: string): void {
  addNotice(ctx, lid, id, text);
  renderHot(ctx, lid);
}

// ---------- past sessions of a folder (`align share --dir <folder> --past <days>`) ----------
/** The days `--past` may reach back: within the transcript tail window. */
export const PAST_MAX_DAYS = 14;

function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** `cwd` is the folder or inside it. A sibling that only shares a prefix (`/work/app-secret`, `/work/app.v2`) is not. */
export function insideDir(cwd: string, dir: string): boolean {
  const c = real(cwd);
  return c === dir || c.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
}

/**
 * Already-metered local sessions active in the last `days` days whose own recorded folders (the first one and every
 * one they reported later) are all `dir` (a realpath) or inside it. A session with no folder is left out. One that was
 * ever shared (shared, pending, suspended, stopped or failed) or has epochs is skipped: sharing it from its start
 * could backdate history a live hook already reported, which the server refuses anyway (`epoch_overlap`). One whose
 * shared history was deleted (on the web or with `align delete-history`) is skipped too and counted in `deleted`:
 * deleting it was a choice, never undone by a later `--past`.
 */
export function pastSessions(ctx: Ctx, dir: string, days: number, now = Date.now()): { take: SessionRow[]; already: number; deleted: number } {
  const since = new Date(now - days * 86_400_000).toISOString();
  const rows = ctx.db
    .prepare("SELECT * FROM sessions WHERE COALESCE(last_active, started_at, created_at) >= ? ORDER BY COALESCE(started_at, created_at), local_id")
    .all(since) as unknown as SessionRow[];
  const take: SessionRow[] = [];
  let already = 0;
  let deleted = 0;
  for (const s of rows) {
    if (!s.cwd) continue;
    if (!sessionCwds(ctx.db, s.local_id, s.cwd).every((c) => insideDir(c, dir))) continue;
    if (kvGet(ctx.db, `history_deleted:${s.local_id}`)) {
      deleted++;
      continue;
    }
    if (sharedBefore(ctx, s.local_id)) already++;
    else take.push(s);
  }
  return { take, already, deleted };
}
