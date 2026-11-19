import { all, audit, get, run, tx } from "./db";
import { badRequest, notFound } from "./errors";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { authorize, type GoalObject, type PolicyPrincipal } from "./policy";
import { ID_RE, oneLine, type Body } from "./validate";
import { memberPrincipal, need } from "./workspaces";

export type CiSource = { kind: "ci"; repository: string; branch: string; check: string; stale_after_days?: number };
export type CommandSource = { kind: "command"; device_id: string; executable: string; args: string[]; stale_after_days?: number };
export type MeasureSource = CiSource | CommandSource;

export function exactFields(b: Body, allowed: string[], label: string) {
  if (Object.keys(b).some((k) => !allowed.includes(k))) throw badRequest(`Unexpected field in the ${label}.`);
}

/** CI identifiers are case-sensitive and are stored exactly as supplied. */
export function ciField(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw badRequest(`Enter a valid ${label}.`);
  return value;
}
export const REPOSITORY = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;
export const BRANCH = /^[a-zA-Z0-9_./-]{1,180}$/;
export const CHECK = /^[^\p{C}\r\n]{1,120}$/u;

export function parseMeasureSource(value: unknown): MeasureSource | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw badRequest("Choose a reading source.");
  const b = value as Body;
  const days = b.stale_after_days;
  if (days !== undefined && (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 366))
    throw badRequest("Stale after (days) must be a whole number from 1 to 366.");
  const freshness = days === undefined ? {} : { stale_after_days: days };
  if (b.kind === "ci") {
    exactFields(b, ["kind", "repository", "branch", "check", "stale_after_days"], "CI source");
    return {
      kind: "ci",
      repository: ciField(b.repository, REPOSITORY, "Repository (owner/name)"),
      branch: ciField(b.branch, BRANCH, "Branch"),
      check: ciField(b.check, CHECK, "CI check name"),
      ...freshness,
    };
  }
  if (b.kind === "command") {
    exactFields(b, ["kind", "device_id", "executable", "args", "stale_after_days"], "Command source");
    if (typeof b.device_id !== "string" || !ID_RE.test(b.device_id) || !b.device_id.startsWith("dv_"))
      throw badRequest("Enter a paired Machine ID.");
    if (typeof b.executable !== "string" || !/^\/[^\p{C}]{1,399}$/u.test(b.executable))
      throw badRequest("Executable path must be an absolute path.");
    if (!Array.isArray(b.args) || b.args.length > 20 || b.args.some((x) => typeof x !== "string" || x.length > 300 || /\p{C}/u.test(x)))
      throw badRequest("Arguments must contain at most 20 entries, each up to 300 characters.");
    return { kind: "command", device_id: b.device_id, executable: b.executable, args: b.args, ...freshness };
  }
  throw badRequest("Choose a reading source.");
}

export function commandReader(ws: string, deviceId: string, goal: GoalObject) {
  const device = get<{ user_id: string }>(
    `SELECT d.user_id FROM v2_devices d JOIN v2_device_grants g ON g.device_id = d.id
     WHERE g.ws_id = ? AND d.id = ? AND d.revoked_at IS NULL`, ws, deviceId,
  );
  if (!device) return null;
  const reader = memberPrincipal(ws, device.user_id);
  return authorize(reader, "goal.record_command_reading", goal).ok ? reader : null;
}

type Credential = { id: string; ws_id: string; label: string; created_at: string; created_by: string };
const PREFIX = "alnci_";

export function readingCredentials(pp: PolicyPrincipal) {
  need(pp, "workspace.manage");
  return all<Omit<Credential, "created_by" | "ws_id">>(
    "SELECT id, label, created_at FROM v2_reading_credentials WHERE ws_id = ? AND revoked_at IS NULL ORDER BY created_at DESC, id", pp.wsId,
  );
}

export async function issueReadingCredential(pp: PolicyPrincipal, b: Body) {
  exactFields(b, ["label"], "Credential");
  need(pp, "workspace.manage");
  const label = oneLine({ Label: b.label }, "Label", 80);
  return tx(() => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.manage");
    const id = newId("mrc");
    const secret = PREFIX + secretToken();
    const at = nowIso();
    run("INSERT INTO v2_reading_credentials (id, ws_id, token_hash, label, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      id, pp.wsId, sha256hex(secret), label, at, pp.userId);
    audit(pp.wsId, pp.userId, "measure.ci_credential_created", id, at);
    return { id, label, created_at: at, secret };
  });
}

export async function revokeReadingCredential(pp: PolicyPrincipal, id: string) {
  return tx(() => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.manage");
    const at = nowIso();
    const updated = run("UPDATE v2_reading_credentials SET revoked_at = ? WHERE id = ? AND ws_id = ? AND revoked_at IS NULL", at, id, pp.wsId);
    if (!updated) throw notFound();
    audit(pp.wsId, pp.userId, "measure.ci_credential_revoked", id, at);
  });
}

export function readingCredential(secret: string) {
  if (!/^alnci_[A-Za-z0-9_-]{43}$/.test(secret)) return undefined;
  return get<Credential>(
    "SELECT id, ws_id, label, created_at, created_by FROM v2_reading_credentials WHERE token_hash = ? AND revoked_at IS NULL",
    sha256hex(secret),
  );
}
