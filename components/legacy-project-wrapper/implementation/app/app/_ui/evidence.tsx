"use client";
import type { EvidenceClass } from "@/lib/v2/home-core.mts";
import { EvidenceLabel, type EvidenceKind } from "./ds/evidence-label";

// The one evidence class an agent-status item carries (LIM-2454 3770c6c4, the checklist's §E2): delivery receipt,
// agent reported or not observed. Used by the goal page's Agent activity and Agents on this goal cards, the value
// card's delivery line and the Sessions tab's stop status. It is the same label as every other screen (EvidenceLabel:
// a word, an icon and a shape, so the class is never told by colour alone), in the one word table (founder ruling
// Nov 16, LIM-2513); data-evidence-class keeps the server's class name for tests.

const KIND: Record<EvidenceClass, EvidenceKind> = { delivery_receipt: "receipt", agent_reported: "reported", not_observed: "unobserved" };

export function EvidencePill({ c }: { c: EvidenceClass }) {
  return (
    <span data-evidence-class={c} className="inline-flex max-w-full">
      <EvidenceLabel kind={KIND[c]} size="s" />
    </span>
  );
}
