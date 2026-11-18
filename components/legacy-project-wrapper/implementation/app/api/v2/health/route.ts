import { get } from "@/lib/v2/db";
import { route } from "@/lib/v2/http";

// GET /api/v2/health (no auth): Fly's health check (fly.toml). The server is up and its database answers. It is not an
// auth route, so no sign-in rate limit counts it: the check used to call Better Auth's get-session every 30 s, whose
// counter resets only after 60 s with no request, so every 101st check (every 50 min) was refused with 429. Hosted, the
// proxy still requires the allowlisted Host, https and Fly-Client-IP, and a misconfigured server answers 503.
export const GET = route(async () => {
  get("SELECT 1 AS ok");
  return { ok: true };
});
