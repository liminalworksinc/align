import { requireWsSession } from "@/lib/auth";
import { audit, seeFinal, touch } from "@/lib/flow";
import { recordFunnel } from "@/lib/funnel";
import { bodyFor, handle } from "@/lib/http";
import { HttpError } from "@/lib/store";
import { isFunnelAction } from "@/lib/value";

const ACTIONS = new Set(["ceo_change_viewed", "brief_reviewed", "scenario_reviewed", "evidence_opened", "saw_accepted_version"]);

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireWsSession(req);
    const b = await bodyFor<{ action?: string; proposal_id?: unknown; feedback?: unknown }>(req, who.ws);
    const { action } = b;
    // The decision value card's funnel events (issue #30): custom workspaces only, kept in workspace state with the role
    // and a time. value_reported carries the tester's answer in `feedback` on this same request, so no new route exists.
    if (isFunnelAction(action)) return who.mutate((s) => recordFunnel(s, who, action, b));
    if (!action || !ACTIONS.has(action)) throw new HttpError(400, "Unknown timer action");
    return who.mutate((s) => {
      if (action === "saw_accepted_version") seeFinal(s, who);
      else {
        const before = s.timer.touchpoints.length;
        // record each review action once per actor to keep the touchpoint log honest and short
        if (!s.timer.touchpoints.some((t) => t.actor === who.actor && t.action === action)) touch(s, who, action);
        if (s.timer.touchpoints.length !== before) audit(s, who, action, "timer");
      }
      return s.timer;
    });
  });
}
