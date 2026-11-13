// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_workspace_admin_routes } from "../../native/.bindings/server_workspace_admin_routes.js";
import { idParam as http_idParam, noContent as http_noContent, readJson as http_readJson, requireRecentSignIn as http_requireRecentSignIn, route as http_route, webAuth as http_webAuth, webWrite as http_webWrite } from "@/lib/v2/http";
import { POD_ROLES as policy_POD_ROLES, WS_ROLES as policy_WS_ROLES } from "@/lib/v2/policy";
import { createSampleWorkspace as sample_createSampleWorkspace } from "@/lib/v2/sample";
import { ID_RE as validate_ID_RE, oneLine as validate_oneLine, oneOf as validate_oneOf, optOneOf as validate_optOneOf, optStr as validate_optStr, str as validate_str } from "@/lib/v2/validate";
import { auditTrail as workspaces_auditTrail, createInvite as workspaces_createInvite, createTeam as workspaces_createTeam, createWorkspace as workspaces_createWorkspace, deleteInvite as workspaces_deleteInvite, deleteWorkspace as workspaces_deleteWorkspace, deletedWorkspaceOwnedBy as workspaces_deletedWorkspaceOwnedBy, deletedWorkspacesFor as workspaces_deletedWorkspacesFor, enter as workspaces_enter, listInvites as workspaces_listInvites, removeMember as workspaces_removeMember, removeTeamMember as workspaces_removeTeamMember, restoreWorkspace as workspaces_restoreWorkspace, setMemberRole as workspaces_setMemberRole, setTeamMember as workspaces_setTeamMember, updateWorkspace as workspaces_updateWorkspace, workspaceDetail as workspaces_workspaceDetail, workspacesFor as workspaces_workspacesFor } from "@/lib/v2/workspaces";
const resources = {
  Response,
  URL,
  http: { idParam: http_idParam, noContent: http_noContent, readJson: http_readJson, requireRecentSignIn: http_requireRecentSignIn, route: http_route, webAuth: http_webAuth, webWrite: http_webWrite },
  policy: { POD_ROLES: policy_POD_ROLES, WS_ROLES: policy_WS_ROLES },
  sample: { createSampleWorkspace: sample_createSampleWorkspace },
  validate: { ID_RE: validate_ID_RE, oneLine: validate_oneLine, oneOf: validate_oneOf, optOneOf: validate_optOneOf, optStr: validate_optStr, str: validate_str },
  workspaces: { auditTrail: workspaces_auditTrail, createInvite: workspaces_createInvite, createTeam: workspaces_createTeam, createWorkspace: workspaces_createWorkspace, deleteInvite: workspaces_deleteInvite, deleteWorkspace: workspaces_deleteWorkspace, deletedWorkspaceOwnedBy: workspaces_deletedWorkspaceOwnedBy, deletedWorkspacesFor: workspaces_deletedWorkspacesFor, enter: workspaces_enter, listInvites: workspaces_listInvites, removeMember: workspaces_removeMember, removeTeamMember: workspaces_removeTeamMember, restoreWorkspace: workspaces_restoreWorkspace, setMemberRole: workspaces_setMemberRole, setTeamMember: workspaces_setTeamMember, updateWorkspace: workspaces_updateWorkspace, workspaceDetail: workspaces_workspaceDetail, workspacesFor: workspaces_workspacesFor },
};
export const routes = create_workspace_admin_routes(resources) as unknown as Routes;
