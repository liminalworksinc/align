'use strict';

function create_workspaces(resources) {
  const {all, audit, get, LIVE_WS, run, sql, tx,
    softDeleteWorkspace, admitCreation, checkMemberCap, checkRestoreCaps,
    precheckCreation, V2Error, badRequest, conflict, forbidden, notFound,
    newId, nowIso, secretToken, sha256hex, authorize, config, event,
    take, addWorkspaceToDevices, liveDevicesOf, deleteMemberSessions,
    onMemberRemoved, cancelDeparture, noteDeparture, personName, RESTORE_DAYS,
    workspaceSteering, writeSteering, oneLine, readDate} = resources;

  function principalIn(p, wsId) {
    if (p.kind !== 'web' && !p.grants.has(wsId)) {
      return {userId: p.user.id, wsId, wsRole: null, pods: new Map()};
    }
    return memberPrincipal(wsId, p.user.id);
  }
  function memberPrincipal(wsId, userId) {
    const member = get(`SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS('ws_id')}`, wsId, userId);
    const pods = new Map();
    if (member) {
      for (const row of all('SELECT pod_id, role FROM v2_pod_members WHERE ws_id = ? AND user_id = ?', wsId, userId)) {
        pods.set(row.pod_id, row.role);
      }
    }
    return {userId, wsId, wsRole: member?.role ?? null, pods};
  }
  function need(p, action, obj = {kind: 'workspace'}) {
    const decision = authorize(p, action, obj);
    if (!decision.ok) throw new V2Error(decision.status, decision.code, decision.message);
  }
  function enter(p, wsId) {
    const pp = principalIn(p, wsId);
    need(pp, 'workspace.read');
    return pp;
  }
  function workspacesFor(p) {
    return all('SELECT w.id, w.name, m.role FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id', p.user.id)
      .filter(w => p.kind === 'web' || p.grants.has(w.id))
      .map(w => ({...w, teams: all('SELECT p.id, p.name, pm.role FROM v2_pods p JOIN v2_pod_members pm ON pm.pod_id = p.id AND pm.user_id = ? WHERE p.ws_id = ? ORDER BY p.name', p.user.id, w.id)}));
  }
  function otherWorkspacesFor(p) {
    if (p.kind !== 'device') return [];
    return all('SELECT w.id, w.name FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id', p.user.id)
      .filter(w => !p.grants.has(w.id));
  }
  async function createWorkspace(req, p, name, code, seed) {
    const userId = p.user.id;
    take(`ws-create:${userId}`, 10, 3600000);
    const creator = {id: userId, email: p.user.email, emailVerified: p.emailVerified};
    await precheckCreation(req, creator, code);
    const id = newId('ws');
    const at = nowIso();
    await tx(() => {
      const redeemed = admitCreation(creator, code, id);
      run('INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)', id, name, userId, at);
      run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", id, userId, at);
      audit(id, userId, 'workspace.created', id, at);
      if (redeemed) event('code_redeemed', {ws: id, user: userId, at});
      event('workspace_created', {ws: id, user: userId, props: {kind: seed ? 'sample' : 'blank'}, at});
      seed?.(id, at);
    });
    return {id, name, role: 'owner'};
  }
  function workspaceDetail(pp) {
    const workspace = get('SELECT id, name, created_at, steering FROM v2_workspaces WHERE id = ?', pp.wsId);
    if (!workspace) throw notFound();
    const members = all('SELECT u.id, u.name, u.email, m.role FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? ORDER BY u.name, u.id', pp.wsId);
    const teams = all('SELECT id, name FROM v2_pods WHERE ws_id = ? ORDER BY name, id', pp.wsId).map(p => ({...p,
      my_role: pp.pods.get(p.id) ?? null,
      members: all('SELECT u.id, u.name, pm.role FROM v2_pod_members pm JOIN ba_user u ON u.id = pm.user_id WHERE pm.pod_id = ? ORDER BY u.name', p.id)}));
    return {workspace, role: pp.wsRole, me: pp.userId, members, teams};
  }
  async function updateWorkspace(pp, b) {
    need(pp, 'workspace.manage');
    if (b.name === undefined && b.steering === undefined) throw badRequest('Send name or steering');
    const name = b.name === undefined ? undefined : oneLine(b, 'name', 100);
    const at = nowIso();
    const steering = await tx(() => {
      if (name !== undefined) {
        run('UPDATE v2_workspaces SET name = ? WHERE id = ?', name, pp.wsId);
        audit(pp.wsId, pp.userId, 'workspace.renamed', pp.wsId, at);
      }
      return b.steering === undefined ? workspaceSteering(pp.wsId) : writeSteering(pp, b.steering, at);
    });
    return {id: pp.wsId, name: get('SELECT name FROM v2_workspaces WHERE id = ?', pp.wsId).name, steering};
  }
  async function deleteWorkspace(pp) {
    need(pp, 'workspace.manage');
    const at = nowIso();
    await tx(() => softDeleteWorkspace(sql, pp.wsId, pp.userId, at));
  }
  function restoreUntil(deletedAt) {
    return new (readDate())(readDate().parse(deletedAt) + RESTORE_DAYS * 86400000).toISOString();
  }
  function deletedWorkspacesFor(userId) {
    const cutoff = new (readDate())(readDate().now() - RESTORE_DAYS * 86400000).toISOString();
    return all("SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.deleted_at IS NOT NULL AND w.deleted_at > ? ORDER BY w.deleted_at DESC", userId, cutoff)
      .map(w => ({...w, restore_until: restoreUntil(w.deleted_at)}));
  }
  function deletedWorkspaceOwnedBy(userId, wsId) {
    const w = get("SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.id = ?", userId, wsId);
    if (!w) throw notFound();
    if (!w.deleted_at) throw conflict('not_deleted', 'This workspace is not deleted, so there is nothing to restore.');
    if (readDate().parse(restoreUntil(w.deleted_at)) <= readDate().now()) throw notFound();
    return {id: w.id, name: w.name};
  }
  async function restoreWorkspace(userId, wsId) {
    const w = deletedWorkspaceOwnedBy(userId, wsId);
    checkRestoreCaps(userId);
    const at = nowIso();
    await tx(() => {
      deletedWorkspaceOwnedBy(userId, wsId);
      checkRestoreCaps(userId);
      run('UPDATE v2_workspaces SET deleted_at = NULL WHERE id = ?', wsId);
      audit(wsId, userId, 'workspace.restored', wsId, at);
    });
    return {id: w.id, name: w.name, role: 'owner'};
  }
  function memberRole(wsId, userId) {
    const role = get('SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?', wsId, userId)?.role;
    if (!role) throw notFound();
    return role;
  }
  function protectOwner(wsId) {
    if ((get("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ? AND role = 'owner'", wsId)?.n ?? 0) <= 1) {
      throw conflict('last_owner', 'A workspace needs at least one owner. Make someone else an owner first.');
    }
  }
  async function setMemberRole(pp, userId, role) {
    need(pp, 'workspace.manage');
    memberRole(pp.wsId, userId);
    const at = nowIso();
    await tx(() => {
      const current = memberRole(pp.wsId, userId);
      if (current === role) return;
      if (current === 'owner') protectOwner(pp.wsId);
      run('UPDATE v2_members SET role = ? WHERE ws_id = ? AND user_id = ?', role, pp.wsId, userId);
      audit(pp.wsId, pp.userId, 'member.role_changed', userId, at);
    });
    return {user_id: userId, role};
  }
  async function removeMember(pp, userId, {deleteSessions = false} = {}) {
    const self = pp.userId === userId;
    if (!self) need(pp, 'workspace.manage');
    memberRole(pp.wsId, userId);
    const at = nowIso();
    await tx(() => {
      const current = memberRole(pp.wsId, userId);
      if (current === 'owner') protectOwner(pp.wsId);
      onMemberRemoved(pp.wsId, userId);
      run('DELETE FROM v2_members WHERE ws_id = ? AND user_id = ?', pp.wsId, userId);
      noteDeparture(pp.wsId, userId, at);
      audit(pp.wsId, pp.userId, self ? 'member.left' : 'member.removed', userId, at);
      if (deleteSessions && deleteMemberSessions(pp.wsId, userId)) audit(pp.wsId, pp.userId, 'member.sessions_deleted', userId, at);
    });
  }
  function auditTrail(pp) {
    need(pp, 'workspace.manage');
    return all('SELECT a.at, a.actor_id, u.name AS actor_name, a.action, a.object_id FROM v2_audit a LEFT JOIN ba_user u ON u.id = a.actor_id\n     WHERE a.ws_id = ? ORDER BY a.seq DESC LIMIT 200', pp.wsId).map(a => ({at: a.at,
      actor: a.actor_id ? {id: a.actor_id, name: personName(a.actor_id, a.actor_name)} : null,
      action: a.action.replace(/^pod\./, 'team.'), object_id: a.object_id}));
  }
  function teamInWs(wsId, podId) {
    if (!get('SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?', wsId, podId)) throw notFound();
  }
  async function createInvite(pp, email, role, team = {id: null, role: null}) {
    need(pp, 'workspace.manage');
    if (team.role && !team.id) throw badRequest('team_role needs a team_id');
    if (team.id) teamInWs(pp.wsId, team.id);
    const teamId = team.id;
    const teamRole = teamId ? team.role ?? 'member' : null;
    if (role === 'viewer' && teamRole === 'lead') throw forbidden('viewer_lead', "A viewer can't lead a team. Invite them as a member of it, or with another workspace role.");
    take(`invite-create:${pp.wsId}`, 50, 3600000);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw badRequest('Enter an email address');
    if (get('SELECT 1 AS x FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? AND lower(u.email) = ?', pp.wsId, normalizedEmail)) throw conflict('already_member', 'That person is already a member.');
    checkMemberCap(pp.wsId, true);
    const token = secretToken(32);
    const id = newId('inv');
    const at = nowIso();
    await tx(() => {
      checkMemberCap(pp.wsId, true);
      run('INSERT INTO v2_invites (id, ws_id, token_hash, email, role, team_id, team_role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, pp.wsId, sha256hex(token), normalizedEmail, role, teamId, teamRole, pp.userId, at, new (readDate())(readDate().now() + 7 * 86400000).toISOString());
      audit(pp.wsId, pp.userId, 'invite.created', id, at);
      event('invite_sent', {ws: pp.wsId, user: pp.userId, props: {role}, at});
    });
    return {id, email: normalizedEmail, role, team_id: teamId, team_role: teamRole, path: '/app/invite/' + token, token};
  }
  function listInvites(pp) {
    need(pp, 'workspace.manage');
    return all('SELECT i.id, i.email, i.role, i.team_id, p.name AS team_name, i.team_role, i.created_at, i.expires_at, i.accepted_at\n     FROM v2_invites i LEFT JOIN v2_pods p ON p.ws_id = i.ws_id AND p.id = i.team_id WHERE i.ws_id = ? ORDER BY i.created_at DESC', pp.wsId)
      .map(({team_name, ...i}) => ({...i, team: i.team_id ? {id: i.team_id, name: team_name ?? ''} : null}));
  }
  async function deleteInvite(pp, inviteId) {
    need(pp, 'workspace.manage');
    const changed = await tx(() => {
      const n = run('DELETE FROM v2_invites WHERE ws_id = ? AND id = ? AND accepted_at IS NULL', pp.wsId, inviteId);
      if (n) audit(pp.wsId, pp.userId, 'invite.withdrawn', inviteId, nowIso());
      return n;
    });
    if (!changed) throw notFound();
  }
  function inviteByToken(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound();
    const i = get('SELECT id, ws_id, email, role, team_id, team_role, expires_at, accepted_at FROM v2_invites WHERE token_hash = ?', sha256hex(token));
    if (!i || i.accepted_at || readDate().parse(i.expires_at) <= readDate().now()) throw notFound();
    if (!get(`SELECT 1 AS x WHERE ${LIVE_WS('?')}`, i.ws_id)) throw notFound();
    return i;
  }
  function previewInvite(token, user) {
    const i = inviteByToken(token);
    const matches = i.email === user.email.toLowerCase();
    const w = get('SELECT name FROM v2_workspaces WHERE id = ?', i.ws_id);
    const team = i.team_id ? get('SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?', i.ws_id, i.team_id) ?? null : null;
    return {workspace: {id: i.ws_id, name: w?.name ?? ''}, role: i.role, team, team_role: team ? i.team_role : null,
      email_matches: matches, invited_email: i.email,
      devices: matches ? liveDevicesOf(user.id).map(d => ({id: d.id, name: d.name, last_seen_at: d.last_seen_at ?? d.created_at})) : []};
  }
  function alreadyJoinedWith(token, userId) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const prior = get('SELECT ws_id FROM v2_invites WHERE token_hash = ? AND accepted_at IS NOT NULL AND accepted_by = ?', sha256hex(token), userId);
    if (prior && get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS('ws_id')}`, prior.ws_id, userId)) {
      throw new V2Error(409, 'already_member', 'You already joined this workspace with this invite, in another tab or window.', {workspace_id: prior.ws_id});
    }
  }
  async function acceptInvite(token, user, emailVerified, deviceIds = [], requireRecent = () => undefined) {
    alreadyJoinedWith(token, user.id);
    const i = inviteByToken(token);
    if (i.email !== user.email.toLowerCase()) throw new V2Error(403, 'email_mismatch', 'This invite is for a different email address');
    if (config().hosted && !emailVerified) throw new V2Error(403, 'email_unverified', 'Your sign-in provider has not verified this email address');
    if (deviceIds.length) requireRecent();
    const at = nowIso();
    let granted = [];
    await tx(() => {
      if (get('SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?', i.ws_id, user.id)) throw conflict('already_member', 'You are already a member.');
      checkMemberCap(i.ws_id, false);
      run('INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', i.ws_id, user.id, i.role, at);
      cancelDeparture(i.ws_id, user.id);
      if (i.team_id && get('SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?', i.ws_id, i.team_id)) {
        run('INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)', i.ws_id, i.team_id, user.id, i.team_role ?? 'member', at);
      } else i.team_id = null;
      run('UPDATE v2_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?', at, user.id, i.id);
      audit(i.ws_id, user.id, 'invite.accepted', i.id, at);
      granted = addWorkspaceToDevices(user.id, i.ws_id, deviceIds, at);
      event('invite_accepted', {ws: i.ws_id, user: user.id, props: {role: i.role}, at});
      if ((get('SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ?', i.ws_id)?.n ?? 0) >= 2) event('second_member_joined', {ws: i.ws_id, user: user.id, at});
    });
    return {workspace_id: i.ws_id, role: i.role, team_id: i.team_id, device_ids: granted};
  }
  async function createTeam(pp, name) {
    need(pp, 'workspace.manage');
    const id = newId('pod');
    const at = nowIso();
    await tx(() => {
      run('INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)', id, pp.wsId, name, at);
      audit(pp.wsId, pp.userId, 'team.created', id, at);
    });
    return {id, name};
  }
  async function setTeamMember(pp, podId, userId, role) {
    teamInWs(pp.wsId, podId);
    need(pp, 'pod.manage_members', {kind: 'pod', podId});
    const current = get('SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?', podId, userId);
    if ((role === 'lead' || current?.role === 'lead') && pp.wsRole !== 'owner') throw forbidden('owner_only', 'Only a workspace owner can make someone a team lead.');
    const member = get('SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?', pp.wsId, userId);
    if (!member) throw notFound();
    if (role === 'lead' && member.role === 'viewer') throw forbidden('viewer_lead', "A viewer can't lead a team. Change their workspace role first, or add them as a member.");
    const at = nowIso();
    await tx(() => {
      run('INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (pod_id, user_id) DO UPDATE SET role = excluded.role', pp.wsId, podId, userId, role, at);
      audit(pp.wsId, pp.userId, 'team.member_set', podId, at);
    });
    return {team_id: podId, user_id: userId, role};
  }
  async function removeTeamMember(pp, podId, userId) {
    teamInWs(pp.wsId, podId);
    need(pp, 'pod.manage_members', {kind: 'pod', podId});
    const current = get('SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?', podId, userId);
    if (current?.role === 'lead' && pp.wsRole !== 'owner' && pp.userId !== userId) throw forbidden('owner_only', 'Only a workspace owner can remove a team lead.');
    const changed = await tx(() => {
      const n = run('DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = ?', pp.wsId, podId, userId);
      if (n) audit(pp.wsId, pp.userId, 'team.member_removed', podId, nowIso());
      return n;
    });
    if (!changed) throw notFound();
  }
  function memberName(userId) {
    return personName(userId, get('SELECT name FROM ba_user WHERE id = ?', userId)?.name);
  }
  function nameTo(userId, reader) {
    return userId === reader ? 'you' : memberName(userId);
  }
  return {principalIn, memberPrincipal, need, enter, workspacesFor, otherWorkspacesFor,
    createWorkspace, workspaceDetail, updateWorkspace, deleteWorkspace, deletedWorkspacesFor,
    deletedWorkspaceOwnedBy, restoreWorkspace, setMemberRole, removeMember, auditTrail,
    createInvite, listInvites, deleteInvite, previewInvite, acceptInvite, createTeam,
    setTeamMember, removeTeamMember, memberName, nameTo};
}

module.exports = {create_workspaces};
