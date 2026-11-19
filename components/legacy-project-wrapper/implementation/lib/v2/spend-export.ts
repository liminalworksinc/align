import type { PolicyPrincipal } from "./policy";
import { spendTeamExport, type Sums } from "./spend";

import { spendMonth } from "./spend-month";

export { spendMonth } from "./spend-month";

/** Quote every cell and prevent spreadsheet formula evaluation, including leading control characters. */
const cell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

/** Serialize exactly the on-screen team report's rows and amounts. */
export function spendCsv(pp: PolicyPrincipal, range: ReturnType<typeof spendMonth>, generatedAt = new Date()) {
  const report = spendTeamExport(pp, range.from, range.to);
  const values = (label: string, s: Sums | null) => [
    range.month,
    label,
    s?.requests ?? 0,
    // Format integer micro-dollars directly, without rounding each team's cost.
    `${Math.trunc((s?.est_list_usd_micros ?? 0) / 1_000_000)}.${String((s?.est_list_usd_micros ?? 0) % 1_000_000).padStart(6, "0")}`,
    s?.unpriced_requests ?? 0,
    s?.input ?? 0,
    s?.output ?? 0,
    s?.cache_read ?? 0,
    s?.cache_write_5m ?? 0,
    s?.cache_write_1h ?? 0,
    s?.cache_write_unsplit ?? 0,
  ];
  const rows = [
    ["Note", report.note],
    ["Month (UTC)", range.month],
    ["Generated at (UTC)", generatedAt.toISOString()],
    [],
    ["month", "team", "requests", "estimated_list_cost_usd", "unpriced_requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit"],
    ...report.rows.map((r) => values(r.label, r)),
    values("Not bound to a goal", report.unallocated),
    values("Total", report.total),
  ];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
