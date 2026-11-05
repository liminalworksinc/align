"use client";
import { EVIDENCE_WORDS, type EvidenceClass } from "@/lib/v2/home-core.mts";

// The one evidence class an agent-status item carries (LIM-2454 3770c6c4, the checklist's §E2): delivery receipt,
// agent reported or not observed, in the Home's words (lib/v2/home-core.mts). Used by the goal page's Agent activity
// and Agents on this goal cards, the value card's delivery line and the Sessions tab's stop status. Coloured from the
// LIM-2472 evidence tokens (both themes), with the dashed border the ds EvidenceLabel gives Not observed, so the class
// is never told by colour alone.

const TONE: Record<EvidenceClass, string> = {
  delivery_receipt: "text-(--ev-receipt) border-(--ev-receipt) bg-(--ev-receipt-soft)",
  agent_reported: "text-(--ev-reported) border-(--ev-reported) bg-(--ev-reported-soft)",
  not_observed: "text-(--ev-unobserved) border-(--ev-unobserved) border-dashed bg-(--ev-unobserved-soft)",
};

export function EvidencePill({ c }: { c: EvidenceClass }) {
  return (
    <span data-evidence-class={c}>
      <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 font-mono text-[12px] tracking-[0.04em] [overflow-wrap:anywhere] ${TONE[c]}`}>{EVIDENCE_WORDS[c].toLowerCase()}</span>
    </span>
  );
}
