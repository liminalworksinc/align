import { switchHint, type Labels } from "@/lib/labels";
import type { Acceptance, Actor, Proposal } from "@/lib/types";

export type NextStep = { who: Actor; does: string };

// Custom scenarios: after an action hands off to the other team, who acts next. Null in Northstar and when the viewer
// is the one who acts next (LIM-2437 bd53f6f6).
export function nextStep(p: Proposal, viewer: string | null | undefined, L: Labels): NextStep | null {
  if (L.northstar) return null;
  return p.state === "PENDING_SECURITY" && viewer === "product"
    ? { who: "security", does: "reviews this" }
    : p.state === "COUNTERED" && viewer === "security"
      ? { who: "product", does: "reviews your changes" }
      : p.state === "ACKNOWLEDGED_BY_PRODUCT" && viewer === "product"
        ? { who: "security", does: "gives the final approval" }
        : null;
}

/** The same step as one plain line, ending with the Switch team hint for a solo tester. */
export function nextStepHint(p: Proposal, viewer: string | null | undefined, L: Labels): string | null {
  const step = nextStep(p, viewer, L);
  return step ? `Next: ${L.person[step.who]} ${step.does}. ${switchHint(L.role[step.who])}` : null;
}

export type Stage = { key: string; who: Actor; label: string; state: "done" | "now" | "later" | "stopped" };

/** Tool Concepts v2 §04: the handshake as steps, so where a proposal stands is read off the strip, not a paragraph.
 *  Custom only. The "accepts the changes" step appears only once the owner has asked for changes. */
export function stages(p: Proposal, acc: Acceptance | null): Stage[] {
  const countered = p.counter_versions.length > 0;
  const ratified = p.state === "RATIFIED";
  const launched = acc?.launch_decision?.decision === "approved";
  const out: Stage[] = [{ key: "proposed", who: p.proposing_owner, label: "Proposed", state: "done" }];
  if (p.state === "REJECTED") {
    out.push({ key: "declined", who: p.recipient_owner, label: "Declined", state: "stopped" });
    return out;
  }
  out.push({ key: "review", who: p.recipient_owner, label: countered ? "Asked for changes" : "Reviews", state: p.state === "PENDING_SECURITY" ? "now" : "done" });
  if (countered) out.push({ key: "accept", who: p.proposing_owner, label: "Accepts the changes", state: p.state === "COUNTERED" ? "now" : "done" });
  out.push({ key: "approve", who: p.recipient_owner, label: "Approves", state: ratified ? "done" : p.state === "ACKNOWLEDGED_BY_PRODUCT" ? "now" : "later" });
  out.push({ key: "launch", who: "leadership", label: "Decides the launch", state: launched ? "done" : ratified ? "now" : "later" });
  return out;
}
