'use strict';
function create_core(resources) {
  const {serverSecret, hmac, runtimeSettings, identifierTools, readDate, readFetch, readAbortSignal, readConsole, readURLSearchParams} = resources;
  const {testIdpEnabled, validMaxDays, sessionMaxDays} = runtimeSettings;
  const {rand32} = identifierTools;
  const CODE_DAYS = 14, CODE_PREFIX = 'alc_', CODE_RE = /^alc_[a-z2-7]{32}$/;
  const NOTE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
  const ESTIMATES = ['same_day', 'two_to_three_days', 'about_a_week', 'longer', 'would_not_be_decided'];
  const harness = ['claude-code', 'codex'];
  const EVENT_PROPS = {
    access_requested: {interest: ['try', 'evaluate'], via: ['form', 'value_card']},
    access_approved: {}, access_declined: {}, code_created: {source: ['request', 'operator']}, code_redeemed: {},
    workspace_created: {kind: ['blank', 'sample']}, invite_sent: {role: ['owner', 'member', 'viewer']}, invite_accepted: {role: ['owner', 'member', 'viewer']},
    device_paired: {workspaces: 'count'}, first_session_captured: {harness}, member_first_session_captured: {harness},
    first_session_bound: {harness, authority: ['own', 'pod', 'alignment']}, second_member_joined: {}, first_change_request: {}, first_approval: {},
    first_directive: {kind: ['goal_version', 'binding_changed', 'binding_suspended', 'stop', 'resume', 'request', 'hold', 'release']},
    first_mcp_read: {client: ['app', 'device']}, loi_sent: {note_ref: NOTE_REF_RE}, loi_signed: {note_ref: NOTE_REF_RE, verified_original: ['yes']},
    first_ask: {}, first_limit: {}, value_card_viewed: {}, value_reported: {estimate: ESTIMATES}, follow_up_clicked: {},
    first_request: {type: ['replan', 'checkpoint', 'switch_goal']}, first_hold: {}, first_launch: {}
  };
  const ONCE_PER_PERSON = ['member_first_session_captured', 'value_card_viewed', 'value_reported', 'follow_up_clicked'];
  const ONCE_PER_WORKSPACE = ['workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined', 'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed', 'first_ask', 'first_limit', 'first_request', 'first_hold', 'first_launch'];
  const REQUEST_STATUSES = ['pending', 'approved', 'declined'], RESTORE_DAYS = 30, SCHEMA_VERSION = 22;
  function eventActor(secret, userId) { return hmac(secret, `ale.${userId}`); }
  function codeHash(secret, code) { return hmac(secret, `alc.${code}`); }
  function recordEvent(db, name, o = {}) {
    const props = o.props ?? {};
    const key = Reflect.ownKeys({[name]: undefined})[0];
    const rules = Object.prototype.hasOwnProperty.call(EVENT_PROPS, key) ? EVENT_PROPS[key] : undefined;
    if (!rules) throw new Error(`Unknown event ${name}`);
    for (const [key, value] of Object.entries(props)) {
      const rule = rules[key];
      if (!(rule === 'count' ? Number.isInteger(value) && value >= 0 : rule instanceof RegExp ? typeof value === 'string' && rule.test(value) : Array.isArray(rule) && rule.includes(value))) throw new Error(`Event ${name} can't carry ${key}`);
    }
    return db.run('INSERT INTO v2_events (name, ws_id, actor, at, props) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', name, o.ws ?? null, o.actor ?? null, o.at ?? new (readDate())().toISOString(), JSON.stringify(props)) === 1;
  }
  function insertCreationCode(db, secret, o, now = readDate().now()) {
    const id = `cc_${rand32(15)}`;
    const code = `${CODE_PREFIX}${rand32(20)}`;
    const email = o.email ? o.email.trim().toLowerCase() : null;
    const expires_at = new (readDate())(now + (o.days ?? CODE_DAYS) * 86400000).toISOString();
    db.run('INSERT INTO v2_creation_codes (id, code_hash, email, request_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', id, codeHash(secret, code), email, o.requestId ?? null, new (readDate())(now).toISOString(), expires_at);
    recordEvent(db, 'code_created', {props: {source: o.requestId ? 'request' : 'operator'}, at: new (readDate())(now).toISOString()});
    return {id, code, email, expires_at};
  }
  function listCreationCodes(db) {
    const at = new (readDate())().toISOString();
    return db.all('SELECT id, email, request_id, created_at, expires_at, revoked_at, redeemed_at, ws_id FROM v2_creation_codes ORDER BY created_at DESC, id').map(row => ({...row, state: row.redeemed_at ? 'used' : row.revoked_at ? 'revoked' : row.expires_at <= at ? 'expired' : 'live'}));
  }
  function revokeCreationCode(db, id, now = readDate().now()) {
    return db.run('UPDATE v2_creation_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND redeemed_at IS NULL', new (readDate())(now).toISOString(), id) === 1;
  }
  function redeemCreationCode(db, secret, code, email, userId, wsId, now = readDate().now()) {
    if (!CODE_RE.test(code)) return false;
    const at = new (readDate())(now).toISOString();
    return db.run('UPDATE v2_creation_codes SET redeemed_at = ?, redeemed_by = ?, ws_id = ?\n       WHERE code_hash = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ? AND (email IS NULL OR email = ?)', at, userId, wsId, codeHash(secret, code), at, email.toLowerCase()) === 1;
  }
  function liveCodeFor(db, email, now = readDate().now()) {
    return !!db.get('SELECT 1 AS x FROM v2_creation_codes WHERE email = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > ?', email, new (readDate())(now).toISOString());
  }
  function listAccessRequests(db, status) {
    return status ? db.all('SELECT * FROM v2_access_requests WHERE status = ? ORDER BY created_at, id', status) : db.all('SELECT * FROM v2_access_requests ORDER BY created_at, id');
  }
  function accessRequest(db, id) { return db.get('SELECT * FROM v2_access_requests WHERE id = ?', id); }
  function approveAccessRequest(db, secret, id, days = CODE_DAYS, now = readDate().now()) {
    const request = accessRequest(db, id);
    if (!request || request.status !== 'pending') return null;
    const code = insertCreationCode(db, secret, {email: request.email, requestId: request.id, days}, now);
    db.run("UPDATE v2_access_requests SET status = 'approved', decided_at = ?, code_id = ? WHERE id = ?", new (readDate())(now).toISOString(), code.id, id);
    recordEvent(db, 'access_approved', {at: new (readDate())(now).toISOString()});
    return {request, code};
  }
  function declineAccessRequest(db, id, now = readDate().now()) {
    const at = new (readDate())(now).toISOString();
    if (db.run("UPDATE v2_access_requests SET status = 'declined', decided_at = ? WHERE id = ? AND status = 'pending'", at, id) !== 1) return false;
    recordEvent(db, 'access_declined', {at});
    return true;
  }
  function undoApproval(db, requestId, codeId) {
    const at = accessRequest(db, requestId)?.decided_at;
    revokeCreationCode(db, codeId);
    db.run("UPDATE v2_access_requests SET status = 'pending', decided_at = NULL, code_id = NULL WHERE id = ?", requestId);
    if (at) {
      db.run('DELETE FROM v2_events WHERE id = (SELECT id FROM v2_events WHERE name = ? AND at = ? ORDER BY id DESC LIMIT 1)', 'access_approved', at);
      db.run('DELETE FROM v2_events WHERE id = (SELECT id FROM v2_events WHERE name = ? AND at = ? ORDER BY id DESC LIMIT 1)', 'code_created', at);
    }
  }
  function workspaceSummaries(db) {
    return db.all("SELECT w.id, w.name, w.created_at, w.deleted_at, COUNT(m.user_id) AS members, COALESCE(SUM(m.role = 'owner'), 0) AS owners\n     FROM v2_workspaces w LEFT JOIN v2_members m ON m.ws_id = w.id GROUP BY w.id ORDER BY w.created_at, w.id");
  }
  function softDeleteWorkspace(db, wsId, actor, at) {
    if (db.run('UPDATE v2_workspaces SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', at, wsId) !== 1) return false;
    db.run('DELETE FROM v2_oauth_grants WHERE ws_id = ?', wsId);
    db.run('INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, ?, ?, ?, ?)', wsId, actor, 'workspace.deleted', wsId, at);
    return true;
  }
  function purgeWorkspace(db, wsId) {
    const prepared = [];
    for (const row of db.all('SELECT id, ws_ids_json FROM v2_device_requests WHERE ws_ids_json IS NOT NULL')) {
      const ids = JSON.parse(row.ws_ids_json);
      if (ids.includes(wsId)) prepared.push([JSON.stringify(ids.filter(id => id !== wsId)), row.id]);
    }
    db.run('DELETE FROM v2_oauth_grants WHERE ws_id = ?', wsId);
    db.run('DELETE FROM v2_change_request_evidence WHERE ws_id = ?', wsId);
    db.run('UPDATE v2_creation_codes SET ws_id = NULL WHERE ws_id = ?', wsId);
    db.run('DELETE FROM v2_device_grants WHERE ws_id = ?', wsId);
    db.run('DELETE FROM v2_audit WHERE ws_id = ?', wsId);
    db.run('UPDATE v2_events SET ws_id = ? WHERE ws_id = ?', `wsx_${rand32(15)}`, wsId);
    for (const [json, id] of prepared) db.run('UPDATE v2_device_requests SET ws_ids_json = ? WHERE id = ?', json, id);
    return db.run('DELETE FROM v2_workspaces WHERE id = ?', wsId) === 1;
  }
  async function postEmail(api, msg, what) {
    let res;
    try {
      res = await (readFetch())(api.url, {method: 'POST', headers: {authorization: `Bearer ${api.key}`, 'content-type': 'application/json'}, body: JSON.stringify({from: api.from, to: msg.to, subject: msg.subject, text: msg.text}), signal: readAbortSignal().timeout(10000), redirect: 'error'});
    } catch (error) {
      readConsole().error(`${what} failed:`, error?.name ?? 'unknown');
      throw new Error(`The ${what.toLowerCase()} could not be sent`);
    }
    await res.body?.cancel().catch(() => undefined);
    if (!res.ok) {
      readConsole().error(`${what} failed: HTTP`, res.status);
      throw new Error(`The ${what.toLowerCase()} could not be sent`);
    }
  }
  function codeEmail(origin, name, code, {local = false} = {}) {
    const signIn = `${origin}/app/sign-in?${new (readURLSearchParams())({email: code.email ?? ''})}${local ? " (a local address: it opens only on the computer Align runs on; if it doesn't open for you, ask whoever runs Align for its address)" : ''}`;
    return {subject: 'Your Align workspace creation code', text: `Hi ${name},\n\nThanks for asking to try Align. You can now create a workspace.\n\n1. Sign in as ${code.email}: ${signIn}\n2. Under "Create a workspace", enter a name and this creation code: ${code.code}\n\nThe code works once, only for ${code.email}, until ${code.expires_at.slice(0, 10)}.\n\nIf you didn't ask for access to Align, ignore this email.`};
  }
  return {CODE_DAYS, CODE_PREFIX, CODE_RE, ESTIMATES, EVENT_PROPS, NOTE_REF_RE, ONCE_PER_PERSON, ONCE_PER_WORKSPACE, REQUEST_STATUSES, RESTORE_DAYS, SCHEMA_VERSION, accessRequest, approveAccessRequest, codeEmail, codeHash, declineAccessRequest, eventActor, hmac, insertCreationCode, listAccessRequests, listCreationCodes, liveCodeFor, postEmail, purgeWorkspace, rand32, recordEvent, redeemCreationCode, revokeCreationCode, serverSecret, sessionMaxDays, softDeleteWorkspace, testIdpEnabled, undoApproval, validMaxDays, workspaceSummaries};
}
module.exports = {create_core};
