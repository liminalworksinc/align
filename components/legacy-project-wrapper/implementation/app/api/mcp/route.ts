import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { EVIDENCE_INSTRUCTIONS, registerAlign, SERVER_INSTRUCTIONS } from "@/lib/mcp/register";
import { noteGrantUse } from "@/lib/oauth/grants";
import { EVIDENCE_SCOPE, originOf, PRM_PATH, readMcpToken, resourceFor, SCOPE } from "@/lib/oauth/server";
import { deviceFromAccessToken } from "@/lib/v2/devices";
import { ready } from "@/lib/v2/init";

// Read-only MCP server by default (specs/align/mcp.md): a connected AI app or a paired device reads, as one person, the
// goals, change requests, decision records and directives of a v2 workspace. No tool can create, change, propose or
// approve. An app the person allowed the opt-in scope changes:evidence gets one more tool,
// align_add_change_request_evidence (an agent-reported evidence link on a request the person may act on): it is
// listed only for such a token, and a call to it from any other token gets 403 insufficient_scope.
const serverInfo = { name: "align", version: "0.2.0" };
const EVIDENCE_TOOL = "align_add_change_request_evidence";
const readOnly = createMcpHandler((s) => registerAlign(s, { evidence: false }), { serverInfo, instructions: SERVER_INSTRUCTIONS });
const withEvidence = createMcpHandler((s) => registerAlign(s, { evidence: true }), { serverInfo, instructions: EVIDENCE_INSTRUCTIONS });
/** withMcpAuth has verified the token and put its AuthInfo on the request: the server follows its scopes. */
const byScope = (req: Request) => ((req as Request & { auth?: AuthInfo }).auth?.scopes.includes(EVIDENCE_SCOPE) ? withEvidence : readOnly)(req);

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
    return { token: bearerToken, clientId: app.client_id, scopes: app.scopes, expiresAt: app.exp, extra: { kind: "app", uid: app.uid, workspaces: [app.ws] } };
  }
  const dev = deviceFromAccessToken(bearerToken);
  if (!dev) return undefined;
  // A device token on MCP reads only: pairing names no scopes, so it never holds changes:evidence. (The device can still
  // add an agent-reported link through the v2 route, POST .../change-requests/{id}/evidence.)
  return { token: bearerToken, clientId: `device:${dev.deviceId}`, scopes: [SCOPE], extra: { kind: "device", uid: dev.user.id, workspaces: [...dev.grants].sort() } };
}

/** Whether a POST body is a tools/call of the evidence tool (alone or in a batch). Anything unparsable is not. */
async function callsEvidenceTool(req: Request): Promise<boolean> {
  if (req.method !== "POST") return false;
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return false;
  }
  const isCall = (m: unknown) => !!m && typeof m === "object" && (m as { method?: unknown }).method === "tools/call" && (m as { params?: { name?: unknown } }).params?.name === EVIDENCE_TOOL;
  return Array.isArray(body) ? body.some(isCall) : isCall(body);
}

async function route(req: Request): Promise<Response> {
  // The MCP endpoint is for apps and CLIs, which send no Origin. A browser page always does, so any Origin is refused
  // in every mode (the MCP transport spec's DNS-rebinding rule; the same rule as lib/v2/http.ts device routes).
  if (req.headers.get("origin") !== null) return Response.json({ error: "Browsers can't call this endpoint" }, { status: 403 });
  // The 401 challenge names this server's own metadata URL (RFC 9728), from the Host the request used. A call to the
  // evidence tool needs both scopes, so a token without changes:evidence gets mcp-handler's 403 insufficient_scope
  // challenge naming them (the MCP authorization spec's step-up answer).
  const scopes = (await callsEvidenceTool(req)) ? [SCOPE, EVIDENCE_SCOPE] : [SCOPE];
  const auth = withMcpAuth(byScope, verifyToken, { required: true, requiredScopes: scopes, resourceMetadataPath: PRM_PATH, resourceUrl: originOf(req) });
  return auth(req);
}

export { route as GET, route as POST, route as DELETE };
