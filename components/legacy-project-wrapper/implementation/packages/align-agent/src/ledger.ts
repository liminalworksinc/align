// Local usage ledger: one row per provider request across transcripts and rollouts, plus root turns and epochs.
import fs from "node:fs";
import path from "node:path";
import type { Ctx } from "./context.ts";
import { bumpGap, kvGet, kvSet, nowIso, type Db } from "./db.ts";
import { requestKey } from "./keys.ts";
import { localId } from "./shared/layout.ts";
import type { Harness } from "./shared/types.ts";
import type { ParsedEvent, UsageEvent } from "./spend/events.ts";
import { PRICE_TABLE_VERSION, priceRequest } from "./spend/prices.ts";

export type Basis = "api_usd" | "subscription_included" | "workspace_credits" | "estimated_list_usd" | "unknown";

export interface SessionRow {
  local_id: string;
  harness: Harness;
  native_id: string;
  cwd: string | null;
  started_at: string | null;
  last_active: string | null;
  api_key_env: number;
  cloud_env: number;
  hooked: number;
  model: string | null;
  last_source: string | null;
}

export function ensureSession(db: Db, harness: Harness, nativeId: string, info: { cwd?: string | null; ts?: string | null } = {}): string {
  const lid = localId(harness, nativeId);
  const ts = info.ts || null;
  db.prepare(
    `INSERT INTO sessions(local_id, harness, native_id, cwd, started_at, last_active, created_at) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(local_id) DO UPDATE SET
       cwd = COALESCE(sessions.cwd, excluded.cwd),
       started_at = CASE WHEN excluded.started_at IS NOT NULL AND (sessions.started_at IS NULL OR excluded.started_at < sessions.started_at) THEN excluded.started_at ELSE sessions.started_at END,
       last_active = CASE WHEN excluded.last_active IS NOT NULL AND (sessions.last_active IS NULL OR excluded.last_active > sessions.last_active) THEN excluded.last_active ELSE sessions.last_active END`,
  ).run(lid, harness, nativeId, info.cwd || null, ts, ts, nowIso());
  if (info.cwd) noteCwd(db, lid, info.cwd);
  return lid;
}

/**
 * The session's first folder is `sessions.cwd`; any other folder it later reported is kept in kv `cwds:<lid>` (at most
 * 8), so `align share --dir --past` can require every folder a session worked in to be inside the shared one.
 */
function noteCwd(db: Db, lid: string, cwd: string): void {
  const first = (db.prepare("SELECT cwd FROM sessions WHERE local_id=?").get(lid) as { cwd: string | null } | undefined)?.cwd;
  if (!first || first === cwd) return;
  const key = `cwds:${lid}`;
  const list = JSON.parse(kvGet(db, key) || "[]") as string[];
  if (list.includes(cwd) || list.length >= 8) return;
  kvSet(db, key, JSON.stringify([...list, cwd]));
}

/** Every folder a session reported: its first, then any others. */
export function sessionCwds(db: Db, lid: string, first: string | null): string[] {
  return [...(first ? [first] : []), ...(JSON.parse(kvGet(db, `cwds:${lid}`) || "[]") as string[])];
}

export function getSession(db: Db, lid: string): SessionRow | null {
  return (db.prepare("SELECT * FROM sessions WHERE local_id=?").get(lid) as unknown as SessionRow) || null;
}

// ---------- basis ----------
let claudeJsonCache: { file: string; at: number; oauth: boolean } | null = null;
function claudeOauth(file: string): boolean {
  if (claudeJsonCache && claudeJsonCache.file === file && Date.now() - claudeJsonCache.at < 60_000) return claudeJsonCache.oauth;
  let oauth = false;
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    oauth = !!(j && typeof j === "object" && j.oauthAccount && typeof j.oauthAccount === "object");
  } catch {
    oauth = false;
  }
  claudeJsonCache = { file, at: Date.now(), oauth };
  return oauth;
}

export function codexAuthMode(codexHome: string): "chatgpt" | "apikey" | "unknown" {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(codexHome, "auth.json"), "utf8"));
    if (j?.auth_mode === "chatgpt") return "chatgpt";
    if (j?.auth_mode === "apikey" || (typeof j?.OPENAI_API_KEY === "string" && j.OPENAI_API_KEY)) return "apikey";
    if (j?.tokens) return "chatgpt";
  } catch {
    /* unknown */
  }
  return "unknown";
}

