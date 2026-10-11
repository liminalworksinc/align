import { HttpError } from "./store";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Agent-facing routes are for processes on this machine. Browsers send Origin cross-site; refuse non-local ones. */
export function assertLocal(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {
    /* malformed or "null" origin */
  }
  if (!LOCAL_HOSTS.has(host)) throw new HttpError(403, "Directive routes are available from this machine only");
}
