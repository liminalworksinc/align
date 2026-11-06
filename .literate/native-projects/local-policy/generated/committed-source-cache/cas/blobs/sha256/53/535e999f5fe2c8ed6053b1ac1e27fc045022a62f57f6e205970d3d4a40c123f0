'use strict';
function data() {
  return {
    WS_ROLES: ['owner', 'member', 'viewer'],
    POD_ROLES: ['lead', 'member'],
    VISIBILITIES: ['private', 'pod', 'workspace'],
    WORKSPACE_ROLE_ACTIONS: {
      owner: ['workspace.read', 'workspace.manage', 'goal.create', 'session.share', 'session.stop_any', 'alignment.create', 'spend.read'],
      member: ['workspace.read', 'goal.create', 'session.share', 'alignment.create', 'spend.read'],
      viewer: ['workspace.read', 'spend.read']
    },
    POD_ROLE_ACTIONS: {
      lead: ['pod.manage_members', 'goal.create_in_pod', 'goal.bind_pod_goal'],
      member: ['goal.create_in_pod', 'goal.bind_pod_goal']
    },
    GOAL_READERS: {
      private: {wsRoles: [], podRoles: []},
      pod: {wsRoles: ['owner'], podRoles: ['lead', 'member']},
      workspace: {wsRoles: ['owner', 'member', 'viewer'], podRoles: []}
    }
  };
}
module.exports = {data};
