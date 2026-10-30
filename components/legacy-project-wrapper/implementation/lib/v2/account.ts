import { all, audit, get, LIVE_WS, run, tx } from "./db";
import { badRequest, conflict } from "./errors";
import { nowIso } from "./ids";
import { onMemberRemoved } from "./lifecycle";
import { noteDeparture, pseudonymise, workspacesNaming } from "./retention";
import { softDeleteWorkspace } from "./workspaces";
import type { WebPrincipal } from "./http";

// Deleting your own account (DELETE /api/v2/me, recent sign-in, the email typed to confirm). One transaction:
//   - refused (409 last_owner) while the person is the only owner of a workspace that has other members;
//   - a workspace where they are the only member is deleted with the account (soft: purged after 30 days);
//   - every membership ends the way member removal does (team places, device grants, connected AI apps);
//   - in every workspace whose rows name them, they become "Former member #n" at once (lib/v2/retention.ts), so goals,
//     change requests, alignments, sessions and spend stay for the others with no name or email;
//   - their devices, pairing requests, Better Auth sessions, linked accounts, passkeys (any ba_ table with a userId),
//     codes for their email and the user row are deleted; device-level audit rows lose their actor;
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
      if (m.live && !m.others) softDeleteWorkspace(m.ws_id, userId, at);
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
    for (const t of userTables()) run(`DELETE FROM ${t.name} WHERE userId = ?`, userId);
    run("DELETE FROM ba_user WHERE id = ?", userId);
    if (get("SELECT 1 AS x FROM ba_user WHERE id = ?", userId)) throw new Error("account not deleted");
    audit(null, null, "account.deleted", null, at);
  });
}
