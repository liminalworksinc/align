import { switchHint, type Labels } from "@/lib/labels";
import type { Proposal } from "@/lib/types";

// Custom scenarios: after an action hands off to the other team, one plain line naming who acts next. Null in Northstar
// and when the viewer is the one who acts next. It ends with the Switch team hint for a solo tester (LIM-2437 bd53f6f6).
export function nextStepHint(p: Proposal, viewer: string | null | undefined, L: Labels): string | null {
  if (L.northstar) return null;
  const step =
    p.state === "PENDING_SECURITY" && viewer === "product"
      ? { who: "security" as const, does: "reviews this" }
      : p.state === "COUNTERED" && viewer === "security"
        ? { who: "product" as const, does: "reviews your changes" }
        : p.state === "ACKNOWLEDGED_BY_PRODUCT" && viewer === "product"
          ? { who: "security" as const, does: "gives the final approval" }
          : null;
  if (!step) return null;
  return `Next: ${L.person[step.who]} ${step.does}. ${switchHint(L.role[step.who])}`;
}
