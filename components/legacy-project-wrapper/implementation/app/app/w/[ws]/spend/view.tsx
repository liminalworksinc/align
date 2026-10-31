"use client";
import { useState } from "react";
import { Card, Err, Loading, Note, PHONE_TABLE, Select, Shell, num, usd, useApi } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import type { WsDetail } from "../../../_ui/types";
import { AllocationCard } from "./allocation";

type Nums = { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number };
type Sums = Nums & { by_basis: Record<string, Nums> };
interface Spend {
  note: string;
  total: Sums;
  unallocated: Sums;
  unpriced_requests: number;
  rows: (Sums & { key: string; kind: string; label: string })[];
}

const BASIS_LABEL: Record<string, string> = {
  api_usd: "API billing",
  subscription_included: "Included in a subscription",
  workspace_credits: "Workspace credits",
  estimated_list_usd: "Estimated at list price",
  unknown: "Unknown basis",
};

const cacheWrite = (s: Nums) => s.cache_write_5m + s.cache_write_1h + s.cache_write_unsplit;

function Row({ label, s, strong }: { label: string; s: Sums; strong?: boolean }) {
  const bases = Object.entries(s.by_basis).filter(([, v]) => v.requests > 0);
  return (
    <tr className={`border-t border-zinc-200 align-top ${PHONE_TABLE.row} ${strong ? "font-semibold text-zinc-900" : ""}`}>
      <td className={`py-2 pr-3 ${PHONE_TABLE.whole}`}>
        {label}
        {bases.length > 0 && (
          <div className="text-[13px] font-normal text-zinc-500">
            {bases.map(([b, v]) => `${BASIS_LABEL[b] ?? b}: ${num(v.requests)} requests`).join(", ")}
          </div>
        )}
      </td>
      <td data-label="Requests" className={`py-2 pr-3 text-right ${PHONE_TABLE.cell}`}>{num(s.requests)}</td>
      <td data-label="Input" className={`py-2 pr-3 text-right ${PHONE_TABLE.cell}`}>{num(s.input)}</td>
      <td data-label="Output" className={`py-2 pr-3 text-right ${PHONE_TABLE.cell}`}>{num(s.output)}</td>
      <td data-label="Cache read" className={`py-2 pr-3 text-right ${PHONE_TABLE.cell}`}>{num(s.cache_read)}</td>
      <td data-label="Cache write" className={`py-2 pr-3 text-right ${PHONE_TABLE.cell}`}>{num(cacheWrite(s))}</td>
      <td data-label="Estimated list cost" className={`py-2 text-right ${PHONE_TABLE.cell}`}>
        <span>
          {usd(s.est_list_usd_micros)}
          {s.unpriced_requests > 0 && <span className="block text-[13px] font-normal text-amber-700">{num(s.unpriced_requests)} unpriced</span>}
        </span>
      </td>
    </tr>
  );
}

export default function SpendPage({ me, ws }: { me: Me; ws: string }) {
  const [by, setBy] = useState<"goal" | "team" | "session">("goal");
  const d = useApi<Spend>(`/api/v2/workspaces/${ws}/spend?by=${by}`);
  const detail = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  return (
    <Shell me={me} ws={ws} tab="Spend">
      <h1 className="mb-2 text-[26px] font-semibold text-zinc-900">Usage by goal</h1>
      <p className="mb-5 text-[15px] text-zinc-600">Tokens from shared sessions, counted under the goal each session was bound to when the work happened.</p>
      <AllocationCard ws={ws} detail={detail.data} />
      <Card
        actions={
          <Select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as "goal" | "team" | "session")}>
            <option value="goal">By goal</option>
            <option value="team">By team</option>
            <option value="session">By my sessions</option>
          </Select>
        }
        title="Estimate"
      >
        {d.loading && <Loading />}
        <Err>{d.error}</Err>
        {d.data && (
          <>
            <Note>{d.data.note} Goals you can&apos;t see are grouped without names. There is no per-person view.</Note>
            <div className="overflow-x-auto">
              <table className={`w-full text-[15px] ${PHONE_TABLE.table}`}>
                <thead className={PHONE_TABLE.head}>
                  <tr className="text-left text-[13px] text-zinc-500">
                    <th className="py-2 pr-3 font-normal">{by === "goal" ? "Goal" : by === "team" ? "Team" : "Session"}</th>
                    <th className="py-2 pr-3 text-right font-normal">Requests</th>
                    <th className="py-2 pr-3 text-right font-normal">Input</th>
                    <th className="py-2 pr-3 text-right font-normal">Output</th>
                    <th className="py-2 pr-3 text-right font-normal">Cache read</th>
                    <th className="py-2 pr-3 text-right font-normal">Cache write</th>
                    <th className="py-2 text-right font-normal">Estimated list cost</th>
                  </tr>
                </thead>
                <tbody className={PHONE_TABLE.body}>
                  {d.data.rows.map((r) => (
                    <Row key={r.key} label={r.label} s={r} />
                  ))}
                  <Row label="Not bound to a goal" s={d.data.unallocated} />
                  <Row label="Total" s={d.data.total} strong />
                </tbody>
              </table>
            </div>
            {d.data.unpriced_requests > 0 && <p className="mt-2 text-[14px] text-amber-700">{num(d.data.unpriced_requests)} {d.data.unpriced_requests === 1 ? "request" : "requests"} used a model with no list price, so {d.data.unpriced_requests === 1 ? "it is" : "they are"} not in the estimate.</p>}
          </>
        )}
      </Card>
    </Shell>
  );
}
