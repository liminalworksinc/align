import { NextResponse, type NextRequest } from "next/server";
import { config as alignConfig, hostAllowed, hostName } from "@/lib/config";
import { LOCAL_HOSTS } from "@/lib/local-guard";

// Runs before every page and API route.
// Mode L (default): every route is for this machine only. A DNS-rebound page reaches the server under its own
// name, so refuse any Host header whose hostname is not loopback (any port). requireJson keeps its own check.
// HOSTED=1 (tester mode): the ALIGN_HOSTS allowlist replaces loopback; then HTTPS is required (X-Forwarded-Proto
// from the platform proxy is trusted only in this mode), agent capture is off, and Northstar's no-session routes
// are closed unless ALIGN_NORTHSTAR_PUBLIC=1.
const CAPTURE = ["/api/sessions/events"];
const NORTHSTAR_OPEN = ["/api/sessions", "/api/directives", "/api/mappings", "/api/policy", "/api/simulations", "/api/evidence", "/api/mcp"];
const under = (p: string, prefixes: string[]) => prefixes.some((x) => p === x || p.startsWith(`${x}/`));

export function proxy(request: NextRequest) {
  const cfg = alignConfig();
  const name = hostName(request.headers.get("host"));
  if (!cfg.hosted) {
    if (name && LOCAL_HOSTS.has(name)) return NextResponse.next();
    return new NextResponse("Misdirected request: this server answers to localhost only\n", {
      status: 421,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!hostAllowed(request.headers.get("host"))) {
    return new NextResponse("Misdirected request: this server answers to its own host name only\n", {
      status: 421,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (request.headers.get("x-forwarded-proto") !== "https") return NextResponse.json({ error: "Use https" }, { status: 403 });
  const p = request.nextUrl.pathname;
  if (under(p, CAPTURE) || (!cfg.northstarPublic && under(p, NORTHSTAR_OPEN))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // App and API routes; skip Next's static assets and image optimizer, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
