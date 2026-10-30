// Spool ingest, outbox flush, epoch assignment, usage upload and the one-pass sync that hooks start in the background.
// Only shared sessions ever reach the server.
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { api, HttpError, NetworkError, SignedOut, signedIn } from "./api.ts";
import { bumpGap, nowIso, tx } from "./db.ts";
import { ensureSession, epochFor, getSession, recordRootTurn } from "./ledger.ts";
import { addNotice, getShare, renderHot, snapshot } from "./hot.ts";
import { applyShare, bind, enqueue, forgetShare, planShare, stopSharing } from "./share.ts";
import { loadFeed, loadMe, refreshFeed, refreshMe, resolveGoal, resolveWorkspace } from "./goals.ts";
import { pollDirectives } from "./directives.ts";
import { kvGet, kvSet } from "./db.ts";
import { tailAll, type TailResult } from "./tailer.ts";
import { detectGitEdits, fetchPod, uploadActivity } from "./activity.ts";
import { fetchAsks } from "./asks.ts";
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
        let goalJson = pending && pending.id === r.pending_id ? pending.goal_json : share.goal_json;
        if (!goalJson && r.goal_id) {
          const g = loadFeed(ctx.home, share.workspace_id)?.goals.find((x) => x.id === r.goal_id);
          goalJson = g ? JSON.stringify(snapshot(g)) : null;
        }
        ctx.db
          .prepare("UPDATE shares SET binding_epoch=?, binding_goal=?, goal_id=?, goal_json=?, state=CASE WHEN state='suspended' THEN 'shared' ELSE state END WHERE local_id=?")
          .run(r.epoch_id, r.goal_id, r.goal_id, goalJson, lid);
        ctx.db.prepare("DELETE FROM pending_bindings WHERE local_id=? AND id=?").run(lid, r.pending_id);
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
      bind(ctx, lid, goal);
      say(`Align: from your next prompt this session counts toward ${goal ? `"${goal.title}"` : "no goal (unallocated)"}.`);
    } else if (r.command === "share") {
      const existing = getShare(ctx, lid);
      if (existing && existing.state !== "stopped" && existing.state !== "error") return lid;
      const ws = resolveWorkspace(ctx.home, r.workspace || ctx.config.default_workspace);
      if (!ws) throw new Error(r.workspace ? "the folder rule's workspace is no longer available on this device" : "no default workspace; run `align share --latest --workspace <name>` in a terminal");
      const goal = r.arg ? resolveGoal(loadFeed(ctx.home, ws.id), r.arg) : null;
      if (goal && !goal.bindable) throw new Error(`goal "${goal.title}" needs an approved alignment before it can be bound`);
      const hasEpochs = ctx.db.prepare("SELECT 1 FROM epochs WHERE local_id=?").get(lid);
      applyShare(ctx, planShare(ctx, lid, ws, goal, null, hasEpochs ? "now" : "start"));
      if (!r.rule_dir) say(`Align: sharing this session with ${ws.name}${goal ? ` for "${goal.title}"` : ""}, counting from ${hasEpochs ? "now" : "session start"}.`);
    }
  } catch (e) {
    say(`Align: ${r.command} failed: ${(e as Error).message}`);
  }
  return lid;
}

// ---------- outbox ----------
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

