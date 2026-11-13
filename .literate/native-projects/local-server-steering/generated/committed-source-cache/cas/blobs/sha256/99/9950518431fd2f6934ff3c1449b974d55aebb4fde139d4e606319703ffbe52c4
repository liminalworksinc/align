'use strict';

/** @typedef {"off" | "on"} Steering */
function create_steering(resources) {
  const { all, audit, get, run, tx, badRequest, nowIso, need, ID_RE, SESSION_KEY_RE, readDate } = resources;

  function workspaceSteering(wsId) {
    const row = get('SELECT steering FROM v2_workspaces WHERE id = ?', wsId);
    return row?.steering === 'on' ? 'on' : 'off';
  }

  function writeSteering(principal, value, time) {
    if (value !== 'on' && value !== 'off') throw badRequest('steering must be on or off');
    if (workspaceSteering(principal.wsId) !== value) {
      run('UPDATE v2_workspaces SET steering = ? WHERE id = ?', value, principal.wsId);
      audit(principal.wsId, principal.userId, value === 'on' ? 'workspace.steering_on' : 'workspace.steering_off', principal.wsId, time);
    }
    return value;
  }

  function percentage(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
  }

  async function ingestSteering(principal, device, body) {
    need(principal, 'session.share');
    const events = body.events;
    if (!Array.isArray(events)) throw badRequest('events must be a list');
    if (events.length > 100) throw badRequest('events: at most 100');
    const parsed = events.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw badRequest('each event must be an object');
      if (typeof entry.session_key !== 'string' || !SESSION_KEY_RE.test(entry.session_key)) throw badRequest('session_key is invalid');
      if (typeof entry.goal_id !== 'string' || !ID_RE.test(entry.goal_id) || typeof entry.suggested_goal_id !== 'string' || !ID_RE.test(entry.suggested_goal_id)) throw badRequest('goal ids are invalid');
      if (!percentage(entry.share) || !percentage(entry.target)) throw badRequest('share and target must be whole percents');
      const parsedAt = typeof entry.at === 'string' ? readDate().parse(entry.at) : NaN;
      if (!Number.isFinite(parsedAt)) throw badRequest('at must be an ISO time');
      return { session_key: entry.session_key, goal_id: entry.goal_id, suggested_goal_id: entry.suggested_goal_id, share: entry.share, target: entry.target, at: parsedAt };
    });
    const now = readDate().now();
    const recordedAt = nowIso();
    let accepted = 0;
    const refused = [];
    await tx(() => {
      for (const [index, event] of parsed.entries()) {
        if (event.at > now + 5 * 60000 || event.at < now - 14 * 86400000) {
          refused.push({ index, reason: event.at > now ? 'clock_skew' : 'too_old' });
          continue;
        }
        const row = get('SELECT device_id, user_id, state FROM v2_sessions WHERE ws_id = ? AND session_key = ?', principal.wsId, event.session_key);
        if (!row || row.device_id !== device.deviceId || row.user_id !== device.user.id || row.state !== 'shared') {
          refused.push({ index, reason: 'not_shared' });
          continue;
        }
        accepted++;
        run('INSERT OR IGNORE INTO v2_steering_events (ws_id, session_key, goal_id, suggested_goal_id, share, target, at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', principal.wsId, event.session_key, event.goal_id, event.suggested_goal_id, event.share, event.target, new (readDate())(event.at).toISOString(), recordedAt);
      }
    });
    return { accepted, refused, server_time: new (readDate())(now).toISOString() };
  }

  function steeringCounts(principal, from, to) {
    need(principal, 'spend.read');
    const days = all('SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM v2_steering_events WHERE ws_id = ? AND (? IS NULL OR at >= ?) AND (? IS NULL OR at < ?) GROUP BY day ORDER BY day', principal.wsId, from, from, to, to);
    return { steering: workspaceSteering(principal.wsId), total: days.reduce((a, day) => a + day.n, 0), days };
  }

  return { workspaceSteering, writeSteering, ingestSteering, steeringCounts };
}

module.exports = { create_steering };
