import { runAudit } from "@/lib/v2/audit";
import { auditModel } from "@/lib/v2/audit-model";
import { V2Error } from "@/lib/v2/errors";
import { clientKey, readJson, requireSameSite, route } from "@/lib/v2/http";
import { take, takeAll } from "@/lib/v2/limits";

// POST /api/v2/audit/run: the consent click (spec C1 to C3, C6). Body: { payload, permission } exactly as the preview
// returned them. The permission works once, for that text, for ten minutes; anything else is refused before any model
// call. A browser always sends Origin on this POST; a request without one is refused, so no script or command-line
// path is a supported way to give consent (C2). Nothing is stored: the report is returned and forgotten.
export const POST = route(async (req) => {
  requireSameSite(req);
  if (!req.headers.get("origin")) throw new V2Error(403, "consent_browser_only", "Send this from the audit page in a browser");
  const model = auditModel();
  if (!model) throw new V2Error(503, "audit_unavailable", "Audits are not turned on for this server yet");
  // Per client on every attempt; the server-wide daily ceiling on model calls (each audit is at most two) only after
  // the permission is accepted, so refused requests cannot exhaust it.
  take(`audit-run:${clientKey(req)}`, 6, 3600_000);
  const body = await readJson(req, 256 * 1024);
  return runAudit(body.payload, body.permission, model, () => {
    if (!takeAll([{ key: "audit-run:all", max: 200, windowMs: 24 * 3600_000 }])) throw new V2Error(429, "rate_limited", "Audits are busy today. Try again tomorrow.");
  });
});
