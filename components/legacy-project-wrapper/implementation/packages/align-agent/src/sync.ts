// Spool ingest, outbox flush, epoch assignment, usage upload and the one-pass sync that hooks start in the background.
// Only shared sessions ever reach the server.
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import {
  api,
  bindDevice,
  clockMeasured,
  clockOffset,
  clockWords,
  CLOCK_TOLERANCE_MS,
  DeviceChanged,
  HttpError,
  loadCredentials,
  NetworkError,
  resetServerTrouble,
  revokePending,
  saveClockOffset,
  serverIso,
  serverTrouble,
  SignedOut,
  signedIn,
  stillBound,
  type Resp,
  type RevokeOutcome,
} from "./api.ts";
import { bumpGap, nowIso, tx } from "./db.ts";
import { endEpochs, ensureSession, epochFor, getSession, recordRootTurn } from "./ledger.ts";
import { addNotice, getShare, renderHot, snapshot } from "./hot.ts";
import { applyShare, bind, endSharesIfSignedOut, enqueue, forgetShare, markStopped, planShare, stopSharing } from "./share.ts";
import { hasWorkspace, loadFeed, loadMe, refreshFeed, refreshMe, resolveGoal, resolveWorkspace } from "./goals.ts";
import { pollDirectives } from "./directives.ts";
import { answerRequest } from "./requests.ts";
import { kvGet, kvSet } from "./db.ts";
import { tailAll, type TailResult } from "./tailer.ts";
import { detectGitEdits, fetchPod, uploadActivity } from "./activity.ts";
import { fetchAsks } from "./asks.ts";
import { computeUnsharedDigest, uploadSteering } from "./allocation.ts";
import { layout, listSpool, localId } from "./shared/layout.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";
import type { SpoolRecord } from "./shared/types.ts";

// ---------- spool ----------
export function ingestSpool(ctx: Ctx): number {
  const files = listSpool(ctx.home);
  let n = 0;
  for (const file of files) {
    const rec = readJson<SpoolRecord>(file);
    try {
      if (rec) {
        const lid = applySpool(ctx, rec);
        if (lid) renderHot(ctx, lid);
      } else bumpGap(ctx.db, "spool_unreadable");
      fs.unlinkSync(file);
      n++;
    } catch (e) {
      ctx.log(`spool ${path.basename(file)} failed: ${(e as Error).message}`);
      try {
        const bad = path.join(layout.spool(ctx.home), "bad");
        fs.mkdirSync(bad, { recursive: true, mode: 0o700 });
        fs.renameSync(file, path.join(bad, path.basename(file)));
      } catch {
        /* leave it */
      }
    }
  }
  return n;
}

