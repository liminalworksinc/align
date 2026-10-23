import { Suspense } from "react";
import { requireUser } from "../../_ui/server";
import InviteAccept from "./view";

export default function Page({ params }: PageProps<"/app/invite/[token]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/app/invite/[token]">["params"] }) {
  const { token } = await params;
  const me = await requireUser(`/app/invite/${token}`);
  return <InviteAccept me={me} token={token} />;
}
