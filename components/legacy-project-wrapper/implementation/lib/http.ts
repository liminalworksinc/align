import { config, hostAllowed } from "./config";
import { HttpError } from "./errors";

// Request helpers for the routes outside /api/v2 that take a browser's JSON: the OAuth consent answer
// (app/api/oauth/approve) and dynamic client registration (app/oauth/register). /api/v2 has its own (lib/v2/http.ts).

export async function handle(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    if (e instanceof HttpError) return Response.json(e.code ? { error: e.message, code: e.code } : { error: e.message }, { status: e.status });
    // Hosted logs carry no request data: an error's message can quote a body or a path, so only its name is kept.
    if (config().hosted) console.error("Server error:", (e as Error)?.name ?? "unknown");
    else console.error(e);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

/** Host header names a loopback address (any port). A DNS-rebound page reaches us under its own name, so anything else is refused. */
function loopbackHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return ["localhost", "127.0.0.1", "[::1]"].includes(name.toLowerCase());
}

/**
 * Hosted (QA-exit finding): the site is https only and a browser sends Origin on every write, so a write's Origin must
 * be exactly https://<Host>. Comparing the host alone let an http:// page (same name, other scheme) write. A wrong
 * scheme, another port, or no Origin at all is refused. Local mode keeps its host:port rule below.
 */
function requireHostedOrigin(req: Request) {
  const origin = req.headers.get("origin")?.toLowerCase();
  const host = req.headers.get("host")?.toLowerCase();
  if (!origin || !host || origin !== `https://${host}`) throw new HttpError(403, "This request came from another site");
}

/**
 * CSRF guard for cookie-authenticated writes: SameSite=Strict does not separate localhost ports, so require JSON (a
 * cross-site form can't send it without a preflight), a loopback (or, hosted, allowlisted) Host and a same-origin Origin.
 */
export function requireJson(req: Request) {
  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "Send this as application/json");
  if (config().hosted) {
    // Hosted: the configured public hostnames replace the loopback rule (proxy.ts enforces the same list).
    if (!hostAllowed(req.headers.get("host"))) throw new HttpError(403, "This request came from another site");
  } else if (!loopbackHost(req.headers.get("host"))) throw new HttpError(403, "This request must come from this machine");
  // Compare with the Host the browser actually used; Next's req.url may normalize it (e.g. to localhost).
  const origin = req.headers.get("origin");
  if (config().hosted) requireHostedOrigin(req);
  else if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (!host || host !== req.headers.get("host")) throw new HttpError(403, "This request came from another site");
  }
}

const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function rejectReserved(v: unknown, at: string): void {
  if (Array.isArray(v)) return v.forEach((x, i) => rejectReserved(x, `${at}[${i}]`));
  if (v && typeof v === "object")
    for (const k of Object.keys(v)) {
      if (RESERVED_KEYS.has(k)) throw new HttpError(400, `“${k}” is not allowed as a field name (at ${at})`);
      rejectReserved((v as Record<string, unknown>)[k], `${at}.${k}`);
    }
}

/**
 * Read at most `max` bytes (413 beyond that) and parse JSON (400 if invalid, or if any key is __proto__,
 * constructor or prototype). An empty body is {}.
 */
export async function cappedJson<T = Record<string, unknown>>(req: Request, max = 64 * 1024, tooLarge = "This request is too large"): Promise<T> {
  if (Number(req.headers.get("content-length") || 0) > max) throw new HttpError(413, tooLarge);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, tooLarge);
      }
      chunks.push(value);
    }
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {} as T;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Send valid JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "Send a JSON object");
  rejectReserved(raw, "body");
  return raw as T;
}
