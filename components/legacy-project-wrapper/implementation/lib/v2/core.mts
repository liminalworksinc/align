import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SQLInputValue } from "node:sqlite";

// The parts of lib/v2 that the operator script (scripts/align-admin.mjs) runs outside the app, against the same
// database: the server secret, creation codes, access-request decisions, the workspace deletion path and the email
// API call. Node runs this file directly (type stripping), so it imports only Node's built-ins, uses no TypeScript
// that needs compiling (no enums or parameter properties), and takes its database as an argument: the app passes
// lib/v2/db.ts's helpers, the script its own connection. Every write here runs inside the caller's transaction.

/** The three statement helpers of lib/v2/db.ts, or the script's equivalent over its own connection. */
export interface Sql {
  run(sql: string, ...params: SQLInputValue[]): number;
  get<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[];
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
  return { request: r, code };
}

/** Decline a pending request. False when it is not pending. */
export function declineAccessRequest(db: Sql, id: string, now = Date.now()): boolean {
  return db.run("UPDATE v2_access_requests SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'pending'", new Date(now).toISOString(), id) === 1;
}

// ---- workspaces ----

/** Every workspace with its member and owner counts (no member names or emails). */
export function workspaceSummaries(db: Sql) {
  return db.all<{ id: string; name: string; created_at: string; members: number; owners: number }>(
    `SELECT w.id, w.name, w.created_at, COUNT(m.user_id) AS members, COALESCE(SUM(m.role = 'owner'), 0) AS owners
     FROM v2_workspaces w LEFT JOIN v2_members m ON m.ws_id = w.id GROUP BY w.id ORDER BY w.created_at, w.id`,
  );
}

/** The one workspace deletion path (DELETE /api/v2/workspaces/{ws} and `align-admin workspaces delete`). Its rows
 *  cascade from v2_workspaces; its connected AI apps, device grants and audit rows go too, and pairing requests forget
 *  it. False when there is no such workspace. */
export function removeWorkspace(db: Sql, wsId: string): boolean {
  db.run("DELETE FROM v2_oauth_grants WHERE ws_id = ?", wsId);
  db.run("DELETE FROM v2_device_grants WHERE ws_id = ?", wsId);
  db.run("DELETE FROM v2_audit WHERE ws_id = ?", wsId);
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
