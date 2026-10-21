import { requireSession } from "@/lib/auth";
import { listening } from "@/lib/events";
import { mapperStatus } from "@/lib/mapper";
import { handle } from "@/lib/http";
import { HttpError, readState } from "@/lib/store";

export async function GET(req: Request) {
  return handle(async () => {
    // Reading the request keeps this handler dynamic. Session data is local-only: refuse foreign browser origins.
    const origin = req.headers.get("origin");
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
      throw new HttpError(403, "Sessions are readable from this machine only");
    }
    // B1-3: captured sessions need a signed-in session. (/api/state still exposes them until B1-6.)
    requireSession(req);
    const s = await readState();
    const sessions = [...s.sessions].sort((a, b) => b.last_at.localeCompare(a.last_at));
    return { sessions, mappings: s.mappings, registry_version: s.registry_version, listening: Object.fromEntries(listening), mapper: mapperStatus() };
  });
}
