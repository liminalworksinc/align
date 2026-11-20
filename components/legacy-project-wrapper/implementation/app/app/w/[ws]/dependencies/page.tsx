import { Suspense } from "react";
import { inWorkspace, param, requireUser } from "../../../_ui/server";
import { NotInWorkspace } from "../../../_ui/missing";
import Dependencies from "./view";

export default function Page({ params, searchParams }: PageProps<"/app/w/[ws]/dependencies">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ params, searchParams }: { params: PageProps<"/app/w/[ws]/dependencies">["params"]; searchParams: PageProps<"/app/w/[ws]/dependencies">["searchParams"] }) {
  const { ws } = await params;
  const q = await searchParams;
  const me = await requireUser(`/app/w/${ws}/dependencies`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Dependencies me={me} ws={ws} goal={param(q.goal) || undefined} />;
}
