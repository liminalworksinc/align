'use strict';
function can_read_goal(principal, goal) {
  if (principal.wsRole === null) return false;
  if (goal.ownerId === principal.userId) return true;
  if (goal.visibility === 'workspace') return true;
  if (goal.visibility !== 'pod') return false;
  if (principal.wsRole === 'owner') return true;
  if (typeof goal.podId !== 'string' || goal.podId.length === 0) return false;
  const role = principal.pods.get(goal.podId);
  return role === 'lead' || role === 'member';
}
module.exports = {can_read_goal};
