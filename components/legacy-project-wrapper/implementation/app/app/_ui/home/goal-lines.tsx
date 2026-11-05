"use client";
import Link from "next/link";
import { EvidenceSummary, StatusPill } from "../ds";
import { useApi } from "../kit";
import type { ChangeRequest, Goal } from "../types";
import { crStatus } from "./cr-status";
import { useValue } from "./value-cache";

// Home, third section (LIM-2472 ruling 9b5b870f): Goals, one line per goal: title, version and team, and one link to the
// goal's work. Chips appear only where there is something to say: an approved change not launched yet, Held, the newest
// launch's delivery, agent time above zero. Sessions live on Work. A line is about 44px tall on a desktop, so twelve
// goals fit one screen; on a phone a quiet line is two rows at most.
// When nothing needs the person this is the Home's body, and it stays this compact.
//
// The evidence is the shared EvidenceSummary (goalFacts), so this line, Home's rows and the review say the same thing:
// the newest launch's delivery from that change's own …/value read, then agent time as reported. Nothing here comes
// from an app's last_read_at. Reads: the goals feed (GET …/goals); EvidenceSummary reads each goal's newest launch.
// The goals and change requests for the plan pill come from the Home's own reads.

export interface GoalLine {
  id: string;
  title: string;
  version: number;
  level: "company" | "team";
  team: { id: string; name: string } | null;
  owner: { id: string; name: string };
}
/** The goal's latest approved change: what its plan pill says. */
/** The goal's newest launched change in the Home's own change-request read, or null when it has none. */
export function newestLaunch(changes: ChangeRequest[], goal: string): ChangeRequest | null {
  return changes.filter((x) => x.goal.id === goal && x.launch === "launched" && x.version !== null).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
}

export function latestApproved(changes: ChangeRequest[] | null, goal: string): ChangeRequest | null {
  const on = (changes ?? []).filter((x) => x.goal.id === goal && x.state === "approved").sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  return on[0] ?? null;
}

function Line({ ws, g, latest, launch, fed, onReview }: { ws: string; g: GoalLine; latest: ChangeRequest | null; launch: ChangeRequest | null | undefined; fed: Goal | undefined; onReview?: (goal: string, id: string) => void }) {
  // The newest launch comes from the Home's change-request read and its delivery from the shared value cache, so the
  // summary makes no read of its own. `launch` undefined (that read failed) lets the summary read for itself.
  const v = useValue(ws, g.id, launch ? launch.id : null);
  const launched = launch === undefined ? undefined : launch ? { version: launch.version!, value: v.value } : null;
  // A line earns a chip only when it has something to say: an approved change still waiting on launch, Held, the newest
  // launch's delivery, or agent time above zero. Zero agent time and "no approved change" show nothing.
  const waiting = latest && latest.state === "approved" && latest.launch !== "launched" ? latest : null;
  const st = waiting ? crStatus(waiting) : null;
  const pill = st && <StatusPill kind={st.kind} size="s" label={st.label} />;
  const a = fed?.allocation;
  return (
    // Desktop: title | chips | Work on one row. Phone: title and Work on the first row, chips (if any) on a second, so
    // a quiet line is one row and never three. The chips cell is empty, and hidden, when nothing earns a chip.
    <li className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5 md:grid-cols-[minmax(0,1fr)_auto_auto] max-md:py-2" data-goal-line={g.id}>
      {/* The title wins: it wraps to two lines before it is cut, and the metadata goes first (team, then version). */}
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="line-clamp-2 min-w-0 text-[14px] font-medium text-(--text-1)" title={g.title}>
          {g.title}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-(--text-3) max-[359px]:hidden">
          v{g.version}
          <span className="max-sm:hidden"> · {g.level === "company" ? "Company" : (g.team?.name ?? "Team")}</span>
        </span>
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5 empty:hidden max-md:order-3 max-md:col-span-2 md:justify-end">
        {pill &&
          (onReview && waiting ? (
            // The phone base rule gives every button 44px of height, which opened a gap under the title row; the pill
            // keeps its own height and a 44px tap area from the pseudo-element instead.
            <button
              type="button"
              onClick={() => onReview(waiting.goal.id, waiting.id)}
              className="relative rounded-full max-sm:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:before:absolute max-sm:before:-inset-y-3 max-sm:before:inset-x-0 max-sm:before:content-['']"
              aria-label={`Review the approved change on ${g.title}`}
            >
              {pill}
            </button>
          ) : (
            pill
          ))}
        {a?.held && <StatusPill kind="held" size="s" label="Held" />}
        {/* The shared summary: the newest launch's delivery from its own …/value read, then agent time as reported. */}
        {fed && <EvidenceSummary ws={ws} goal={fed} variant="inline" max={2} launched={launched} />}
      </div>
      <Link href={`/app/w/${ws}/work?goal=${g.id}`} className="inline-flex min-h-[32px] items-center px-1 text-[13px] text-(--text-2) hover:text-(--text-1) hover:underline max-sm:min-h-[44px]" aria-label={`Work on ${g.title}`} data-goal-work>
        Work
      </Link>
    </li>
  );
}

export default function GoalLines({
  ws,
  goals,
  changes,
  onReview,
  feed,
}: {
  ws: string;
  /** Unused since lines stopped saying "yours" (an owner's every line said it); kept so callers need no change. */
  me?: string;
  /** The Home's goals (GET …/home → goals), or null when that read failed. */
  goals: GoalLine[] | null;
  /** Every change request the person can read, or null when that read failed (the lines then show no plan pill). */
  changes: ChangeRequest[] | null;
  /** Opens a change request in the review drawer; without it the plan pill is not a button. */
  onReview?: (goal: string, id: string) => void;
  /** The goals feed (GET …/goals, for allocation) when the Home already read it; without it the lines read it once. */
  feed?: Goal[] | null;
}) {
  const own = useApi<{ goals: Goal[] }>(feed === undefined ? `/api/v2/workspaces/${ws}/goals` : null);
  const fedGoals = feed === undefined ? own.data?.goals : feed;
  return (
    <section aria-labelledby="goal-lines-title" className="flex min-w-0 flex-col gap-3" data-goal-lines={goals?.length ?? "unknown"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="goal-lines-title" className="text-[16px] font-semibold text-(--text-1)">
          Goals
        </h2>
        <Link href={`/app/w/${ws}/goals`} className="text-[13px] text-(--text-2) hover:text-(--text-1) hover:underline">
          All goals
        </Link>
      </div>
      {!goals ? (
        <p className="text-[14px] text-(--text-2)">Align couldn&apos;t read the goals just now.</p>
      ) : goals.length === 0 ? (
        <p className="rounded-(--radius-m) border border-dashed border-(--line-strong) px-4 py-3 text-[14px] text-(--text-2)">
          No active goals you can see.{" "}
          <Link href={`/app/w/${ws}/goals`} className="font-medium text-(--accent-text) hover:underline">
            Create a goal
          </Link>
        </p>
      ) : (
        <>
          {changes === null && <p className="text-[13px] text-(--text-2)">Align couldn&apos;t read change requests just now, so the plan state of each goal is unknown.</p>}
          <ul className="divide-y divide-(--line) overflow-hidden rounded-(--radius-m) border border-(--line) bg-(--bg-panel)">
            {goals.map((g) => (
              <Line key={g.id} ws={ws} g={g} latest={latestApproved(changes, g.id)} launch={changes ? newestLaunch(changes, g.id) : undefined} fed={fedGoals?.find((x) => x.id === g.id)} onReview={onReview} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
