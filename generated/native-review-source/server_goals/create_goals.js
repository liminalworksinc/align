'use strict';

function create_goals(resources) {
  const all = resources.all;
  const audit = resources.audit;
  const get = resources.get;
  const run = resources.run;
  const tx = resources.tx;
  const badRequest = resources.badRequest;
  const conflict = resources.conflict;
  const forbidden = resources.forbidden;
  const notFound = resources.notFound;
  const newId = resources.newId;
  const nowIso = resources.nowIso;
  const sha256hex = resources.sha256hex;
  const canBind = resources.canBind;
  const canReadGoal = resources.canReadGoal;
  const goalVersionDirective = resources.goalVersionDirective;
  const event = resources.event;
  const limitsIn = resources.limitsIn;
  const limitsOf = resources.limitsOf;
  const need = resources.need;
  const personName = resources.personName;
  const expireOpenRequests = resources.expireOpenRequests;
  const releaseHold = resources.releaseHold;
  const endAlignmentsToClosedGoal = resources.endAlignmentsToClosedGoal;
  const feedAllocation = resources.feedAllocation;
  const workspaceSteering = resources.workspaceSteering;
  const supersedeReallocations = resources.supersedeReallocations;
  const cleanName = resources.cleanName;
  const optStr = resources.optStr;
  const str = resources.str;
  const isBlankText = resources.isBlankText;
  const DEPENDS_ON_MAX = resources.DEPENDS_ON_MAX;

  const GOAL_LEVELS = ['company', 'team'];
  const WIRE_VISIBILITIES = ['private', 'team', 'workspace'];
  const GOAL_STATUSES = ['active', 'achieved', 'dropped'];
  const DEPENDENCY_CYCLE = 'That would make these goals depend on each other in a loop.';

  function toWireVisibility(visibility) { return visibility === 'pod' ? 'team' : visibility; }
  function goalObj(g) {
    return { kind: 'goal', ownerId: g.owner_id, visibility: g.visibility, podId: g.pod_id };
  }
  function goalRow(wsId, goalId) {
    return get('SELECT * FROM v2_goals WHERE ws_id = ? AND id = ?', wsId, goalId);
  }
  function visibleGoal(pp, goalId) {
    const g = goalRow(pp.wsId, goalId);
    if (!g) throw notFound();
    need(pp, 'goal.read', goalObj(g));
    return g;
  }
  function goalCore(g) {
    const owner = get('SELECT name FROM ba_user WHERE id = ?', g.owner_id);
    const pod = g.pod_id ? get('SELECT id, name FROM v2_pods WHERE id = ?', g.pod_id) : null;
    return {
      id: g.id, version: g.version, title: g.title,
      measures: JSON.parse(g.measures_json), status: g.status,
      level: g.level ?? 'team', visibility: toWireVisibility(g.visibility),
      owner: { id: g.owner_id, name: personName(g.owner_id, owner?.name) },
      team: pod ? { id: pod.id, name: pod.name } : null,
      anchors: JSON.parse(g.anchors_json),
      depends_on: JSON.parse(g.depends_on_json || '[]'),
      limits: limitsOf(g), target_share: g.target_share ?? null
    };
  }
  function parentIds(wsId, goalId) {
    return all("SELECT DISTINCT target_goal_id FROM v2_alignments WHERE ws_id = ? AND source_goal_id = ? AND state = 'approved' ORDER BY target_goal_id", wsId, goalId).map(r => r.target_goal_id);
  }
  function reviewParents(wsId, goalId, at, only) {
    for (const id of only ? [only] : parentIds(wsId, goalId)) {
      const parent = goalRow(wsId, id);
      if (!parent) continue;
      run('INSERT INTO v2_goal_acks (ws_id, goal_id, parent_id, parent_version, at) VALUES (?, ?, ?, ?, ?)\n       ON CONFLICT (goal_id, parent_id) DO UPDATE SET parent_version = excluded.parent_version, at = excluded.at', wsId, goalId, id, parent.version, at);
    }
  }
  function parentsFor(pp, g) {
    const out = [];
    for (const id of parentIds(pp.wsId, g.id)) {
      const parent = goalRow(pp.wsId, id);
      if (!parent || !canReadGoal(pp, goalObj(parent))) continue;
      const ack = get('SELECT parent_version FROM v2_goal_acks WHERE goal_id = ? AND parent_id = ?', g.id, id);
      const reviewed = ack?.parent_version ?? null;
      out.push({ id: parent.id, title: parent.title, version: parent.version,
        reviewed_version: reviewed, stale: reviewed === null || reviewed < parent.version });
    }
    return out;
  }
  async function confirmParent(pp, goalId, parentId) {
    const g = goalRow(pp.wsId, goalId);
    if (!g) throw notFound();
    need(pp, 'goal.edit', goalObj(g));
    if (!parentIds(pp.wsId, goalId).includes(parentId)) throw notFound();
    const at = nowIso();
    await tx(() => {
      reviewParents(pp.wsId, goalId, at, parentId);
      audit(pp.wsId, pp.userId, 'goal.parent_reviewed', goalId, at);
    });
    return serializeGoal(pp, goalRow(pp.wsId, goalId));
  }
  function transferGoals(wsId, userId) {
    return new Set(all("SELECT DISTINCT a.target_goal_id FROM v2_alignments a\n       JOIN v2_alignment_revisions r ON r.alignment_id = a.id AND r.revision = a.revision\n       JOIN v2_alignment_sessions s ON s.alignment_id = a.id AND s.revision = a.revision\n       JOIN v2_sessions x ON x.ws_id = s.ws_id AND x.session_key = s.session_key\n       WHERE a.ws_id = ? AND a.state = 'approved' AND r.choice = 'work_toward' AND x.user_id = ?", wsId, userId).map(r => r.target_goal_id));
  }
  function transferFor(wsId, sessionKey, goalId) {
    return get("SELECT a.id FROM v2_alignments a\n       JOIN v2_alignment_revisions r ON r.alignment_id = a.id AND r.revision = a.revision\n       JOIN v2_alignment_sessions s ON s.alignment_id = a.id AND s.revision = a.revision\n       WHERE a.ws_id = ? AND a.state = 'approved' AND r.choice = 'work_toward' AND a.target_goal_id = ? AND s.session_key = ?\n       ORDER BY a.updated_at DESC LIMIT 1", wsId, goalId, sessionKey)?.id ?? null;
  }
  function bindableFor(pp, g, transfers = transferGoals(pp.wsId, pp.userId)) {
    if (g.status !== 'active') return false;
    return canBind(pp, goalObj(g), transfers.has(g.id));
  }
  function serializeGoal(pp, g, transfers) {
    const core = goalCore(g);
    const deps = core.depends_on.filter(id => {
      const row = goalRow(pp.wsId, id);
      return row && canReadGoal(pp, goalObj(row));
    });
    return { ...core, depends_on: deps, bindable: bindableFor(pp, g, transfers), contributes_to: parentsFor(pp, g) };
  }
  function visibleGoals(pp) {
    return all('SELECT * FROM v2_goals WHERE ws_id = ? ORDER BY created_at, id', pp.wsId).filter(g => canReadGoal(pp, goalObj(g)));
  }
  function goalsFeed(pp) {
    const transfers = transferGoals(pp.wsId, pp.userId);
    const shares = feedAllocation(pp);
    const goals = visibleGoals(pp).map(g => ({ ...serializeGoal(pp, g, transfers), allocation: shares.get(g.id) ?? null }));
    const steering = workspaceSteering(pp.wsId);
    const version = sha256hex(JSON.stringify({ goals, steering })).slice(0, 16);
    return { version, goals, steering };
  }
  function unreadableGoals(pp, ids) {
    return ids.filter(id => {
      const g = goalRow(pp.wsId, id);
      return g && !canReadGoal(pp, goalObj(g));
    });
  }
  function measuresIn(value, prev = []) {
    if (value === undefined) return prev;
    if (!Array.isArray(value)) throw badRequest('measures must be a list');
    if (value.length > 10) throw badRequest('measures: at most 10');
    const out = [];
    for (const b of value) {
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw badRequest('each measure must be an object with text');
      const text = str(b, 'text', 300);
      const target = optStr(b, 'target', 100);
      const keep = typeof b.id === 'string' && prev.some(m => m.id === b.id) && !out.some(m => m.id === b.id);
      out.push({ id: keep ? b.id : newId('m'), text, target });
    }
    return out;
  }
  function anchorsIn(value, prev = { repos: [], branch_patterns: [], issues: [] }) {
    if (value === undefined) return prev;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('anchors must be an object');
    function list(key) {
      const v = value[key];
      if (v === undefined) return prev[key];
      if (!Array.isArray(v)) throw badRequest(`anchors.${key} must be a list`);
      if (v.length > 20) throw badRequest(`anchors.${key}: at most 20`);
      const out = [];
      for (const item of v) {
        if (typeof item !== 'string') throw badRequest(`anchors.${key} must be a list of strings`);
        const text = cleanName(item).trim();
        if (text.length > 200) throw badRequest(`anchors.${key} items are too long (max 200 characters)`);
        if (!isBlankText(text) && !out.includes(text)) out.push(text);
      }
      return out;
    }
    return { repos: list('repos'), branch_patterns: list('branch_patterns'), issues: list('issues') };
  }
  function tooManyDependencies(retained) {
    const hidden = retained === 1 ? ", and 1 goal you can't see stays on its list" : retained > 0 ? `, and ${retained} goals you can't see stay on its list` : '';
    throw badRequest(`A goal can depend on at most ${DEPENDS_ON_MAX} other goals${hidden}; choose fewer.`, 'too_many_dependencies');
  }
  function dependsIn(pp, value, goalId, prev = [], keepFrom = prev) {
    if (value === undefined) return prev;
    if (!Array.isArray(value)) throw badRequest('depends_on must be a list of goal ids');
    if (value.length > DEPENDS_ON_MAX) tooManyDependencies(0);
    const out = [];
    for (const id of value) {
      if (typeof id !== 'string' || id === goalId) throw badRequest('depends_on must list other goals');
      const row = goalRow(pp.wsId, id);
      if (!row || !canReadGoal(pp, goalObj(row))) throw notFound();
      if (!out.includes(id)) out.push(id);
    }
    const hidden = unreadableGoals(pp, keepFrom).filter(id => !out.includes(id));
    if (out.length + hidden.length > DEPENDS_ON_MAX) tooManyDependencies(hidden.length);
    return [...out, ...hidden];
  }
  function dependencyCycle(wsId, goalId, deps) {
    const graph = new Map(all('SELECT id, depends_on_json FROM v2_goals WHERE ws_id = ?', wsId).map(r => [r.id, JSON.parse(r.depends_on_json || '[]')]));
    graph.set(goalId, deps);
    const seen = new Set();
    const stack = [...deps];
    while (stack.length) {
      const id = stack.pop();
      if (id === goalId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(graph.get(id) ?? []));
    }
    return false;
  }
  function goalsDependingOn(wsId, goalId) {
    const reverse = new Map();
    for (const r of all('SELECT id, depends_on_json FROM v2_goals WHERE ws_id = ?', wsId)) {
      for (const id of JSON.parse(r.depends_on_json || '[]')) {
        if (!reverse.has(id)) reverse.set(id, []);
        reverse.get(id).push(r.id);
      }
    }
    const out = new Set();
    const stack = [...(reverse.get(goalId) ?? [])];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id) || id === goalId) continue;
      out.add(id);
      stack.push(...(reverse.get(id) ?? []));
    }
    return out;
  }
  function assertNoDependencyCycle(wsId, goalId, deps) {
    if (dependencyCycle(wsId, goalId, deps)) throw conflict('cycle', DEPENDENCY_CYCLE);
  }
  function contentHash(c) {
    return sha256hex(JSON.stringify({
      title: c.title, measures: c.measures, anchors: c.anchors, status: c.status,
      ...(c.depends_on?.length ? { depends_on: [...c.depends_on].sort() } : {}),
      ...(c.limits?.length ? { limits: c.limits } : {}),
      ...(c.target_share !== null && c.target_share !== undefined ? { target_share: c.target_share } : {})
    }));
  }
  function sameContent(a, b) { return contentHash(a) === contentHash(b); }
  function contentOf(g) {
    return { title: g.title, measures: JSON.parse(g.measures_json), anchors: JSON.parse(g.anchors_json),
      status: g.status, depends_on: JSON.parse(g.depends_on_json || '[]'), limits: limitsOf(g), target_share: g.target_share ?? null };
  }
  function versionContentOf(wsId, goalId, version) {
    const row = get('SELECT title, measures_json, anchors_json, status, depends_on_json, limits_json, target_share FROM v2_goal_versions WHERE ws_id = ? AND goal_id = ? AND version = ?', wsId, goalId, version);
    return row ? contentOf(row) : undefined;
  }
  function nextContent(pp, goalId, prev, b, keepDepsFrom = prev.depends_on, loopOk = false) {
    const status = b.status ?? prev.status;
    if (!GOAL_STATUSES.includes(status)) throw badRequest('status must be active, achieved or dropped');
    const next = {
      title: b.title === undefined ? prev.title : str(b, 'title', 300),
      measures: measuresIn(b.measures, prev.measures), anchors: anchorsIn(b.anchors, prev.anchors), status,
      depends_on: dependsIn(pp, b.depends_on, goalId, prev.depends_on, keepDepsFrom),
      limits: limitsIn(b.limits, prev.limits), target_share: targetIn(b.target_share, prev.target_share)
    };
    if (!loopOk) assertNoDependencyCycle(pp.wsId, goalId, next.depends_on);
    if (sameContent(next, prev)) throw conflict('no_change', 'Nothing changed, so no new version was saved.');
    return next;
  }
  function targetIn(value, prev = null) {
    if (value === undefined) return prev;
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw badRequest('target_share must be a whole percent from 0 to 100, or null');
    return value;
  }
  function assertTargetsFit(wsId, next) {
    let others = 0;
    for (const row of all("SELECT id, target_share FROM v2_goals WHERE ws_id = ? AND status = 'active' AND target_share IS NOT NULL", wsId)) {
      if (!next.has(row.id)) others += row.target_share;
    }
    let sum = 0;
    for (const value of next.values()) sum += value ?? 0;
    const total = sum + others;
    if (total > 100) throw conflict('targets_over_100', `Targets of active goals would add up to ${total}%; keep them at 100% or less (other goals already take ${others}%).`);
  }
  function insertGoal(pp, f, at) {
    const id = newId('g');
    const limits = f.limits ?? [];
    const target = f.targetShare ?? null;
    if (target !== null) assertTargetsFit(pp.wsId, new Map([[id, target]]));
    run("INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, level, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, created_at, updated_at)\n     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
      id, pp.wsId, pp.userId, f.podId, f.visibility, f.level, f.title, JSON.stringify(f.measures), JSON.stringify(f.anchors), JSON.stringify(f.dependsOn), JSON.stringify(limits), target, at, at);
    run("INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, content_hash, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
      pp.wsId, id, f.title, JSON.stringify(f.measures), JSON.stringify(f.anchors), JSON.stringify(f.dependsOn), JSON.stringify(limits), target,
      contentHash({ title: f.title, measures: f.measures, anchors: f.anchors, status: 'active', depends_on: f.dependsOn, limits, target_share: target }), pp.userId, at);
    audit(pp.wsId, pp.userId, 'goal.created', id, at);
    return id;
  }
  async function createGoal(pp, b) {
    const level = b.level ?? 'team';
    if (!GOAL_LEVELS.includes(level)) throw badRequest('level must be company or team');
    let visibility = b.visibility ?? 'workspace';
    if (!WIRE_VISIBILITIES.includes(visibility)) throw badRequest('visibility must be private, team or workspace');
    if (visibility === 'team') visibility = 'pod';
    const podId = optStr(b, 'team_id', 64);
    if (level === 'company') {
      if (podId) throw badRequest('A company goal has no team');
      if (visibility !== 'workspace') throw badRequest('A company goal is visible to the whole workspace');
    }
    if (podId && !get('SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?', pp.wsId, podId)) throw notFound();
    if (visibility === 'pod' && !podId) throw badRequest('A team goal needs a team');
    need(pp, 'goal.create', { kind: 'goal_draft', podId });
    if (level === 'company' && pp.wsRole !== 'owner') throw forbidden('owner_only', 'Only a workspace owner can create a company goal.');
    const title = str(b, 'title', 300);
    const measures = measuresIn(b.measures ?? []);
    const anchors = anchorsIn(b.anchors ?? {});
    const dependsOn = dependsIn(pp, b.depends_on ?? [], null);
    const limits = limitsIn(b.limits ?? [], []);
    const targetShare = targetIn(b.target_share);
    const at = nowIso();
    if ((get('SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?', pp.wsId)?.n ?? 0) >= 1000) throw conflict('too_many_goals', 'This workspace has the maximum number of goals.');
    const id = await tx(() => {
      if ((get('SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?', pp.wsId)?.n ?? 0) >= 1000) throw conflict('too_many_goals', 'This workspace has the maximum number of goals.');
      const created = insertGoal(pp, { title, level, podId, visibility, measures, anchors, dependsOn, limits, targetShare }, at);
      if (limits.length) event('first_limit', { ws: pp.wsId, user: pp.userId, at });
      return created;
    });
    return serializeGoal(pp, goalRow(pp.wsId, id));
  }
  function supersedeOpen(wsId, goalId, actorId, at) {
    for (const row of all("SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND state IN ('pending','countered')", wsId, goalId)) {
      run("UPDATE v2_change_requests SET state = 'superseded', updated_at = ? WHERE id = ?", at, row.id);
      audit(wsId, actorId, 'change_request.superseded', row.id, at);
    }
  }
  function supersedeUnlaunched(wsId, goalId, actorId, at) {
    for (const row of all("SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND state = 'approved' AND launch IN ('pending','not_yet')", wsId, goalId)) {
      run("UPDATE v2_change_requests SET state = 'superseded', launch = 'superseded', updated_at = ? WHERE id = ?", at, row.id);
      audit(wsId, actorId, 'change_request.superseded', row.id, at);
    }
  }
  function writeGoalVersion(g, content, actorId, at, authorId = actorId) {
    const c = { ...content, target_share: content.target_share ?? null };
    if (c.depends_on.length) assertNoDependencyCycle(g.ws_id, g.id, c.depends_on);
    const previousTarget = g.target_share ?? null;
    if (c.status === 'active' && c.target_share !== null && (g.status !== 'active' || previousTarget === null || c.target_share > previousTarget)) assertTargetsFit(g.ws_id, new Map([[g.id, c.target_share]]));
    const version = g.version + 1;
    const changed = run('UPDATE v2_goals SET version = ?, title = ?, measures_json = ?, anchors_json = ?, depends_on_json = ?, limits_json = ?, target_share = ?, status = ?, updated_at = ? WHERE ws_id = ? AND id = ? AND version = ?',
      version, c.title, JSON.stringify(c.measures), JSON.stringify(c.anchors), JSON.stringify(c.depends_on), JSON.stringify(c.limits), c.target_share, c.status, at, g.ws_id, g.id, g.version);
    if (!changed) throw conflict('stale_version', 'This goal changed while you were editing. Reload to start from its latest version.');
    run('INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, content_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      g.ws_id, g.id, version, c.title, JSON.stringify(c.measures), JSON.stringify(c.anchors), JSON.stringify(c.depends_on), JSON.stringify(c.limits), c.target_share, c.status, contentHash(c), authorId, at);
    audit(g.ws_id, actorId, 'goal.versioned', g.id, at);
    if (c.limits.length) event('first_limit', { ws: g.ws_id, user: authorId, at });
    reviewParents(g.ws_id, g.id, at);
    const next = goalRow(g.ws_id, g.id);
    goalVersionDirective(g.ws_id, next);
    supersedeUnlaunched(g.ws_id, g.id, actorId, at);
    supersedeReallocations(g.ws_id, g.id, actorId, at);
    if (c.status === 'achieved' || c.status === 'dropped') {
      supersedeOpen(g.ws_id, g.id, actorId, at);
      expireOpenRequests(g.ws_id, g.id, actorId, at);
      releaseHold(g.ws_id, g.id, actorId, at);
      endAlignmentsToClosedGoal(g.ws_id, g.id, actorId, at);
    }
    return next;
  }
  async function newGoalVersion(pp, goalId, b) {
    const row = goalRow(pp.wsId, goalId);
    if (!row) throw notFound();
    need(pp, 'goal.edit', goalObj(row));
    if (b.version !== undefined && b.version !== row.version) throw conflict('stale_version', `This goal changed while you were editing. Reload to start from version ${row.version}.`);
    const next = nextContent(pp, row.id, contentOf(row), b);
    await tx(() => writeGoalVersion(row, next, pp.userId, nowIso()));
    return serializeGoal(pp, goalRow(pp.wsId, goalId));
  }
  function goalDetail(pp, goalId) {
    const row = visibleGoal(pp, goalId);
    const versions = all('SELECT version, title, status, target_share, content_hash, created_at, created_by FROM v2_goal_versions WHERE goal_id = ? ORDER BY version DESC', row.id);
    const contributions = all("SELECT source_goal_id, id AS alignment_id FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved'", pp.wsId, row.id).map(c => {
      const source = c.source_goal_id ? goalRow(pp.wsId, c.source_goal_id) : null;
      return { goal: source && canReadGoal(pp, goalObj(source)) ? { id: source.id, title: source.title } : null };
    }).filter(c => c.goal);
    return {
      goal: serializeGoal(pp, row),
      hidden_depends_on: unreadableGoals(pp, JSON.parse(row.depends_on_json || '[]')).length,
      versions: versions.map(v => ({ ...v, created_by: undefined })), contributions,
      can_edit: row.owner_id === pp.userId && pp.wsRole !== 'viewer',
      can_propose: row.owner_id !== pp.userId && pp.wsRole !== 'viewer' && row.status === 'active'
    };
  }
  return { GOAL_LEVELS, WIRE_VISIBILITIES, toWireVisibility, GOAL_STATUSES, goalObj, goalRow, visibleGoal, goalCore,
    parentIds, reviewParents, confirmParent, transferGoals, transferFor, bindableFor, serializeGoal, visibleGoals,
    goalsFeed, unreadableGoals, dependencyCycle, goalsDependingOn, DEPENDENCY_CYCLE, assertNoDependencyCycle,
    sameContent, contentOf, versionContentOf, nextContent, targetIn, assertTargetsFit, insertGoal, createGoal,
    writeGoalVersion, newGoalVersion, goalDetail };
}

module.exports = { create_goals };
