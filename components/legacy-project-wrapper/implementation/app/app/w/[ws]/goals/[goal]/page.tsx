import { Suspense } from "react";
import { inWorkspace, requireUser } from "../../../../_ui/server";
import { NotInWorkspace } from "../../../../_ui/missing";
import GoalPage from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]/goals/[goal]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/goals/[goal]">["params"] }) {
  const { ws, goal } = await params;
  const me = await requireUser(`/app/w/${ws}/goals/${goal}`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <GoalPage me={me} ws={ws} goal={goal} />;
}
