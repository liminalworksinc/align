import { Suspense } from "react";
import { isRecentSignIn } from "@/lib/v2/http";
import { param, requireUser } from "../_ui/server";
import DeviceApprove from "./view";

export default function Page({ searchParams }: PageProps<"/app/device">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

// ?code= fills the code (it comes back here after signing in again). Approving needs a sign-in from the last 15
// minutes; an older one gets the sign-in-again prompt instead of the form.
async function Inner({ searchParams }: { searchParams: PageProps<"/app/device">["searchParams"] }) {
  const raw = param((await searchParams).code).toUpperCase();
  const code = /^[A-Z0-9 -]{1,12}$/.test(raw) ? raw : "";
  const me = await requireUser(code ? `/app/device?code=${encodeURIComponent(code)}` : "/app/device");
  return <DeviceApprove me={me} code={code} recent={isRecentSignIn(me.signedInAt)} />;
}
