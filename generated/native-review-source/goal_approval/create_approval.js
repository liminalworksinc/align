'use strict';

function create_approval(resources) {
  const all = resources.all;

  function approvalSet(goal) {
    const candidates = new Set([goal.owner_id]);
    if (goal.pod_id) {
      const leads = all("SELECT user_id FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'", goal.ws_id, goal.pod_id);
      for (const row of leads) candidates.add(row.user_id);
    }
    if (goal.level === 'company') {
      const owners = all("SELECT user_id FROM v2_members WHERE ws_id = ? AND role = 'owner' ORDER BY user_id", goal.ws_id);
      for (const row of owners) candidates.add(row.user_id);
    }
    const eligible = new Set(all("SELECT user_id FROM v2_members WHERE ws_id = ? AND role IN ('owner','member')", goal.ws_id).map(row => row.user_id));
    return [...candidates].filter(id => eligible.has(id)).sort();
  }

  function effectiveSet(goal, requesterId) {
    const base = approvalSet(goal);
    if (goal.owner_id === requesterId && base.includes(requesterId)) return base;
    const filtered = base.filter(id => id !== requesterId);
    if (filtered.length) return filtered;
    return all("SELECT user_id FROM v2_members WHERE ws_id = ? AND role = 'owner' ORDER BY user_id", goal.ws_id)
      .map(row => row.user_id).filter(id => id !== requesterId);
  }

  function launchSet(goal, requesterId) {
    const effective = effectiveSet(goal, requesterId);
    const owners = all("SELECT user_id FROM v2_members WHERE ws_id = ? AND role = 'owner' ORDER BY user_id", goal.ws_id);
    return [...new Set([...effective, ...owners.map(row => row.user_id)])].sort();
  }

  return { approvalSet, effectiveSet, launchSet };
}

module.exports = { create_approval };
