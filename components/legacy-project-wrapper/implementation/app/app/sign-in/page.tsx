import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser, param, safeNext, signInOptions } from "../_ui/server";
import SignIn from "./view";

export default function Page({ searchParams }: PageProps<"/app/sign-in">) {
  return (
    <Suspense fallback={<main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

// ?next= (an /app path or /oauth/authorize URL), ?email= and ?code= (from a code message: they only fill the form),
// ?reauth=1 (show the form even to someone signed in, so they can sign in again).
async function Inner({ searchParams }: { searchParams: PageProps<"/app/sign-in">["searchParams"] }) {
  const q = await searchParams;
  const next = safeNext(q.next);
  if (param(q.reauth) !== "1" && (await currentUser())) redirect(next);
  const code = param(q.code);
  return <SignIn next={next} options={signInOptions()} email={param(q.email).slice(0, 320)} code={/^\d{6}$/.test(code) ? code : ""} />;
}
