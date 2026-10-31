import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SQLInputValue } from "node:sqlite";

// The parts of lib/v2 that the operator script (scripts/align-admin.mjs) runs outside the app, against the same
// database: the schema version it expects, the settings both read (the session cap, the test switches), the server
// secret, creation codes, access-request decisions, workspace deletion (soft) and purging, and the email API call.
// The retention schedule, which also runs from the script, is lib/v2/retention-core.mts. Node runs this file directly (type stripping), so it imports only Node's built-ins, uses no TypeScript
// that needs compiling (no enums or parameter properties), and takes its database as an argument: the app passes
// lib/v2/db.ts's helpers, the script its own connection. Every write here runs inside the caller's transaction.

/** The three statement helpers of lib/v2/db.ts, or the script's equivalent over its own connection. */
export interface Sql {
  run(sql: string, ...params: SQLInputValue[]): number;
  get<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[];
}

/** The PRAGMA user_version of a fully migrated database (lib/v2/db.ts MIGRATIONS.length; db.ts checks they agree).
 *  The operator script refuses any other, so it never writes to a schema it doesn't know. */
export const SCHEMA_VERSION = 14;

// ---- settings shared with the operator script (lib/v2/config.ts re-exports these) ----

const hostedEnv = (env: NodeJS.ProcessEnv) => env.HOSTED === "1";

/** The local test identity provider (email + password sign-up). ALIGN_TEST_IDP=1, never when hosted. */
export const testIdpEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ALIGN_TEST_IDP === "1" && !hostedEnv(env);

const SESSION_MAX_DAYS = 30;
export const validMaxDays = (v: string) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 365;

/** The absolute session cap in days: ALIGN_SESSION_MAX_DAYS, a whole number from 1 to 365, default 30. A web session
 *  older than this is invalid however recently it was used. Hosted refuses a bad value at startup; Mode L ignores it.
 *  The retention job (server or script) deletes sessions older than this, so run the script with the server's
 *  environment. */
