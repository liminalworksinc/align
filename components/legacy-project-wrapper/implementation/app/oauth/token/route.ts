import { config } from "@/lib/config";
import { clientOf } from "@/lib/ratelimit";
import { exchange, originOf, TokenError } from "@/lib/oauth/server";
import { takeOAuthCall } from "@/lib/oauth/limits";
import { ready } from "@/lib/v2/init";

// OAuth token endpoint: authorization_code (PKCE) and refresh_token for public clients. Called by the app's servers
// (Claude, ChatGPT) or its CLI (Claude Code, Codex), never by a page on this site, so there is no cookie and no CSRF.
const headers = { "cache-control": "no-store", pragma: "no-cache" };

export async function POST(req: Request) {
  try {
    takeOAuthCall(clientOf(req), "token");
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (Number(req.headers.get("content-length") || 0) > 8 * 1024) throw new TokenError("invalid_request", "Request too large");
    const text = await req.text();
    if (text.length > 8 * 1024) throw new TokenError("invalid_request", "Request too large");
    let form: URLSearchParams;
    if (type === "application/x-www-form-urlencoded") form = new URLSearchParams(text);
    else if (type === "application/json") {
      const raw = JSON.parse(text || "{}");
      form = new URLSearchParams(Object.entries(raw && typeof raw === "object" ? raw : {}).map(([k, v]) => [k, String(v)]));
    } else throw new TokenError("invalid_request", "Send application/x-www-form-urlencoded");
    await ready(); // grants live in the v2 database
    return Response.json(await exchange(form, originOf(req)), { headers });
  } catch (e) {
    if (e instanceof TokenError) return Response.json({ error: e.error, error_description: e.message }, { status: e.status, headers });
    if (e instanceof SyntaxError) return Response.json({ error: "invalid_request", error_description: "Send valid JSON" }, { status: 400, headers });
    if ((e as { status?: number })?.status === 429) return Response.json({ error: "slow_down", error_description: "Too many requests" }, { status: 429, headers });
    if (config().hosted) console.error("Server error:", (e as Error)?.name ?? "unknown");
    else console.error(e);
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
