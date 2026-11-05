import Link from "next/link";

// Decision, work and record, one click each (LIM-2472 direction 9b5b870f: "From any decision: one click to the work on
// that goal, one click back, one click to its record"). The same links in the review, on Work's evidence panel and in the
// record, so the three never name or style the way between them differently. `here` leaves out the page you're on.
//   Review         /app/w/<ws>/record?cr=<id>        (the review leads that page; needs a change request)
//   Work           /app/w/<ws>/work?goal=<goal>
//   Record         /app/w/<ws>/record?cr=<id>#record (the request's timeline), else /record?goal=<goal>
// 44px tall on phones.

export const DECISION_LINK =
  "inline-flex min-h-[32px] max-sm:min-h-[44px] items-center text-[14px] text-(--accent-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

export type DecisionPlace = "review" | "work" | "record";

export function DecisionLinks({ ws, goalId, crId, here, className = "" }: { ws: string; goalId: string; crId?: string; here?: DecisionPlace; className?: string }) {
  const links: { place: DecisionPlace; href: string; label: string }[] = [
    ...(crId ? [{ place: "review" as const, href: `/app/w/${ws}/record?cr=${crId}`, label: "Review" }] : []),
    { place: "work", href: `/app/w/${ws}/work?goal=${goalId}`, label: "Work on this goal" },
    { place: "record", href: crId ? `/app/w/${ws}/record?cr=${crId}#record` : `/app/w/${ws}/record?goal=${goalId}`, label: crId ? "Its record" : "Goal record" },
  ];
  return (
    <nav aria-label="Decision, work and record" data-decision-links className={`flex flex-wrap items-center gap-x-4 ${className}`}>
      {links
        .filter((l) => l.place !== here)
        .map((l) => (
          <Link key={l.place} href={l.href} data-to={l.place} className={DECISION_LINK}>
            {l.label}
          </Link>
        ))}
    </nav>
  );
}
