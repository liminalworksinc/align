// Every number in the report, computed in code from the parsed runs (R1). The model never produces a number: its draft
// uses the placeholders below, and fill() writes the values in.

import { capCategories } from "./category.ts";
import { MAX_CATEGORIES, MIN_RUNS, THIN_BELOW, type Run } from "./schema.ts";

export interface CategoryCount {
  category: string;
  count: number;
  /** Run ids with at least one change in this category, in input order. */
  runs: string[];
}

export interface RunRow {
  id: string;
  date: string;
  total: number;
  byCategory: Record<string, number>;
  minutes: number | null;
  used: Run["used"];
}

export interface Numbers {
  runs: number;
  runsUsed: number;
  runsNotUsed: number;
  runsUnknown: number;
  totalChanges: number;
  /** Median changes per run, to one decimal. */
  medianChanges: number;
  /** Sum of every run's minutes (abandoned runs included) over the runs that were used. Null when no run has minutes or
   *  none was used. An estimate from the person or the agent (R5). */
  minutesPerUsedRun: number | null;
  runsWithMinutes: number;
  categories: CategoryCount[];
  top: CategoryCount | null;
  /** Top category's share of all changes, whole percent. Null for thin evidence (3 to 5 runs) or no changes. */
  topSharePercent: number | null;
  /** True when one category clearly leads: at least 40% of changes and 1.5 times the next. */
  dominant: boolean;
  thin: boolean;
  table: RunRow[];
}

export class TooFewRuns extends Error {
  readonly count: number;
  constructor(count: number) {
    super(`An audit needs at least ${MIN_RUNS} runs; this paste has ${count}.`);
    this.count = count;
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Cap categories at five (folding the rest into "other") and return runs with capped category names. */
export function normalizeRuns(runs: Run[]): Run[] {
  const counts = new Map<string, number>();
  for (const r of runs) for (const c of r.changes) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  const map = capCategories(counts, MAX_CATEGORIES);
  return runs.map((r) => ({ ...r, changes: r.changes.map((c) => ({ ...c, category: map.get(c.category) ?? c.category })) }));
}

/** Compute the report's numbers. Throws TooFewRuns below three runs (spec §2.1). Expects normalizeRuns() output. */
export function computeNumbers(runs: Run[]): Numbers {
  if (runs.length < MIN_RUNS) throw new TooFewRuns(runs.length);
  const thin = runs.length < THIN_BELOW;
  const byCat = new Map<string, CategoryCount>();
  const table: RunRow[] = runs.map((r) => {
    const byCategory: Record<string, number> = {};
    for (const c of r.changes) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      const e = byCat.get(c.category) ?? { category: c.category, count: 0, runs: [] };
      e.count++;
      if (!e.runs.includes(r.id)) e.runs.push(r.id);
      byCat.set(c.category, e);
    }
    return { id: r.id, date: r.date, total: r.changes.length, byCategory, minutes: r.minutes, used: r.used };
  });
  const categories = [...byCat.values()].sort((a, b) => b.count - a.count);
  const totalChanges = runs.reduce((n, r) => n + r.changes.length, 0);
  const runsUsed = runs.filter((r) => r.used === "yes").length;
  const withMinutes = runs.filter((r) => r.minutes !== null);
  const totalMinutes = withMinutes.reduce((n, r) => n + (r.minutes ?? 0), 0);
  const top = categories[0] ?? null;
  const second = categories[1]?.count ?? 0;
  const dominant = !!top && totalChanges > 0 && top.count / totalChanges >= 0.4 && top.count >= 1.5 * second;
  return {
    runs: runs.length,
    runsUsed,
    runsNotUsed: runs.filter((r) => r.used === "no").length,
    runsUnknown: runs.filter((r) => r.used === "unknown").length,
    totalChanges,
    medianChanges: round1(median(runs.map((r) => r.changes.length))),
    minutesPerUsedRun: withMinutes.length && runsUsed ? round1(totalMinutes / runsUsed) : null,
    runsWithMinutes: withMinutes.length,
    categories,
    top,
    topSharePercent: !thin && top && totalChanges ? Math.round((top.count / totalChanges) * 100) : null,
    dominant,
    thin,
    table,
  };
}

/** The placeholders a draft may use. Each maps to a value computed above; nothing else may carry a number. */
export function placeholders(n: Numbers): Record<string, string | null> {
  return {
    runs: String(n.runs),
    runs_used: String(n.runsUsed),
    runs_not_used: String(n.runsNotUsed),
    total_changes: String(n.totalChanges),
    median_changes: String(n.medianChanges),
    minutes_per_used_run: n.minutesPerUsedRun === null ? null : String(n.minutesPerUsedRun),
    top_category: n.top?.category ?? null,
    top_count: n.top ? String(n.top.count) : null,
    top_runs: n.top ? String(n.top.runs.length) : null,
    top_share: n.topSharePercent === null ? null : `${n.topSharePercent}%`,
  };
}

const PLACEHOLDER = /\{([a-z_]+)\}/g;

/** Names of placeholders in `text` that are unknown or have no value for these numbers. */
export function badPlaceholders(text: string, n: Numbers): string[] {
  const p = placeholders(n);
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((k) => !(k in p) || p[k] === null);
}

/** Write computed values into a draft's prose. Call only after verify() passed. */
export function fill(text: string, n: Numbers): string {
  const p = placeholders(n);
  return text.replace(PLACEHOLDER, (all, k: string) => p[k] ?? all);
}
