import { config, hostAllowed } from "./config";
import { MAX_CONDITIONS } from "./flow";
import { HttpError } from "./store";

export async function handle(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return out instanceof Response ? out : Response.json(out);
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    // Hosted logs carry no request data: an error's message can quote a body or a path, so only its name is kept.
    if (config().hosted) console.error("Server error:", (e as Error)?.name ?? "unknown");
    else console.error(e);
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
  if (config().hosted) {
    // Hosted: the configured public hostnames replace the loopback rule (proxy.ts enforces the same list).
    if (!hostAllowed(req.headers.get("host"))) throw new HttpError(403, "This request came from another site");
  } else if (!loopbackHost(req.headers.get("host"))) throw new HttpError(403, "This request must come from this machine");
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
 * constructor or prototype). An empty body is {}. Used by the workspace routes; body() is unchanged.
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

/** Per-field caps for custom workspace bodies: every string 300 characters, plan text 4000, a counter's conditions
 *  MAX_CONDITIONS (lib/flow.ts checks the same limit for /setup scenarios). */
export function capFields(v: unknown, at = "body"): void {
  if (typeof v === "string") {
    const max = /(^|\.)(text|plan_text)$/.test(at) ? 4000 : at === "body.conditions" ? MAX_CONDITIONS : 300;
    if (v.length > max) throw new HttpError(400, `${at.replace(/^body\./, "")} is too long (max ${max} characters)`);
  } else if (Array.isArray(v)) v.forEach((x, i) => capFields(x, `${at}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) capFields(x, `${at}.${k}`);
}

/** Northstar bodies parse exactly as before (body()); custom workspace bodies are capped at 64 KB and per field. */
export async function bodyFor<T = Record<string, unknown>>(req: Request, ws: string): Promise<T> {
  if (ws === "northstar") return body<T>(req);
  // CSRF: SameSite=Strict doesn't separate localhost ports, so a text/plain form from another local port could
  // otherwise write to a signed-in workspace. JSON only, same Host and Origin, as /api/workspaces requires.
  requireJson(req);
  const b = await cappedJson<T>(req);
  capFields(b);
  return b;
}
