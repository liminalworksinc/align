import type { ReactNode } from "react";
import { EvidenceLabel, type EvidenceKind } from "./evidence-label";
import { Icon } from "./icons";

/** Where an event came from. person: recorded in Align against a person; system: Align itself. Align's audit log
 *  records no channel (browser, CLI or app), so person and system never claim one; `detail` can say so ("source not
 *  recorded"). Evidence uses the evidence classes: Receipt, Agent reported, Self-reported, Not observed. */
export type TimelineSource = { kind: "person" | "system"; detail?: string } | { kind: EvidenceKind; detail?: string };

const ORIGIN = {
  person: { icon: Icon.person, word: "Recorded in Align" },
  system: { icon: Icon.system, word: "Align" },
} as const;

export type TimelineEvent = {
  id: string;
  /** Who did it, as Align recorded them ("Maya Ortiz", "Claude Code on maya-laptop", "Align"). */
  who: string;
  /** What they did, in a short sentence ("approved version 3"). */
  what: ReactNode;
  /** ISO time. */
  when: string;
  /** The object it happened to ("Security goal", "Change request 12"). */
  object?: ReactNode;
  source: TimelineSource;
  detail?: ReactNode;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

function SourceLabel({ source }: { source: TimelineSource }) {
  if (source.kind !== "person" && source.kind !== "system")
    return <EvidenceLabel kind={source.kind} detail={"detail" in source ? source.detail : undefined} size="s" />;
  const o = ORIGIN[source.kind];
  const I = o.icon;
  return (
    <span data-source={source.kind} className="inline-flex items-center gap-1.5 rounded-(--radius-s) border border-(--line-strong) px-1.5 py-0.5 text-[12px] text-(--text-2)">
      <I />
      <span className="font-medium">{o.word}</span>
      {"detail" in source && source.detail && <span className="font-mono text-(--text-3)">{source.detail}</span>}
    </span>
  );
}

/** A chronological record: who did what, when, to which object, and from which source. Oldest first unless the
 *  caller sorts otherwise; only events Align recorded belong here. */
export function Timeline({ events, empty }: { events: TimelineEvent[]; empty?: ReactNode }) {
  if (!events.length) return <>{empty ?? <p className="text-[14px] text-(--text-2)">Nothing recorded yet.</p>}</>;
  return (
    <ol className="relative flex flex-col">
      {events.map((e, i) => (
        <li key={e.id} className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
          <span aria-hidden="true" className="relative flex justify-center">
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-(--edge) bg-(--bg-panel)" />
            {i < events.length - 1 && <span className="absolute top-5 bottom-[-4px] w-px bg-(--line-strong)" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[14px] font-semibold text-(--text-1)">{e.who}</span>
              <span className="text-[14px] text-(--text-1)">{e.what}</span>
              {e.object && <span className="text-[14px] text-(--text-2)">· {e.object}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <time dateTime={e.when} className="font-mono text-[12px] text-(--text-3)">
                {fmt(e.when)}
              </time>
              <SourceLabel source={e.source} />
            </div>
            {e.detail && <div className="mt-2 rounded-(--radius-s) border border-(--line) bg-(--bg-inset) px-3 py-2 text-[13px] text-(--text-2)">{e.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