function applySpool(ctx: Ctx, r: SpoolRecord): string | null {
  switch (r.type) {
    case "session_start": {
      const lid = ensureSession(ctx.db, r.harness, r.native_id, { cwd: r.cwd, ts: r.ts });
      ctx.db
        .prepare("UPDATE sessions SET hooked=1, api_key_env=MAX(api_key_env, ?), cloud_env=MAX(cloud_env, ?), model=COALESCE(?, model), last_source=? WHERE local_id=?")
        .run(r.api_key_env ? 1 : 0, r.cloud_provider_env ? 1 : 0, r.model, r.source, lid);
      return lid;
    }
    case "root_turn":
      return recordRootTurn(ctx.db, r.harness, r.native_id, r.root_turn, r.ts, r.cwd, true);
    case "epoch_open": {
      const lid = r.local_id;
      recordRootTurn(ctx.db, r.harness, r.native_id, r.root_turn || `ts:${r.starts_at}`, r.starts_at, null, true);
      const share = getShare(ctx, lid);
      if (!share || share.state === "stopped" || share.state === "error") return lid;
      const pending = ctx.db.prepare("SELECT * FROM pending_bindings WHERE local_id=?").get(lid) as { id: string; goal_json: string | null } | undefined;
      tx(ctx.db, () => {
        const exists = ctx.db.prepare("SELECT 1 FROM epochs WHERE epoch_id=?").get(r.epoch_id);
        if (exists) return;
        ctx.db
          .prepare("INSERT INTO epochs(epoch_id, local_id, workspace_id, goal_id, starts_at, root_turn, cause, created_at) VALUES(?,?,?,?,?,?,?,?)")
          .run(r.epoch_id, lid, share.workspace_id, r.goal_id, r.starts_at, r.root_turn, r.cause, nowIso());
        // The goal comes from the binding the hook applied; a binding the hook recorded itself (InjectedState.local_binding)
        // may reach this pass before its command did, so otherwise the share's own goal only when it is the same one.
        let goalJson = pending && pending.id === r.pending_id ? pending.goal_json : share.binding_goal === r.goal_id ? share.goal_json : null;
        if (!goalJson && r.goal_id) {
          const g = loadFeed(ctx.home, share.workspace_id)?.goals.find((x) => x.id === r.goal_id);
          goalJson = g ? JSON.stringify(snapshot(g)) : null;
        }
        ctx.db
          .prepare("UPDATE shares SET binding_epoch=?, binding_goal=?, goal_id=?, goal_json=?, state=CASE WHEN state='suspended' THEN 'shared' ELSE state END WHERE local_id=?")
          .run(r.epoch_id, r.goal_id, r.goal_id, goalJson, lid);
        ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=? AND id=?").run(lid, r.pending_id);
        kvSet(ctx.db, `binding_consumed:${lid}`, r.pending_id);
        enqueue(ctx, lid, "post_epoch", {
          ws: share.workspace_id,
          session_key: share.session_key,
          body: { epoch_id: r.epoch_id, goal_id: r.goal_id, starts_at: r.starts_at, root_turn: r.root_turn, cause: r.cause },
        });
      });
      return lid;
    }
    case "applied": {
      for (const id of r.directive_ids) markApplied(ctx, r.local_id, id, r.ts);
      return r.local_id;
    }
    case "request_answer": {
      const res = answerRequest(ctx, r.local_id, r.request_id, r.answer, r.auto, r.ts, r.pending_id);
      // The agent's own auto-accept loses quietly to an earlier answer; the developer hears why theirs failed.
      if (!res.ok && !r.auto) addNotice(ctx, r.local_id, `ans_${r.request_id}_${Date.parse(r.ts) || 0}`, `Align: ${r.answer === "accepted" ? "accept" : "decline"} failed: ${res.why}.`);
      return r.local_id;
    }
    case "command":
      return applyCommand(ctx, r);
  }
}

export function markApplied(ctx: Ctx, lid: string, directiveId: string, at: string): void {
  const row = ctx.db.prepare("SELECT state FROM directive_sessions WHERE directive_id=? AND local_id=?").get(directiveId, lid) as { state: string } | undefined;
  if (!row || row.state !== "received") return;
  const share = getShare(ctx, lid);
  ctx.db.prepare("UPDATE directive_sessions SET state='applied' WHERE directive_id=? AND local_id=?").run(directiveId, lid);
  if (share) enqueue(ctx, lid, "receipt", { directive_id: directiveId, body: { session_key: share.session_key, state: "applied", at } });
}

