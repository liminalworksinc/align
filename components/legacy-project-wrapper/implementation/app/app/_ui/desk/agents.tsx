"use client";
import Link from "next/link";
import { EvidenceLabel, type EvidenceKind } from "../ds";
import { when } from "../kit";
import { appStatusWords, type EvidenceClass } from "@/lib/v2/home-core.mts";

// What Align has observed of the connected AI apps, from the Home read (GET …/home, apps). One evidence class each:
// a goal read Align served (last_read_at) is a Receipt; an app that only connected is Not observed. A connection is
// never shown as a read, and nothing says what an agent did with a goal.

export interface HomeApp {
  id: string;
  name: string;
  connected_by: { id: string; name: string };
  approved_at: string;
  last_used_at: string | null;
  last_read_at: string | null;
  evidence_class: EvidenceClass;
}

export const EV: Record<EvidenceClass, EvidenceKind> = { delivery_receipt: "receipt", agent_reported: "reported", not_observed: "unobserved" };

/** One line on whether any connected app has read the goals, for a decision's evidence panel. */
export function AgentsLine({ ws, apps }: { ws: string; apps: { everyone: boolean; items: HomeApp[] } | null | undefined }) {
  if (apps === undefined) return null;
  if (apps === null)
    return <p className="text-[13px] text-(--text-2)">Align couldn&apos;t read the connected apps just now, so whether any agent read the goals is unknown.</p>;
  if (!apps.items.length)
    return (
      <div className="flex flex-col gap-1.5" data-agents="none">
        <EvidenceLabel kind="unobserved" detail="no app connected" />
        <p className="text-[13px] text-(--text-2)">
          {apps.everyone ? "No AI app is connected to this workspace" : "You haven't connected an AI app here"}, so Align has observed no agent reading this goal.{" "}
          <Link href={`/app/w/${ws}/apps`} className="text-(--accent-text) underline-offset-4 hover:underline">
            Connect an agent
          </Link>
        </p>
      </div>
    );
  return (
    <ul className="flex flex-col gap-2" data-agents="list">
      {apps.items.map((a) => (
        <li key={a.id} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-(--text-1)">{a.name}</span>
            <EvidenceLabel kind={EV[a.evidence_class]} size="s" />
          </div>
          <span className="text-[12px] text-(--text-3)">{appStatusWords(a, when)}. Align sees when an app reads the goals, not what it does with them.</span>
        </li>
      ))}
    </ul>
  );
}
