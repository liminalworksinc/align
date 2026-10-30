import { revokeGrantsOfPerson } from "../oauth/grants";
import { softDeleteWorkspace } from "./core.mts";
import { all, audit, get, LIVE_WS, run, sql, tx } from "./db";
import { revokeDevicesOf } from "./devices";
import { badRequest, conflict, notFound } from "./errors";
import { nowIso } from "./ids";
import { onMemberRemoved } from "./lifecycle";
import { accessEmailKey, otpEmailKey } from "./limits";
import { noteDeparture, pseudonymise, workspacesNaming } from "./retention";
import type { WebPrincipal } from "./http";

// A person's own account (/app/account): their passkeys, the prompt to add one, and signing out everywhere.
// Passkeys live in Better Auth's ba_passkey and are added through its routes (/api/v2/auth/passkey/*, which need a
// recent sign-in: lib/v2/auth.ts). Listing, renaming and deleting are ours, so they answer in the v2 error envelope and
// deleting is audited. Passkey and account rows in the audit have no workspace, like device pairing.

export interface PasskeyRow {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

/** The person's passkeys, oldest first, with when each last signed them in (null: never). */
export function listPasskeys(userId: string): PasskeyRow[] {
  return all<PasskeyRow>(
    `SELECT p.id, p.name, p.createdAt AS created_at, u.last_used_at FROM ba_passkey p LEFT JOIN v2_passkey_use u ON u.passkey_id = p.id
     WHERE p.userId = ? ORDER BY p.createdAt, p.id`,
    userId,
  ).map((p) => ({ id: p.id, name: p.name || null, created_at: p.created_at, last_used_at: p.last_used_at }));
}

/** Show the "add a passkey" prompt: the person has no passkey and has not dismissed it. */
export function passkeyPromptDue(userId: string): boolean {
  return !get("SELECT 1 AS x FROM ba_passkey WHERE userId = ? LIMIT 1", userId) && !get("SELECT 1 AS x FROM v2_passkey_prompt_dismissed WHERE user_id = ?", userId);
}

/** "Not now" on the prompt: never shown to this person again (adding a passkey later is still on /app/account). */
export async function dismissPasskeyPrompt(userId: string) {
  await tx(() => run("INSERT INTO v2_passkey_prompt_dismissed (user_id, dismissed_at) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING", userId, nowIso()));
}

const ownPasskey = (userId: string, id: string) => !!get("SELECT 1 AS x FROM ba_passkey WHERE id = ? AND userId = ?", id, userId);

/** Rename one of the person's passkeys; someone else's (or an unknown id) is not found. */
export async function renamePasskey(userId: string, id: string, name: string) {
  const n = await tx(() => run("UPDATE ba_passkey SET name = ? WHERE id = ? AND userId = ?", name, id, userId));
  if (!n) throw notFound();
  return { id, name };
}

/** Delete one of the person's passkeys (the caller has checked the recent sign-in). Audited as passkey.deleted. */
export async function deletePasskey(userId: string, id: string) {
  const n = await tx(() => {
    if (!ownPasskey(userId, id)) return 0;
    run("DELETE FROM ba_passkey WHERE id = ?", id);
    audit(null, userId, "passkey.deleted", id, nowIso());
    return 1;
  });
  if (!n) throw notFound();
}

/** Sign out everywhere: every web session of the person ends (the caller's included). Optionally every paired device is
 *  revoked (device.revoked, reason signed_out_everywhere) and every connected AI app in every workspace is
 *  disconnected (oauth.app_revoked in that workspace). One transaction; the audit records
 *  account.signed_out_everywhere. Returns how many of each ended. */
export async function signOutEverywhere(userId: string, also: { devices: boolean; apps: boolean }) {
  const at = nowIso();
  return tx(() => {
    const sessions = run("DELETE FROM ba_session WHERE userId = ?", userId);
    const devices = also.devices ? revokeDevicesOf(userId, "signed_out_everywhere", userId) : 0;
    const apps = also.apps ? revokeGrantsOfPerson(userId, at) : 0;
    audit(null, userId, "account.signed_out_everywhere", userId, at);
    return { sessions, devices, apps };
  });
}

// ---- deleting the account ----

// Deleting your own account (DELETE /api/v2/me, recent sign-in, the email typed to confirm). One transaction:
//   - refused (409 last_owner) while the person is the only owner of a workspace that has other members;
//   - a workspace where they are the only member is deleted with the account (soft: purged after 30 days);
//   - every membership ends the way member removal does (team places, device grants, connected AI apps);
//   - in every workspace whose rows name them, they become "Former member #n" at once (lib/v2/retention.ts), so goals,
//     change requests, alignments, sessions and spend stay for the others with no name or email;
//   - their devices, pairing requests, Better Auth sessions, linked accounts, passkeys (any ba_ table with a userId)
//     with their "last used" times, their dismissal of the passkey prompt, codes for their email and the user row
//     are deleted; audit rows without a workspace (devices, passkeys, signing out everywhere) lose their actor;
//   - hosted access (PRESEED-002/003): their access requests are deleted; creation codes bound to their email are
//     deleted if unused, and a used one (the operator's record of what created a workspace) keeps no email or
//     redeemer; the durable rate-limit counters keyed by their email (an HMAC of it) are deleted;
//   - one audit row without a workspace, actor or email records that an account was deleted.

/** Live workspaces where this person is the only owner and someone else is a member. */
function soleOwnerWithOthers(userId: string) {
  return all<{ id: string; name: string }>(
    `SELECT w.id, w.name FROM v2_members m JOIN v2_workspaces w ON w.id = m.ws_id
     WHERE m.user_id = ? AND m.role = 'owner' AND w.deleted_at IS NULL
       AND (SELECT COUNT(*) FROM v2_members o WHERE o.ws_id = m.ws_id AND o.role = 'owner') = 1
       AND (SELECT COUNT(*) FROM v2_members o WHERE o.ws_id = m.ws_id) > 1
     ORDER BY w.name`,
    userId,
  );
}

function refuseLastOwner(userId: string) {
  const blocking = soleOwnerWithOthers(userId);
  if (blocking.length) {
    throw conflict(
      "last_owner",
      `You are the only owner of ${blocking.map((w) => w.name).join(", ")}, which ${blocking.length === 1 ? "has" : "have"} other members. Make someone else an owner, or delete the workspace, first.`,
    );
  }
}

const userTables = () =>
  all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ba\\_%' ESCAPE '\\' AND name <> 'ba_user'").filter((t) =>
    all<{ name: string }>(`PRAGMA table_info(${t.name})`).some((c) => c.name === "userId"),
  );