export function basisFor(ctx: Ctx, harness: Harness, lid: string): Basis {
  const s = getSession(ctx.db, lid);
  if (harness === "claude-code") {
    if (s && (s.api_key_env || s.cloud_env)) return "api_usd";
    return claudeOauth(ctx.paths.claudeJson) ? "subscription_included" : "api_usd";
  }
  const mode = codexAuthMode(ctx.paths.codexHome);
  return mode === "chatgpt" ? "subscription_included" : mode === "apikey" ? "api_usd" : "unknown";
}

// ---------- requests ----------
interface ReqRow {
  request_key: string;
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_write_unsplit: number;
  counts_valid: number;
  source: string;
  finalized: number;
  uploaded: number;
  root_turn: string | null;
  conflict: number;
}


function sameValues(a: ReqRow, ev: UsageEvent): boolean {
  const c = ev.counts;
  if (!c) return a.counts_valid === 0 && a.model === ev.model;
  return (
    a.counts_valid === 1 &&
    a.model === ev.model &&
    a.input === c.input &&
    a.output === c.output &&
    a.cache_read === c.cache_read &&
    a.cache_write_5m === c.cache_write_5m &&
    a.cache_write_1h === c.cache_write_1h &&
    a.cache_write_unsplit === c.cache_write_unsplit
  );
}

export type UpsertResult = "inserted" | "replaced" | "kept" | "conflict";

export function upsertRequest(ctx: Ctx, ev: UsageEvent): UpsertResult {
  const db = ctx.db;
  const lid = ensureSession(db, ev.harness, ev.native_session_id, { ts: ev.ts });
  const key = requestKey(ctx.secret, ev.provider, ev.provider_id);
  const existing = db.prepare("SELECT * FROM requests WHERE request_key=?").get(key) as unknown as ReqRow | undefined;
  if (existing) {
    const same = sameValues(existing, ev);
    if (!existing.root_turn && ev.root_turn) {
      db.prepare("UPDATE requests SET root_turn=? WHERE request_key=?").run(ev.root_turn, key);
    }
    if (existing.uploaded !== 0) {
      if (!same && ev.finalized) {
        db.prepare("UPDATE requests SET conflict=conflict+1 WHERE request_key=?").run(key);
        return "conflict";
      }
      return "kept";
    }
    const oldRank = existing.finalized === 1 ? 1 : 0;
    const newRank = ev.finalized ? 1 : 0;
    if (newRank > oldRank || (newRank === oldRank && !ev.finalized)) {
      writeRow(ctx, key, lid, ev, existing.root_turn, "replace");
      return "replaced";
    }
    if (newRank === oldRank && ev.finalized && !same && existing.source === ev.source) {
      db.prepare("UPDATE requests SET conflict=conflict+1 WHERE request_key=?").run(key);
      bumpGap(db, "request_usage_conflict");
      return "conflict";
    }
    return "kept";
  }
  writeRow(ctx, key, lid, ev, null, "insert");
  return "inserted";
}