async function perform(ctx: Ctx, item: OutboxRow): Promise<void> {
  const p = JSON.parse(item.payload);
  const lid = item.local_id;
  const base = p.ws ? `/api/v2/workspaces/${enc(p.ws)}/sessions/${enc(p.session_key)}` : "";
  switch (item.kind) {
    case "put_session": {
      const r = await api(ctx, "PUT", base, { body: p.body });
      if (r.status === 200) {
        const state = r.json?.state === "suspended" ? "suspended" : "shared";
        ctx.db.prepare("UPDATE shares SET state=CASE WHEN state IN ('stopped','error') THEN state ELSE ? END, error=NULL WHERE local_id=?").run(state, lid);
        renderHot(ctx, lid);
        return;
      }
      if (r.status === 409 && r.json?.error === "sharing_stopped") {
        ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=COALESCE(stopped_at, ?) WHERE local_id=?").run(nowIso(), lid);
        ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind IN ('post_epoch')").run(lid);
        renderHot(ctx, lid);
        return;
      }
      if (r.status === 404 || r.status === 403) {
        ctx.db.prepare("UPDATE shares SET state='error', error=? WHERE local_id=?").run(r.json?.error || `http_${r.status}`, lid);
        ctx.db.prepare("DELETE FROM outbox WHERE local_id=? AND kind IN ('post_epoch')").run(lid);
        addNotice(ctx, lid, `share_err_${item.id}`, `Align: sharing failed (${r.json?.error || r.status}). This session stays private.`);
        renderHot(ctx, lid);
        return;
      }
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    case "post_epoch": {
      const r = await api(ctx, "POST", `${base}/epochs`, { body: p.body });
      if (r.status === 200) {
        ctx.db.prepare("UPDATE epochs SET synced=1, goal_version_at_start=? WHERE epoch_id=?").run(r.json?.goal_version_at_start ?? null, p.body.epoch_id);
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
            : `Align: the server refused this binding (${r.json?.error || r.status}). Usage for this period stays private.`,
        );
        renderHot(ctx, lid);
        return;
      }
      throw new HttpError(r.status, r.json?.error ?? null, r.json);
    }
    case "receipt": {
      const r = await api(ctx, "POST", `/api/v2/directives/${enc(p.directive_id)}/receipts`, { body: p.body });
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
      if (r.status === 204 || r.status === 200 || r.status === 404) {
        forgetShare(ctx, lid);
        return;
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
}

const MAX_ROWS = 500;
const MAX_BYTES = 256 * 1024;

export async function uploadUsage(ctx: Ctx): Promise<{ uploaded: number; batches: number }> {
  const res = { uploaded: 0, batches: 0 };
  if (!signedIn(ctx.home)) return res;
  const shares = ctx.db.prepare("SELECT local_id, workspace_id, session_key FROM shares WHERE state='shared'").all() as { local_id: string; workspace_id: string; session_key: string }[];
  promoteSettled(ctx);
  for (const s of shares) {
    assignEpochs(ctx, s.local_id);
    const pendingOutbox = ctx.db.prepare("SELECT 1 FROM outbox WHERE local_id=? AND kind IN ('put_session','post_epoch') LIMIT 1").get(s.local_id);
    if (pendingOutbox) continue;
    for (;;) {
      const rows = ctx.db
        .prepare(
          `SELECT r.* FROM requests r JOIN epochs e ON e.epoch_id=r.epoch_id
           WHERE r.local_id=? AND r.uploaded=0 AND r.finalized=1 AND e.synced=1
           ORDER BY COALESCE(r.ts, r.created_at) LIMIT ?`,
        )
        .all(s.local_id, MAX_ROWS) as unknown as UploadRow[];
      if (!rows.length) break;
      const wire = rows.map((r) => ({
        request_key: r.request_key,
        ts: r.ts || r.created_at,
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
          if (r.json?.error === "sharing_stopped" || r.json?.error === "not_shared" || r.status === 404) {
            ctx.db.prepare("UPDATE shares SET state='stopped', stopped_at=COALESCE(stopped_at, ?) WHERE local_id=?").run(nowIso(), s.local_id);
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
  try {
    res.spooled += ingestSpool(ctx);
    res.tail = tailAll(ctx, opts.tailBudgetMs);
    res.spooled += ingestSpool(ctx);
    if (!signedIn(ctx.home)) return res;
    const refresh = new Set<string>();
    res.sent += (await flushOutbox(ctx)).sent;
    res.directives = await pollDirectives(ctx, (ws) => refresh.add(ws)).catch(() => 0);
    res.sent += (await flushOutbox(ctx)).sent;
    res.uploaded = (await uploadUsage(ctx)).uploaded;
    res.sent += (await flushOutbox(ctx)).sent;
    // Workspaces and grants change rarely; goals can change any time, and a new session reads its envelope from the
    // cached feed, so every pass revalidates the feeds (a 304 when nothing changed).
    let me = loadMe(ctx.home);
    if (opts.refreshFeeds || !me || Date.now() - Number(kvGet(ctx.db, "me_refreshed_at") || 0) >= ctx.config.goals_refresh_ms) {
      kvSet(ctx.db, "me_refreshed_at", String(Date.now()));
      me = await refreshMe(ctx).catch(() => me);
    }
    for (const w of me?.workspaces || []) refresh.add(w.id);
    for (const ws of refresh) await refreshFeed(ctx, ws).catch(() => undefined);
    // Asks between teams (a 304 when nothing changed): read by `align asks`, `align team` and the envelope.
    for (const ws of refresh) await fetchAsks(ctx, ws).catch(() => false);
    // Team activity: this machine's in-flight work up, other machines' down (a few hundred bytes when quiet).
    try {
      detectGitEdits(ctx);
    } catch {
      /* best effort */
    }
    res.activity = await uploadActivity(ctx).catch(() => 0);
    for (const ws of refresh) await fetchPod(ctx, ws).catch(() => 0);
    return res;
  } finally {
    try {
      writeJsonAtomic(layout.lastSync(ctx.home), { at: nowIso(), ms: Date.now() - t0, pid: process.pid });
      fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
}
