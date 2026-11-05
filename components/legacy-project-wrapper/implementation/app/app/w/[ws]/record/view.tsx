"use client";
import { Shell } from "../../../_ui/kit";
import { DecisionRecord } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";

// The decision record page: the shared timeline body (app/app/_ui/ds/decision-record.tsx) inside today's shell, which
// either concept's shell replaces.
export default function Record({ me, ws, goal, cr }: { me: Me; ws: string; goal?: string; cr?: string }) {
  return (
    <Shell me={me} ws={ws}>
      <h1 className="mb-5 text-[26px] font-semibold text-(--text-1)">Decision record</h1>
      <DecisionRecord ws={ws} me={me.id} goalId={goal} crId={cr} />
    </Shell>
  );
}
