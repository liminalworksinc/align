import { Icon } from "./icons";

export type EvidenceKind = "receipt" | "reported" | "self" | "unobserved";

// The evidence classes (LIM-2454 3770c6c4). Words are exact: Receipt = Align delivered something and recorded it; Agent
// reported = the agent's own words; Self-reported = a person added this in a web session and Align did not check it
// (reported_as on an evidence item, lib/v2/evidence.ts); Not observed = Align has nothing. Never "verified", "live" or
// "done". Self-reported is neutral on purpose: it ranks below Agent reported and has no colour of its own.
const WORD: Record<EvidenceKind, string> = { receipt: "Receipt", reported: "Agent reported", self: "Self-reported", unobserved: "Not observed" };

const TONE: Record<EvidenceKind, string> = {
  receipt: "text-(--ev-receipt) bg-(--ev-receipt-soft) border-(--ev-receipt)/40",
  reported: "text-(--ev-reported) bg-(--ev-reported-soft) border-(--ev-reported)/40",
  self: "text-(--text-2) border-(--line-strong)",
  unobserved: "text-(--ev-unobserved) bg-(--ev-unobserved-soft) border-(--ev-unobserved)/50 border-dashed",
};

/** One evidence class, as a word and a shape; `detail` adds what the class is about ("applied v3", "PR link"). */
export function EvidenceLabel({ kind, detail, size = "m" }: { kind: EvidenceKind; detail?: string; size?: "s" | "m" }) {
  const I = kind === "self" ? Icon.person : Icon[kind];
  return (
    <span
      data-evidence={kind}
      className={`inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-(--radius-s) border ${TONE[kind]} ${size === "s" ? "px-1.5 py-0.5 text-[12px]" : "px-2 py-1 text-[13px]"}`}
    >
      {/* The icon and the word stay together; only the detail wraps. */}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
        <I />
        {WORD[kind]}
      </span>
      {detail && <span className="min-w-0 break-words font-mono text-[12px]">{detail}</span>}
    </span>
  );
}
