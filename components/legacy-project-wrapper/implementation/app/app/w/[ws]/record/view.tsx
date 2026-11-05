"use client";
import { DecisionRecord } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";
import { DeskShell } from "../../../_ui/b/shell";

// The decision record page: the shared timeline body (app/app/_ui/ds/decision-record.tsx) inside today's shell, which
// either concept's shell replaces. With ?cr= it is the review a link lands on: the review leads, its record follows.
// Concept B: the desk shell, so the journey stays in one frame.
export default function Record({ me, ws, goal, cr }: { me: Me; ws: string; goal?: string; cr?: string }) {
  return (
    <DeskShell me={me} ws={ws} active="desk" crumbs={[{ label: "Decision desk", href: `/app/w/${ws}` }, { label: cr ? "Review" : "Decision record" }]}>
      <h1 className="mb-5 text-[26px] font-semibold text-(--text-1)">{cr ? "Review" : "Decision record"}</h1>
      <DecisionRecord ws={ws} me={me.id} goalId={goal} crId={cr} />
    </DeskShell>
  );
}
