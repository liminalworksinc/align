"use client";
import { Btn } from "./kit";
import { ERROR_PAGE, ERROR_RETRY } from "./words";

/** What app/error.tsx and app/global-error.tsx show: plain words and a retry. Never the error's message or stack; only
 *  the digest Next.js gives a server error, so a report can be matched to the server log. */
export function ErrorNotice({ digest, reset }: { digest?: string; reset: () => void }) {
  return (
    <main role="alert" className="grid min-h-screen place-items-center bg-(--bg-page) p-6 text-(--text-1) max-sm:p-3">
      <div className="flex w-full max-w-[460px] flex-col items-start gap-4 rounded-(--radius-l) border border-(--line) bg-(--bg-panel) p-8 max-sm:p-5">
        <p className="font-display text-[26px] leading-none">Align</p>
        <p className="text-[18px] font-semibold">{ERROR_PAGE}</p>
        <Btn onClick={reset}>{ERROR_RETRY}</Btn>
        {digest && <p className="font-mono text-[12.5px] text-(--text-2) [overflow-wrap:anywhere]">Reference: {digest}</p>}
      </div>
    </main>
  );
}
