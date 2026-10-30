import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAlign, SERVER_INSTRUCTIONS } from "@/lib/mcp/register";
import { noteGrantUse } from "@/lib/oauth/grants";
import { originOf, PRM_PATH, readMcpToken, resourceFor, SCOPE } from "@/lib/oauth/server";
import { deviceFromAccessToken } from "@/lib/v2/devices";
import { ready } from "@/lib/v2/init";

// MCP server (specs/align/mcp.md): a connected AI app or a paired device reads, as one person, the goals, change
// requests, decision records and directives of a v2 workspace. No tool can create, change, propose or approve; the one
// write is align_add_change_request_evidence (an agent-reported evidence link on a request the person may act on).
const handler = createMcpHandler(registerAlign, { serverInfo: { name: "align", version: "0.2.0" }, instructions: SERVER_INSTRUCTIONS });

/**
 * Two kinds of bearer token, in Mode L and hosted alike:
 * - `alm.` from Align's OAuth flow (lib/oauth/server.ts): one person, the one workspace chosen at consent.
 * - `alnd_` v2 device access tokens (lib/v2/devices.ts): the device's person, its granted workspaces where they are
 *   still a member.
 * Anything else (an `agt.` agent token, a former static token, a device refresh token) is 401.
 */
async function verifyToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  await ready();
  if (bearerToken.startsWith("alm.")) {
    const app = readMcpToken(bearerToken, resourceFor(originOf(req)));
    if (!app) return undefined;
    noteGrantUse(app.grant);
    return { token: bearerToken, clientId: app.client_id, scopes: [SCOPE], expiresAt: app.exp, extra: { kind: "app", uid: app.uid, workspaces: [app.ws] } };
  }
  const dev = deviceFromAccessToken(bearerToken);
  if (!dev) return undefined;
  return { token: bearerToken, clientId: `device:${dev.deviceId}`, scopes: [SCOPE], extra: { kind: "device", uid: dev.user.id, workspaces: [...dev.grants].sort() } };
}

async function route(req: Request): Promise<Response> {
  // The MCP endpoint is for apps and CLIs, which send no Origin. A browser page always does, so any Origin is refused
  // in every mode (the MCP transport spec's DNS-rebinding rule; the same rule as lib/v2/http.ts device routes).
  if (req.headers.get("origin") !== null) return Response.json({ error: "Browsers can't call this endpoint" }, { status: 403 });
  // The 401 challenge names this server's own metadata URL (RFC 9728), from the Host the request used.
  const auth = withMcpAuth(handler, verifyToken, { required: true, requiredScopes: [SCOPE], resourceMetadataPath: PRM_PATH, resourceUrl: originOf(req) });
  return auth(req);
}

export { route as GET, route as POST, route as DELETE };
