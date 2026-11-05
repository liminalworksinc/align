"use client";
import Link from "next/link";
import { EvidenceLabel, StatusPill } from "../ds";
import { useApi } from "../kit";
import type { ChangeRequest, Goal } from "../types";
import { crStatus } from "./cr-status";

// Home, third section (LIM-2472 ruling 9b5b870f): Goals, one line per goal. Each line holds the plan state (the goal's
// latest approved change: launched, or approved and not launched), the receipt line where Align has one for that launch,
// the agent time on the goal over 7 days as the agents reported it, and one link to the goal's work. Sessions live on
// Work. A line is about 44px tall on a desktop, so twelve goals fit one screen; on a phone a line wraps to two rows.
// When nothing needs the person this is the Home's body, and it stays this compact.
//
// Reads: the goals feed (GET …/goals, for allocation) and, per launched change shown, GET …/value (that launch's
// delivery counts). The goals and change requests come from the Home's own reads.

export interface GoalLine {
  id: string;
  title: string;
  version: number;
  level: "company" | "team";
  team: { id: string; name: string } | null;
  owner: { id: string; name: string };
}
interface Delivery {
  delivery: { sessions: number; received: number; applied: number } | null;
}

/** What Align delivered for the goal's launched version: the launch's own counts. */
function Delivered({ ws, cr }: { ws: string; cr: ChangeRequest }) {
  const v = useApi<Delivery>(`/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/value`);
  if (!v.data) return v.error ? <EvidenceLabel kind="unobserved" size="s" detail="delivery unknown" /> : null;
  const d = v.data.delivery;
  if (!d || d.sessions === 0) return <EvidenceLabel kind="unobserved" size="s" detail={`v${cr.version} reached no bound session`} />;
  if (d.received === 0) return <EvidenceLabel kind="unobserved" size="s" detail={`sent v${cr.version} to ${d.sessions}, no receipt`} />;
  return <EvidenceLabel kind="receipt" size="s" detail={`sent v${cr.version}, ${d.received} of ${d.sessions} received`} />;
}

/** The goal's latest approved change: what its plan pill says. */
export function latestApproved(changes: ChangeRequest[] | null, goal: string): ChangeRequest | null {
  const on = (changes ?? []).filter((x) => x.goal.id === goal && x.state === "approved").sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  return on[0] ?? null;
}

function Line({ ws, me, g, latest, alloc, onReview }: { ws: string; me: string; g: GoalLine; latest: ChangeRequest | null; alloc: Goal["allocation"] | undefined; onReview?: (goal: string, id: string) => void }) {
  const st = latest ? crStatus(latest) : null;
  const pill = st && latest && <StatusPill kind={st.kind} size="s" label={st.kind === "launched" ? `Launched v${latest.version}` : st.kind === "approved" ? "Approved, not launched" : st.label} />;
  return (
    <li className="grid min-h-[44px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-1.5 max-md:grid-cols-1 max-md:py-2.5" data-goal-line={g.id}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[14px] font-medium text-(--text-1)" title={g.title}>
          {g.title}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-(--text-3)">
          v{g.version} · {g.level === "company" ? "Company" : (g.team?.name ?? "Team")}
          {g.owner.id === me ? " · yours" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        {pill &&
          (onReview && latest ? (
            <button
              type="button"
              onClick={() => onReview(latest.goal.id, latest.id)}
              className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:min-h-[44px]"
              aria-label={`Review the latest change on ${g.title}`}
            >
              {pill}
            </button>
          ) : (
            pill
          ))}
        {!latest && <span className="text-[12px] text-(--text-3)">No approved change yet</span>}
        {latest?.launch === "launched" && <Delivered ws={ws} cr={latest} />}
        {alloc?.held && <StatusPill kind="held" size="s" label="Held" />}
        {/* Agent time over 7 days, from the usage agents report: their own word, never a measure of progress. */}
        {alloc && <EvidenceLabel kind="reported" size="s" detail={`${alloc.share_7d > 0 ? `${alloc.share_7d}% of agent time, 7d` : "no agent time, 7d"}${alloc.target_share !== null ? `, target ${alloc.target_share}%` : ""}`} />}
        <Link href={`/app/w/${ws}/work?goal=${g.id}`} className="inline-flex min-h-[32px] items-center px-1 text-[13px] font-medium text-(--accent-text) hover:underline max-sm:min-h-[44px]" aria-label={`Work on ${g.title}`} data-goal-work>
          Work
        </Link>
      </div>
    </li>
  );
}

export default function GoalLines({
  ws,
  me,
  goals,
  changes,
  onReview,
}: {
  ws: string;
  me: string;
  /** The Home's goals (GET …/home → goals), or null when that read failed. */
  goals: GoalLine[] | null;
  /** Every change request the person can read, or null when that read failed (the lines then show no plan pill). */
  changes: ChangeRequest[] | null;
  /** Opens a change request in the review drawer; without it the plan pill is not a button. */
  onReview?: (goal: string, id: string) => void;
}) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  return (
    <section aria-labelledby="goal-lines-title" className="flex min-w-0 flex-col gap-3" data-goal-lines={goals?.length ?? "unknown"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="goal-lines-title" className="text-[16px] font-semibold text-(--text-1)">
          Goals
        </h2>
        <Link href={`/app/w/${ws}/goals`} className="text-[13px] text-(--accent-text) hover:underline">
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
              <Line key={g.id} ws={ws} me={me} g={g} latest={latestApproved(changes, g.id)} alloc={feed.data?.goals.find((x) => x.id === g.id)?.allocation} onReview={onReview} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
