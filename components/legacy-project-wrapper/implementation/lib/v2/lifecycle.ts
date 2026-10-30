import { all, run } from "./db";

// What ends when a person stops being a member of a workspace, or when a workspace is deleted. Both run inside the
// caller's tx(), so the change and its effects commit together.
//
// Extension point: OAuth grants for MCP apps are bound to one person and one workspace. When they live in the v2
// database (lib/v2 OAuth grants), revoke them here too: onMemberRemoved revokes the person's grants for wsId, and
// onWorkspaceDeleted revokes every grant for wsId. Nothing else needs to change: every route that removes a member
// or deletes a workspace already calls these.

/** A member was removed or left: their team memberships and their devices' grants for this workspace end. Their
 *  goals, sessions and history stay, attributed to them. */
export function onMemberRemoved(wsId: string, userId: string) {
  run("DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = ?", wsId, userId);
  run("DELETE FROM v2_device_grants WHERE ws_id = ? AND device_id IN (SELECT id FROM v2_devices WHERE user_id = ?)", wsId, userId);
}

/** A workspace is about to be deleted (its rows cascade from v2_workspaces). Its audit rows go too, and pairing
 *  requests forget it. */
export function onWorkspaceDeleted(wsId: string) {
  run("DELETE FROM v2_device_grants WHERE ws_id = ?", wsId);
  run("DELETE FROM v2_audit WHERE ws_id = ?", wsId);
  for (const r of all<{ id: string; ws_ids_json: string }>("SELECT id, ws_ids_json FROM v2_device_requests WHERE ws_ids_json IS NOT NULL")) {
    const ids = JSON.parse(r.ws_ids_json) as string[];
    if (ids.includes(wsId)) run("UPDATE v2_device_requests SET ws_ids_json = ? WHERE id = ?", JSON.stringify(ids.filter((w) => w !== wsId)), r.id);
  }
}
