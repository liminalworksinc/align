import type { ReactNode } from "react";
import { EvidenceLabel, type EvidenceKind } from "./evidence-label";

/** Where an event came from. Person and system events are what Align recorded itself; the three evidence classes are
 *  for what agents and their devices sent. */
export type TimelineSource = { kind: "person" | "system" } | { kind: EvidenceKind; detail?: string };

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
  if (source.kind === "person" || source.kind === "system")
    return <span className="font-mono text-[12px] text-(--text-3)">{source.kind === "person" ? "Recorded in Align" : "Align"}</span>;
  return <EvidenceLabel kind={source.kind} detail={"detail" in source ? source.detail : undefined} size="s" />;
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
