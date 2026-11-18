"use client";
import type { EvidenceClass } from "@/lib/v2/home-core.mts";
import { EvidenceLabel, type EvidenceKind } from "./ds";

// The one evidence class an agent-status item carries (LIM-2454 3770c6c4, the checklist's §E2), on the goal page's
// Agent activity and Agents on this goal cards, the value card's delivery and Connected AI apps lines and the Sessions
// tab's stop status. It is the same label, words and shape the Home, Apps, Requests and review drawer use ("Receipt",
// "Agent reported", "Not observed", dashed), so a class reads one way on every screen (founder ruling, LIM-2513, Nov 13).

const KIND: Record<EvidenceClass, EvidenceKind> = { delivery_receipt: "receipt", agent_reported: "reported", not_observed: "unobserved" };

export function EvidencePill({ c }: { c: EvidenceClass }) {
  return (
    <span data-evidence-class={c} className="inline-flex max-w-full">
      <EvidenceLabel kind={KIND[c]} size="s" />
    </span>
  );
}
