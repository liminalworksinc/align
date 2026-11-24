import { preview } from "@/lib/v2/audit";
import { auditModel } from "@/lib/v2/audit-model";
import { V2Error } from "@/lib/v2/errors";
import { clientKey, readJson, requireSameSite, route } from "@/lib/v2/http";
import { take } from "@/lib/v2/limits";

// POST /api/v2/audit/preview (no sign-in; release A is open to anyone with the link, founder ruling 2026-11-24).
// Body: { paste }. Redacts, parses and computes, sends nothing anywhere, stores nothing. Returns the exact text a send
// would carry, who would read it, and a single-use permission for that text (spec C1, C3, C4).
export const POST = route(async (req) => {
  requireSameSite(req);
  take(`audit-preview:${clientKey(req)}`, 30, 3600_000);
  if (!auditModel()) throw new V2Error(503, "audit_unavailable", "Audits are not turned on for this server yet");
  const body = await readJson(req, 256 * 1024);
  if (typeof body.paste !== "string" || !body.paste.trim()) throw new V2Error(400, "bad_request", "Paste what your agent printed");
  return preview(body.paste);
});
