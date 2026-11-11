'use strict';

function create_sessions(resources) {
  const {
    caps, sessionCapError, all, audit, get, run, tx, takeDurable,
    V2Error, badRequest, conflict, notFound, event, nowIso, sha256hex,
    goalObj, goalRow, transferFor, authorize, canReadGoal, stopStatus,
    writeDirective, need, expireStoppedSessionTargets, holdNewlyBound,
    personName, shareAgainText, shareAgainWords, sharingStoppedText,
    b64url, iso, nonNegInt, oneOf, optInt, optStr, str, readDate
  } = resources;

  function endSessions(live, reason, at) {
    for (const s of live) {
      run('UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL', at, s.ws_id, s.session_key);
      run(`UPDATE v2_sessions SET state = 'stopped', stopped_at = COALESCE(stopped_at, ?), ended_reason = ?, governing_goal_id = NULL,
         governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND session_key = ?`, at, reason, at, s.ws_id, s.session_key);
      run("UPDATE v2_request_targets SET state = 'expired', ended_reason = ?, updated_at = ? WHERE ws_id = ? AND session_key = ? AND state IN ('sent','received')", reason, at, s.ws_id, s.session_key);
    }
    return live.length;
  }

  function sessionRow(ws, key) {
    return get('SELECT * FROM v2_sessions WHERE ws_id = ? AND session_key = ?', ws, key);
  }
  function openEpoch(ws, key) {
    return get('SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL', ws, key);
  }
  function ownSession(pp, p, key) {
    const s = sessionRow(pp.wsId, key);
    if (!s) throw notFound();
    need(pp, 'session.manage', {kind: 'session', ownerId: s.user_id});
    if (p.kind === 'device' && s.device_id !== p.deviceId) throw notFound();
    return s;
  }
  function epochOut(e) {
    return {epoch_id: e.epoch_id, goal_id: e.goal_id, goal_version_at_start: e.goal_version_at_start, starts_at: e.starts_at, ends_at: e.ends_at};
  }
  function shareOut(s) {
    const e = openEpoch(s.ws_id, s.session_key);
    return {session_key: s.session_key, state: s.state, current_epoch: e ? epochOut(e) : null};
  }
  function clockSkew(field, sent) {
    const minutes = Math.round((readDate().parse(sent) - readDate().now()) / 60000);
    return new V2Error(400, 'clock_skew', `${field} is ${minutes} minutes ahead of the server's clock; this device's clock is off`, {server_time: nowIso()});
  }
  async function putSession(pp, dev, key, b) {
    need(pp, 'session.share');
    const harness = oneOf(b, 'harness', ['claude-code', 'codex']);
    const repoKey = b64url(b, 'repo_key', 43, 43);
    const alias = optStr(b, 'repo_alias', 100);
    const startedAt = iso(b, 'started_at');
    if (readDate().parse(startedAt) > readDate().now() + 5 * 60 * 1000) throw clockSkew('started_at', startedAt);
    const title = optStr(b, 'title', 200);
    const at = nowIso();
    const out = await tx(() => {
      const s = sessionRow(pp.wsId, key);
      const ended = s && s.state === 'stopped' && (s.ended_reason === 'device_signed_out' ? s.device_id !== dev.deviceId : s.ended_reason === 'member_removed');
      if (s && ended && s.user_id === dev.user.id) {
        if (s.harness !== harness || s.repo_key !== repoKey) throw conflict('session_conflict', 'This session key was shared with a different harness or repo');
        run("UPDATE v2_sessions SET device_id = ?, state = 'shared', stopped_at = NULL, ended_reason = NULL, repo_alias = ?, title = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?", dev.deviceId, alias, title, at, pp.wsId, key);
        audit(pp.wsId, dev.user.id, 'session.shared_again', null, at);
      } else if (s) {
        if (s.user_id !== dev.user.id) throw notFound();
        if (s.state === 'stopped') throw conflict('sharing_stopped', 'Sharing was stopped for this session');
        if (s.device_id !== dev.deviceId) throw notFound();
        if (s.harness !== harness || s.repo_key !== repoKey) throw conflict('session_conflict', 'This session key was shared with a different harness or repo');
        run('UPDATE v2_sessions SET repo_alias = ?, title = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?', alias, title, at, pp.wsId, key);
      } else {
        const c = caps();
        if (c && !takeDurable([{key: `sessions-device:${dev.deviceId}`, max: c.sessionsPerDeviceDay, windowMs: 24 * 3600 * 1000}])) throw sessionCapError(c.sessionsPerDeviceDay);
        run(`INSERT INTO v2_sessions (ws_id, session_key, user_id, device_id, harness, repo_key, repo_alias, title, started_at, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'shared', ?, ?)`, pp.wsId, key, dev.user.id, dev.deviceId, harness, repoKey, alias, title, startedAt, at, at);
        event('first_session_captured', {ws: pp.wsId, user: dev.user.id, props: {harness}, at});
        event('member_first_session_captured', {ws: pp.wsId, user: dev.user.id, props: {harness}, at});
      }
      return shareOut(sessionRow(pp.wsId, key));
    });
    if (out.state === 'stopped') throw conflict('sharing_stopped', 'Sharing was stopped for this session');
    return out;
  }

  async function openBindingEpoch(pp, dev, key, b) {
    const s = ownSession(pp, dev, key);
    if (s.state === 'stopped') throw new V2Error(409, 'sharing_stopped', 'Sharing was stopped for this session', {ended_reason: s.ended_reason ?? null});
    const epochId = str(b, 'epoch_id', 70);
    if (!/^ep_[A-Za-z0-9_-]{22,64}$/.test(epochId)) throw badRequest('epoch_id must be ep_ followed by 22+ url-safe characters');
    const goalId = b.goal_id === null || b.goal_id === undefined ? null : str(b, 'goal_id', 64);
    const startsAt = iso(b, 'starts_at');
    const rootTurn = optStr(b, 'root_turn', 200);
    const cause = str(b, 'cause', 80);
    if (cause !== 'manual' && !/^directive:dir_[a-z2-7]{24}$/.test(cause)) throw badRequest('cause must be "manual" or "directive:<dir_id>"');
    if (cause !== 'manual' && !get('SELECT 1 AS x FROM v2_directive_targets WHERE ws_id = ? AND directive_id = ? AND session_key = ?', pp.wsId, cause.slice(10), key)) throw badRequest('cause names a directive that was not sent to this session');
    if (readDate().parse(startsAt) > readDate().now() + 5 * 60 * 1000) throw clockSkew('starts_at', startsAt);
    const futureStart = readDate().parse(s.started_at) > readDate().now();
    if (readDate().parse(startsAt) < readDate().parse(s.started_at) && !futureStart) throw badRequest('starts_at is before the session started');
    const same = get('SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?', pp.wsId, key, epochId);
    if (same) {
      if (same.goal_id === goalId && same.starts_at === startsAt) return epochOut(same);
      throw conflict('epoch_conflict', 'This epoch id was already used with different values');
    }
    let authority = 'none', alignmentId = null, version = null;
    if (goalId) {
      const g = goalRow(pp.wsId, goalId);
      if (!g || !canReadGoal(pp, goalObj(g))) throw notFound();
      const transfer = transferFor(pp.wsId, key, goalId);
      const d = authorize(pp, 'goal.bind', {kind: 'bind', goal: goalObj(g), hasTransfer: !!transfer});
      if (!d.ok) throw new V2Error(d.status, d.code, d.message);
      if (g.status !== 'active') throw conflict('goal_not_active', 'That goal is no longer active');
      authority = g.owner_id === pp.userId ? 'own' : g.pod_id && pp.pods.has(g.pod_id) ? 'pod' : 'alignment';
      alignmentId = authority === 'alignment' ? transfer : null;
      version = g.version;
    }
    const at = nowIso();
    return await tx(() => {
      const open = openEpoch(pp.wsId, key);
      const lastEnd = get('SELECT MAX(ends_at) AS m FROM v2_epochs WHERE ws_id = ? AND session_key = ?', pp.wsId, key)?.m ?? null;
      if (open && startsAt < open.starts_at) throw conflict('epoch_overlap', 'starts_at is before the current epoch started');
      if (lastEnd && startsAt < lastEnd) throw conflict('epoch_overlap', 'starts_at is before the last epoch ended');
      if (open) run('UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND epoch_id = ?', startsAt, pp.wsId, key, open.epoch_id);
      if (startsAt < s.started_at) run('UPDATE v2_sessions SET started_at = ? WHERE ws_id = ? AND session_key = ?', startsAt, pp.wsId, key);
      run(`INSERT INTO v2_epochs (ws_id, session_key, epoch_id, goal_id, goal_version_at_start, starts_at, root_turn, cause, authority, alignment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, pp.wsId, key, epochId, goalId, version, startsAt, rootTurn, cause, authority, alignmentId, at);
      const cur = sessionRow(pp.wsId, key);
      const keepGoverning = cur.governing_goal_id !== null && cur.governing_goal_id === goalId;
      run("UPDATE v2_sessions SET state = 'shared', governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?", keepGoverning ? cur.governing_goal_id : null, keepGoverning ? cur.governing_alignment_id : null, at, pp.wsId, key);
      if (goalId) holdNewlyBound(pp.wsId, goalId, key);
      if (goalId && authority !== 'none') event('first_session_bound', {ws: pp.wsId, user: pp.userId, props: {harness: cur.harness, authority}, at});
      return epochOut(get('SELECT * FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?', pp.wsId, key, epochId));
    });
  }

  const USAGE_FIELDS = ['epoch_id', 'ts', 'model', 'query_source', 'input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'cache_write_unsplit', 'basis', 'est_list_usd_micros', 'price_table_version', 'source'];
  const QUERY_SOURCES = ['main', 'subagent', 'auxiliary', 'unknown'];
  const BASES = ['api_usd', 'subscription_included', 'workspace_credits', 'estimated_list_usd', 'unknown'];
  const SOURCES = ['otel', 'transcript', 'rollout'];
  function usageRowIn(r, i) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw badRequest(`rows[${i}] must be an object`);
    try {
      return {
        request_key: b64url(r, 'request_key', 16, 128),
        epoch_id: str(r, 'epoch_id', 70),
        ts: iso(r, 'ts'),
        model: str(r, 'model', 100),
        query_source: oneOf(r, 'query_source', QUERY_SOURCES),
        input: nonNegInt(r, 'input'),
        output: nonNegInt(r, 'output'),
        cache_read: nonNegInt(r, 'cache_read'),
        cache_write_5m: nonNegInt(r, 'cache_write_5m'),
        cache_write_1h: nonNegInt(r, 'cache_write_1h'),
        cache_write_unsplit: nonNegInt(r, 'cache_write_unsplit'),
        basis: oneOf(r, 'basis', BASES),
        est_list_usd_micros: optInt(r, 'est_list_usd_micros'),
        price_table_version: optStr(r, 'price_table_version', 64),
        source: oneOf(r, 'source', SOURCES)
      };
    } catch (e) {
      if (e instanceof V2Error) throw badRequest(`rows[${i}]: ${e.message}`);
      throw e;
    }
  }
  async function ingestUsage(pp, dev, key, b) {
    const s = ownSession(pp, dev, key);
    if (s.state === 'stopped') throw new V2Error(409, 'sharing_stopped', 'Sharing was stopped for this session', {ended_reason: s.ended_reason ?? null});
    if (!Array.isArray(b.rows)) throw badRequest('rows must be a list');
    if (b.rows.length > 500) throw new V2Error(413, 'too_many_rows', 'At most 500 rows per batch');
    const rows = b.rows.map(usageRowIn);
    const at = nowIso();
    return tx(() => {
      const epochs = all('SELECT epoch_id, starts_at, ends_at FROM v2_epochs WHERE ws_id = ? AND session_key = ?', pp.wsId, key);
      const byId = new Map(epochs.map(e => [e.epoch_id, e]));
      let accepted = 0, duplicates = 0, conflicts = 0;
      const refused = [];
      for (const r of rows) {
        const e = byId.get(r.epoch_id);
        if (!e) { conflicts++; refused.push(r.request_key); continue; }
        const t = readDate().parse(r.ts);
        if (t < readDate().parse(e.starts_at)) { conflicts++; refused.push(r.request_key); continue; }
        if (e.ends_at !== null && t >= readDate().parse(e.ends_at) && !epochs.some(x => readDate().parse(x.starts_at) <= t && (x.ends_at === null || t < readDate().parse(x.ends_at)))) {
          conflicts++; refused.push(r.request_key); continue;
        }
        if (run(`INSERT OR IGNORE INTO v2_usage (ws_id, session_key, request_key, ${USAGE_FIELDS.join(', ')}, received_at)
         VALUES (?, ?, ?, ${USAGE_FIELDS.map(() => '?').join(', ')}, ?)`, pp.wsId, key, r.request_key, ...USAGE_FIELDS.map(f => r[f]), at)) { accepted++; continue; }
        const prev = get(`SELECT ${USAGE_FIELDS.join(', ')} FROM v2_usage WHERE ws_id = ? AND session_key = ? AND request_key = ?`, pp.wsId, key, r.request_key);
        if (prev && USAGE_FIELDS.every(f => prev[f] === r[f])) duplicates++;
        else conflicts++;
      }
      if (conflicts) run('UPDATE v2_sessions SET conflicts = conflicts + ? WHERE ws_id = ? AND session_key = ?', conflicts, pp.wsId, key);
      return {accepted, duplicates, conflicts, refused};
    });
  }
  async function stopSharing(pp, p, key) {
    ownSession(pp, p, key);
    const at = nowIso();
    await tx(() => {
      run('UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL', at, pp.wsId, key);
      run("UPDATE v2_sessions SET state = 'stopped', stopped_at = COALESCE(stopped_at, ?), ended_reason = NULL, governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND session_key = ?", at, at, pp.wsId, key);
      expireStoppedSessionTargets(pp.wsId, key, at);
      audit(pp.wsId, pp.userId, 'session.sharing_stopped', null, at);
    });
    return {session_key: key, state: 'stopped'};
  }
  function deletedKeyHash(userId, key) { return sha256hex(`deleted-session\0${userId}\0${key}`); }
  async function deleteSession(pp, p, key) {
    const s = sessionRow(pp.wsId, key);
    if (!s) {
      if (get('SELECT 1 AS x FROM v2_deleted_sessions WHERE ws_id = ? AND key_hash = ?', pp.wsId, deletedKeyHash(pp.userId, key))) throw new V2Error(410, 'history_deleted', "This session's shared history was already deleted; nothing is left to delete");
      throw notFound();
    }
    need(pp, 'session.manage', {kind: 'session', ownerId: s.user_id});
    await tx(() => {
      run('DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?', pp.wsId, key);
      run('INSERT OR REPLACE INTO v2_deleted_sessions (ws_id, key_hash, deleted_at) VALUES (?, ?, ?)', pp.wsId, deletedKeyHash(s.user_id, key), nowIso());
      run('DELETE FROM v2_directives WHERE ws_id = ? AND NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)', pp.wsId);
      audit(pp.wsId, pp.userId, 'session.history_deleted', p.kind === 'device' ? p.deviceId : null, nowIso());
    });
  }
  function sharedFrom(wsId, deviceId) {
    const d = deviceId ? get('SELECT id, name, revoked_at FROM v2_devices WHERE id = ?', deviceId) : null;
    if (!d) return null;
    const has_workspace = !d.revoked_at && !!get('SELECT 1 AS x FROM v2_device_grants WHERE device_id = ? AND ws_id = ?', d.id, wsId);
    return {id: d.id, name: d.name, signed_out: !!d.revoked_at, has_workspace};
  }
  function memberRemovedRefusal(pp, s) {
    const you = s.user_id === pp.userId;
    const user = get('SELECT name FROM ba_user WHERE id = ?', s.user_id);
    const name = personName(s.user_id, user?.name);
    const lead = `This session's sharing ended when ${you ? 'you' : name} left this workspace, so a stop or resume can't reach it.`;
    if (!user) return lead + ' Their account was deleted, so nothing can share it again.';
    if (!get('SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?', pp.wsId, s.user_id)) return lead + ` Once ${you ? 'you are' : `${name} is`} back in the workspace and the machine that shared it has the workspace again, ::align share in that session shares it again, and then Stop and Resume here reach it.`;
    return lead + ' ' + shareAgainText(shareAgainWords(sharedFrom(pp.wsId, s.device_id), you ? null : name)) + ' Then Stop and Resume here reach it.';
  }
  function sharingStoppedRefusal(pp, s) {
    if (s.user_id === pp.userId) return sharingStoppedText(null);
    const user = get('SELECT name FROM ba_user WHERE id = ?', s.user_id);
    return sharingStoppedText(personName(s.user_id, user?.name), {deleted: !user});
  }
  async function setAgentStop(pp, key, stop) {
    const s = sessionRow(pp.wsId, key);
    if (!s) throw notFound();
    need(pp, 'session.stop', {kind: 'session', ownerId: s.user_id});
    if (s.ended_reason === 'device_signed_out') throw conflict('device_signed_out', "The machine that shared this session signed out of Align, so its sharing ended and a stop or resume can't reach it. Once that machine is signed in again (align login), ::align share in the session shares it again, and then Stop and Resume here reach it; until then, a stopped session stays stopped.");
    if (s.ended_reason === 'member_removed') throw conflict('member_removed', memberRemovedRefusal(pp, s));
    if (s.state === 'stopped') throw conflict('sharing_stopped', sharingStoppedRefusal(pp, s));
    const at = nowIso();
    const id = await tx(() => {
      run('UPDATE v2_sessions SET agent_stopped = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?', stop ? 1 : 0, at, pp.wsId, key);
      audit(pp.wsId, pp.userId, stop ? 'session.agent_stopped' : 'session.agent_resumed', null, at);
      return writeDirective(pp.wsId, stop ? 'stop' : 'resume', [key], null, null);
    });
    return {directive_id: id, agent_stopped: stop};
  }
  function listSessions(pp) {
    function goalLabel(id) {
      if (!id) return null;
      const g = goalRow(pp.wsId, id);
      if (g && canReadGoal(pp, goalObj(g))) return {id: g.id, title: g.title, version: g.version};
      return {id: null, title: null, private: true};
    }
    const mine = all('SELECT * FROM v2_sessions WHERE ws_id = ? AND user_id = ? ORDER BY started_at DESC', pp.wsId, pp.userId).map(s => {
      const e = openEpoch(pp.wsId, s.session_key);
      const usage = get('SELECT COUNT(*) AS requests, COALESCE(SUM(input), 0) AS input, COALESCE(SUM(output), 0) AS output FROM v2_usage WHERE ws_id = ? AND session_key = ?', pp.wsId, s.session_key);
      return {
        session_key: s.session_key, harness: s.harness, repo_alias: s.repo_alias,
        title: s.title, started_at: s.started_at, state: s.state, stopped_at: s.stopped_at,
        ended_reason: s.ended_reason, device: sharedFrom(pp.wsId, s.device_id),
        current_epoch: e ? {...epochOut(e), goal: goalLabel(e.goal_id)} : null,
        governing_goal: goalLabel(s.governing_goal_id), agent_stopped: !!s.agent_stopped,
        stop_status: stopStatus(pp.wsId, s.session_key), conflicts: s.conflicts, usage
      };
    });
    const everyone = pp.wsRole === 'owner' ? all("SELECT s.*, u.name AS owner_name FROM v2_sessions s LEFT JOIN ba_user u ON u.id = s.user_id WHERE s.ws_id = ? AND s.state <> 'stopped' ORDER BY s.started_at DESC", pp.wsId).map(s => ({
      session_key: s.session_key, owner: {id: s.user_id, name: personName(s.user_id, s.owner_name)},
      repo_alias: s.repo_alias, harness: s.harness, started_at: s.started_at, state: s.state,
      agent_stopped: !!s.agent_stopped, stop_status: stopStatus(pp.wsId, s.session_key)
    })) : null;
    return {mine, all: everyone};
  }
  return {endSessions, sessionRow, openEpoch, ownSession, putSession, openBindingEpoch, USAGE_FIELDS, ingestUsage, stopSharing, deleteSession, setAgentStop, listSessions};
}

exports.create_sessions = create_sessions;
