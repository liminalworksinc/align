import { Suspense } from "react";
import { requireUser } from "../../../_ui/server";
import Requests from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]/requests">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/requests">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}/requests`);
  return <Requests me={me} ws={ws} />;
}
