'use strict';

function create_evidence(resources) {
  const all = resources.all;
  const get = resources.get;
  const badRequest = resources.badRequest;
  const goalTargets = resources.goalTargets;
  const authorize = resources.authorize;
  const goalSpend = resources.goalSpend;
  const memberName = resources.memberName;
  const oneOf = resources.oneOf;
  const str = resources.str;
  const readURL = resources.readURL;
  const readDate = resources.readDate;
  const EVIDENCE_KINDS = ['pr', 'ci_run', 'incident', 'dashboard', 'doc', 'other'];
  const EVIDENCE_PER_REVISION = 10;

  function evidenceInput(b) {
    const kind = oneOf(b, 'kind', EVIDENCE_KINDS);
    const raw = str(b, 'url', 2048);
    let url;
    try {
      const Constructor = readURL();
      url = new Constructor(raw);
    } catch (error) {
      throw badRequest('url must be an https URL');
    }
    if (url.protocol !== 'https:' || !url.hostname) {
      throw badRequest('url must be an https URL');
    }
    if (url.username || url.password) {
      throw badRequest('url must not contain a user name or password');
    }
    if (url.href.length > 2048) {
      throw badRequest('url is too long (max 2048 characters)');
    }
    const label = str(b, 'label', 120);
    if (/[\x00-\x1f\x7f]/.test(label)) {
      throw badRequest('label must be one line of text');
    }
    return { kind, url: url.href, label };
  }

  function evidenceRows(requestId) {
    return all('SELECT * FROM v2_change_request_evidence WHERE change_request_id = ? ORDER BY revision, added_at, id', requestId);
  }

  function evidenceCount(requestId, revision) {
    return get('SELECT COUNT(*) AS n FROM v2_change_request_evidence WHERE change_request_id = ? AND revision = ?', requestId, revision)?.n ?? 0;
  }

  function evidenceView(e, canRemove) {
    return {
      id: e.id,
      revision: e.revision,
      kind: e.kind,
      url: e.url,
      label: e.label,
      source: e.source,
      reported_as: e.source === 'agent' ? 'agent-reported' : 'self-reported',
      added_by: { id: e.added_by, name: memberName(e.added_by) },
      added_at: e.added_at,
      can_remove: canRemove
    };
  }

  function recordSnapshot(ws, goalId, at) {
    const from = new (readDate())(readDate().parse(at) - 30 * 24 * 3600 * 1000).toISOString();
    const to = at;
    const snapshot = {
      recorded_at: at,
      window: { from, to, days: 30 },
      spend: goalSpend(ws, goalId, from, to),
      bound_sessions: goalTargets(ws, goalId).length,
      last_activity_at: get('SELECT MAX(at) AS at FROM (\n       SELECT MAX(u.ts) AS at FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE e.ws_id = ? AND e.goal_id = ?\n       UNION ALL SELECT MAX(starts_at) FROM v2_epochs WHERE ws_id = ? AND goal_id = ?\n       UNION ALL SELECT MAX(at) FROM v2_activity WHERE ws_id = ? AND goal_id = ?\n     )', ws, goalId, ws, goalId, ws, goalId)?.at ?? null
    };
    return JSON.stringify(snapshot);
  }

  function snapshotView(pp, json, revision) {
    if (!json) return null;
    const snapshot = JSON.parse(json);
    const ok = authorize(pp, 'spend.read', { kind: 'workspace' }).ok;
    return {
      revision,
      recorded_by: 'align',
      recorded_at: snapshot.recorded_at,
      window: snapshot.window,
      spend: ok ? snapshot.spend : null,
      spend_hidden: !ok,
      bound_sessions: snapshot.bound_sessions,
      last_activity_at: snapshot.last_activity_at
    };
  }

  return { EVIDENCE_KINDS, EVIDENCE_PER_REVISION, evidenceInput, evidenceRows, evidenceCount, evidenceView, recordSnapshot, snapshotView };
}

module.exports = { create_evidence };
