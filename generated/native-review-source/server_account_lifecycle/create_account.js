'use strict';
function create_account(resources) {
  const { all, get, run, tx, audit, LIVE_WS, sql, softDeleteWorkspace,
    revokeDevicesOf, revokeGrantsOfPerson, actorOf, badRequest, conflict,
    notFound, nowIso, onMemberRemoved, accessEmailKey, otpEmailKey,
    noteDeparture, pseudonymise, workspacesNaming } = resources;
  function listPasskeys(userId) {
    return all('SELECT p.id, p.name, p.createdAt AS created_at, u.last_used_at FROM ba_passkey p LEFT JOIN v2_passkey_use u ON u.passkey_id = p.id WHERE p.userId = ? ORDER BY p.createdAt, p.id', userId)
      .map(row => ({ id: row.id, name: row.name || null, created_at: row.created_at, last_used_at: row.last_used_at }));
  }
  function passkeyPromptDue(userId) {
    return !get('SELECT id FROM ba_passkey WHERE userId = ? LIMIT 1', userId) &&
      !get('SELECT user_id FROM v2_passkey_prompt_dismissed WHERE user_id = ?', userId);
  }
  async function dismissPasskeyPrompt(userId) {
    await tx(() => run('INSERT OR IGNORE INTO v2_passkey_prompt_dismissed (user_id, dismissed_at) VALUES (?, ?)', userId, nowIso()));
  }
  async function renamePasskey(userId, id, name) {
    const result = await tx(() => run('UPDATE ba_passkey SET name = ? WHERE id = ? AND userId = ?', name, id, userId));
    if (!result) throw notFound();
    return { id, name };
  }
  async function deletePasskey(userId, id) {
    const result = await tx(() => {
      if (!get('SELECT id FROM ba_passkey WHERE id = ? AND userId = ?', id, userId)) return 0;
      run('DELETE FROM ba_passkey WHERE id = ? AND userId = ?', id, userId);
      audit(null, userId, 'passkey.deleted', id, nowIso());
      return 1;
    });
    if (!result) throw notFound();
  }
  async function signOutEverywhere(userId, also) {
    const at = nowIso();
    return await tx(() => {
      const sessions = run('DELETE FROM ba_session WHERE userId = ?', userId);
      const devices = also.devices ? revokeDevicesOf(userId, 'signed_out_everywhere', userId) : 0;
      const apps = also.apps ? revokeGrantsOfPerson(userId, at) : 0;
      audit(null, userId, 'account.signed_out_everywhere', userId, at);
      return { sessions, devices, apps };
    });
  }
  function refuseSoleOwner(userId) {
    const blocked = all("SELECT w.name FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id WHERE m.user_id = ? AND m.role = 'owner' AND w.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM v2_members o WHERE o.ws_id = w.id AND o.role = 'owner' AND o.user_id != ?) AND EXISTS (SELECT 1 FROM v2_members x WHERE x.ws_id = w.id AND x.user_id != ?) ORDER BY w.name", userId, userId, userId);
    if (blocked.length) {
      const names = blocked.map(row => row.name).join(', ');
      const verb = blocked.length === 1 ? 'has' : 'have';
      throw conflict('last_owner', `You are the only owner of ${names}, which ${verb} other members. Make someone else an owner, or delete the workspace, first.`);
    }
  }
  async function deleteAccount(principal, confirmEmail) {
    const userId = principal.user.id;
    const email = principal.user.email.trim().toLowerCase();
    const confirmation = confirmEmail.trim().toLowerCase();
    if (email !== confirmation) throw badRequest('Type your email address exactly to confirm');
    refuseSoleOwner(userId);
    const at = nowIso();
    await tx(() => {
      refuseSoleOwner(userId);
      const memberships = all(`SELECT m.ws_id, ${LIVE_WS('m.ws_id')} AS live, (SELECT count(*) FROM v2_members other WHERE other.ws_id = m.ws_id AND other.user_id != ?) AS others FROM v2_members m WHERE m.user_id = ?`, userId, userId);
      for (const membership of memberships) {
        const wsId = membership.ws_id;
        if (membership.live && !membership.others) softDeleteWorkspace(sql, wsId, userId, at);
        onMemberRemoved(wsId, userId);
        run('DELETE FROM v2_members WHERE ws_id = ? AND user_id = ?', wsId, userId);
        noteDeparture(wsId, userId, at);
        audit(wsId, userId, 'member.account_deleted', userId, at);
      }
      for (const wsId of workspacesNaming(userId)) pseudonymise(wsId, userId, at);
      run('DELETE FROM v2_invites WHERE lower(email) = ?', email);
      run('UPDATE v2_audit SET actor_id = NULL WHERE ws_id IS NULL AND actor_id = ?', userId);
      run('UPDATE v2_audit SET object_id = NULL WHERE ws_id IS NULL AND object_id = ?', userId);
      run('DELETE FROM v2_devices WHERE user_id = ?', userId);
      run('DELETE FROM v2_device_requests WHERE user_id = ?', userId);
      run('DELETE FROM v2_oauth_grants WHERE user_id = ?', userId);
      run("DELETE FROM ba_verification WHERE length(identifier) > length(?) AND substr(identifier, -length(?) - 1) = '-' || ?", email, email, email);
      run('DELETE FROM v2_access_requests WHERE lower(email) = ?', email);
      run('DELETE FROM v2_creation_codes WHERE lower(email) = ? AND redeemed_at IS NULL', email);
      run('UPDATE v2_creation_codes SET email = NULL WHERE lower(email) = ?', email);
      run('UPDATE v2_creation_codes SET redeemed_by = NULL WHERE redeemed_by = ?', userId);
      run('DELETE FROM v2_rate_hits WHERE key = ?', otpEmailKey(email));
      run('DELETE FROM v2_rate_hits WHERE key = ?', accessEmailKey(email));
      run('UPDATE v2_events SET actor = NULL WHERE actor = ?', actorOf(userId));
      run('DELETE FROM v2_passkey_use WHERE passkey_id IN (SELECT id FROM ba_passkey WHERE userId = ?)', userId);
      run('DELETE FROM v2_passkey_prompt_dismissed WHERE user_id = ?', userId);
      const tables = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ba\\_%' ESCAPE '\\' AND name != 'ba_user'");
      for (const table of tables) {
        const columns = all(`PRAGMA table_info(${table.name})`);
        if (columns.some(column => column.name === 'userId')) run(`DELETE FROM ${table.name} WHERE userId = ?`, userId);
      }
      run('DELETE FROM ba_user WHERE id = ?', userId);
      if (get('SELECT id FROM ba_user WHERE id = ?', userId)) throw new Error('account not deleted');
      audit(null, null, 'account.deleted', null, at);
    });
  }
  return { listPasskeys, passkeyPromptDue, dismissPasskeyPrompt, renamePasskey, deletePasskey, signOutEverywhere, deleteAccount };
}
module.exports = { create_account };