function writeRow(ctx: Ctx, key: string, lid: string, ev: UsageEvent, priorRoot: string | null, mode: "insert" | "replace"): void {
  const c = ev.counts;
  const price = c ? priceRequest(ev.model, c, ev.total_input) : { est_list_usd_micros: null, unpriced: "invalid_counters" as const };
  const basis = basisFor(ctx, ev.harness, lid);
  const now = nowIso();
  const vals = [
    ev.provider,
    lid,
    ev.harness,
    ev.ts,
    ev.model,
    ev.query_source,
    c?.input ?? 0,
    c?.output ?? 0,
    c?.cache_read ?? 0,
    c?.cache_write_5m ?? 0,
    c?.cache_write_1h ?? 0,
    c?.cache_write_unsplit ?? 0,
    c ? 1 : 0,
    basis,
    price.est_list_usd_micros,
    price.unpriced,
    PRICE_TABLE_VERSION,
    ev.source,
    ev.root_turn || priorRoot,
    ev.finalized ? 1 : 0,
    ev.harness_cost_usd_micros ?? null,
    ev.retract_group ?? null,
  ] as const;
  if (mode === "insert") {
    ctx.db
      .prepare(
        `INSERT INTO requests(provider, local_id, harness, ts, model, query_source, input, output, cache_read, cache_write_5m, cache_write_1h,
          cache_write_unsplit, counts_valid, basis, est_list_usd_micros, unpriced, price_table_version, source, root_turn, finalized,
          harness_cost_usd_micros, retract_group, request_key, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(...vals, key, now, now);
  } else {
    ctx.db
      .prepare(
        `UPDATE requests SET provider=?, local_id=?, harness=?, ts=?, model=?, query_source=?, input=?, output=?, cache_read=?, cache_write_5m=?,
          cache_write_1h=?, cache_write_unsplit=?, counts_valid=?, basis=?, est_list_usd_micros=?, unpriced=?, price_table_version=?, source=?,
          root_turn=?, finalized=?, harness_cost_usd_micros=?, retract_group=?, epoch_id=NULL, updated_at=? WHERE request_key=?`,
      )
      .run(...vals, now, key);
  }
}

/** Hook spool root turns are authoritative (their time equals the epoch start the hook opened); others only fill gaps. */
export function recordRootTurn(db: Db, harness: Harness, nativeId: string, rootTurn: string, ts: string, cwd?: string | null, authoritative = false): string {
  const lid = ensureSession(db, harness, nativeId, { ts, cwd: cwd ?? null });
  if (authoritative) {
    db.prepare("INSERT INTO root_turns(local_id, root_turn, ts) VALUES(?,?,?) ON CONFLICT(local_id, root_turn) DO UPDATE SET ts=excluded.ts").run(lid, rootTurn, ts);
  } else {
    db.prepare("INSERT OR IGNORE INTO root_turns(local_id, root_turn, ts) VALUES(?,?,?)").run(lid, rootTurn, ts);
  }
  return lid;
}

/** Apply parsed events from any source. Returns counts for diagnostics. */
export function applyEvents(ctx: Ctx, events: ParsedEvent[]): { requests: number; roots: number; gaps: number } {
  const out = { requests: 0, roots: 0, gaps: 0 };
  for (const ev of events) {
    switch (ev.kind) {
      case "request":
        upsertRequest(ctx, ev);
        out.requests++;
        break;
      case "root_turn":
        recordRootTurn(ctx.db, ev.harness, ev.native_session_id, ev.root_turn, ev.ts);
        out.roots++;
        break;
      case "session":
        ensureSession(ctx.db, ev.harness, ev.native_session_id, { cwd: ev.cwd, ts: ev.ts });
        break;
      case "gap":
        bumpGap(ctx.db, ev.reason);
        out.gaps++;
        break;
      case "retract":
        ctx.db.prepare("DELETE FROM requests WHERE retract_group=? AND uploaded=0").run(ev.group);
        break;
    }
  }
  return out;
}

// ---------- epochs ----------
export interface EpochRow {
  epoch_id: string;
  local_id: string;
  workspace_id: string;
  goal_id: string | null;
  starts_at: string;
  root_turn: string | null;
  cause: string;
  synced: number;
}

/**
 * The epoch active at a request's root turn. Root turn time comes from the hook spool or transcript prompts; when the
 * root turn is unknown the request's own timestamp is used. Epochs opened at a root turn start at that turn's time.
 */
export function epochFor(db: Db, lid: string, rootTurn: string | null, ts: string | null): EpochRow | null {
  let at: string | null = null;
  if (rootTurn) {
    const e = db.prepare("SELECT * FROM epochs WHERE local_id=? AND root_turn=? ORDER BY rowid DESC LIMIT 1").get(lid, rootTurn) as unknown as EpochRow | undefined;
    if (e) return e;
    const r = db.prepare("SELECT ts FROM root_turns WHERE local_id=? AND root_turn=?").get(lid, rootTurn) as { ts: string } | undefined;
    if (r) at = r.ts;
  }
  if (!at) at = ts;
  if (!at) return null;
  return (
    (db
      .prepare("SELECT * FROM epochs WHERE local_id=? AND starts_at<=? ORDER BY starts_at DESC, rowid DESC LIMIT 1")
      .get(lid, at) as unknown as EpochRow | undefined) || null
  );
}
