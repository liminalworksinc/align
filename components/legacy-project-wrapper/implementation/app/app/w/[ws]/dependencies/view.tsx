"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import { Shell } from "../../../_ui/kit";
import { GoalDependencies } from "../../../_ui/ds";
import type { Me } from "../../../_ui/server";

// The goal dependencies page: the shared goal map (app/app/_ui/ds/dependencies.tsx) inside today's shell, which either
// concept's shell replaces.
export default function Dependencies({ me, ws, goal }: { me: Me; ws: string; goal?: string }) {
  return (
    <Shell me={me} ws={ws}>
      <h1 className={`${PAGE_H1} mb-1`}>Goal dependencies</h1>
      <p className="mb-5 max-w-prose text-[15px] text-(--text-2)">Each goal under the goal it contributes to, with what it depends on. Choose one for its details and to compare its versions.</p>
      <GoalDependencies ws={ws} goalId={goal} />
    </Shell>
  );
}
