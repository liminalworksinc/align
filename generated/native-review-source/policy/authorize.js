'use strict';
const {data} = require('./data.js');
const {can_read_goal} = require('./can_read_goal.js');
const allow = () => ({ok: true});
const hidden = () => ({ok: false, status: 404, code: 'not_found', message: 'Not found'});
const deny = (code, message) => ({ok: false, status: 403, code, message});
function roleDenial(principal) {
  return principal.wsRole === 'viewer'
    ? deny('read_only', 'Viewers can look but not change anything.')
    : deny('owner_only', 'Only a workspace owner can do this.');
}
function teamRole(principal, podId) {
  return typeof podId === 'string' && podId.length > 0 ? principal.pods.get(podId) : undefined;
}
function teamMember(principal, podId) {
  const role = teamRole(principal, podId);
  return role === 'lead' || role === 'member';
}
function isGoal(object) {
  return object !== null && typeof object === 'object' && object.kind === 'goal'
    && typeof object.ownerId === 'string'
    && ['private', 'pod', 'workspace'].includes(object.visibility)
    && (object.podId === null || typeof object.podId === 'string');
}
function authorize(principal, action, object) {
  if (principal.wsRole === null) return hidden();
  const actions = data().WORKSPACE_ROLE_ACTIONS[principal.wsRole];
  const permits = actionName => Array.isArray(actions) && actions.includes(actionName);
  if (['workspace.read', 'workspace.manage', 'session.share', 'session.stop_any', 'alignment.create', 'spend.read'].includes(action)) {
    return permits(action) ? allow() : roleDenial(principal);
  }
  switch (action) {
    case 'goal.create':
      if (!permits('goal.create')) return roleDenial(principal);
      if (!object || object.kind !== 'goal_draft' || !(object.podId === null || typeof object.podId === 'string')) return hidden();
      if (object.podId && !teamMember(principal, object.podId)) {
        return deny('not_in_team', 'Only members of that team can add its goals.');
      }
      return allow();
    case 'goal.read':
      return isGoal(object) && can_read_goal(principal, object) ? allow() : hidden();
    case 'goal.edit':
      if (!isGoal(object) || !can_read_goal(principal, object)) return hidden();
      if (!permits('goal.create')) return roleDenial(principal);
      return object.ownerId === principal.userId ? allow()
        : deny('not_goal_owner', "Only the goal's owner can change it.");
    case 'goal.bind':
      if (!object || object.kind !== 'bind' || typeof object.hasTransfer !== 'boolean'
        || !isGoal(object.goal) || !can_read_goal(principal, object.goal)) return hidden();
      if (!permits('session.share')) return roleDenial(principal);
      if (object.goal.ownerId === principal.userId || teamMember(principal, object.goal.podId) || object.hasTransfer) return allow();
      return deny('alignment_required', "Ask the goal's owner to approve working toward it first.");
    case 'pod.manage_members':
      if (!object || object.kind !== 'pod' || typeof object.podId !== 'string') return hidden();
      if (principal.wsRole === 'viewer') return roleDenial(principal);
      if (principal.wsRole === 'owner' || teamRole(principal, object.podId) === 'lead') return allow();
      return deny('not_team_lead', "Only a workspace owner or the team's lead can change its members.");
    case 'session.manage':
    case 'session.stop':
      if (!object || object.kind !== 'session' || typeof object.ownerId !== 'string') return hidden();
      return object.ownerId === principal.userId || (action === 'session.stop' && permits('session.stop_any')) ? allow() : hidden();
    case 'alignment.read':
      if (!object || object.kind !== 'alignment' || !Array.isArray(object.involved)
        || !object.involved.every(id => typeof id === 'string')) return hidden();
      return object.involved.includes(principal.userId) ? allow() : hidden();
    default:
      return hidden();
  }
}
module.exports = {authorize};
