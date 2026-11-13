'use strict';
function create_lifecycle(resources) {
  const { all, run, nowIso, revokeGrantsFor, endSessions, deleteOrphanDirectives } = resources;
  function onMemberRemoved(wsId, userId) {
    revokeGrantsFor(wsId, userId);
    const rows = all("SELECT ws_id, session_key FROM v2_sessions WHERE ws_id = ? AND user_id = ? AND state != 'stopped'", wsId, userId);
    endSessions(rows, 'member_removed', nowIso());
    run('DELETE FROM v2_pod_members WHERE ws_id = ? AND user_id = ?', wsId, userId);
    run('DELETE FROM v2_device_grants WHERE ws_id = ? AND device_id IN (SELECT id FROM v2_devices WHERE user_id = ?)', wsId, userId);
  }
  function deleteMemberSessions(wsId, userId) {
    const result = run('DELETE FROM v2_sessions WHERE ws_id = ? AND user_id = ?', wsId, userId);
    if (result) deleteOrphanDirectives();
    return result;
  }
  return { onMemberRemoved, deleteMemberSessions };
}
module.exports = { create_lifecycle };
