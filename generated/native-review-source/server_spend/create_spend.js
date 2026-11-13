'use strict';

function create_spend(resources) {
  const all = resources.all;
  const badRequest = resources.badRequest;
  const goalObj = resources.goalObj;
  const canReadGoal = resources.canReadGoal;
  const need = resources.need;
  const fields = ['requests', 'input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'cache_write_unsplit', 'est_list_usd_micros', 'unpriced_requests'];
  const bases = ['api_usd', 'subscription_included', 'workspace_credits', 'estimated_list_usd', 'unknown'];
  function numbers() {
    return {requests: 0, input: 0, output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: 0, est_list_usd_micros: 0, unpriced_requests: 0};
  }
  function sums() {
    const value = numbers();
    value.by_basis = {api_usd: numbers(), subscription_included: numbers(), workspace_credits: numbers(), estimated_list_usd: numbers(), unknown: numbers()};
    return value;
  }
  function add(sum, row) {
    const basis = bases.includes(row.basis) ? row.basis : 'unknown';
    for (const key of fields) {
      sum[key] += row[key];
      sum.by_basis[basis][key] += row[key];
    }
  }
  function spend(principal, by, from, to) {
    need(principal, 'spend.read');
    if (from && to && from >= to) throw badRequest('from must be before to');
    const raw = all(`SELECT e.goal_id, u.session_key, s.user_id AS session_owner, u.basis, COUNT(*) AS requests, SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read,
            SUM(u.cache_write_5m) AS cache_write_5m, SUM(u.cache_write_1h) AS cache_write_1h, SUM(u.cache_write_unsplit) AS cache_write_unsplit,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est_list_usd_micros,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced_requests
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     JOIN v2_sessions s ON s.ws_id = u.ws_id AND s.session_key = u.session_key
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id, u.session_key, u.basis`, principal.wsId, from, from, to, to);
    const rolled = all(`SELECT NULLIF(goal_id, '') AS goal_id, '' AS session_key, '' AS session_owner, basis,
            SUM(requests) AS requests, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read,
            SUM(cache_write_5m) AS cache_write_5m, SUM(cache_write_1h) AS cache_write_1h, SUM(cache_write_unsplit) AS cache_write_unsplit,
            SUM(est_list_usd_micros) AS est_list_usd_micros, SUM(unpriced_requests) AS unpriced_requests
     FROM v2_spend_rollups
     WHERE ws_id = ? AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY goal_id, basis`, principal.wsId, from, from, to, to).map(row => ({...row, rolled: true}));
    const goals = new Map(all('SELECT * FROM v2_goals WHERE ws_id = ?', principal.wsId).map(goal => [goal.id, goal]));
    const pods = new Map(all('SELECT id, name FROM v2_pods WHERE ws_id = ?', principal.wsId).map(pod => [pod.id, pod.name]));
    const sessions = new Map(all('SELECT session_key, title, repo_alias, harness FROM v2_sessions WHERE ws_id = ? AND user_id = ?', principal.wsId, principal.userId).map(session => [session.session_key, session]));
    const total = sums();
    const unallocated = sums();
    const buckets = new Map();
    function bucket(key, kind, label, extra = {}) {
      if (!buckets.has(key)) buckets.set(key, {key, kind, label, ...extra, sums: sums()});
      return buckets.get(key).sums;
    }
    for (const row of [...raw, ...rolled]) {
      add(total, row);
      if (!row.goal_id) {
        add(unallocated, row);
        continue;
      }
      const goal = goals.get(row.goal_id);
      const visible = goal && canReadGoal(principal, goalObj(goal));
      if (by === 'session') {
        if (row.rolled) {
          add(bucket('rolled_up', 'rolled_up', 'Older sessions (rolled up)'), row);
          continue;
        }
        const session = row.session_owner === principal.userId ? sessions.get(row.session_key) : null;
        if (session) {
          add(bucket('session:' + row.session_key, 'session', session.title || session.repo_alias || `${session.harness} session`, {session_key: row.session_key}), row);
        } else {
          add(bucket('others', 'others', "Other people's sessions"), row);
        }
        continue;
      }
      if (!visible) {
        add(bucket('private', 'private', 'Private goals'), row);
      } else if (by === 'goal') {
        add(bucket('goal:' + goal.id, 'goal', goal.title, {goal: {id: goal.id, title: goal.title}}), row);
      } else if (goal.pod_id) {
        add(bucket('team:' + goal.pod_id, 'team', pods.get(goal.pod_id) ?? 'Team', {team: {id: goal.pod_id, name: pods.get(goal.pod_id) ?? ''}}), row);
      } else {
        add(bucket('no_team', 'no_team', 'Goals without a team'), row);
      }
    }
    const rows = [...buckets.values()].map(({sums, ...rest}) => ({...rest, ...sums}));
    rows.sort((a, b) => b.est_list_usd_micros - a.est_list_usd_micros || b.requests - a.requests || a.label.localeCompare(b.label));
    return {by, from, to, note: 'Costs are estimates at list price, not a bill. Subscription usage is not money spent.', total, unallocated, unpriced_requests: total.unpriced_requests, rows};
  }
  function goalSpend(workspace, goalId, from, to) {
    const rows = all(`SELECT u.model, u.basis, COUNT(*) AS requests, SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read,
            SUM(u.cache_write_5m) AS cache_write_5m, SUM(u.cache_write_1h) AS cache_write_1h, SUM(u.cache_write_unsplit) AS cache_write_unsplit,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est_list_usd_micros,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced_requests
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND e.goal_id = ? AND u.ts >= ? AND u.ts < ?
     GROUP BY u.model, u.basis`, workspace, goalId, from, to);
    const total = sums();
    const models = new Map();
    for (const row of rows) {
      add(total, row);
      let model = models.get(row.model);
      if (!model) {
        model = sums();
        models.set(row.model, model);
      }
      add(model, row);
    }
    const by_model = [...models.entries()].map(([model, sums]) => ({model, ...sums}));
    by_model.sort((a, b) => b.est_list_usd_micros - a.est_list_usd_micros || b.requests - a.requests || a.model.localeCompare(b.model));
    return {total, by_model};
  }
  return {spend, goalSpend};
}

module.exports = {create_spend};
