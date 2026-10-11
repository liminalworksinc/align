import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { HttpError, mutate } from "@/lib/store";


// Records the reference to a decision that was genuinely retrieved from Alike in a separate coding-agent session.
// Stores only id, summary, timestamps and the plan before/after: never raw transcripts.
export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const b = await body<Record<string, string>>(req);
    for (const k of ["decision_id", "summary", "recorded_at", "retrieved_in_session", "plan_before", "plan_after"])
      if (!b[k]?.trim()) throw new HttpError(400, `Missing ${k}`);
    return mutate((s) => {
      s.brief.alike_ref = {
        decision_id: b.decision_id.trim(),
        summary: b.summary.trim().slice(0, 600),
        recorded_at: b.recorded_at.trim(),
        retrieved_in_session: b.retrieved_in_session.trim(),
        plan_before: b.plan_before.trim().slice(0, 600),
        plan_after: b.plan_after.trim().slice(0, 600),
      };
      s.brief.alike_status = "retrieved";
      audit(s, who, "alike_ref_recorded", b.decision_id);
      return s.brief;
    });
  });
}
