import { Suspense } from "react";
import { isRecentSignIn } from "@/lib/v2/http";
import { requireUser } from "../../_ui/server";
import InviteAccept from "./view";

export default function Page({ params }: PageProps<"/app/invite/[token]">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-(--text-3)">Loading Align…</main>}>
      <Inner params={params} />
    </Suspense>
  );
}

// Giving a paired device the workspace needs a sign-in from the last 15 minutes; joining alone does not.
async function Inner({ params }: { params: PageProps<"/app/invite/[token]">["params"] }) {
  const { token } = await params;
  const me = await requireUser(`/app/invite/${token}`);
  return <InviteAccept me={me} token={token} recent={isRecentSignIn(me.signedInAt)} />;
}
