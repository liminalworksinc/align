import { Suspense } from "react";
import { inWorkspace, requireUser } from "../../../_ui/server";
import { NotInWorkspace } from "../../../_ui/missing";
import Requests from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]/requests">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-(--text-3)">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/requests">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}/requests`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Requests me={me} ws={ws} />;
}
