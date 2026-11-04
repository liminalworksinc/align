"use client";
import { Pill } from "./kit";
import { EVIDENCE_WORDS, type EvidenceClass } from "@/lib/v2/home-core.mts";

// The one evidence class an agent-status item carries (LIM-2454 3770c6c4, the checklist's §E2): delivery receipt,
// agent reported or not observed, in the Home's words (lib/v2/home-core.mts). Used by the goal page's Agent activity
// and Agents on this goal cards, the value card's delivery line and the Sessions tab's stop status.

export function EvidencePill({ c }: { c: EvidenceClass }) {
  return (
    <span data-evidence-class={c}>
      <Pill>{EVIDENCE_WORDS[c].toLowerCase()}</Pill>
    </span>
  );
}
