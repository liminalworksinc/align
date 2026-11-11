'use strict';

function create_value(resources) {
  const { appsSentGoalVersion, ESTIMATES, diffOf, getChangeRequest, all, get,
    run, tx, badRequest, conflict, event, goalObj, goalRow, parentIds, newId,
    nowIso, take, canReadGoal, oneOf, memberName, cleanValueText, followUpUrl,
    spanWords, VALUE_EDIT_DAYS, VALUE_NOTE_MAX, readDate } = resources;
  const editMs = VALUE_EDIT_DAYS * 24 * 3600 * 1000;
  const VALUE_ACTIONS = ['viewed', 'reported', 'follow_up'];

  function approved(pp, goalId, requestId) {
    const cr = getChangeRequest(pp, requestId, goalId);
    if (cr.state !== 'approved' || !cr.approved_by || !cr.decided_at)
      throw conflict('not_approved', "This change request isn't approved, so it has no value card.");
    return cr;
  }
  function project(row, pp, now) {
    return {
      id: row.id,
      person: { id: row.person_id, name: memberName(row.person_id) },
      estimate: row.estimate,
      note: row.note,
      created_at: row.created_at,
      updated_at: row.updated_at,
      can_edit: row.person_id === pp.userId && now - readDate().parse(row.created_at) < editMs
    };
  }
  function reportRows(ws, requestId) {
    return all('SELECT id, person_id, estimate, note, created_at, updated_at FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? ORDER BY created_at, id', ws, requestId);
  }
  function valueView(pp, goalId, requestId) {
    const cr = approved(pp, goalId, requestId);
    const g = goalRow(pp.wsId, cr.goal.id);
    function readable(id) {
      const row = goalRow(pp.wsId, id);
      return row && canReadGoal(pp, goalObj(row)) ? { id: row.id, title: row.title } : null;
    }
    const parents = parentIds(pp.wsId, g.id).map(readable).filter(Boolean);
    const depIds = [
      ...all('SELECT g.id FROM v2_goals g, json_each(g.depends_on_json) d WHERE g.ws_id = ? AND d.value = ?', pp.wsId, g.id).map(r => r.id),
      ...all("SELECT DISTINCT source_goal_id AS id FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved' AND source_goal_id IS NOT NULL", pp.wsId, g.id).map(r => r.id)
    ];
    const ids = new Set(depIds);
    ids.delete(g.id);
    const dependents = [...ids].sort().map(readable).filter(Boolean);
    const team = g.pod_id ? get('SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?', pp.wsId, g.pod_id) ?? null : null;
    const launched = cr.launch === 'launched' && cr.version !== null;
    const directive = launched ? get("SELECT id FROM v2_directives WHERE ws_id = ? AND goal_id = ? AND kind = 'goal_version' AND json_extract(goal_json, '$.version') = ? ORDER BY seq LIMIT 1", pp.wsId, g.id, cr.version) : undefined;
    let delivery = null, firstApplied = null;
    if (directive) {
      delivery = {
        sessions: get('SELECT COUNT(*) AS n FROM v2_directive_targets WHERE directive_id = ?', directive.id)?.n ?? 0,
        received: get('SELECT COUNT(DISTINCT session_key) AS n FROM v2_receipts WHERE directive_id = ?', directive.id)?.n ?? 0,
        applied: get("SELECT COUNT(DISTINCT session_key) AS n FROM v2_receipts WHERE directive_id = ? AND state IN ('applied','enforced')", directive.id)?.n ?? 0
      };
      firstApplied = get("SELECT MIN(recorded_at) AS at FROM v2_receipts WHERE directive_id = ? AND state IN ('applied','enforced')", directive.id)?.at ?? null;
    }
    const decided = readDate().parse(cr.decided_at);
    const toApplied = firstApplied ? spanWords(Math.max(0, readDate().parse(firstApplied) - decided)) : null;
    const launchedAt = launched ? cr.launch_decided_at : null;
    const toLaunch = launchedAt ? spanWords(Math.max(0, readDate().parse(launchedAt) - decided)) : null;
    const now = readDate().now();
    const participants = new Set([cr.requester.id, cr.approved_by.id, ...cr.approvers.map(p => p.id), ...cr.revisions.map(r => r.author.id)]);
    const seesAll = pp.wsRole === 'owner' || participants.has(pp.userId);
    const rows = reportRows(pp.wsId, cr.id);
    const mine = rows.find(r => r.person_id === pp.userId);
    return {
      change_request_id: cr.id,
      goal: { id: g.id, title: g.title, version: launched ? cr.version : null, base_version: cr.base_version, team },
      launch: cr.launch ?? 'launched',
      launched_at: launchedAt,
      diff: diffOf(pp, cr.id)?.diff ?? {},
      approved_by: cr.approved_by,
      decided_at: cr.decided_at,
      created_at: cr.created_at,
      approved_without_evidence: cr.approved_without_evidence,
      affected: { parents, dependents },
      delivery,
      apps: launched ? { everyone: pp.wsRole === 'owner', items: appsSentGoalVersion(pp, g.id, cr.version) } : null,
      measured: { proposal_to_decision: spanWords(Math.max(0, decided - readDate().parse(cr.created_at))), decision_to_launch: toLaunch, decision_to_first_applied: toApplied },
      my_report: mine ? project(mine, pp, now) : null,
      reports: (seesAll ? rows : rows.filter(r => r.person_id === pp.userId)).map(r => project(r, pp, now)),
      sees_all_reports: seesAll,
      follow_up_url: followUpUrl()
    };
  }
  async function recordValue(pp, goalId, requestId, b) {
    const cr = approved(pp, goalId, requestId);
    const action = oneOf(b, 'action', VALUE_ACTIONS);
    let estimate = null, note = null;
    if (action === 'reported') {
      estimate = oneOf(b, 'estimate', ESTIMATES);
      if (b.note !== undefined && b.note !== null && typeof b.note !== 'string') throw badRequest('note must be text');
      const cleaned = typeof b.note === 'string' ? cleanValueText(b.note) : '';
      if (cleaned.length > VALUE_NOTE_MAX) throw badRequest(`note: at most ${VALUE_NOTE_MAX} characters`);
      note = cleaned || null;
    }
    take('value:' + pp.userId, 30, 60000);
    const ws = pp.wsId, user = pp.userId;
    if (action === 'viewed') {
      const recorded = await tx(() => event('value_card_viewed', { ws, user }));
      return { recorded, report: null };
    }
    if (action === 'follow_up') {
      const recorded = await tx(() => event('follow_up_clicked', { ws, user }));
      return { recorded, report: null };
    }
    const at = nowIso();
    const recorded = await tx(() => {
      const prev = get('SELECT * FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? AND person_id = ?', ws, cr.id, user);
      if (prev) {
        if (readDate().parse(at) - readDate().parse(prev.created_at) >= editMs)
          throw conflict('edit_closed', `A value report can be changed for ${VALUE_EDIT_DAYS} days after it was saved.`);
        run('UPDATE v2_value_reports SET estimate = ?, note = ?, updated_at = ? WHERE id = ?', estimate, note, at, prev.id);
      } else {
        run('INSERT INTO v2_value_reports (id, ws_id, change_request_id, person_id, estimate, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId('vr'), ws, cr.id, user, estimate, note, at, at);
      }
      return event('value_reported', { ws, user, props: { estimate } });
    });
    const row = get('SELECT id, person_id, estimate, note, created_at, updated_at FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? AND person_id = ?', ws, cr.id, user);
    return { recorded, report: project(row, pp, readDate().now()) };
  }
  return { valueView, VALUE_ACTIONS, recordValue };
}
module.exports = { create_value };
