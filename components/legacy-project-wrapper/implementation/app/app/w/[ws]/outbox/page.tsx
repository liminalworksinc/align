import { notFound } from "next/navigation";
import { Suspense } from "react";
import { standInOutbox, transferPreviewEnabled } from "@/lib/v2/transfer-preview";
import { inWorkspace, requireUser } from "../../../_ui/server";
import { NotInWorkspace } from "../../../_ui/missing";
import { Loading } from "../sessions/parts";
import Outbox from "./view";

// LIM-2529 experience preview: the author's outbox (spec #117). Off unless ALIGN_PREVIEW_TRANSFER_UI=1; stand-in data only.
export default function Page({ params }: PageProps<"/app/w/[ws]/outbox">) {
  return <Suspense fallback={<Loading />}><Inner params={params} /></Suspense>;
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/outbox">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}/outbox`);
  // Checked per request, after the sign-in read makes this dynamic: checked outside it, the build bakes in its value.
  if (!transferPreviewEnabled()) notFound();
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Outbox me={me} ws={ws} items={standInOutbox()} />;
}
