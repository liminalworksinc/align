import { revokeGrantsOfPerson } from "../oauth/grants";
import { all, audit, get, run, tx } from "./db";
import { revokeDevicesOf } from "./devices";
import { notFound } from "./errors";
import { nowIso } from "./ids";

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
