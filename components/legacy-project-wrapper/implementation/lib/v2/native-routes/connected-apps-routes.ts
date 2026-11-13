// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_connected_apps_routes } from "../../native/.bindings/server_connected_apps_routes.js";
import { GRANT_ID as grants_GRANT_ID, listGrants as grants_listGrants, revokeGrant as grants_revokeGrant } from "@/lib/oauth/grants";
import { MCP_PATH as oauth_MCP_PATH, originOf as oauth_originOf } from "@/lib/oauth/server";
import { idParam as http_idParam, noContent as http_noContent, route as http_route, webAuth as http_webAuth, webWrite as http_webWrite } from "@/lib/v2/http";
import { ID_RE as validate_ID_RE } from "@/lib/v2/validate";
import { enter as workspaces_enter } from "@/lib/v2/workspaces";
const resources = {
  Response,
  grants: { GRANT_ID: grants_GRANT_ID, listGrants: grants_listGrants, revokeGrant: grants_revokeGrant },
  oauth: { MCP_PATH: oauth_MCP_PATH, originOf: oauth_originOf },
  http: { idParam: http_idParam, noContent: http_noContent, route: http_route, webAuth: http_webAuth, webWrite: http_webWrite },
  validate: { ID_RE: validate_ID_RE },
  workspaces: { enter: workspaces_enter },
};
export const routes = create_connected_apps_routes(resources) as unknown as Routes;
