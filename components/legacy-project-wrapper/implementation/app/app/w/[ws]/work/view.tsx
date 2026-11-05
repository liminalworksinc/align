"use client";
import { Shell } from "../../../_ui/kit";
import { WorkPanels } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";

// The Work page: the shared goal-by-goal drill-down (app/app/_ui/ds/work.tsx) inside today's shell, which either
// concept's shell replaces.
export default function Work({ me, ws, goal }: { me: Me; ws: string; goal?: string }) {
  return (
    <Shell me={me} ws={ws}>
      <h1 className="mb-1 text-[26px] font-semibold text-(--text-1)">Work</h1>
      <p className="mb-5 max-w-prose text-[15px] text-(--text-2)">What Align knows about the work on each goal: sessions people shared toward it, evidence on its changes and connected apps&apos; goal reads. Each item says where it came from.</p>
      <WorkPanels ws={ws} goalId={goal} />
    </Shell>
  );
}
