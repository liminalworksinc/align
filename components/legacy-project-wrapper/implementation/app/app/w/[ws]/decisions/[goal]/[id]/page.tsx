import { Suspense } from "react";
import { inWorkspace, requireUser } from "../../../../../_ui/server";
import { NotInWorkspace } from "../../../../../_ui/missing";
import DecisionPage from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]/decisions/[goal]/[id]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/decisions/[goal]/[id]">["params"] }) {
  const { ws, goal, id } = await params;
  const me = await requireUser(`/app/w/${ws}/decisions/${goal}/${id}`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <DecisionPage me={me} ws={ws} goal={goal} id={id} />;
}
