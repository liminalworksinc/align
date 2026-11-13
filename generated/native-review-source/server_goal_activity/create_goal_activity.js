'use strict';

/** @typedef {object} GoalActivity Caller-owned activity result. */
/** @typedef {object} GoalActivityItem Caller-owned aggregate item. */
function create_goal_activity(resources) {
  const all = resources.all;
  const get = resources.get;
  const visibleGoals = resources.visibleGoals;
  const visibleGoal = resources.visibleGoal;
  const activityEvidence = resources.activityEvidence;
  const nowIso = resources.nowIso;
  const readDate = resources.readDate;
  const ACTIVITY_WINDOW_DAYS = 14;

  function seesActivityDetail(principal, goal) {
    return goal.owner_id === principal.userId ||
      (goal.pod_id && principal.pods.has(goal.pod_id)) || principal.wsRole === 'owner';
  }

  function compute(principal, goal, currentTime = readDate().now()) {
    const ws = goal.ws_id;
    const since = new (readDate())(currentTime - 14 * 24 * 3600 * 1000).toISOString();
    const lines = all(`SELECT s.session_key, s.user_id, s.harness, s.state, s.agent_stopped, s.governing_goal_id,
            (SELECT o.goal_id FROM v2_epochs o WHERE o.ws_id = s.ws_id AND o.session_key = s.session_key AND o.ends_at IS NULL) AS open_goal
     FROM v2_sessions s
     WHERE s.ws_id = ? AND EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key
                                   AND (e.ends_at IS NULL OR e.ends_at >= ?) AND (e.goal_id = ? OR s.governing_goal_id = ?))
     ORDER BY s.session_key`, ws, since, goal.id, goal.id);
    const latest = times => times.reduce((max, t) => t && (!max || t > max) ? t : max, null);
    function lastOf(key) {
      return latest([
        get('SELECT MAX(u.ts) AS t FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE u.ws_id = ? AND u.session_key = ? AND e.goal_id = ?', ws, key, goal.id)?.t,
        get('SELECT MAX(starts_at) AS t FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND goal_id = ?', ws, key, goal.id)?.t
      ]);
    }
    const by_harness = { 'claude-code': 0, codex: 0 };
    let active_now = 0;
    const mine = [];
    const cutoff = new (readDate())(currentTime - 90 * 60 * 1000).toISOString();
    for (const line of lines) {
      by_harness[line.harness]++;
      const last = lastOf(line.session_key);
      const onGoalNow = line.open_goal === goal.id || line.governing_goal_id === goal.id;
      if (line.state === 'shared' && !line.agent_stopped && onGoalNow && last && last >= cutoff) active_now++;
      if (line.user_id === principal.userId) {
        mine.push({session_key: line.session_key, harness: line.harness, state: line.state, last_activity_at: last});
      }
    }
    const last_activity_at = latest([
      get('SELECT MAX(u.ts) AS t FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE u.ws_id = ? AND e.goal_id = ?', ws, goal.id)?.t,
      get('SELECT MAX(starts_at) AS t FROM v2_epochs WHERE ws_id = ? AND goal_id = ?', ws, goal.id)?.t,
      get('SELECT MAX(at) AS t FROM v2_activity WHERE ws_id = ? AND goal_id = ?', ws, goal.id)?.t
    ]);
    let detail = null;
    if (seesActivityDetail(principal, goal)) {
      const live = nowIso();
      const files = all('SELECT path FROM v2_activity WHERE ws_id = ? AND goal_id = ? AND expires_at > ? AND path IS NOT NULL GROUP BY path ORDER BY COUNT(*) DESC, MAX(at) DESC, path LIMIT 4', ws, goal.id, live).map(row => row.path);
      const files_hidden = get(`SELECT COUNT(DISTINCT path_hash) AS n FROM v2_activity a WHERE ws_id = ? AND goal_id = ? AND expires_at > ? AND path IS NULL AND path_hash IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM v2_activity b WHERE b.ws_id = a.ws_id AND b.goal_id = a.goal_id AND b.path_hash = a.path_hash AND b.path IS NOT NULL AND b.expires_at > ?)`, ws, goal.id, live, live)?.n ?? 0;
      detail = {files, files_hidden, mine};
    }
    return {sessions: lines.length, active_now, by_harness, last_activity_at,
      evidence_class: activityEvidence({sessions: lines.length, last_activity_at}), detail};
  }

  function goalActivity(principal, id) {
    return compute(principal, visibleGoal(principal, id));
  }

  function goalsActivity(principal) {
    const teams = new Map();
    function team(id) {
      if (!id) return null;
      if (!teams.has(id)) teams.set(id, get('SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?', principal.wsId, id) ?? null);
      return teams.get(id);
    }
    const currentTime = readDate().now();
    const goals = visibleGoals(principal).filter(goal => goal.status === 'active').map(goal => ({
      goal: {id: goal.id, title: goal.title, team: team(goal.pod_id)},
      ...compute(principal, goal, currentTime)
    }));
    goals.sort((left, right) => Number(!!right.detail) - Number(!!left.detail) ||
      (right.last_activity_at ?? '').localeCompare(left.last_activity_at ?? '') ||
      left.goal.title.localeCompare(right.goal.title));
    const unbound = get(`SELECT COUNT(*) AS n FROM v2_sessions s WHERE s.ws_id = ? AND s.user_id = ? AND s.state = 'shared' AND s.governing_goal_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL AND e.goal_id IS NOT NULL)`, principal.wsId, principal.userId)?.n ?? 0;
    return {goals, unbound};
  }
  return {ACTIVITY_WINDOW_DAYS, seesActivityDetail, goalActivity, goalsActivity};
}

module.exports = {create_goal_activity};
