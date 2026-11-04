import { Suspense } from "react";
import { param, requireUser, signInOptions } from "../_ui/server";
import Account from "./view";

export default function Page({ searchParams }: PageProps<"/app/account">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

// ?error= is Better Auth's code when linking a provider failed (its errorCallbackURL brings the person back here).
async function Inner({ searchParams }: { searchParams: PageProps<"/app/account">["searchParams"] }) {
  const me = await requireUser("/app/account");
  const error = param((await searchParams).error).slice(0, 100);
  return <Account me={me} options={signInOptions()} linkError={/^[A-Za-z0-9_ -]+$/.test(error) ? error : ""} />;
}
