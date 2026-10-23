import { Suspense } from "react";
import { requireUser } from "../../_ui/server";
import Goals from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}`);
  return <Goals me={me} ws={ws} />;
}
