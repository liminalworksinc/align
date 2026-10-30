import { Suspense } from "react";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { turnstile } from "@/lib/v2/config";
import { param } from "../_ui/server";
import RequestAccess from "./view";

// /app/request-access: public (no sign-in), so people without an account can ask for a creation code.
// ?interest=evaluate preselects "Evaluate Align on a real workflow"; ?via=value_card (the decision value card's
// follow-up link) is sent with the request and kept on its product event. Any other value is ignored.
export default function Page({ searchParams }: PageProps<"/app/request-access">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/app/request-access">["searchParams"] }) {
  await connection(); // the settings are read per request, never baked into a prerendered shell
  const q = await searchParams;
  return (
    <RequestAccess
      captchaSiteKey={turnstile()?.siteKey ?? null}
      local={!config().hosted}
      interest={param(q.interest) === "evaluate" ? "evaluate" : "try"}
      via={param(q.via) === "value_card" ? "value_card" : "form"}
    />
  );
}
