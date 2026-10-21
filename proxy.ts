import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_HOSTS } from "@/lib/local-guard";

// Every page and API route is for this machine only. A DNS-rebound page reaches the server under its own
// name, so refuse any Host header whose hostname is not loopback (any port). requireJson keeps its own check.
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  if (name && LOCAL_HOSTS.has(name)) return NextResponse.next();
  return new NextResponse("Misdirected request: this server answers to localhost only\n", {
    status: 421,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  // App and API routes; skip Next's static assets and image optimizer, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
