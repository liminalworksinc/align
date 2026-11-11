'use strict';

function create_records(resources) {
  const get = resources.get;
  const V2Error = resources.V2Error;
  const requestView = resources.requestView;
  const requestViews = resources.requestViews;
  const CHANGE_REQUEST_STATES = ['pending', 'countered', 'approved', 'rejected', 'withdrawn', 'superseded'];
  const Q01 = "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'v2_change_requests'";

  function summary(v) {
    return {
      id: v.id,
      goal: { id: v.goal.id, title: v.goal.title },
      state: v.state,
      launch: v.launch,
      condition: v.condition,
      requested_by: v.requester,
      base_version: v.base_version,
      revision: v.revision,
      reason: v.reason,
      evidence: v.revisions.flatMap(r => r.evidence).map(link => ({
        id: link.id,
        revision: link.revision,
        kind: link.kind,
        url: link.url,
        label: link.label,
        source: link.source,
        reported_as: link.reported_as,
        added_by: link.added_by,
        added_at: link.added_at
      })),
      snapshot: v.revisions.find(r => r.revision === v.revision)?.snapshot ?? null,
      created_at: v.created_at,
      updated_at: v.updated_at
    };
  }

  function detail(v) {
    const decided = v.state === 'approved' || v.state === 'rejected' ||
      (v.state === 'superseded' && !!v.approved_by);
    const diff = {};
    const { before, after } = v.diff;
    if (after.title !== undefined) diff.title = { before: before.title, after: after.title };
    if (after.measures !== undefined) diff.measures = { before: before.measures, after: after.measures };
    if (after.depends_on !== undefined) diff.depends_on = {
      before: before.depends_on, after: after.depends_on, hidden: v.diff.hidden_depends_on
    };
    if (after.status !== undefined) diff.status = { before: before.status, after: after.status };
    if (after.limits !== undefined) diff.limits = { before: before.limits ?? [], after: after.limits };
    return {
      ...summary(v),
      decided_by: decided ? v.approved_by ?? v.rejected_by : null,
      decision_note: decided ? v.decision_note : null,
      diff,
      resulting_version: v.state === 'approved' && v.launch === 'launched' ? v.version : null,
      launch_decided_by: v.launch_decided_by,
      launch_decided_at: v.launch_decided_at,
      approved_without_evidence: v.approved_without_evidence,
      decided_at: decided ? v.decided_at : null
    };
  }

  function listChangeRequests(pp, state, limit = 100) {
    if (!get(Q01)) return [];
    return requestViews(pp, { state }).slice(0, Math.max(0, limit)).map(summary);
  }

  function getChangeRequest(pp, id) {
    if (!get(Q01)) return null;
    try {
      return detail(requestView(pp, id));
    } catch (error) {
      if (error instanceof V2Error && error.status === 404) return null;
      throw error;
    }
  }

  return { CHANGE_REQUEST_STATES, listChangeRequests, getChangeRequest };
}

module.exports = { create_records };
