"use client";

import Link from "next/link";
import type { OutcomePeriod } from "@/lib/v2/outcome-periods";
import { Err, Loading, usd, useApi, when } from "./kit";
import { readingWords } from "./measure-readings";

export function OutcomePeriods({ ws, me, goal, request }: { ws: string; me: string; goal?: string; request?: string }) {
  const query = request ? `?request=${request}` : goal ? `?goal=${goal}` : "";
  const d = useApi<{ periods: OutcomePeriod[] }>(`/api/v2/workspaces/${ws}/outcome-periods${query}`);
  if (d.loading) return request ? <Loading /> : null;
  if (d.error) return <Err>Could not load spend and readings for the period.</Err>;
  if (!d.data?.periods.length) return null;
  return (
    <section aria-label="Spend during the period" className="my-3 min-w-0 space-y-3 text-[14px] [overflow-wrap:anywhere]" data-outcome-periods>
      {d.data.periods.map((period) => (
        <div key={period.change_request_id} className="min-w-0 rounded-(--radius-s) border border-(--line) p-3">
          {!request && <Link className="block min-h-11 underline" href={`/app/w/${ws}?review=${period.goal_id}.${period.change_request_id}`}>
            {goal ? period.measure_text : `${period.goal_title} · ${period.measure_text}`}
          </Link>}
          <p>Launch {when(period.from_at)} to first report {when(period.to_at)}</p>
          {period.spend && <p><strong>Spend during the period</strong> · {period.spend.estimate === null ? "Unknown" : `${usd(period.spend.estimate)} estimated at list price`}
            {period.spend.partial_estimate !== null && ` (${usd(period.spend.partial_estimate)} for the priced usage in view)`}
          </p>}
          <p className="mt-1 font-medium">Readings during the period</p>
          {period.readings.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {period.readings.map((reading) => <li key={reading.id}>{readingWords(reading, me)}</li>)}
            </ul>
          ) : <p>No readings in this period.</p>}
          {period.more_readings && <p>Showing the 20 most recent readings in the period.</p>}
        </div>
      ))}
    </section>
  );
}
