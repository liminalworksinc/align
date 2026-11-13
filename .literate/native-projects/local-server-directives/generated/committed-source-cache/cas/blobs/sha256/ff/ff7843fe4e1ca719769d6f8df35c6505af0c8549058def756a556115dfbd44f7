'use strict';

function create_directives(resources) {
  const { all, get, run, tx, V2Error, badRequest, notFound, event, newId, nowIso, goalCore,
    goalObj, bindableFor, goalRow, canReadGoal, principalIn,
    expireStoppedSessionTargets, holdWire, requestReceipt, requestWire, readDate } = resources;

  function writeDirective(ws, kind, sessionKeys, goal, binding, extra) {
    const keys = [...new Set(sessionKeys)];
    if (!keys.length) return null;
    const id = newId('dir');
    run('INSERT INTO v2_directives (id, ws_id, kind, goal_id, goal_json, binding_json, request_json, hold_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, ws, kind, goal?.id ?? extra?.goalId ?? null, goal ? JSON.stringify(goal) : null,
      binding ? JSON.stringify(binding) : null,
      extra?.request ? JSON.stringify(extra.request) : null,
      extra?.hold ? JSON.stringify(extra.hold) : null, nowIso());
    for (const k of keys) run('INSERT INTO v2_directive_targets (ws_id, directive_id, session_key) VALUES (?, ?, ?)', ws, id, k);
    event('first_directive', {ws, props: {kind}});
    return id;
  }

  function goalTargets(ws, goalId) {
    return all(`SELECT s.session_key FROM v2_sessions s
     LEFT JOIN v2_epochs e ON e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL
     WHERE s.ws_id = ? AND s.state <> 'stopped' AND (e.goal_id = ? OR s.governing_goal_id = ?)
     ORDER BY s.session_key`, ws, goalId, goalId).map(r => r.session_key);
  }

  function goalVersionDirective(ws, goal) {
    return writeDirective(ws, 'goal_version', goalTargets(ws, goal.id), goalCore(goal), null);
  }

  function goalSnapshot(json) {
    const {pod, visibility, ...rest} = JSON.parse(json);
    return {...rest, team: rest.team ?? pod ?? null, level: rest.level ?? 'team',
      visibility: visibility === 'pod' ? 'team' : visibility,
      limits: rest.limits ?? [], target_share: rest.target_share ?? null};
  }

  function directiveWire(dev, row, sessionKeys) {
    const principal = principalIn(dev, row.ws_id);
    let goal = null;
    if (row.goal_json) {
      const live = row.goal_id ? goalRow(row.ws_id, row.goal_id) : undefined;
      if (live && canReadGoal(principal, goalObj(live))) {
        goal = {...goalSnapshot(row.goal_json), bindable: bindableFor(principal, live)};
      }
    }
    const result = {id: row.id, seq: row.seq, ws: row.ws_id, kind: row.kind,
      session_keys: sessionKeys, goal,
      binding: row.binding_json ? JSON.parse(row.binding_json) : null, created_at: row.created_at};
    if (row.kind === 'request') result.request = row.request_json ? requestWire(principal, JSON.parse(row.request_json)) : null;
    if (row.kind === 'hold' || row.kind === 'release') {
      result.hold = row.hold_json && row.goal_id ? holdWire(principal, row.kind, row.goal_id, JSON.parse(row.hold_json)) : null;
    }
    return result;
  }

  function directivesFor(dev, cursor, limit = 100) {
    const ws = [...dev.grants];
    if (!ws.length) return [];
    return all(`SELECT d.seq, d.id, d.ws_id, d.kind, d.goal_id, d.goal_json, d.binding_json, d.request_json, d.hold_json, d.created_at, group_concat(t.session_key, ' ') AS keys
     FROM v2_directives d
     JOIN v2_directive_targets t ON t.directive_id = d.id
     JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE s.device_id = ? AND s.user_id = ? AND d.seq > ? AND d.ws_id IN (${ws.map(() => '?').join(',')})
     GROUP BY d.seq ORDER BY d.seq LIMIT ?`, dev.deviceId, dev.user.id, cursor, ...ws, limit)
      .map(row => directiveWire(dev, row, row.keys.split(' ').sort()));
  }

  function endedSessionsFor(dev, nowMs = readDate().now()) {
    const ws = [...dev.grants];
    if (!ws.length) return [];
    return all(`SELECT ws_id, session_key, ended_reason, stopped_at FROM v2_sessions
     WHERE user_id = ? AND state = 'stopped' AND stopped_at >= ? AND ws_id IN (${ws.map(() => '?').join(',')})
     ORDER BY stopped_at DESC LIMIT 200`, dev.user.id, new (readDate())(nowMs - 30 * 86400000).toISOString(), ...ws)
      .map(r => ({ws: r.ws_id, session_key: r.session_key, ended_reason: r.ended_reason ?? null, stopped_at: r.stopped_at}));
  }

  function parseCursor(value) {
    if (value === null || value === '') return 0;
    if (!/^\d{1,15}$/.test(value)) throw badRequest('cursor must be a sequence number');
    return Number(value);
  }

  const RECEIPT_STATES = ['received', 'applied', 'enforced', 'accepted', 'declined'];

  async function recordReceipt(dev, directiveId, sessionKey, state, at, autoAccepted = false) {
    const t = get(`SELECT t.ws_id, d.kind, d.request_json, s.state AS session_state, s.ended_reason FROM v2_directive_targets t
     JOIN v2_directives d ON d.id = t.directive_id
     JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE t.directive_id = ? AND t.session_key = ? AND s.user_id = ? AND s.device_id = ?`, directiveId, sessionKey, dev.user.id, dev.deviceId);
    if (!t || !dev.grants.has(t.ws_id)) throw notFound();
    const answer = state === 'accepted' || state === 'declined';
    if (answer && t.kind !== 'request') throw badRequest('accepted and declined answer a request directive');
    if (autoAccepted && state !== 'accepted') throw badRequest('auto_accepted goes only with state accepted');
    const request = t.kind === 'request' && t.request_json ? JSON.parse(t.request_json) : null;
    if (answer && request && t.session_state === 'stopped') {
      await tx(() => expireStoppedSessionTargets(t.ws_id, sessionKey, nowIso()));
      throw new V2Error(409, 'request_expired', "This request expired: this session's sharing was stopped, so it no longer takes answers.", {ended_reason: t.ended_reason ?? null});
    }
    return tx(() => {
      const count = run('INSERT OR IGNORE INTO v2_receipts (ws_id, directive_id, session_key, state, at, recorded_at, auto_accepted) VALUES (?, ?, ?, ?, ?, ?, ?)',
        t.ws_id, directiveId, sessionKey, state, at, nowIso(), autoAccepted ? 1 : 0);
      if (!request) return {fresh: count > 0};
      return {fresh: count > 0, request_state: requestReceipt(t.ws_id, request.request_id, sessionKey, state, autoAccepted, dev.user.id)};
    });
  }

  function stopStatus(ws, sessionKey) {
    const d = get(`SELECT d.id, d.kind, d.created_at FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id
     WHERE t.ws_id = ? AND t.session_key = ? AND d.kind IN ('stop','resume') ORDER BY d.seq DESC LIMIT 1`, ws, sessionKey);
    if (!d) return null;
    const receipts = all('SELECT state, at FROM v2_receipts WHERE directive_id = ? AND session_key = ? ORDER BY at', d.id, sessionKey);
    return {directive_id: d.id, kind: d.kind, created_at: d.created_at, receipts};
  }

  return {writeDirective, goalTargets, goalVersionDirective, goalSnapshot, directivesFor,
    endedSessionsFor, parseCursor, RECEIPT_STATES, recordReceipt, stopStatus};
}

exports.create_directives = create_directives;
