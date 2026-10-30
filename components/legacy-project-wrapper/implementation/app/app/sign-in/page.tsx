import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, safeNext, signInOptions } from "../_ui/server";
import SignIn from "./view";

export default function Page({ searchParams }: PageProps<"/app/sign-in">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/app/sign-in">["searchParams"] }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next);
  return <SignIn next={next} options={signInOptions()} />;
}
