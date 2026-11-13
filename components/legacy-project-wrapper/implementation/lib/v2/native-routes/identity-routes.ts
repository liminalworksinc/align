// Caller-owned resource wiring; behavior is in the admitted package.
import type { Routes } from "./binding";
import { create_identity_routes } from "../../native/.bindings/server_identity_routes.js";
import { config as config_config } from "@/lib/config";
import { createAccessRequest as access_createAccessRequest } from "@/lib/v2/access";
import { deleteAccount as account_deleteAccount, deletePasskey as account_deletePasskey, dismissPasskeyPrompt as account_dismissPasskeyPrompt, listPasskeys as account_listPasskeys, passkeyPromptDue as account_passkeyPromptDue, renamePasskey as account_renamePasskey, signOutEverywhere as account_signOutEverywhere } from "@/lib/v2/account";
import { COOKIE_PREFIX as auth_COOKIE_PREFIX, getAuth as auth_getAuth } from "@/lib/v2/auth";
import { authorize as devices_authorize, decideRequest as devices_decideRequest, deviceOwnedBy as devices_deviceOwnedBy, grantWorkspace as devices_grantWorkspace, listDevices as devices_listDevices, lookupRequest as devices_lookupRequest, refresh as devices_refresh, revokeDevice as devices_revokeDevice, token as devices_token, userCodeOf as devices_userCodeOf, workspaceIdsOf as devices_workspaceIdsOf } from "@/lib/v2/devices";
import { badRequest as errors_badRequest, notFound as errors_notFound } from "@/lib/v2/errors";
import { clientKey as http_clientKey, deviceAuth as http_deviceAuth, eitherAuth as http_eitherAuth, idParam as http_idParam, noContent as http_noContent, originOf as http_originOf, readJson as http_readJson, rejectBrowser as http_rejectBrowser, requireRecentSignIn as http_requireRecentSignIn, requireSameSite as http_requireSameSite, route as http_route, webAuth as http_webAuth, webWrite as http_webWrite } from "@/lib/v2/http";
import { ready as init_ready } from "@/lib/v2/init";
import { ID_RE as validate_ID_RE, b64url as validate_b64url, oneLine as validate_oneLine, str as validate_str, strList as validate_strList } from "@/lib/v2/validate";
import { acceptInvite as workspaces_acceptInvite, otherWorkspacesFor as workspaces_otherWorkspacesFor, previewInvite as workspaces_previewInvite, workspacesFor as workspaces_workspacesFor } from "@/lib/v2/workspaces";
import { connection as nextServer_connection } from "next/server";
const resources = {
  Response,
  URL,
  config: { config: config_config },
  access: { createAccessRequest: access_createAccessRequest },
  account: { deleteAccount: account_deleteAccount, deletePasskey: account_deletePasskey, dismissPasskeyPrompt: account_dismissPasskeyPrompt, listPasskeys: account_listPasskeys, passkeyPromptDue: account_passkeyPromptDue, renamePasskey: account_renamePasskey, signOutEverywhere: account_signOutEverywhere },
  auth: { COOKIE_PREFIX: auth_COOKIE_PREFIX, getAuth: auth_getAuth },
  devices: { authorize: devices_authorize, decideRequest: devices_decideRequest, deviceOwnedBy: devices_deviceOwnedBy, grantWorkspace: devices_grantWorkspace, listDevices: devices_listDevices, lookupRequest: devices_lookupRequest, refresh: devices_refresh, revokeDevice: devices_revokeDevice, token: devices_token, userCodeOf: devices_userCodeOf, workspaceIdsOf: devices_workspaceIdsOf },
  errors: { badRequest: errors_badRequest, notFound: errors_notFound },
  http: { clientKey: http_clientKey, deviceAuth: http_deviceAuth, eitherAuth: http_eitherAuth, idParam: http_idParam, noContent: http_noContent, originOf: http_originOf, readJson: http_readJson, rejectBrowser: http_rejectBrowser, requireRecentSignIn: http_requireRecentSignIn, requireSameSite: http_requireSameSite, route: http_route, webAuth: http_webAuth, webWrite: http_webWrite },
  init: { ready: init_ready },
  validate: { ID_RE: validate_ID_RE, b64url: validate_b64url, oneLine: validate_oneLine, str: validate_str, strList: validate_strList },
  workspaces: { acceptInvite: workspaces_acceptInvite, otherWorkspacesFor: workspaces_otherWorkspacesFor, previewInvite: workspaces_previewInvite, workspacesFor: workspaces_workspacesFor },
  nextServer: { connection: nextServer_connection },
};
export const routes = create_identity_routes(resources) as unknown as Routes;
