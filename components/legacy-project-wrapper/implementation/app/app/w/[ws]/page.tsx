import { Suspense } from "react";
import { creationOptions, inWorkspace, requireUser } from "../../_ui/server";
import { NotInWorkspace } from "../../_ui/missing";
import Home from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-(--text-3)">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Home me={me} ws={ws} creation={await creationOptions(me)} />;
}
