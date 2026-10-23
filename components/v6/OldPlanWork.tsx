"use client";
import { useState } from "react";
import { conflictMeasureId, labelsFor, poss, type Labels } from "@/lib/labels";
import type { StateView, WorkItem } from "@/lib/types";
import { currentGoal, priorVersion } from "../select";
import { workFor } from "../TeamLens";
import { Button } from "../ui";
import { CARD, Chip, H1, Lbl, NotBuilt, Pill, Row, copyText } from "./kit";

// v6 "Work": the strategy cascade (company goal → team goals → work items) and, once a decision is approved, the work
// still running under the replaced measure. Everything comes from state. There is no keep / re-scope / stop control:
// work items have no decision field yet, so the card says so instead.

const initials = (name: string) =>
  name
    .split(/[\s/·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Company goal → each team's goal → its work items, in priority order. */
export function GoalCascade({ s, L }: { s: StateView; L: Labels }) {
  const ceo = currentGoal(s, "ceo");
  return (
    <section aria-label="How the work connects to the goals" className="flex flex-col gap-3">
      <Lbl>Company goal → team goals → work</Lbl>
      <div className={`${CARD} px-[18px] py-3.5`}>
        <Lbl>
          {L.team.ceo} · {ceo?.version ?? "—"}
        </Lbl>
        <div className="mt-1 text-[16px] font-semibold text-zinc-900">{ceo?.objective ?? `No current goal has been shared for ${L.team.ceo}.`}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(["product", "security"] as const).map((o) => {
          const g = currentGoal(s, o);
          const work = workFor(s, g);
          return (
            <div key={o} className={`${CARD} flex flex-col gap-1 px-[18px] py-3.5`}>
              <div className="flex flex-wrap items-center gap-2">
                <Lbl>{L.team[o]}</Lbl>
                {g && <Chip>{g.version}</Chip>}
              </div>
              <div className="text-[15px] font-semibold text-zinc-900">{g?.objective ?? `No current goal has been shared for ${L.team[o]}.`}</div>
              <div className="mt-1 border-t border-zinc-200">
                {work.length ? (
                  work.map((w, i) => (
                    <Row key={w.id} n={`#${i + 1}`} status={w.observed_status}>
                      {w.task}
                    </Row>
                  ))
                ) : (
                  <p className="py-2 text-[14px] text-zinc-500">No work linked to this goal yet.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Work items tied to the goal that changed, and whether the approval itself re-planned each one. */
function oldPlanItems(s: StateView): { acc: NonNullable<StateView["acceptances"][number]>; items: { w: WorkItem; replanned: boolean }[] } | null {
  const acc = s.acceptances.at(-1);
  if (!acc) return null;
  const ids = acc.owning_work_item_ids;
  const list = ids ? s.work_items.filter((w) => ids.includes(w.id)) : s.work_items.filter((w) => w.goal_id === acc.new_goal_id);
  const items = [...list]
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((w) => ({ w, replanned: !!w.decision_ref || w.observed_status.includes(`goal ${acc.accepted_version}`) }));
  return { acc, items };
}

/** The work items the Work screen says are still on the old plan (its headline count). The record's link uses it too. */
export function stillOnOldPlan(s: StateView): WorkItem[] {
  return oldPlanItems(s)?.items.filter((i) => !i.replanned).map((i) => i.w) ?? [];
}

export function OldPlanWork({ s }: { s: StateView }) {
  const L = labelsFor(s);
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const found = oldPlanItems(s);
  const sec = currentGoal(s, "security");
  const old = (sec && priorVersion(s, sec)) ?? sec;
  const oldMeasure = old?.measures.find((m) => m.id === conflictMeasureId(s))?.text ?? "the earlier measure";
  const stale = found?.items.filter((i) => !i.replanned) ?? [];
  const nudge = found
    ? `${stale.length} running item${stale.length === 1 ? "" : "s"} still serve${stale.length === 1 ? "s" : ""} the replaced measure “${oldMeasure}”: ${stale.map((i) => i.w.task).join("; ")}. ${poss(L.team.security)} goal is now ${found.acc.accepted_version}. Keep, re-scope or stop each one?`
    : "";

  return (
    <section aria-label="Work still on the old plan" className="flex max-w-[880px] flex-col gap-[18px]">
      <H1
        sub={
          found
            ? `${stale.length} running item${stale.length === 1 ? "" : "s"} still serve${stale.length === 1 ? "s" : ""} the replaced measure “${oldMeasure}”.`
            : "No approved decision yet, so nothing to move."
        }
      >
        Work still on the old plan
      </H1>
      {found?.items.map(({ w, replanned }) => (
        <div key={w.id} className="flex items-center gap-3.5 rounded-[14px] border border-zinc-200 bg-white px-[18px] py-4">
          <span aria-hidden className="grid size-[34px] flex-none place-items-center rounded-full border border-zinc-300 bg-zinc-100 text-[12px] font-bold text-zinc-700">
            {initials(L.team[w.owner] ?? w.owner)}
          </span>
          <div className="min-w-0 flex-1">
            <b className="text-zinc-900">{w.task}</b>
            <div className="text-[13.5px] text-zinc-500">
              {L.team[w.owner] ?? w.owner} · {w.observed_status}
            </div>
          </div>
          {replanned ? <Pill tone="violet" small>re-planned in this decision</Pill> : <Pill tone="amber">still on the old measure</Pill>}
        </div>
      ))}
      {found && found.items.length === 0 && <p className="text-[15px] text-zinc-500">No work items are linked to the goal that changed.</p>}
      <NotBuilt title="Keep, re-scope or stop, per item">Coming next: decide for each item whether to keep it, re-scope it or stop it.</NotBuilt>
      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
        <span className="min-w-0 flex-1 text-[13.5px] text-zinc-500">
          Nobody is notified automatically.
          {copied === "ok" && " Nudge copied."}
        </span>
        <Button
          kind="secondary"
          disabled={!found || stale.length === 0}
          onClick={async () => setCopied((await copyText(nudge)) ? "ok" : "failed")}
        >
          Copy a nudge for the owner
        </Button>
      </div>
      {copied === "failed" && (
        <label className="flex flex-col gap-1 text-[13.5px] text-zinc-500">
          The browser didn&apos;t allow copying. Select the text below instead.
          <textarea readOnly rows={3} value={nudge} className="w-full resize-none rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[15px] text-zinc-900" />
        </label>
      )}
    </section>
  );
}
