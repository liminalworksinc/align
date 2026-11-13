'use strict';

function create_creation(resources) {
  const { config, secret, requireCaptcha, caps, creationMode, CODE_RE,
    redeemCreationCode, get, sql, refuseDisposable, V2Error, conflict,
    forbidden, count, readFirstOwnerEmail, memberCheckNow } = resources;
  const suffix = ' Contact the operator of this Align server to raise it.';
  const invalid = "That creation code isn't valid. It may be mistyped, used, expired, revoked or for another email address.";
  const live = () => get('SELECT COUNT(*) AS n FROM v2_workspaces WHERE deleted_at IS NULL')?.n ?? 0;
  const owned = userId => get("SELECT COUNT(*) AS n FROM v2_members m JOIN v2_workspaces w ON w.id = m.ws_id WHERE m.user_id = ? AND m.role = 'owner' AND w.deleted_at IS NULL", userId)?.n ?? 0;

  function needsCode(email) {
    if (creationMode() !== 'codes') return false;
    const firstOwner = (readFirstOwnerEmail() || '').trim().toLowerCase();
    if (firstOwner && email.toLowerCase() === firstOwner && !get('SELECT id FROM v2_workspaces LIMIT 1')) return false;
    return true;
  }

  function checkCreation(creator, code) {
    if (!config().hosted) return;
    if (creationMode() === 'closed') throw forbidden('creation_closed', "New workspaces can't be created on this server right now. Contact its operator.");
    const c = caps();
    const total = live();
    if (total >= c.workspaces) throw forbidden('workspace_cap', `This server has reached its limit of ${count(c.workspaces, 'workspace')}.` + suffix);
    const personal = owned(creator.id);
    if (personal >= c.owned) throw forbidden('owned_workspace_cap', `You already own ${count(personal, 'workspace')}, the limit for one account here.` + suffix);
    refuseDisposable(creator.email);
    if (needsCode(creator.email) && !code) throw forbidden('creation_code_required', 'Creating a workspace here needs a creation code. Request access to get one.');
  }

  async function precheckCreation(request, creator, code) {
    checkCreation(creator, code);
    if (!config().hosted) return;
    if (code !== null && !CODE_RE.test(code)) throw forbidden('creation_code_invalid', invalid);
    await requireCaptcha(request);
  }

  function admitCreation(creator, code, workspaceId) {
    checkCreation(creator, code);
    if (!config().hosted || !needsCode(creator.email)) return false;
    if (!redeemCreationCode(sql, secret(), code, creator.emailVerified ? creator.email : '', creator.id, workspaceId)) throw forbidden('creation_code_invalid', invalid);
    return true;
  }

  function checkRestoreCaps(userId) {
    const c = caps();
    if (!c) return;
    const total = live();
    if (total >= c.workspaces) throw conflict('workspace_cap', `Restoring it would take this server past its limit of ${count(c.workspaces, 'workspace')}.` + suffix);
    const personal = owned(userId);
    if (personal >= c.owned) throw conflict('owned_workspace_cap', `You already own ${count(personal, 'workspace')}, the limit for one account here, so this one can't be restored.` + suffix);
  }

  function checkMemberCap(workspaceId, countInvites) {
    const c = caps();
    if (!c) return;
    const now = memberCheckNow();
    const members = get('SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ?', workspaceId)?.n ?? 0;
    const invites = countInvites ? (get('SELECT COUNT(*) AS n FROM v2_invites WHERE ws_id = ? AND accepted_at IS NULL AND expires_at > ?', workspaceId, now)?.n ?? 0) : 0;
    if (members + invites >= c.members) throw forbidden('member_cap', `This workspace has reached its limit of ${count(c.members, 'member')}, counting open invites.` + suffix);
  }

  function sessionCapError(max) {
    return new V2Error(403, 'session_cap', `This device has shared ${count(max, 'new session')} in the last 24 hours, the limit here.` + suffix);
  }
  return { needsCode, precheckCreation, admitCreation, checkRestoreCaps, checkMemberCap, sessionCapError };
}

module.exports = { create_creation };
