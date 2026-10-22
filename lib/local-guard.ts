import { HttpError } from "./store";

/** Loopback host names. Also used by proxy.ts against the Host header ("[::1]" there; "::1" is URL.hostname's form). */
export const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** True when a browser Origin is this machine and this very server: a loopback name and the same host and port as
 *  the Host header. Another local port is another site (SameSite=Strict doesn't separate localhost ports). */
export function originIsThisServer(req: Request, origin: string): boolean {
  try {
    const u = new URL(origin);
    return LOCAL_HOSTS.has(u.hostname) && u.host === req.headers.get("host");
  } catch {
    return false; // malformed or "null" origin
  }
}

/** Agent-facing routes are for processes on this machine. Browsers send Origin cross-site; refuse any page that isn't
 *  this server itself (another localhost port included). Scripts send no Origin. */
export function assertLocal(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  if (!originIsThisServer(req, origin)) throw new HttpError(403, "Directive routes are available from this machine only");
}