export function sessionMaxDays(env: NodeJS.ProcessEnv = process.env): number {
  const v = (env.ALIGN_SESSION_MAX_DAYS ?? "").trim();
  return v && validMaxDays(v) ? Number(v) : SESSION_MAX_DAYS;
}

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Random base32 (lowercase, RFC 4648 alphabet) from `bytes` random bytes. */
export function rand32(bytes = 15): string {
  const buf = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** ALIGN_SECRET, the server's own HMAC key. Hosted servers must set it (lib/config.ts); in Mode L, when it is unset,
 *  one is generated into <data>/.secret (0600) on first use. */
export function serverSecret(dataDir: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.ALIGN_SECRET) return env.ALIGN_SECRET;
  const file = path.join(dataDir, ".secret");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

/** HMAC-SHA256 of `payload` under `secret`, base64url. Callers domain-separate with a prefix (`alm.`, `alr.`, `alc.`). */
export const hmac = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

// ---- product events (v2_events, PRESEED-007) ----
// Content-free funnel events: what happened, in which workspace, when, and a keyed hash of who (so the operator's
// report can count distinct people without identifying anyone). props hold only the allowlisted keys below, each a
// fixed choice, a count or an opaque operator reference: never an email, name, title, goal text, URL, repository,
// code or token. The table is append-only (a trigger refuses changing name, at or props); the retention job deletes
// rows after 13 months, account deletion clears that person's actor, and purging a workspace replaces its id in them.

const HARNESSES = ["claude-code", "codex"] as const;
/** An operator's own reference for an LOI (a file or CRM id): letters, digits and . _ : -, up to 64; no @ or /, so it
 *  can't be an email address or a URL. */
export const NOTE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
type PropRule = readonly string[] | "count" | RegExp;
/** How long a decision would have taken without Align, as the person who reports it estimates (one per person per
 *  approved change request in v2_value_reports; the value_reported event carries only this). */
export const ESTIMATES = ["same_day", "two_to_three_days", "about_a_week", "longer", "would_not_be_decided"] as const;

/** Every event name and the props it may carry. */
export const EVENT_PROPS = {
  access_requested: { interest: ["try", "evaluate"], via: ["form", "value_card"] },
  access_approved: {},
  access_declined: {},
  code_created: { source: ["request", "operator"] },
  code_redeemed: {},
  workspace_created: { kind: ["blank", "sample"] },
  invite_sent: { role: ["owner", "member", "viewer"] },
  invite_accepted: { role: ["owner", "member", "viewer"] },
  device_paired: { workspaces: "count" },
  first_session_captured: { harness: HARNESSES },
  member_first_session_captured: { harness: HARNESSES },
  first_session_bound: { harness: HARNESSES, authority: ["own", "pod", "alignment"] },
  second_member_joined: {},
  first_change_request: {},
  first_approval: {},
  first_directive: { kind: ["goal_version", "binding_changed", "binding_suspended", "stop", "resume", "request", "hold", "release"] },
  first_mcp_read: { client: ["app", "device"] },
  loi_sent: { note_ref: NOTE_REF_RE },
  loi_signed: { note_ref: NOTE_REF_RE, verified_original: ["yes"] },
  first_ask: {},
  first_limit: {},
  value_card_viewed: {},
  value_reported: { estimate: ESTIMATES },
  follow_up_clicked: {},
  first_request: { type: ["replan", "checkpoint", "switch_goal"] },
  first_hold: {},
  first_launch: {},
} as const satisfies Record<string, Record<string, PropRule>>;
export type EventName = keyof typeof EVENT_PROPS;
export type EventProps = Record<string, string | number>;

/** Recorded at most once per workspace (the unique index v2_events_once_ws in lib/v2/db.ts lists the same names). */
export const ONCE_PER_WORKSPACE: readonly EventName[] = [
  "workspace_created",
  "code_redeemed",
  "first_session_captured",
  "first_session_bound",
  "second_member_joined",
  "first_change_request",
  "first_approval",
  "first_directive",
  "first_mcp_read",
  "loi_sent",
  "loi_signed",
  "first_ask",
  "first_limit",
  "first_request",
  "first_hold",
  "first_launch",
];

/** Recorded at most once per person in a workspace (the unique index v2_events_once_person in lib/v2/db.ts lists the
 *  same names; a row with no actor is never refused by it). */
export const ONCE_PER_PERSON: readonly EventName[] = ["member_first_session_captured", "value_card_viewed", "value_reported", "follow_up_clicked"];

/** The keyed hash that stands for a person in v2_events: HMAC of their user id under the server secret (`ale.`). It
 *  can't be reversed, and without the secret it can't be matched to an id. */
export const eventActor = (secret: string, userId: string) => hmac(secret, `ale.${userId}`);

function checkProps(name: EventName, props: EventProps) {
  const rules = EVENT_PROPS[name] as Record<string, PropRule>;
  if (!rules) throw new Error(`Unknown event ${name}`);
  for (const [k, v] of Object.entries(props)) {
    const rule = rules[k];
    const ok =
      rule === "count"
        ? Number.isInteger(v) && (v as number) >= 0
        : rule instanceof RegExp
          ? typeof v === "string" && rule.test(v)
          : Array.isArray(rule) && rule.includes(v as string);
    if (!ok) throw new Error(`Event ${name} can't carry ${k}`);
  }
}

/** Append one event (inside the caller's transaction). A once-per-workspace event (ONCE_PER_WORKSPACE) or a
 *  once-per-person event (ONCE_PER_PERSON) that is already there is skipped. True when a row was added. */
export function recordEvent(db: Sql, name: EventName, o: { ws?: string | null; actor?: string | null; props?: EventProps; at?: string } = {}): boolean {
  const props = o.props ?? {};
  checkProps(name, props);
  return (
    db.run(
      "INSERT INTO v2_events (name, ws_id, actor, at, props) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
      name,
      o.ws ?? null,
      o.actor ?? null,
      o.at ?? new Date().toISOString(),
      JSON.stringify(props),
    ) === 1
  );
}

// ---- creation codes (v2_creation_codes) ----
// A creation code lets one hosted workspace be created (lib/v2/creation.ts). It is shown once, when it is made; only
// its HMAC is stored. Single use, it expires (14 days by default), and it can be bound to one email address, which
// then must be the signed-in person's verified email.

export const CODE_PREFIX = "alc_";
export const CODE_RE = /^alc_[a-z2-7]{32}$/;
export const CODE_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

export const codeHash = (secret: string, code: string) => hmac(secret, `alc.${code}`);

export interface NewCode {
  id: string;
  code: string;
  email: string | null;
  expires_at: string;
}

/** A new code: its id and the code itself (returned only here). `email`, when given, binds it to that address. */
export function insertCreationCode(db: Sql, secret: string, o: { email?: string | null; days?: number; requestId?: string | null }, now = Date.now()): NewCode {
  const id = `cc_${rand32(15)}`;
  const code = `${CODE_PREFIX}${rand32(20)}`;
  const email = o.email ? o.email.trim().toLowerCase() : null;
  const expires = new Date(now + (o.days ?? CODE_DAYS) * DAY_MS).toISOString();
  db.run(
    "INSERT INTO v2_creation_codes (id, code_hash, email, request_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    codeHash(secret, code),
    email,
    o.requestId ?? null,
    new Date(now).toISOString(),
    expires,
  );
  recordEvent(db, "code_created", { props: { source: o.requestId ? "request" : "operator" }, at: new Date(now).toISOString() });
  return { id, code, email, expires_at: expires };
}

export interface CodeRow {
  id: string;
  email: string | null;
  request_id: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
  ws_id: string | null;
}

/** Every code, newest first, without any secret: id, binding, dates and what it created. */
export function listCreationCodes(db: Sql): (CodeRow & { state: "live" | "used" | "revoked" | "expired" })[] {
  const now = new Date().toISOString();
  return db
    .all<CodeRow>("SELECT id, email, request_id, created_at, expires_at, revoked_at, redeemed_at, ws_id FROM v2_creation_codes ORDER BY created_at DESC, id")
    .map((r) => ({ ...r, state: r.redeemed_at ? "used" : r.revoked_at ? "revoked" : r.expires_at <= now ? "expired" : "live" }));
}

/** Revoke a code that has not been used. False when there is no such unused, unrevoked code. */
export function revokeCreationCode(db: Sql, id: string, now = Date.now()): boolean {
  return db.run("UPDATE v2_creation_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND redeemed_at IS NULL", new Date(now).toISOString(), id) === 1;
}

/** Spend a code for workspace `wsId`, in one statement: it must exist, be unused, unrevoked and unexpired, and be
 *  unbound or bound to `email`. True when it was spent. */
export function redeemCreationCode(db: Sql, secret: string, code: string, email: string, userId: string, wsId: string, now = Date.now()): boolean {
  if (!CODE_RE.test(code)) return false;
  const at = new Date(now).toISOString();
  return (
    db.run(
      `UPDATE v2_creation_codes SET redeemed_at = ?, redeemed_by = ?, ws_id = ?
       WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ? AND (email IS NULL OR email = ?)`,
      at,
      userId,
      wsId,
      codeHash(secret, code),
      at,
      email.toLowerCase(),
    ) === 1
  );
}

/** Is there a usable code bound to this (normalized) email? */
export function liveCodeFor(db: Sql, email: string, now = Date.now()): boolean {
  return !!db.get("SELECT 1 AS x FROM v2_creation_codes WHERE email = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?", email, new Date(now).toISOString());
}

// ---- access requests (v2_access_requests) ----

export type RequestStatus = "pending" | "approved" | "declined";
export const REQUEST_STATUSES: readonly RequestStatus[] = ["pending", "approved", "declined"];

export interface AccessRequestRow {
  id: string;
  email: string;
  name: string;
  company: string | null;
  team_size: string | null;
  use_case: string;
  interest: "try" | "evaluate";
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  code_id: string | null;
}

export function listAccessRequests(db: Sql, status?: RequestStatus): AccessRequestRow[] {
  return status
    ? db.all<AccessRequestRow>("SELECT * FROM v2_access_requests WHERE status = ? ORDER BY created_at, id", status)
    : db.all<AccessRequestRow>("SELECT * FROM v2_access_requests ORDER BY created_at, id");
}

export const accessRequest = (db: Sql, id: string) => db.get<AccessRequestRow>("SELECT * FROM v2_access_requests WHERE id = ?", id);

/** Approve a pending request: a code bound to its email, recorded on the request. Null when it is not pending. */
export function approveAccessRequest(db: Sql, secret: string, id: string, days = CODE_DAYS, now = Date.now()): { request: AccessRequestRow; code: NewCode } | null {
  const r = accessRequest(db, id);
  if (!r || r.status !== "pending") return null;
  const code = insertCreationCode(db, secret, { email: r.email, days, requestId: r.id }, now);
  db.run("UPDATE v2_access_requests SET status = 'approved', decided_at = ?, code_id = ? WHERE id = ?", new Date(now).toISOString(), code.id, id);
  recordEvent(db, "access_approved", { at: new Date(now).toISOString() });
  return { request: r, code };
}

/** Decline a pending request. False when it is not pending. */
export function declineAccessRequest(db: Sql, id: string, now = Date.now()): boolean {
  const at = new Date(now).toISOString();
  if (db.run("UPDATE v2_access_requests SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'pending'", at, id) !== 1) return false;
  recordEvent(db, "access_declined", { at });
  return true;
}

/** Undo an approval whose email could not be sent (scripts/align-admin.mjs): the code is revoked, the request is
 *  pending again, and the approval's two events (the code made, the approval, both at its decided_at) are taken back,
 *  so nothing half-done counts. Inside the caller's transaction. */
export function undoApproval(db: Sql, requestId: string, codeId: string) {
  const at = accessRequest(db, requestId)?.decided_at;
  revokeCreationCode(db, codeId);
  db.run("UPDATE v2_access_requests SET status = 'pending', decided_at = NULL, code_id = NULL WHERE id = ?", requestId);
  if (!at) return;
  for (const name of ["access_approved", "code_created"]) {
    db.run("DELETE FROM v2_events WHERE id = (SELECT id FROM v2_events WHERE name = ? AND at = ? ORDER BY id DESC LIMIT 1)", name, at);
  }
}

// ---- workspaces ----

export const RESTORE_DAYS = 30;

/** Every workspace with its member and owner counts (no member names or emails) and, for a deleted one, when. */
export function workspaceSummaries(db: Sql) {
  return db.all<{ id: string; name: string; created_at: string; deleted_at: string | null; members: number; owners: number }>(
    `SELECT w.id, w.name, w.created_at, w.deleted_at, COUNT(m.user_id) AS members, COALESCE(SUM(m.role = 'owner'), 0) AS owners
     FROM v2_workspaces w LEFT JOIN v2_members m ON m.ws_id = w.id GROUP BY w.id ORDER BY w.created_at, w.id`,
  );
}

const auditRow = (db: Sql, ws: string | null, actor: string | null, action: string, objectId: string | null, at: string) =>
  db.run("INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, ?, ?, ?, ?)", ws, actor, action, objectId, at);

/** The one deletion path (DELETE /api/v2/workspaces/{ws}, account deletion, `align-admin workspaces delete`): a soft
 *  delete. The workspace is unreachable to everyone at once (404 everywhere, devices stop syncing it) and its connected
 *  AI apps are revoked; its devices' grants stay but reach nothing (a restore brings them back). Its owners can restore
 *  it for RESTORE_DAYS; then the retention job purges it (purgeWorkspace). `actor` is null for the operator. False
 *  when there is no such live workspace. */
export function softDeleteWorkspace(db: Sql, wsId: string, actor: string | null, at: string): boolean {
  if (db.run("UPDATE v2_workspaces SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", at, wsId) !== 1) return false;
  db.run("DELETE FROM v2_oauth_grants WHERE ws_id = ?", wsId);
  auditRow(db, wsId, actor, "workspace.deleted", wsId, at);
  return true;
}

/** Every row of a workspace, at once and for good (the retention job after the restore window, and `align-admin
 *  workspaces delete --purge`): its rows cascade from v2_workspaces; its connected AI apps, change-request evidence,
 *  devices' grants and audit rows go too, and pairing requests and the creation code that made it forget it (the
 *  code stays used, so no row anywhere names the workspace); its product events stay under a fresh random id
 *  (wsx_…). False when there is no such workspace. */
export function purgeWorkspace(db: Sql, wsId: string): boolean {
  db.run("DELETE FROM v2_oauth_grants WHERE ws_id = ?", wsId);
  db.run("DELETE FROM v2_change_request_evidence WHERE ws_id = ?", wsId); // cascades too; said here for the record
  db.run("UPDATE v2_creation_codes SET ws_id = NULL WHERE ws_id = ?", wsId);
  db.run("DELETE FROM v2_device_grants WHERE ws_id = ?", wsId);
  db.run("DELETE FROM v2_audit WHERE ws_id = ?", wsId);
  // Its product events stay for the metrics (they hold no content), under a random id that names nothing.
  db.run("UPDATE v2_events SET ws_id = ? WHERE ws_id = ?", `wsx_${rand32(15)}`, wsId);
  for (const r of db.all<{ id: string; ws_ids_json: string }>("SELECT id, ws_ids_json FROM v2_device_requests WHERE ws_ids_json IS NOT NULL")) {
    const ids = JSON.parse(r.ws_ids_json) as string[];
    if (ids.includes(wsId)) db.run("UPDATE v2_device_requests SET ws_ids_json = ? WHERE id = ?", JSON.stringify(ids.filter((w) => w !== wsId)), r.id);
  }
  return db.run("DELETE FROM v2_workspaces WHERE id = ?", wsId) === 1;
}

// ---- email ----

export interface EmailApi {
  url: string;
  key: string;
  from: string;
}

const EMAIL_TIMEOUT_MS = 10_000;

/** One message through the Resend-compatible email API: an HTTPS POST of {from, to, subject, text} with the Bearer
 *  key, 10 s timeout. Throws on a failure; logs only the HTTP status or the error's name, never the address, text or
 *  key. `what` names the message in that log line ("Sign-in email"). */
export async function postEmail(api: EmailApi, msg: { to: string; subject: string; text: string }, what: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(api.url, {
      method: "POST",
      headers: { authorization: `Bearer ${api.key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: api.from, to: msg.to, subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (e) {
    console.error(`${what} failed:`, (e as Error)?.name ?? "unknown");
    throw new Error(`The ${what.toLowerCase()} could not be sent`);
  }
  await res.body?.cancel().catch(() => undefined);
  if (!res.ok) {
    console.error(`${what} failed: HTTP`, res.status);
    throw new Error(`The ${what.toLowerCase()} could not be sent`);
  }
}

/** The message that carries an approved request's creation code. */
export function codeEmail(origin: string, name: string, code: NewCode): { subject: string; text: string } {
  const signIn = `${origin}/app/sign-in?${new URLSearchParams({ email: code.email ?? "" })}`;
  return {
    subject: "Your Align workspace creation code",
    text: [
      `Hi ${name},`,
      "",
      "Thanks for asking to try Align. You can now create a workspace.",
      "",
      `1. Sign in as ${code.email}: ${signIn}`,
      `2. Under "Create a workspace", enter a name and this creation code: ${code.code}`,
      "",
      `The code works once, only for ${code.email}, until ${code.expires_at.slice(0, 10)}.`,
      "",
      "If you didn't ask for access to Align, ignore this email.",
    ].join("\n"),
  };
}
