"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import { Shell } from "../../../_ui/kit";
import { DecisionRecord } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";

// The decision record page: the shared timeline body (app/app/_ui/ds/decision-record.tsx) inside today's shell, which
// either concept's shell replaces. With ?cr= it is the review a link lands on: the review leads, its record follows.
export default function Record({ me, ws, goal, cr }: { me: Me; ws: string; goal?: string; cr?: string }) {
  return (
    <Shell me={me} ws={ws}>
      <h1 className={`${PAGE_H1} mb-5`}>{cr ? "Review" : "Decision record"}</h1>
      <DecisionRecord ws={ws} me={me.id} goalId={goal} crId={cr} />
    </Shell>
  );
}