export async function deleteAccount(p: WebPrincipal, confirmEmail: string) {
  const userId = p.user.id;
  const email = p.user.email.trim().toLowerCase();
  if (confirmEmail.trim().toLowerCase() !== email) throw badRequest("Type your email address exactly to confirm");
  refuseLastOwner(userId);
  const at = nowIso();
  await tx(() => {
    refuseLastOwner(userId);
    const memberships = all<{ ws_id: string; live: number; others: number }>(
      `SELECT m.ws_id, ${LIVE_WS("m.ws_id")} AS live, (SELECT COUNT(*) FROM v2_members o WHERE o.ws_id = m.ws_id AND o.user_id <> m.user_id) AS others
       FROM v2_members m WHERE m.user_id = ?`,
      userId,
    );
    for (const m of memberships) {
      if (m.live && !m.others) softDeleteWorkspace(sql, m.ws_id, userId, at);
      onMemberRemoved(m.ws_id, userId);
      run("DELETE FROM v2_members WHERE ws_id = ? AND user_id = ?", m.ws_id, userId);
      noteDeparture(m.ws_id, userId, at);
      audit(m.ws_id, userId, "member.account_deleted", userId, at);
    }
    // Pseudonymise everywhere their rows are, including workspaces they left earlier.
    for (const ws of workspacesNaming(userId)) pseudonymise(ws, userId, at);
    run("DELETE FROM v2_invites WHERE lower(email) = ?", email);
    run("UPDATE v2_audit SET actor_id = NULL WHERE ws_id IS NULL AND actor_id = ?", userId);
    run("UPDATE v2_audit SET object_id = NULL WHERE ws_id IS NULL AND object_id = ?", userId);
    run("DELETE FROM v2_devices WHERE user_id = ?", userId); // tokens and grants cascade; sessions keep no device
    run("DELETE FROM v2_device_requests WHERE user_id = ?", userId);
    run("DELETE FROM v2_oauth_grants WHERE user_id = ?", userId);
    // Codes for their email (Better Auth names them <purpose>-otp-<email>).
    run("DELETE FROM ba_verification WHERE length(identifier) > length(?1) AND substr(identifier, -length(?1) - 1) = '-' || ?1", email);
    // Hosted access: requests, codes bound to their email, and email-keyed rate-limit counters.
    run("DELETE FROM v2_access_requests WHERE lower(email) = ?", email);
    run("DELETE FROM v2_creation_codes WHERE lower(email) = ? AND redeemed_at IS NULL", email);
    run("UPDATE v2_creation_codes SET email = NULL WHERE lower(email) = ?", email);
    run("UPDATE v2_creation_codes SET redeemed_by = NULL WHERE redeemed_by = ?", userId);
    run("DELETE FROM v2_rate_hits WHERE key IN (?, ?)", otpEmailKey(email), accessEmailKey(email));
    // Passkeys' "last used" times and the prompt dismissal (PRESEED-005). They also cascade from ba_passkey and ba_user;
    // deleting them by name keeps this list the complete record of what names the person.
    run("DELETE FROM v2_passkey_use WHERE passkey_id IN (SELECT id FROM ba_passkey WHERE userId = ?)", userId);
    run("DELETE FROM v2_passkey_prompt_dismissed WHERE user_id = ?", userId);
    for (const t of userTables()) run(`DELETE FROM ${t.name} WHERE userId = ?`, userId);
    run("DELETE FROM ba_user WHERE id = ?", userId);
    if (get("SELECT 1 AS x FROM ba_user WHERE id = ?", userId)) throw new Error("account not deleted");
    audit(null, null, "account.deleted", null, at);
  });
}
