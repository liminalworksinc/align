import { requireWsSession } from "@/lib/auth";
import { audit, seeFinal, touch } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";
import { HttpError } from "@/lib/store";

const ACTIONS = new Set(["ceo_change_viewed", "brief_reviewed", "scenario_reviewed", "evidence_opened", "saw_accepted_version"]);

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { action } = await bodyFor<{ action?: string }>(req, who.ws);
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
