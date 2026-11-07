import { NextResponse, type NextRequest } from "next/server";
import { config as alignConfig, hostAllowed, hostName, LOOPBACK, startupProblems } from "@/lib/config";

// Runs before every page and API route (static assets are matched out below).
// `/` is not a page: it redirects to the web app, /app, in both modes.
// Mode L (default): every route is for this machine only. A DNS-rebound page reaches the server under its own name, so
// refuse any Host header whose hostname is not loopback (any port). Cross-origin cookie writes are refused by the
// routes themselves (lib/v2/http.ts, lib/http.ts), which see the Origin and the body.
// HOSTED=1: the ALIGN_HOSTS allowlist replaces loopback; then HTTPS is required (X-Forwarded-Proto from Fly's proxy is
// trusted only in this mode) and the request must come through that proxy (Fly-Client-IP). Only the allowlisted paths
// below are served: everything else is 404, so a route added later is closed when hosted until it is listed here.
// The two public trust pages, /privacy and /trust, are exact paths: nothing under them is served.
const HOSTED_ROUTES = /^\/(?:app|api\/v2|api\/mcp|oauth|\.well-known|api\/oauth)(?:\/|$)|^\/(?:privacy|trust)$/;

/** /app on the loopback name and port the browser used (Next may normalize nextUrl's host), so its cookies still apply. */
function toApp(request: NextRequest): URL {
  try {
    return new URL("/app", `http://${request.headers.get("host")}`);
  } catch {
    const u = request.nextUrl.clone();
    u.pathname = "/app";
    u.search = "";
    return u;
  }
}

const text = (status: number, body: string) => new NextResponse(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

// Every page and route this proxy sees, refusals and redirects included: never framed (clickjacking). The consent page
// sets the same two values itself in next.config.ts, so it is left to that set here. HSTS only when hosted: in Mode L it
// would pin 127.0.0.1 to https in the browser.
const HSTS = "max-age=31536000";
const CONSENT_PAGE = "/oauth/authorize";
function secured(res: NextResponse, pathname: string, hosted: boolean): NextResponse {
  if (pathname !== CONSENT_PAGE) {
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }
  if (hosted) res.headers.set("Strict-Transport-Security", HSTS);
  return res;
}

export function proxy(request: NextRequest) {
  const cfg = alignConfig();
  return secured(route(request, cfg), request.nextUrl.pathname, cfg.hosted);
}

function route(request: NextRequest, cfg: ReturnType<typeof alignConfig>): NextResponse {
  const name = hostName(request.headers.get("host"));
  const p = request.nextUrl.pathname;
  if (!cfg.hosted) {
    if (!name || !LOOPBACK.has(name)) return text(421, "Misdirected request: this server answers to localhost only\n");
    if (p === "/") return NextResponse.redirect(toApp(request), 307);
    return NextResponse.next();
  }
  // A misconfigured hosted server serves nothing, even if the platform kept the process up after startup refused.
  if (startupProblems().length) return text(503, "This server is not configured yet\n");
  if (!hostAllowed(request.headers.get("host"))) return text(421, "Misdirected request: this server answers to its own host name only\n");
  if (request.headers.get("x-forwarded-proto") !== "https") return NextResponse.json({ error: "Use https" }, { status: 403 });
  // Fly's edge sets Fly-Client-IP; a request without it did not come through the public proxy.
  if (!request.headers.get("fly-client-ip")) return NextResponse.json({ error: "Use the public address" }, { status: 403 });
  // /new: a v1 invite link. It leads to sign-in and the creation-code field; v1 never carried the code in the URL (LIM-2473).
  if (p === "/" || p === "/new") return NextResponse.redirect(new URL("/app", `https://${name}`), 307);
  if (!HOSTED_ROUTES.test(p)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.next();
}

export const config = {
  // App and API routes; skip Next's static assets and image optimizer, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
