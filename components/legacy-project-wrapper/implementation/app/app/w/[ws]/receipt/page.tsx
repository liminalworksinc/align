import { notFound } from "next/navigation";
import { Suspense } from "react";
import { standInReceipt, transferPreviewEnabled } from "@/lib/v2/transfer-preview";
import { inWorkspace, requireUser } from "../../../_ui/server";
import { NotInWorkspace } from "../../../_ui/missing";
import { Loading } from "../sessions/parts";
import Receipt from "./view";

// LIM-2529 experience preview: the weekly receipt (spec #117). Off unless ALIGN_PREVIEW_TRANSFER_UI=1; stand-in data only.
export default function Page({ params }: PageProps<"/app/w/[ws]/receipt">) {
  if (!transferPreviewEnabled()) notFound();
  return <Suspense fallback={<Loading />}><Inner params={params} /></Suspense>;
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/receipt">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}/receipt`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Receipt me={me} ws={ws} rows={standInReceipt()} />;
}
