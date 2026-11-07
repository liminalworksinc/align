import { Icon } from "./icons";

export type StatusKind = "draft" | "pending" | "countered" | "approved" | "launched" | "declined" | "held";

const WORD: Record<StatusKind, string> = {
  draft: "Draft",
  pending: "Pending",
  countered: "Countered",
  approved: "Approved",
  launched: "Launched",
  declined: "Declined",
  held: "Held",
};

// Orchid (--st-pending) is the in-between colour: pending, countered and held share it and differ by word and shape.
const TONE: Record<StatusKind, string> = {
  draft: "text-(--text-2) bg-(--bg-inset) border-(--line-strong) border-dashed",
  pending: "text-(--st-pending) bg-(--st-pending-soft) border-(--st-pending)/40",
  countered: "text-(--st-pending) bg-(--st-pending-soft) border-(--st-pending)/40",
  held: "text-(--st-pending) bg-(--st-pending-soft) border-(--st-pending)/40",
  approved: "text-(--st-approved) bg-(--st-approved-soft) border-(--st-approved)/40",
  launched: "text-(--st-launched) bg-(--st-launched-soft) border-(--st-launched)/45",
  declined: "text-(--st-declined) bg-(--st-declined-soft) border-(--st-declined)/40",
};

/** A change request's or plan's state: always a word and a shape. `label` replaces the word (e.g. "Approved, launch
 *  not yet"), never with a different meaning. */
export function StatusPill({ kind, label, size = "m" }: { kind: StatusKind; label?: string; size?: "s" | "m" }) {
  const I = Icon[kind];
  return (
    <span
      data-status={kind}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium ${TONE[kind]} ${size === "s" ? "px-2 py-0.5 text-[12px]" : "px-2.5 py-1 text-[13px]"}`}
    >
      <span className="shrink-0">
        <I />
      </span>
      <span className="[overflow-wrap:normal]">{label ?? WORD[kind]}</span>
    </span>
  );
}
