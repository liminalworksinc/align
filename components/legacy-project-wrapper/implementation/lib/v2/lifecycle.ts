import { revokeGrantsFor } from "../oauth/grants";
import { all, run } from "./db";
import { nowIso } from "./ids";
import { endSessions } from "./sessions";
import { deleteOrphanDirectives } from "./retention";

// What ends when a person stops being a member of a workspace. It runs inside the caller's tx(), so the change and its
// effects commit together. Every route that removes a member (an owner removing them, leaving, deleting an account)
// calls it. Deleting a workspace is softDeleteWorkspace in lib/v2/core.mts, and purging one purgeWorkspace there, both
// shared with the operator script.
//
// Connected AI apps (v2_oauth_grants, lib/oauth/grants.ts) are bound to one person and one workspace: they are revoked
// here explicitly (and by softDeleteWorkspace). The grant's foreign key to v2_members (and v2_workspaces) cascades as
// well, as a backstop.

/** A member was removed or left: their team memberships, their devices' grants and their connected AI apps for this
 *  workspace end, and so do their live shared sessions there (ended_reason member_removed, as a revoked device's end:
 *  no device of theirs can fetch this workspace's directives any more, so nothing could deliver a stop, a resume or a
 *  release, and requests still waiting on them expire). Their goals, sessions and history stay (pseudonymised 30 days
 *  later, lib/v2/retention-core.mts). */
export function onMemberRemoved(wsId: string, userId: string) {
  revokeGrantsFor(wsId, userId);
  endSessions(all<{ ws_id: string; session_key: string }>("SELECT ws_id, session_key FROM v2_sessions WHERE ws_id = ? AND user_id = ? AND state <> 'stopped'", wsId, userId), "member_removed", nowIso());
  run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = ?", wsId, userId);
  run("DELETE FROM v2_device_grants WHERE ws_id = ? AND device_id IN (SELECT id FROM v2_devices WHERE user_id = ?)", wsId, userId);
}

/** Delete a person's shared sessions in one workspace now (their epochs, usage, deliveries and receipts cascade).
 *  Spend already rolled up stays. Returns how many sessions were deleted. */
export function deleteMemberSessions(wsId: string, userId: string): number {
  const n = run("DELETE FROM v2_sessions WHERE ws_id = ? AND user_id = ?", wsId, userId);
  if (n) deleteOrphanDirectives();
  return n;
}
