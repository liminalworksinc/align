import { Icon } from "./icons";

export type EvidenceKind = "receipt" | "reported" | "unobserved";

// The three evidence classes (LIM-2454 3770c6c4). Words are exact: Receipt = Align delivered something and recorded
// it; Agent reported = the agent's own words; Not observed = Align has nothing. Never "verified", "live" or "done".
const WORD: Record<EvidenceKind, string> = { receipt: "Receipt", reported: "Agent reported", unobserved: "Not observed" };

const TONE: Record<EvidenceKind, string> = {
  receipt: "text-(--ev-receipt) bg-(--ev-receipt-soft) border-(--ev-receipt)/40",
  reported: "text-(--ev-reported) bg-(--ev-reported-soft) border-(--ev-reported)/40",
  unobserved: "text-(--ev-unobserved) bg-(--ev-unobserved-soft) border-(--ev-unobserved)/50 border-dashed",
};

/** One evidence class, as a word and a shape; `detail` adds what the class is about ("applied v3", "PR link"). */
export function EvidenceLabel({ kind, detail, size = "m" }: { kind: EvidenceKind; detail?: string; size?: "s" | "m" }) {
  const I = Icon[kind];
  return (
    <span
      data-evidence={kind}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-(--radius-s) border ${TONE[kind]} ${size === "s" ? "px-1.5 py-0.5 text-[12px]" : "px-2 py-1 text-[13px]"}`}
    >
      <I />
      <span className="font-medium">{WORD[kind]}</span>
      {detail && <span className="font-mono text-[12px] opacity-90">{detail}</span>}
    </span>
  );
}
