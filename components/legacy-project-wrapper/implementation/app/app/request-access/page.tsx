import { Suspense } from "react";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { turnstile } from "@/lib/v2/config";
import RequestAccess from "./view";

// /app/request-access: public (no sign-in), so people without an account can ask for a creation code.
export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner />
    </Suspense>
  );
}

async function Inner() {
  await connection(); // the settings are read per request, never baked into a prerendered shell
  return <RequestAccess captchaSiteKey={turnstile()?.siteKey ?? null} local={!config().hosted} />;
}
