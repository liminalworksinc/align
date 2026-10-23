import { NextResponse, type NextRequest } from "next/server";
import { config as alignConfig, hostAllowed, hostName, startupProblems, testServerClosed } from "@/lib/config";
import { LOCAL_HOSTS } from "@/lib/local-guard";

// Runs before every page and API route.
// Mode L (default): every route is for this machine only. A DNS-rebound page reaches the server under its own
// name, so refuse any Host header whose hostname is not loopback (any port). requireJson keeps its own check.
// HOSTED=1 (tester mode): the ALIGN_HOSTS allowlist replaces loopback; then HTTPS is required (X-Forwarded-Proto
// from Fly's proxy is trusted only in this mode) and the request must come through that proxy (Fly-Client-IP).
// Only the tester routes below exist: everything else, Northstar and capture included, is 404, so a route added
// later is closed when hosted until it is listed here.
const HOSTED_ROUTES = [
  /^\/new$/,
  /^\/w\/[^/]+$/,
  /^\/api\/workspaces$/,
  /^\/api\/workspaces\/config$/,
  /^\/api\/workspaces\/[^/]+\/login-info$/,
  /^\/api\/session$/,
  /^\/api\/state$/,
  /^\/api\/timer$/,
  /^\/api\/reset$/,
  /^\/api\/proposals$/,
  /^\/api\/proposals\/[^/]+\/(?:accept|acknowledge|counter|launch|reject)$/,
];
const TO_NEW = new Set(["/", "/setup"]); // Northstar's pages: a tester lands on workspace creation instead

const text = (status: number, body: string) => new NextResponse(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export function proxy(request: NextRequest) {
  const cfg = alignConfig();
  const name = hostName(request.headers.get("host"));
  if (!cfg.hosted) {
    if (name && LOCAL_HOSTS.has(name)) return NextResponse.next();
    return text(421, "Misdirected request: this server answers to localhost only\n");
  }
  // A misconfigured hosted server serves nothing, even if the platform kept the process up after startup refused.
  if (startupProblems().length) return text(503, "This server is not configured to serve testers yet\n");
  // Closed (the promised deletion date has ended): the server stays up for the operator's purge, and every request
  // gets 410, whatever its Host or headers.
  if (testServerClosed(cfg.deleteBy)) return text(410, `This test server closed on ${cfg.deleteBy}.\n`);
  if (!hostAllowed(request.headers.get("host"))) return text(421, "Misdirected request: this server answers to its own host name only\n");
  if (request.headers.get("x-forwarded-proto") !== "https") return NextResponse.json({ error: "Use https" }, { status: 403 });
  // Fly's edge sets Fly-Client-IP; a request without it did not come through the public proxy.
  if (!request.headers.get("fly-client-ip")) return NextResponse.json({ error: "Use the public address" }, { status: 403 });
  const p = request.nextUrl.pathname;
  if (TO_NEW.has(p)) return NextResponse.redirect(new URL("/new", `https://${name}`), 307);
  if (!HOSTED_ROUTES.some((r) => r.test(p))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.next();
}

export const config = {
  // App and API routes; skip Next's static assets and image optimizer, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
