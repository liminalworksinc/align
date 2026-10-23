"use client";
import { ERROR_PAGE, ERROR_RETRY, errorRef } from "@/lib/labels";
import { Button } from "./ui";

/** What app/error.tsx and app/global-error.tsx show: plain words and a retry. Never the error's message or stack; only
 *  the digest Next.js gives a server error, so a report can be matched to the server log. */
export function ErrorNotice({ digest, reset }: { digest?: string; reset: () => void }) {
  return (
    <main role="alert" className="flex min-h-full flex-col items-start gap-4 p-10">
      <p className="text-[18px] font-semibold text-zinc-900">{ERROR_PAGE}</p>
      <Button onClick={reset}>{ERROR_RETRY}</Button>
      {digest && <p className="font-mono text-[12.5px] text-zinc-500">{errorRef(digest)}</p>}
    </main>
  );
}
