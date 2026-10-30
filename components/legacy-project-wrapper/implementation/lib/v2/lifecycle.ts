import { revokeGrantsFor, revokeWorkspaceGrants } from "../oauth/grants";
import { run } from "./db";
import { deleteOrphanDirectives } from "./retention";

// What ends when a person stops being a member of a workspace, or when a workspace is deleted. Both run inside the
// caller's tx(), so the change and its effects commit together. Every route that removes a member (an owner removing
// them, leaving, deleting an account) or deletes a workspace calls these.
//
// Connected AI apps (v2_oauth_grants, lib/oauth/grants.ts) are bound to one person and one workspace: they are revoked
// here explicitly. The grant's foreign key to v2_members (and v2_workspaces) cascades as well, as a backstop.

/** A member was removed or left: their team memberships, their devices' grants and their connected AI apps for this
 *  workspace end. Their goals, sessions and history stay (pseudonymised 30 days later, lib/v2/retention.ts). */
export function onMemberRemoved(wsId: string, userId: string) {
  revokeGrantsFor(wsId, userId);
  run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = ?", wsId, userId);
  run("DELETE FROM v2_device_grants WHERE ws_id = ? AND device_id IN (SELECT id FROM v2_devices WHERE user_id = ?)", wsId, userId);
}

/** A workspace is being deleted (soft: lib/v2/workspaces.ts). Its connected AI apps are revoked now; its devices'
 *  grants stay but reach nothing while it is deleted (a restore brings them back); the retention job purges every row
 *  after the restore window (purgeWorkspace in lib/v2/retention.ts). */
export function onWorkspaceDeleted(wsId: string) {
  revokeWorkspaceGrants(wsId);
}

/** Delete a person's shared sessions in one workspace now (their epochs, usage, deliveries and receipts cascade).
 *  Spend already rolled up stays. Returns how many sessions were deleted. */
export function deleteMemberSessions(wsId: string, userId: string): number {
  const n = run("DELETE FROM v2_sessions WHERE ws_id = ? AND user_id = ?", wsId, userId);
  if (n) deleteOrphanDirectives();
  return n;
}
