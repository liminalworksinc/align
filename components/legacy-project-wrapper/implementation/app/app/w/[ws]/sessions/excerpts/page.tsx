import { Suspense } from "react";
import { inWorkspace, requireUser } from "../../../../_ui/server";
import { NotInWorkspace } from "../../../../_ui/missing";
import { Loading } from "../parts";
import Excerpts from "./view";

export default function Page({ params }: PageProps<"/app/w/[ws]/sessions/excerpts">) {
  return <Suspense fallback={<Loading />}><Inner params={params} /></Suspense>;
}

async function Inner({ params }: { params: PageProps<"/app/w/[ws]/sessions/excerpts">["params"] }) {
  const { ws } = await params;
  const me = await requireUser(`/app/w/${ws}/sessions/excerpts`);
  if (!(await inWorkspace(me, ws))) return <NotInWorkspace me={me} />;
  return <Excerpts me={me} ws={ws} />;
}
