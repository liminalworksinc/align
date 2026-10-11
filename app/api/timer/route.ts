import { requireSession } from "@/lib/auth";
import { audit, seeFinal, touch } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { HttpError, mutate } from "@/lib/store";

const ACTIONS = new Set(["ceo_change_viewed", "brief_reviewed", "scenario_reviewed", "evidence_opened", "saw_accepted_version"]);

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const { action } = await body<{ action?: string }>(req);
    if (!action || !ACTIONS.has(action)) throw new HttpError(400, "Unknown timer action");
    return mutate((s) => {
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
