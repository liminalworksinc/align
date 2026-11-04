"use client";
import Link from "next/link";
import { api, Btn, Card, Err, Loading, Note, Pill, num, usd, useAction, useApi } from "../../../_ui/kit";
import type { AllocationResponse, AllocationRow, WsDetail } from "../../../_ui/types";

// Allocation: where the workspace's agent time went against each goal's target, a six-week trend and the steering
// switch. Targets are set on each goal; changes across goals are proposed and approved on the Alignments page.

const rowLabel = (r: AllocationRow) => (r.kind === "goal" ? r.goal!.title : r.kind === "private" ? "Goals you can't see" : "Not bound to a goal");

function gapText(gap: number | null) {
  if (gap === null) return "no target";
  if (Math.abs(gap) < 1) return "on target";
  return gap > 0 ? `${Math.round(gap)} points over` : `${Math.round(-gap)} points under`;
}

function Bar({ share, target }: { share: number; target: number | null }) {
  return (
    <div className="relative h-3 w-full rounded-full bg-zinc-100" aria-hidden>
      <div className="h-3 rounded-full bg-violet-600" style={{ width: `${Math.min(100, share)}%` }} />
      {target !== null && <div className="absolute top-[-3px] h-[18px] w-[2px] bg-zinc-900" style={{ left: `calc(${Math.min(100, target)}% - 1px)` }} title={`target ${target}%`} />}
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
    <Card title="Agent time against targets" actions={<Pill tone={steering === "on" ? "green" : "neutral"}>steering {steering}</Pill>}>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          <Note>
            Last 7 days. {d.data.window.note} Shares are of all shared agent time in the workspace. Goal owners set targets; there is no per-person view.
          </Note>
          {d.data.window.total_fresh_tokens === 0 && <p className="text-[15px] text-zinc-500">No shared agent time in the last 7 days yet.</p>}
          <ul className="divide-y divide-zinc-200" aria-label="Allocation by goal">
            {d.data.window.rows.map((r) => (
              <li key={r.kind + (r.goal?.id ?? "")} className="py-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[15px]">
                  <span className="text-zinc-900">{rowLabel(r)}</span>
                  <span className="ml-auto text-zinc-700">
                    {r.share}% of agent time{r.target_share !== null ? ` · target ${r.target_share}%` : ""}
                  </span>
                  {r.kind === "goal" && <Pill tone={r.gap !== null && Math.abs(r.gap) >= 10 ? "amber" : "neutral"}>{gapText(r.gap)}</Pill>}
                </div>
                <Bar share={r.share} target={r.target_share} />
                <p className="mt-1 text-[13px] text-zinc-500">
                  {num(r.fresh_tokens)} fresh tokens · {usd(r.est_list_usd_micros)} at list price{r.unpriced_requests ? ` · ${num(r.unpriced_requests)} unpriced requests` : ""} · {r.sessions} {r.sessions === 1 ? "session" : "sessions"}
                </p>
              </li>
            ))}
          </ul>
          {d.data.window.unpriced_requests > 0 && (
            <p className="mt-2 text-[14px] text-amber-700">
              {num(d.data.window.unpriced_requests)} requests used a model with no list price. They count in agent time (tokens) but not in the list price.
            </p>
          )}
          {weekGoals.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-1 text-[14px] text-zinc-600">Share of agent time by week (weeks start Monday, UTC)</p>
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-left text-[13px] text-zinc-500">
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
                    <tr key={id} className="border-t border-zinc-200">
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
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] text-zinc-600">
            <span>
              Steering is {steering}. When it is on, a session that starts on a goal at least 10 points over its target, while another goal is at least 10 points under, gets one line
              naming both shares. {d.data.steering.total} {d.data.steering.total === 1 ? "line was" : "lines were"} shown in the last 7 days.
            </span>
            <Link href={`/app/w/${ws}/alignments`} className="text-violet-700 hover:underline">
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
    </Card>
  );
}
