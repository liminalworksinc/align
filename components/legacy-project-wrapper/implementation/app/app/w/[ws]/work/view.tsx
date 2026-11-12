"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import { Shell } from "../../../_ui/kit";
import { WorkPanels } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";

// The Work page: the shared body (app/app/_ui/ds/work.tsx) inside the shell. ?goal=<g>&cr=<id> leads with that
// decision; ?goal=<g> with the goal's open or latest one; bare /work is a plain index of goals.
export default function Work({ me, ws, goal, cr }: { me: Me; ws: string; goal?: string; cr?: string }) {
  return (
    <Shell me={me} ws={ws}>
      <h1 className={`${PAGE_H1} mb-1`}>Work</h1>
      <p className="mb-5 max-w-prose text-[15px] text-(--text-2)">What Align knows about the work behind a decision: its evidence, what Align sent, the sessions on the goal and connected apps&apos; goal reads. Each item says where it came from.</p>
      <WorkPanels ws={ws} goalId={goal} crId={cr} me={me.id} />
    </Shell>
  );
}
