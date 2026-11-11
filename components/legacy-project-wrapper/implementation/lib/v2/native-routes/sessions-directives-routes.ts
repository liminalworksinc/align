// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_sessions_directives_routes } from "../../native/.bindings/server_sessions_directives_routes.js";
import { RECEIPT_STATES as directives_RECEIPT_STATES, directivesFor as directives_directivesFor, endedSessionsFor as directives_endedSessionsFor, parseCursor as directives_parseCursor, recordReceipt as directives_recordReceipt } from "@/lib/v2/directives";
import { badRequest as errors_badRequest } from "@/lib/v2/errors";
import { deviceAuth as http_deviceAuth, eitherWrite as http_eitherWrite, idParam as http_idParam, noContent as http_noContent, readJson as http_readJson, requireRecentSignIn as http_requireRecentSignIn, route as http_route, webAuth as http_webAuth, webWrite as http_webWrite } from "@/lib/v2/http";
import { cancelRequest as requests_cancelRequest, getHold as requests_getHold, holdGoal as requests_holdGoal, listHolds as requests_listHolds, listRequests as requests_listRequests, releaseGoal as requests_releaseGoal, requireHolder as requests_requireHolder, sendRequest as requests_sendRequest } from "@/lib/v2/requests";
import { deleteSession as sessions_deleteSession, ingestUsage as sessions_ingestUsage, listSessions as sessions_listSessions, openBindingEpoch as sessions_openBindingEpoch, putSession as sessions_putSession, setAgentStop as sessions_setAgentStop, stopSharing as sessions_stopSharing } from "@/lib/v2/sessions";
import { ID_RE as validate_ID_RE, SESSION_KEY_RE as validate_SESSION_KEY_RE, iso as validate_iso, oneOf as validate_oneOf, str as validate_str } from "@/lib/v2/validate";
import { enter as workspaces_enter } from "@/lib/v2/workspaces";
const resources = {
  Response,
  URL,
  directives: { RECEIPT_STATES: directives_RECEIPT_STATES, directivesFor: directives_directivesFor, endedSessionsFor: directives_endedSessionsFor, parseCursor: directives_parseCursor, recordReceipt: directives_recordReceipt },
  errors: { badRequest: errors_badRequest },
  http: { deviceAuth: http_deviceAuth, eitherWrite: http_eitherWrite, idParam: http_idParam, noContent: http_noContent, readJson: http_readJson, requireRecentSignIn: http_requireRecentSignIn, route: http_route, webAuth: http_webAuth, webWrite: http_webWrite },
  requests: { cancelRequest: requests_cancelRequest, getHold: requests_getHold, holdGoal: requests_holdGoal, listHolds: requests_listHolds, listRequests: requests_listRequests, releaseGoal: requests_releaseGoal, requireHolder: requests_requireHolder, sendRequest: requests_sendRequest },
  sessions: { deleteSession: sessions_deleteSession, ingestUsage: sessions_ingestUsage, listSessions: sessions_listSessions, openBindingEpoch: sessions_openBindingEpoch, putSession: sessions_putSession, setAgentStop: sessions_setAgentStop, stopSharing: sessions_stopSharing },
  validate: { ID_RE: validate_ID_RE, SESSION_KEY_RE: validate_SESSION_KEY_RE, iso: validate_iso, oneOf: validate_oneOf, str: validate_str },
  workspaces: { enter: workspaces_enter },
};
export const routes = create_sessions_directives_routes(resources) as unknown as Routes;