function applyCommand(ctx: Ctx, r: Extract<SpoolRecord, { type: "command" }>): string {
  const lid = ensureSession(ctx.db, r.harness, r.native_id, { cwd: r.cwd, ts: r.ts });
  const say = (text: string) => addNotice(ctx, lid, `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, text);
  try {
    if (r.command === "unshare") {
      stopSharing(ctx, lid);
      say("Align: this session stopped sharing. Usage from now on stays on this machine.");
    } else if (r.command === "bind") {
      const share = getShare(ctx, lid);
      if (!share) throw new Error("this session is not shared");
      const goal = r.arg ? resolveGoal(loadFeed(ctx.home, share.workspace_id), r.arg) : null;
      if (goal && !goal.bindable) throw new Error(`goal "${goal.title}" needs an approved alignment before it can be bound`);
      // The hook already applied this binding at a prompt (same id): don't queue it a second time, and drop a pending
      // binding recorded before this command, which the developer replaced (N1).
      if (!r.pending_id || kvGet(ctx.db, `binding_consumed:${lid}`) !== r.pending_id) bind(ctx, lid, goal, "manual", null, r.pending_id);
      else ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=? AND id<>? AND created_at<?").run(lid, r.pending_id, r.ts);
      // A hook that recorded the binding itself already told the user; an older record is confirmed here.
      if (!r.pending_id) say(`Align: from your next prompt this session counts toward ${goal ? `"${goal.title}"` : "no goal (unallocated)"}.`);
    } else if (r.command === "share") {
      const existing = getShare(ctx, lid);
      if (existing && existing.state !== "stopped" && existing.state !== "error") return lid;
      // Signed out: nothing could reach the server, so the share is refused rather than applied and ended at once (N4).
      // A folder rule's share at a session start stays quiet (the hook already said the session stays private).
      if (!signedIn(ctx.home)) {
        if (r.rule_dir) return lid;
        throw new Error("this machine is signed out of Align. Run `align login` in a terminal, then type `::align share` here");
      }
      const ws = resolveWorkspace(ctx.home, r.workspace || ctx.config.default_workspace);
      if (!ws) throw new Error(r.workspace ? `${r.rule_dir ? "the folder rule's" : "that"} workspace is no longer available on this device` : "no default workspace; run `align share --latest --workspace <name>` in a terminal");
      const goal = r.arg ? resolveGoal(loadFeed(ctx.home, ws.id), r.arg) : null;
      if (goal && !goal.bindable) throw new Error(`goal "${goal.title}" needs an approved alignment before it can be bound`);
      const hasEpochs = ctx.db.prepare("SELECT 1 FROM epochs WHERE local_id=?").get(lid);
      applyShare(ctx, planShare(ctx, lid, ws, goal, null, hasEpochs ? "now" : "start"));
      if (!r.rule_dir) addNotice(ctx, lid, `share_started_${r.ts}`, `Align: sharing this session with ${ws.name}${goal ? ` for "${goal.title}"` : ""}, counting from ${hasEpochs ? "now" : "session start"}.`);
    }
  } catch (e) {
    say(`Align: ${r.command} failed: ${(e as Error).message}`);
  }
  return lid;
}

// ---------- outbox ----------
/** The server refused a call that must not be dropped (a history deletion, C4-1): it stays queued and is tried again
 *  after `retryMs`, or at once by the developer's next `align delete-history`. */
class KeepQueued extends Error {
  retryMs: number;
  constructor(message: string, retryMs: number) {
    super(message);
    this.retryMs = retryMs;
  }
}

/** How long a refused history deletion waits before it is tried again on its own (a new pairing may be allowed). */
const REFUSED_DELETE_RETRY_MS = 3_600_000;

interface OutboxRow {
  id: number;
  local_id: string;
  kind: string;
  payload: string;
  attempts: number;
  next_at: number;
}

const backoff = (ctx: Ctx, attempts: number) =>
  Math.min(Number(ctx.env.ALIGN_OUTBOX_MAX_BACKOFF_MS || 60_000), 1000 * 2 ** Math.min(attempts, 6)) * (0.75 + Math.random() * 0.5);
const enc = encodeURIComponent;

export async function flushOutbox(ctx: Ctx): Promise<{ sent: number; deferred: number }> {
  const res = { sent: 0, deferred: 0 };
  if (!signedIn(ctx.home)) return res;
  const sessions = ctx.db.prepare("SELECT local_id, MIN(id) AS first FROM outbox GROUP BY local_id ORDER BY first").all() as { local_id: string }[];
  for (const { local_id } of sessions) {
    for (;;) {
      const item = ctx.db.prepare("SELECT * FROM outbox WHERE local_id=? ORDER BY id LIMIT 1").get(local_id) as unknown as OutboxRow | undefined;
      if (!item) break;
      if (item.next_at > Date.now()) {
        res.deferred++;
        break;
      }
      try {
        await perform(ctx, item);
        ctx.db.prepare("DELETE FROM outbox WHERE id=?").run(item.id);
        res.sent++;
      } catch (e) {
        if (e instanceof SignedOut) return res;
        if (e instanceof KeepQueued) {
          ctx.db.prepare("UPDATE outbox SET attempts=attempts+1, next_at=?, last_error=? WHERE id=?").run(Date.now() + e.retryMs, e.message, item.id);
          res.deferred++;
          break;
        }
        if (e instanceof NetworkError || (e instanceof HttpError && (e.status >= 500 || e.status === 429))) {
          ctx.db.prepare("UPDATE outbox SET attempts=attempts+1, next_at=?, last_error=? WHERE id=?").run(Date.now() + backoff(ctx, item.attempts + 1), String((e as Error).message), item.id);
          res.deferred++;
          break; // keep this session's FIFO order
        }
        ctx.log(`outbox ${item.kind} dropped: ${(e as Error).message}`);
        ctx.db.prepare("DELETE FROM outbox WHERE id=?").run(item.id);
      }
    }
  }
  return res;
}

/**
 * The body a session or epoch call sends: its local times on the server's clock (never in the future), worked out once
 * and kept in the queued call, so a retry sends the same values (the server answers a repeated epoch with other values
 * 409 epoch_conflict).
 */
async function wireBody(ctx: Ctx, item: OutboxRow, p: any, field: "started_at" | "starts_at", fresh = false): Promise<any> {
  if (p.wire && !fresh) return p.wire;
  // The first time this process sends a time, it measures the server's clock first (one cheap read): a clock that
  // runs slow is never refused, so without this a session's first start would go up on a stale offset (C3-5).
  if (!clockMeasured()) await api(ctx, "GET", "/api/v2/me").catch(() => null);
  const offset = clockOffset(ctx.home);
  p.wire = { ...p.body, [field]: serverIso(p.body[field], offset, true) };
  p.wire_offset = offset;
  ctx.db.prepare("UPDATE outbox SET payload=? WHERE id=?").run(JSON.stringify(p), item.id);
  return p.wire;
}

/**
 * The server refused a time as `clock_skew` (this computer's clock runs ahead and Align did not know yet when it put
 * the time on the server's clock): save the offset to its `server_time` (the answer's Date header may already have).
 * True when the call is worth sending again: the offset now differs from the one its times were put on.
 */
async function learnClock(ctx: Ctx, r: Resp, p: any): Promise<boolean> {
  if (r.status !== 400 || r.json?.error !== "clock_skew") return false;
  const offset = Date.parse(String(r.json?.server_time ?? "")) - Date.now();
  if (!Number.isNaN(offset) && Math.abs(offset) >= CLOCK_TOLERANCE_MS && Math.abs(offset - clockOffset(ctx.home)) >= CLOCK_TOLERANCE_MS) {
    await saveClockOffset(ctx, offset);
    ctx.log(`clock: the server refused a time as clock_skew; this computer's clock is ${clockWords(offset)} the server's`);
  }
  return Math.abs(clockOffset(ctx.home) - (Number(p.wire_offset) || 0)) >= CLOCK_TOLERANCE_MS;
}

/** A share the server refused takes back its "sharing this session" notice if the session has not seen it yet, so
 *  the next prompt does not say both. */
function dropShareStarted(ctx: Ctx, lid: string): void {
  ctx.db.prepare("DELETE FROM notices WHERE local_id=? AND id LIKE ?").run(lid, `${lid}/share_started_%`);
}

/** Why the server refused a session's share, and what to do, for its notice (N5). */
function shareRefusal(ctx: Ctx, status: number, code: string | null): string {
  const server = loadCredentials(ctx.home)?.server_url || "the Align server";
  if (status === 403) return `Align: sharing failed (${code || status}): this machine may not share sessions in that workspace. This session stays private.`;
  return `Align: sharing failed (${code || status}): the server did not take this session from this machine. If it was shared before from this machine and that sign-in was never revoked, revoke the old device at ${server}/app/devices, then type \`::align share\` here again. This session stays private.`;
}

async function perform(ctx: Ctx, item: OutboxRow): Promise<void> {
  const p = JSON.parse(item.payload);
  const lid = item.local_id;
  const base = p.ws ? `/api/v2/workspaces/${enc(p.ws)}/sessions/${enc(p.session_key)}` : "";
  switch (item.kind) {
    case "put_session": {
      let r = await api(ctx, "PUT", base, { body: await wireBody(ctx, item, p, "started_at") });
      if (await learnClock(ctx, r, p)) r = await api(ctx, "PUT", base, { body: await wireBody(ctx, item, p, "started_at", true) });
      if (r.status === 200) {
        const state = r.json?.state === "suspended" ? "suspended" : "shared";
        ctx.db.prepare("UPDATE shares SET state=CASE WHEN state IN ('stopped','error') THEN state ELSE ? END, error=NULL WHERE local_id=?").run(state, lid);
        renderHot(ctx, lid);
        return;
      }
      if (r.status === 409 && r.json?.error === "sharing_stopped") {
        markStopped(ctx, lid);
        ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind IN ('post_epoch')").run(lid);
        // Its sharing was stopped (by the developer, or on the web): the server never shares a stopped session again,
        // whichever of the account's devices asks, so no "revoke the old device" here (C4-8).
        dropShareStarted(ctx, lid);
        addNotice(ctx, lid, `share_err_${item.id}`, "Align: sharing failed (sharing_stopped): this session's sharing was stopped (`align stop-sharing`, `::align unshare` or Stop sharing on the web), and a session whose sharing was stopped is not shared again. This session stays private.");
        renderHot(ctx, lid);
        return;
      }
      if (r.status === 400 && r.json?.error === "clock_skew") {
        ctx.db.prepare("UPDATE shares SET state='error', error=? WHERE local_id=?").run("clock_skew", lid);
        endEpochs(ctx.db, lid, nowIso());
        ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind IN ('post_epoch')").run(lid);
        dropShareStarted(ctx, lid);
        addNotice(ctx, lid, `share_err_${item.id}`, `Align: sharing failed because this computer's clock is off (${String(r.json?.message || "clock_skew").replace(/\.$/, "")}). Set the system clock to update automatically, then type \`::align share\` here again. This session stays private.`);
        renderHot(ctx, lid);
        return;
      }
      if (r.status === 404 || r.status === 403) {
        // Perhaps this machine lost access to the workspace (its person was removed): that ends the share with its own
        // notice. Otherwise say why the server refused it, and what to do.
        if (!(await hasWorkspace(ctx, p.ws))) return;
        ctx.db.prepare("UPDATE shares SET state='error', error=? WHERE local_id=?").run(r.json?.error || `http_${r.status}`, lid);
        endEpochs(ctx.db, lid, nowIso());
        ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind IN ('post_epoch')").run(lid);
        dropShareStarted(ctx, lid);
        addNotice(ctx, lid, `share_err_${item.id}`, shareRefusal(ctx, r.status, r.json?.error ?? null));
        renderHot(ctx, lid);
        return;
      }
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    case "post_epoch": {
      let r = await api(ctx, "POST", `${base}/epochs`, { body: await wireBody(ctx, item, p, "starts_at") });
      if (await learnClock(ctx, r, p)) r = await api(ctx, "POST", `${base}/epochs`, { body: await wireBody(ctx, item, p, "starts_at", true) });
      if (r.status === 200) {
        ctx.db.prepare("UPDATE epochs SET synced=1, goal_version_at_start=?, wire_offset=? WHERE epoch_id=?").run(r.json?.goal_version_at_start ?? null, Number(p.wire_offset) || 0, p.body.epoch_id);
        return;
      }
      if (r.status === 403 || r.status === 404 || r.status === 409 || r.status === 400) {
        ctx.db.prepare("UPDATE epochs SET synced=-1 WHERE epoch_id=?").run(p.body.epoch_id);
        addNotice(
          ctx,
          lid,
          `epoch_err_${p.body.epoch_id}`,
          r.json?.error === "alignment_required"
            ? "Align: that goal needs an approved alignment before this session can count toward it. Usage for this period stays private."
            : r.json?.error === "clock_skew"
              ? `Align: the server refused this binding because this computer's clock is off (${String(r.json?.message || "clock_skew").replace(/\.$/, "")}). Set the system clock to update automatically. Usage for this period stays private.`
              : `Align: the server refused this binding (${r.json?.error || r.status}). Usage for this period stays private.`,
        );
        renderHot(ctx, lid);
        return;
      }
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    case "receipt": {
      const r = await api(ctx, "POST", `/api/v2/directives/${enc(p.directive_id)}/receipts`, { body: { ...p.body, at: serverIso(p.body.at, clockOffset(ctx.home)) } });
      if (r.status === 200 || r.status === 404) return;
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    case "stop_sharing": {
      const r = await api(ctx, "POST", `${base}/stop-sharing`, { body: {} });
      if (r.status === 200 || r.status === 204 || r.status === 404) return;
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    case "delete_session": {
      const r = await api(ctx, "DELETE", base);
      if (r.status === 204 || r.status === 200) {
        forgetShare(ctx, lid);
        return;
      }
      if (r.status === 410 && r.json?.error === "history_deleted") {
        // Its history is gone on the server already (deleted on the web, say): nothing is left to delete, so the
        // deletion is done here too, and said once (cycle 5).
        forgetShare(ctx, lid);
        kvSet(ctx.db, `history_gone:${lid}`, nowIso());
        ctx.log(`history deletion: the shared history of session ${lid.slice(0, 8)} was already deleted on the server; nothing is left there`);
        return;
      }
      if (r.status === 404 || r.status === 403) {
        // Not deleted: the share and the queued deletion stay, and `align delete-history` says so (C4-1). The server
        // lets any live device of the account that shared it delete its history, so this is a device of another
        // account, one without access to the workspace now, or history that is not there (deleted on the web, say).
        kvSet(ctx.db, `delete_refused:${lid}`, r.json?.error || `http_${r.status}`);
        throw new KeepQueued(`history deletion refused: ${r.status} ${r.json?.error || ""}`.trim(), REFUSED_DELETE_RETRY_MS);
      }
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    default:
      return;
  }
}

// ---------- settled unfinalized rows ----------
/**
 * Transcript rows that never got a stop_reason (common for subagent transcripts) are billed from the last row seen,
 * as liminal-desktop does, once they have been idle for the settle window.
 */
export function promoteSettled(ctx: Ctx): number {
  const ms = Number(ctx.env.ALIGN_UNFINALIZED_SETTLE_MS || 10 * 60_000);
  const before = new Date(Date.now() - ms).toISOString();
  const r = ctx.db.prepare("UPDATE requests SET finalized=1 WHERE finalized=0 AND updated_at<=?").run(before);
  return Number(r.changes);
}

// ---------- epochs + usage ----------
export function assignEpochs(ctx: Ctx, lid: string): number {
  const share = getShare(ctx, lid);
  const rows = ctx.db.prepare("SELECT request_key, root_turn, ts, created_at FROM requests WHERE local_id=? AND uploaded=0 AND finalized=1 AND epoch_id IS NULL").all(lid) as {
    request_key: string;
    root_turn: string | null;
    ts: string | null;
    created_at: string;
  }[];
  let n = 0;
  const set = ctx.db.prepare("UPDATE requests SET epoch_id=? WHERE request_key=?");
  const withhold = ctx.db.prepare("UPDATE requests SET uploaded=2 WHERE request_key=?");
  for (const r of rows) {
    const e = epochFor(ctx.db, lid, r.root_turn, r.ts || r.created_at);
    if (!e) continue;
    const at = r.ts || r.created_at;
    if (e.synced < 0 || (share?.suspended_at && at >= share.suspended_at && e.starts_at < share.suspended_at)) {
      withhold.run(r.request_key);
      continue;
    }
    set.run(e.epoch_id, r.request_key);
    n++;
  }
  return n;
}

interface UploadRow {
  request_key: string;
  ts: string | null;
  created_at: string;
  epoch_id: string;
  model: string;
  query_source: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_write_unsplit: number;
  basis: string;
  est_list_usd_micros: number | null;
  price_table_version: string;
  source: string;
  epoch_offset: number | null;
}

const MAX_ROWS = 500;
const MAX_BYTES = 256 * 1024;

export async function uploadUsage(ctx: Ctx): Promise<{ uploaded: number; batches: number }> {
  const res = { uploaded: 0, batches: 0 };
  if (!signedIn(ctx.home)) return res;
  const shares = ctx.db.prepare("SELECT local_id, workspace_id, session_key FROM shares WHERE state='shared'").all() as { local_id: string; workspace_id: string; session_key: string }[];
  promoteSettled(ctx);
  // Rows go up with their times on the server's clock, on the offset their epoch's start went up on: a clock corrected
  // between recording and sending (an offline machine whose clock ran ahead) keeps each row inside its epoch (C3-5).
  // Epochs sent before that offset was kept use the one known now.
  const offset = clockOffset(ctx.home);
  for (const s of shares) {
    assignEpochs(ctx, s.local_id);
    const pendingOutbox = ctx.db.prepare("SELECT 1 FROM outbox WHERE local_id=? AND kind IN ('put_session','post_epoch') LIMIT 1").get(s.local_id);
    if (pendingOutbox) continue;
    for (;;) {
      const rows = ctx.db
        .prepare(
          `SELECT r.*, e.wire_offset AS epoch_offset FROM requests r JOIN epochs e ON e.epoch_id=r.epoch_id
           WHERE r.local_id=? AND r.uploaded=0 AND r.finalized=1 AND e.synced=1
           ORDER BY COALESCE(r.ts, r.created_at) LIMIT ?`,
        )
        .all(s.local_id, MAX_ROWS) as unknown as UploadRow[];
      if (!rows.length) break;
      const wire = rows.map((r) => ({
        request_key: r.request_key,
        ts: serverIso(r.ts || r.created_at, r.epoch_offset ?? offset),
        epoch_id: r.epoch_id,
        model: r.model,
        query_source: r.query_source,
        input: r.input,
        output: r.output,
        cache_read: r.cache_read,
        cache_write_5m: r.cache_write_5m,
        cache_write_1h: r.cache_write_1h,
        cache_write_unsplit: r.cache_write_unsplit,
        basis: r.basis,
        est_list_usd_micros: r.est_list_usd_micros,
        price_table_version: r.price_table_version,
        source: r.source,
      }));
      while (wire.length > 1 && Buffer.byteLength(JSON.stringify({ rows: wire })) > MAX_BYTES) wire.splice(Math.ceil(wire.length / 2));
      let r;
      try {
        r = await api(ctx, "POST", `/api/v2/workspaces/${enc(s.workspace_id)}/sessions/${enc(s.session_key)}/usage`, { body: { rows: wire } });
      } catch (e) {
        if (e instanceof NetworkError) return res;
        throw e;
      }
      if (r.status !== 200) {
        if (r.status === 403 || r.status === 404 || r.status === 409) {
          ctx.log(`usage upload refused for ${s.local_id}: ${r.status} ${r.json?.error || ""}`);
          // This machine may have lost access to the workspace: that ends its shares there, with their own notice.
          if ((r.status === 403 || r.status === 404) && !(await hasWorkspace(ctx, s.workspace_id))) break;
          if (r.json?.error === "sharing_stopped" || r.json?.error === "not_shared" || r.status === 404) {
            markStopped(ctx, s.local_id);
            // Never silently: the session hears that its sharing ended and that usage now stays here.
            addNotice(
              ctx,
              s.local_id,
              `upload_refused_${r.status}`,
              `Align: the server no longer accepts this session's usage (${r.json?.error || r.status}), so it stopped sharing; its usage stays on this machine from now on.`,
            );
            renderHot(ctx, s.local_id);
          }
        }
        break;
      }
      const keys = wire.map((w) => w.request_key);
      tx(ctx.db, () => {
        const mark = ctx.db.prepare("UPDATE requests SET uploaded=1 WHERE request_key=?");
        for (const k of keys) mark.run(k);
        ctx.db
          .prepare("UPDATE shares SET accepted=accepted+?, duplicates=duplicates+?, conflicts=conflicts+? WHERE local_id=?")
          .run(Number(r.json?.accepted || 0), Number(r.json?.duplicates || 0), Number(r.json?.conflicts || 0), s.local_id);
      });
      res.uploaded += keys.length;
      res.batches++;
      if (rows.length < MAX_ROWS && keys.length === rows.length) break;
    }
  }
  return res;
}

export function outboxDepth(ctx: Ctx): number {
  return (ctx.db.prepare("SELECT COUNT(*) AS n FROM outbox").get() as { n: number }).n;
}

export { localId, getSession };

// ---------- one pass ----------
export interface SyncResult {
  skipped: boolean;
  spooled: number;
  tail: TailResult;
  sent: number;
  uploaded: number;
  directives: number;
  activity?: number;
  steering?: number;
  /** The first time this pass could not reach the server or got a 5xx (null when every call got through). */
  serverError?: string | null;
  /** Devices left to revoke (`align logout` offline, or one `align login` replaced): what this pass did with each. */
  revoked?: RevokeOutcome;
  /** The pass stopped because this machine's pairing changed under it (an `align login` or `align logout` committed):
   *  nothing more went to the server as the device it started as, nor as the new one (C4-2). */
  aborted?: boolean;
}

/** last-sync.json: when the last pass ran, and whether the server could be reached (B5). */
export interface LastSync {
  at: string;
  ms: number;
  pid: number;
  /** Why the server could not be reached in the last pass; absent when it could. */
  error?: string;
  /** Since when passes have failed to reach the server. */
  error_since?: string;
}

/**
 * One sync pass, then return: hook spool, transcript tail (bounded), outbox, directives by cursor, usage upload, goal
 * and asks feeds (conditional GETs), team activity. A lock file keeps concurrent passes (several sessions' hooks) from overlapping.
 */
export async function syncOnce(ctx: Ctx, opts: { tailBudgetMs: number; refreshFeeds?: boolean; waitForLockMs?: number }): Promise<SyncResult> {
  const res: SyncResult = { skipped: false, spooled: 0, tail: { files: 0, bytes: 0, rewrites: 0, events: 0 }, sent: 0, uploaded: 0, directives: 0 };
  const lock = path.join(ctx.home, "sync.lock");
  const waitUntil = Date.now() + (opts.waitForLockMs ?? 0);
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
      break;
    } catch {
      let age = Infinity;
      try {
        age = Date.now() - fs.statSync(lock).mtimeMs;
      } catch {
        continue; // released between the two calls
      }
      if (age >= 120_000) {
        fs.writeFileSync(lock, String(process.pid), { mode: 0o600 }); // stale lock from a killed pass
        break;
      }
      // An end-of-turn pass waits for the running one, so the turn's last usage is never skipped.
      if (Date.now() >= waitUntil) return { ...res, skipped: true };
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const t0 = Date.now();
  resetServerTrouble();
  // The whole pass is one device's (C4-2): if `align login` or `align logout` commits while it runs, its next call to
  // the server refuses to go on as the new pairing (or none), and the pass stops there.
  const unbind = bindDevice(ctx);
  /** Stop the pass when the pairing changed under it: steps that swallow their own errors would otherwise go on. */
  const guard = () => {
    if (!stillBound(ctx)) throw new DeviceChanged("pairing changed during the pass");
  };
  try {
    // A device this machine signed out of while the server was unreachable is revoked before anything else.
    res.revoked = await revokePending(ctx).catch(() => ({ revoked: [], already: [], pending: [] }));
    res.spooled += ingestSpool(ctx);
    res.tail = tailAll(ctx, opts.tailBudgetMs);
    res.spooled += ingestSpool(ctx);
    try {
      computeUnsharedDigest(ctx);
    } catch {
      /* best effort; the note just doesn't show */
    }
    if (!signedIn(ctx.home)) {
      endSharesIfSignedOut(ctx);
      return res;
    }
    guard();
    const refresh = new Set<string>();
    let reach: string[] | null = null;
    res.sent += (await flushOutbox(ctx)).sent;
    guard();
    res.directives = await pollDirectives(ctx, (ws) => refresh.add(ws), (ws) => (reach = ws)).catch(() => 0);
    guard();
    res.sent += (await flushOutbox(ctx)).sent;
    guard();
    res.uploaded = (await uploadUsage(ctx)).uploaded;
    guard();
    res.sent += (await flushOutbox(ctx)).sent;
    guard();
    // Workspaces and grants change rarely; goals can change any time, and a new session reads its envelope from the
    // cached feed, so every pass revalidates the feeds (a 304 when nothing changed).
    let me = loadMe(ctx.home);
    // The directives answer lists the workspaces this device reaches now: when that differs from the cached /me (a
    // workspace given back when an invite was accepted with this device ticked, or one lost), /me is read at once.
    const reached = reach as string[] | null;
    const moved = !!me && !!reached && [...new Set(reached)].sort().join() !== [...new Set(me.workspaces.map((w) => w.id))].sort().join();
    if (opts.refreshFeeds || !me || moved || Date.now() - Number(kvGet(ctx.db, "me_refreshed_at") || 0) >= ctx.config.goals_refresh_ms) {
      kvSet(ctx.db, "me_refreshed_at", String(Date.now()));
      me = await refreshMe(ctx).catch(() => me);
    }
    guard();
    for (const w of me?.workspaces || []) refresh.add(w.id);
    for (const ws of refresh) await refreshFeed(ctx, ws).catch(() => undefined);
    // Asks between teams (a 304 when nothing changed): read by `align asks`, `align team` and the envelope.
    for (const ws of refresh) await fetchAsks(ctx, ws).catch(() => false);
    guard();
    // Team activity: this machine's in-flight work up, other machines' down (a few hundred bytes when quiet).
    try {
      detectGitEdits(ctx);
    } catch {
      /* best effort */
    }
    res.activity = await uploadActivity(ctx).catch(() => 0);
    guard();
    for (const ws of refresh) await fetchPod(ctx, ws).catch(() => 0);
    res.steering = await uploadSteering(ctx).catch(() => 0);
    guard();
    return res;
  } catch (e) {
    if (!(e instanceof DeviceChanged)) throw e;
    res.aborted = true;
    ctx.log("sync: this machine's pairing changed during the pass (align login or logout); the pass stopped, and the next one goes on as the device signed in now");
    return res;
  } finally {
    unbind();
    res.serverError = serverTrouble();
    try {
      const at = nowIso();
      const prev = readJson<LastSync>(layout.lastSync(ctx.home));
      const rec: LastSync = { at, ms: Date.now() - t0, pid: process.pid };
      if (res.serverError) {
        rec.error = res.serverError;
        rec.error_since = prev?.error ? prev.error_since || prev.at : at;
        ctx.log(`sync: ${res.serverError}; queued work stays on this machine until a pass gets through`);
      } else if (prev?.error) ctx.log("sync: the server is reachable again");
      writeJsonAtomic(layout.lastSync(ctx.home), rec);
      fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
}
