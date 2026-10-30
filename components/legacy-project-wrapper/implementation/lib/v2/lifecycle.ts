import { revokeGrantsFor } from "../oauth/grants";
import { run } from "./db";

// What ends when a person stops being a member of a workspace. It runs inside the caller's tx(), so the change and its
// effects commit together. Every route that removes a member (an owner removing them, or leaving) calls it. Deleting a
// workspace is removeWorkspace in lib/v2/core.mts, shared with the operator script.
//
// Connected AI apps (v2_oauth_grants, lib/oauth/grants.ts) are bound to one person and one workspace: they are revoked
// here explicitly (and by removeWorkspace). The grant's foreign key to v2_members (and v2_workspaces) cascades as
// well, as a backstop.

/** A member was removed or left: their team memberships, their devices' grants and their connected AI apps for this
 *  workspace end. Their goals, sessions and history stay, attributed to them. */
export function onMemberRemoved(wsId: string, userId: string) {
  revokeGrantsFor(wsId, userId);
  run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = ?", wsId, userId);
  run("DELETE FROM v2_device_grants WHERE ws_id = ? AND device_id IN (SELECT id FROM v2_devices WHERE user_id = ?)", wsId, userId);
}
