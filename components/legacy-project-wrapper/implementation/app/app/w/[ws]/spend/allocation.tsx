"use client";
import Link from "next/link";
import { api, Btn, Err, Loading, Note, Pill, num, usd, useAction, useApi } from "../../../_ui/kit";
import { Panel } from "../../../_ui/ds";
import type { AllocationResponse, AllocationRow, WsDetail } from "../../../_ui/types";
import { count, plural } from "@/lib/v2/plural.mts";

// Allocation (lib/v2/allocation.ts): where the workspace's shared agent time went against each goal's target, a
// six-week trend and the steering switch (workspace owners). Targets are versioned goal fields: a goal's owner sets one
// in a new version; anyone else proposes new targets on the Alignments page, where each goal's approvers approve them
// and someone launches them.

const rowLabel = (r: AllocationRow) => (r.kind === "goal" ? r.goal!.title : r.kind === "private" ? "Goals you can't see" : "Not bound to a goal");

/** A gap in whole points, as the pill shows it. It rounds toward zero, so the label and its colour agree with each
 *  other and with steering's "at least 10 points" rule: a 9.6-point gap reads "9 points over" in grey (C4-3). */
const gapPoints = (gap: number) => Math.floor(Math.abs(gap));

function gapText(gap: number | null) {
  if (gap === null) return "no target";
  if (Math.abs(gap) < 1) return "on target";
  const n = gapPoints(gap);
  return `${n} ${n === 1 ? "point" : "points"} ${gap > 0 ? "over" : "under"}`;
}

function Bar({ share, target }: { share: number; target: number | null }) {
  return (
    <div className="relative h-3 w-full rounded-full bg-(--bg-raised)" aria-hidden>
      <div className="h-3 rounded-full bg-(--text-3)" style={{ width: `${Math.min(100, share)}%` }} />
      {target !== null && <div className="absolute top-[-3px] h-[18px] w-[2px] bg-(--text-1)" style={{ left: `calc(${Math.min(100, target)}% - 1px)` }} title={`target ${target}%`} />}
    </div>
  );
}

export function AllocationCard({ ws, detail }: { ws: string; detail: WsDetail | null }) {
  const d = useApi<AllocationResponse>(`/api/v2/workspaces/${ws}/allocation?weeks=6`);
  const act = useAction();
  const steering = d.data?.steering.steering ?? detail?.workspace.steering ?? "off";
  const isOwner = detail?.role === "owner";
  const weekGoals = d.data ? [...new Map(d.data.weekly.flatMap((w) => w.rows.filter((r) => r.kind === "goal").map((r) => [r.goal!.id, r.goal!.title] as const))).entries()] : [];
  return (
    <Panel className="mb-4" title="Agent time against targets" actions={<Pill>steering {steering}</Pill>}>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          <Note>Last 7 days. {d.data.window.note} Shares are of all shared agent time in the workspace. There is no per-person view.</Note>
          {d.data.window.total_fresh_tokens === 0 && <p className="text-[15px] text-(--text-3)">No shared agent time in the last 7 days yet.</p>}
          <ul className="divide-y divide-(--line)" aria-label="Allocation by goal">
            {d.data.window.rows.map((r) => (
              <li key={r.kind + (r.goal?.id ?? "")} className="py-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[15px]">
                  <span className="min-w-0 break-words text-(--text-1)">{rowLabel(r)}</span>
                  <span className="ml-auto text-(--text-2)">
                    {r.share}% of agent time{r.target_share !== null ? ` · target ${r.target_share}%` : ""}
                  </span>
                  {r.kind === "goal" && <Pill tone={r.gap !== null && gapPoints(r.gap) >= 10 ? "amber" : "neutral"}>{gapText(r.gap)}</Pill>}
                </div>
                <Bar share={r.share} target={r.target_share} />
                <p className="mt-1 text-[13px] text-(--text-3)">
                  {num(r.fresh_tokens)} fresh tokens · {usd(r.est_list_usd_micros)} at list price{r.unpriced_requests ? ` · ${count(r.unpriced_requests, "unpriced request", undefined, num)}` : ""} · {count(r.sessions, "session")}
                </p>
              </li>
            ))}
          </ul>
          {d.data.window.unpriced_requests > 0 && (
            <p className="mt-2 text-[14px] text-(--st-retry)">{count(d.data.window.unpriced_requests, "request", undefined, num)} used a model with no list price. {plural(d.data.window.unpriced_requests, "It counts", "They count")} in agent time (tokens) but not in the list price.</p>
          )}
          {weekGoals.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-1 text-[14px] text-(--text-2)">Share of agent time by week (weeks start Monday, UTC)</p>
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-(--line-strong) text-left font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3)">
                    <th className="py-1 pr-3 font-normal">Goal</th>
                    {d.data.weekly.map((w) => (
                      <th key={w.week_start} className="py-1 pr-3 text-right font-normal">
                        {new Date(w.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekGoals.map(([id, title]) => (
                    <tr key={id} className="border-t border-(--line)">
                      <td className="py-1 pr-3">{title}</td>
                      {d.data!.weekly.map((w) => {
                        const r = w.rows.find((x) => x.goal?.id === id);
                        return (
                          <td key={w.week_start} className="py-1 pr-3 text-right">
                            {w.total_fresh_tokens ? `${r?.share ?? 0}%` : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] text-(--text-2)">
            <span>
              Steering is {steering}. When it is on, a shared session that starts on a goal at least 10 points over its target, while another goal is at least 10 points under, gets one line naming
              both shares. Goals on hold are left out. {d.data.steering.total} {d.data.steering.total === 1 ? "line was" : "lines were"} shown in the last 7 days.
            </span>
            <Link href={`/app/w/${ws}/alignments#target-changes`} className="inline-flex min-h-[36px] items-center font-medium text-(--accent-text) underline-offset-2 hover:underline max-sm:min-h-[44px]">
              Propose new targets
            </Link>
            {isOwner && (
              <Btn kind="secondary" disabled={act.busy} onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}`, { method: "PATCH", body: { steering: steering === "on" ? "off" : "on" } }), d.reload)}>
                Turn steering {steering === "on" ? "off" : "on"}
              </Btn>
            )}
          </div>
          <Err>{act.error}</Err>
        </>
      )}
    </Panel>
  );
}
