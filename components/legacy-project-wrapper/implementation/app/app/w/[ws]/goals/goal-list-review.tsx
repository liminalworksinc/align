"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { GoalListReview } from "@/lib/v2/goal-list-review";
import { api, Btn, Card, Err, Loading, scrollToLinkedSection, useAction, useApi, when } from "../../../_ui/kit";

function ReviewLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center font-medium text-(--accent-text) underline underline-offset-2">
      {children}
    </Link>
  );
}

const monthLabel = (from: string) =>
  new Date(from).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
function calendarDate(at: string) {
  const date = new Date(at);
  return date.toLocaleDateString(undefined, {
    month: "short", day: "numeric", timeZone: "UTC",
    ...(date.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: "numeric" } : {}),
  });
}

const readingSource = {
  self: "self-reported",
  ci: "reported with a CI credential",
  command: "reported from a machine",
};

export function GoalListReviewCard({ ws, openOnArrival }: { ws: string; openOnArrival: boolean }) {
  const [open, setOpen] = useState(openOnArrival);
  const path = `/api/v2/workspaces/${ws}/goal-list-review`;
  const read = useApi<GoalListReview>(open ? path : null);
  const action = useAction();
  const data = read.error ? null : read.data;
  const root = `/app/w/${ws}`;
  function record(choice: "reviewed" | "defer" | "snooze", goal?: string) {
    if (!data || action.busy) return;
    void action.run(() => api(path, { body: { action: choice, period_end: data.period_end, goal_id: goal } }), read.reload);
  }

  return (
    <section id="goal-list-review" ref={scrollToLinkedSection} aria-labelledby="goal-list-review-title" className="min-w-0">
      <Card>
        <h2 id="goal-list-review-title">
          <button type="button" aria-expanded={open} aria-controls="goal-list-review-content" onClick={() => setOpen(!open)}
            className="min-h-[44px] text-left text-[18px] font-semibold text-(--accent-text) underline underline-offset-2">
            Review the goal list
          </button>
        </h2>
        <div id="goal-list-review-content" hidden={!open} className="min-w-0 space-y-3 text-[15px] text-(--text-2) [overflow-wrap:anywhere]">
          {open && read.loading && !data && <Loading />}
          {open && read.error && <Err>The goal-list review is unknown. Try reloading the page.</Err>}
          {open && data && (
            <>
              <p>Agent usage in {monthLabel(data.from)} (UTC). Shares count input, output and cache writes.</p>
              <div>
                <p className="font-medium text-(--text-1)">Does shared work need a goal?</p>
                <p>{data.unbound_share === null ? "Share without a goal is unknown." :
                  `${data.unbound_share === 0 ? "Less than 0.1" : `About ${data.unbound_share}`}% of recorded usage had no goal. This compares work without a goal with work on goals visible to the whole workspace.`}</p>
                {data.unbound_share !== null && <ReviewLink href={`${root}/goals#new-goal`}>Add a goal</ReviewLink>}
              </div>

              {data.questions.length === 0 ? <p>No questions from the records available for this review.</p> : (
                <ul className="divide-y divide-(--line)">
                  {data.questions.map((item) => {
                    const goal = `${root}/goals/${item.goal.id}`;
                    return (
                      <li key={item.goal.id} className="space-y-2 py-3" data-goal-review-question={item.goal.id}>
                        <h3 className="font-semibold text-(--text-1)">{item.goal.title}</h3>
                        {item.inactivity && (
                          <div>
                            <p>Does this goal still need work? {item.inactivity.last_at ?
                              <>No agent usage recorded since {calendarDate(item.inactivity.last_at)} (UTC).</> :
                              <>Agent activity is unknown. No usage was recorded by the end of the period.</>}</p>
                            <Btn kind="secondary" disabled={action.busy} onClick={() => record("snooze", item.goal.id)}>Snooze for a week</Btn>
                          </div>
                        )}
                        {item.measures.map((measure) => (
                          <p key={measure.id}>
                            {measure.kind === "missing" ? `Reading unknown for “${measure.text}”. Is there a reading to add?` :
                              measure.kind === "no_number" ? `Numeric reading unknown for “${measure.text}”. Would a number help track this measure?` :
                              measure.kind === "stale" ? `The reading for “${measure.text}” from ${when(measure.last_at)} is stale. Is there an update?` :
                              measure.kind === "no_recent_reading" ? `No reading for “${measure.text}” since ${when(measure.last_at)}. Is there an update?` :
                              `Recorded readings for “${measure.text}” show the same value over the last three weeks. Is the measure still useful?`}
                            {measure.kind !== "missing" && ` The latest reading was ${readingSource[measure.source]}.`}
                          </p>
                        ))}
                        {item.outcomes.map((outcome) => (
                          <div key={outcome.change_request_id}>
                            <p>{outcome.outcome === "not_met" ? `The expectation for “${outcome.measure_text}” was self-reported as not met. Should the goal change?` :
                              `The outcome for “${outcome.measure_text}” is unknown. The expectation was due ${calendarDate(outcome.due_on)} and has no answer.`}</p>
                            <ReviewLink href={`${root}/decisions/${item.goal.id}/${outcome.change_request_id}`}>Open decision record</ReviewLink>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-x-4">
                          <ReviewLink href={`${goal}#${item.can_edit ? "new-version" : "change-requests"}`}>
                            {item.can_edit ? "Save a new version" : "Propose a change"}
                          </ReviewLink>
                          {item.can_hold && <ReviewLink href={`${goal}#agents-on-goal`}>Hold agents</ReviewLink>}
                          {item.can_edit && <ReviewLink href={`${goal}#drop-goal`}>Drop this goal</ReviewLink>}
                          {item.measures.length > 0 && <ReviewLink href={`${goal}#goal-measures`}>Open measures</ReviewLink>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {data.reviewed_at ? <p role="status">You reviewed this on {when(data.reviewed_at)}.</p> : (
                  <>
                    <Btn disabled={action.busy} onClick={() => record("reviewed")}>Mark reviewed</Btn>
                    {data.deferred_until ? <p role="status">The Home link returns {when(data.deferred_until)}.</p> :
                      <Btn kind="secondary" disabled={action.busy} onClick={() => record("defer")}>Remind me in a week</Btn>}
                  </>
                )}
              </div>
              <Err>{action.error}</Err>
            </>
          )}
        </div>
      </Card>
    </section>
  );
}
