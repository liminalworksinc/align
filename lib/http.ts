import { HttpError } from "./store";

export async function handle(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * CSRF guard for state-replacing routes. SameSite=Strict does not separate localhost ports and body() parses any
 * content type, so require JSON (a cross-site form can't send it without a preflight) and a same-origin Origin.
 */
/** Host header names a loopback address (any port). A DNS-rebound page reaches us under its own name, so anything else is refused. */
function loopbackHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return ["localhost", "127.0.0.1", "[::1]"].includes(name.toLowerCase());
}

export function requireJson(req: Request) {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "Send this as application/json");
  if (!loopbackHost(req.headers.get("host"))) throw new HttpError(403, "This request must come from this machine");
  // Compare with the Host the browser actually used; Next's req.url may normalize it (e.g. to localhost).
  const origin = req.headers.get("origin");
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (!host || host !== req.headers.get("host")) throw new HttpError(403, "This request came from another site");
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
