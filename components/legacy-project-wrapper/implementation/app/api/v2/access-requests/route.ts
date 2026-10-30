import { createAccessRequest } from "@/lib/v2/access";
import { clientKey, readJson, requireSameSite, route } from "@/lib/v2/http";

// POST /api/v2/access-requests (no sign-in; same-site browser form) { email, name, company?, team_size?, use_case,
// interest: "try"|"evaluate" } -> 201 { received: true }. Turnstile token in x-captcha-response when Turnstile is on.
export const POST = route(async (req) => {
  requireSameSite(req);
  const b = await readJson(req, 8192);
  return Response.json(await createAccessRequest(req, clientKey(req), b), { status: 201 });
});
