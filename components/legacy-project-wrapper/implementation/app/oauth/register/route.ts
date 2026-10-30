import { config } from "@/lib/config";
import { cappedJson } from "@/lib/http";
import { clientOf } from "@/lib/ratelimit";
import { registerClient, RegistrationError } from "@/lib/oauth/clients";
import { takeOAuthCall } from "@/lib/oauth/limits";
import { grantedScopes } from "@/lib/oauth/server";

// RFC 7591 dynamic client registration, kept for apps that don't use a client metadata document yet. Public clients
// only; a registration grants nothing by itself (a signed-in person still has to approve the app for one of their workspaces).
// A `scope` may name goals:read and changes:evidence (unknown names are dropped); the answer echoes what Align would
// grant. It is not stored: the authorization request's own scope decides, and the person sees it on the consent page.
const headers = { "cache-control": "no-store" };

export async function POST(req: Request) {
  try {
    takeOAuthCall(clientOf(req), "register");
    const meta = await cappedJson(req, 8 * 1024);
    if (meta.scope !== undefined && meta.scope !== null && typeof meta.scope !== "string") {
      return Response.json({ error: "invalid_client_metadata", error_description: "scope must be a space-separated string" }, { status: 400, headers });
    }
    const c = await registerClient(meta);
    return Response.json(
      {
        client_id: c.client_id,
        client_name: c.client_name,
        redirect_uris: c.redirect_uris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: grantedScopes(typeof meta.scope === "string" ? meta.scope : null).join(" "),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      { status: 201, headers },
    );
  } catch (e) {
    if (e instanceof RegistrationError) return Response.json({ error: "invalid_redirect_uri", error_description: e.message }, { status: 400, headers });
    const status = (e as { status?: number })?.status;
    if (status === 429) return Response.json({ error: "slow_down", error_description: "Too many registrations" }, { status, headers });
    if (status && status < 500) return Response.json({ error: "invalid_client_metadata", error_description: (e as Error).message }, { status: 400, headers });
    if (config().hosted) console.error("Server error:", (e as Error)?.name ?? "unknown");
    else console.error(e);
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
