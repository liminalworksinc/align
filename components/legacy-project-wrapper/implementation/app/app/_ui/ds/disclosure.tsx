import type { ReactNode } from "react";

/** Closed by default, opened by the person. A native <details>, so it works from the keyboard and needs no state; the
 *  chevron and underline say it is a control. Use it for what most people don't need yet ("See who decides"). */
export function Disclosure({ summary, children, className = "" }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={`group/disclosure min-w-0 ${className}`}>
      <summary className="inline-flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 rounded-(--radius-s) text-[13px] font-medium text-(--text-2) underline underline-offset-4 hover:text-(--text-1) max-sm:min-h-[44px] [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 group-open/disclosure:rotate-90">
          <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
        </svg>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
