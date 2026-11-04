import { Suspense } from "react";
import { inWorkspace, requireUser } from "../../../_ui/server";
import { NotInWorkspace } from "../../../_ui/missing";
import Apps from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]/apps">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/apps">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}/apps`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Apps me={me} ws={ws} />;
}
