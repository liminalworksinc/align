import { Suspense } from "react";
import { requireUser } from "../_ui/server";
import Devices from "./view";

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner />
    </Suspense>
  );
}

async function Inner() {
  const me = await requireUser("/app/devices");
  return <Devices me={me} />;
}
