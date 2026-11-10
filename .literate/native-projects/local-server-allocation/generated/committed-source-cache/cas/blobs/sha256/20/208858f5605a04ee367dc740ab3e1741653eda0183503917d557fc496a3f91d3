'use strict';

function create_allocation(resources) {
  const { all, badRequest, goalObj, canReadGoal, need, readDate } = resources;
  const day = 86400000;
  const note = 'Agent time is counted in fresh tokens (input, output and cache writes) for every model. Costs are estimates at list price, not a bill.';
  function percent(part, total, digits = 1) {
    return total > 0 ? Math.round((part / total * 100) * 10 ** digits) / 10 ** digits : 0;
  }
  function aggregate(wsId, from, to) {
    const raw = all(`SELECT e.goal_id, SUM((u.input + u.output + u.cache_write_5m + u.cache_write_1h + u.cache_write_unsplit)) AS fresh,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced, COUNT(DISTINCT u.session_key) AS sessions
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id`, wsId, from, from, to, to);
    const retained = all(`SELECT NULLIF(goal_id, '') AS goal_id, SUM((input + output + cache_write_5m + cache_write_1h + cache_write_unsplit)) AS fresh, SUM(est_list_usd_micros) AS est, SUM(unpriced_requests) AS unpriced, 0 AS sessions
     FROM v2_spend_rollups
     WHERE ws_id = ? AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY goal_id`, wsId, from, from, to, to);
    const merged = new Map();
    for (const row of [...raw, ...retained]) {
      const held = merged.get(row.goal_id);
      if (!held) merged.set(row.goal_id, { ...row });
      else {
        held.fresh += row.fresh;
        held.est += row.est;
        held.unpriced += row.unpriced;
        held.sessions += row.sessions;
      }
    }
    return [...merged.values()];
  }
  function allocation(principal, from, to) {
    need(principal, 'spend.read');
    if (from && to && from >= to) throw badRequest('from must be before to');
    const usage = aggregate(principal.wsId, from, to);
    const goals = new Map(all('SELECT * FROM v2_goals WHERE ws_id = ?', principal.wsId).map(g => [g.id, g]));
    const total = usage.reduce((sum, r) => sum + r.fresh, 0);
    const privateRow = { kind: 'private', goal: null, fresh_tokens: 0, share: 0, target_share: null, gap: null, est_list_usd_micros: 0, unpriced_requests: 0, sessions: 0 };
    const unallocated = { ...privateRow, kind: 'unallocated' };
    const rows = [];
    const seen = new Set();
    for (const r of usage) {
      const g = r.goal_id ? goals.get(r.goal_id) : undefined;
      const combined = !r.goal_id ? unallocated : !g || !canReadGoal(principal, goalObj(g)) ? privateRow : null;
      if (combined) {
        combined.fresh_tokens += r.fresh;
        combined.est_list_usd_micros += r.est;
        combined.unpriced_requests += r.unpriced;
        combined.sessions += r.sessions;
        continue;
      }
      seen.add(g.id);
      const share = percent(r.fresh, total);
      const target = g.status === 'active' ? g.target_share ?? null : null;
      rows.push({ kind: 'goal', goal: { id: g.id, title: g.title }, fresh_tokens: r.fresh, share, target_share: target, gap: target === null ? null : Math.round((share - target) * 10) / 10, est_list_usd_micros: r.est, unpriced_requests: r.unpriced, sessions: r.sessions });
    }
    for (const g of goals.values()) {
      if (seen.has(g.id) || g.status !== 'active' || g.target_share === null || g.target_share === undefined || !canReadGoal(principal, goalObj(g))) continue;
      rows.push({ kind: 'goal', goal: { id: g.id, title: g.title }, fresh_tokens: 0, share: 0, target_share: g.target_share, gap: -g.target_share, est_list_usd_micros: 0, unpriced_requests: 0, sessions: 0 });
    }
    privateRow.share = percent(privateRow.fresh_tokens, total);
    unallocated.share = percent(unallocated.fresh_tokens, total);
    rows.sort((a, b) => b.fresh_tokens - a.fresh_tokens || (b.target_share ?? -1) - (a.target_share ?? -1) || a.goal.title.localeCompare(b.goal.title));
    if (privateRow.fresh_tokens) rows.push(privateRow);
    if (unallocated.fresh_tokens) rows.push(unallocated);
    return { from, to, total_fresh_tokens: total, total_est_list_usd_micros: usage.reduce((s, r) => s + r.est, 0), unpriced_requests: usage.reduce((s, r) => s + r.unpriced, 0), rows, note };
  }
  function weekStart(t) {
    const d = new (readDate())(t);
    const weekday = (d.getUTCDay() + 6) % 7;
    return readDate().UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - weekday * day;
  }
  function weeklyAllocation(principal, weeks = 6, now = readDate().now()) {
    need(principal, 'spend.read');
    weeks = Math.max(1, Math.min(26, Math.floor(weeks)));
    const start = weekStart(now);
    const result = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const from = new (readDate())(start - i * 7 * day).toISOString();
      const to = new (readDate())(start + (1 - i) * 7 * day).toISOString();
      const report = allocation(principal, from, to);
      result.push({ week_start: from, total_fresh_tokens: report.total_fresh_tokens, rows: report.rows.map(r => ({ kind: r.kind, goal: r.goal, share: r.share, target_share: r.target_share })) });
    }
    return result;
  }
  function feedAllocation(principal, now = readDate().now()) {
    const usage = aggregate(principal.wsId, new (readDate())(now - 7 * day).toISOString(), null);
    const total = usage.reduce((s, r) => s + r.fresh, 0);
    const amounts = new Map(usage.filter(r => r.goal_id).map(r => [r.goal_id, r.fresh]));
    const holds = new Set(all('SELECT goal_id FROM v2_goal_holds WHERE ws_id = ?', principal.wsId).map(r => r.goal_id));
    const goals = all("SELECT * FROM v2_goals WHERE ws_id = ? AND status = 'active'", principal.wsId);
    const result = new Map();
    for (const g of goals) {
      if (!canReadGoal(principal, goalObj(g))) continue;
      const exact = percent(amounts.get(g.id) ?? 0, total);
      const target = g.target_share ?? null;
      result.set(g.id, { target_share: target, share_7d: Math.round(exact), gap_7d: target === null || total === 0 ? null : Math.round((exact - target) * 10) / 10, held: holds.has(g.id) });
    }
    return result;
  }
  return { allocation, weekStart, weeklyAllocation, feedAllocation };
}

module.exports = { create_allocation };
