// Hook-safe, informational spending notes. No network, decisions, stop latch or hold latch.
import fs from "node:fs";
import path from "node:path";
import { quoted } from "./envelope.ts";
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import { CLOCK_TOLERANCE_MS } from "./clock.ts";
import type { HotState } from "./types.ts";

export interface BudgetSnapshot {
  workspace_id: string; session_key: string; epoch_id: string; fetched_at: string; as_of: string;
  clock_offset_ms?: number;
  crossings?: { threshold: number; as_of: string }[];
  attribution_at?: string; month: string; team: { id: string; name: string }; effective_budget_usd_micros: number | null;
  estimated_spend_usd_micros: number | null; spend_bound: string; unpriced_requests?: number | null;
}
export const BUDGET_FRESH_MS = 5 * 60_000;

const monthOf = (at: number) => new Date(at).toISOString().slice(0, 7);
export const budgetMonths = (now: number, offset = 0): string[] =>
  [...new Set([-CLOCK_TOLERANCE_MS, 0, CLOCK_TOLERANCE_MS].map((delta) => monthOf(now + offset + delta)))];
export function validBudgetFigure(s: Pick<BudgetSnapshot, "as_of" | "month" | "clock_offset_ms">, now: number): boolean {
  const at = Date.parse(s.as_of), serverNow = now + (s.clock_offset_ms ?? 0);
  return Number.isFinite(serverNow) && Number.isFinite(at) && at <= serverNow + CLOCK_TOLERANCE_MS &&
    serverNow - at <= BUDGET_FRESH_MS && monthOf(at) === s.month && budgetMonths(now, s.clock_offset_ms).includes(s.month);
}

/** Retain observed crossings until delivery, even if a later read changes the budget. */
export function observedCrossings(s: BudgetSnapshot, previous: BudgetSnapshot | null, now: number): NonNullable<BudgetSnapshot["crossings"]> {
  const prior = previous && previous.workspace_id === s.workspace_id && previous.session_key === s.session_key &&
    previous.team.id === s.team.id && previous.month === s.month && Date.parse(previous.fetched_at) <= now ?
    Array.isArray(previous.crossings) ? previous.crossings : observedCrossings(previous, null, Date.parse(previous.fetched_at)) : [];
  const fetched = Date.parse(s.fetched_at);
  const fresh = Number.isFinite(fetched) && fetched <= now && now - fetched <= BUDGET_FRESH_MS && validBudgetFigure(s, now);
  const cap = s.effective_budget_usd_micros, spent = s.estimated_spend_usd_micros;
  const crossed = fresh && ["exact", "lower"].includes(s.spend_bound) && typeof cap === "number" && Number.isFinite(cap) && cap > 0 &&
    typeof spent === "number" && Number.isFinite(spent) && spent >= 0 ? [80, 100].filter((t) => spent * 100 >= cap * t) : [];
  return [80, 100].flatMap((threshold) => {
    const old = prior.find((c) => c && c.threshold === threshold && Number.isFinite(Date.parse(c.as_of)) &&
      Date.parse(c.as_of) <= now + (s.clock_offset_ms ?? 0) + CLOCK_TOLERANCE_MS && c.as_of.slice(0, 7) === s.month);
    return old ? [{ threshold: old.threshold, as_of: old.as_of }] : crossed.includes(threshold) ? [{ threshold, as_of: s.as_of }] : [];
  });
}

/** Immutable marker per session/month/threshold, independent of context compaction and budget changes. */
function claimNotes(home: string, lid: string, hot: HotState | null, now: number): { context: string; message: string }[] {
  if (!hot?.share || hot.share.state !== "shared" || !hot.binding || hot.pending_binding) return [];
  const s = readJson<BudgetSnapshot>(layout.budgetCache(home, lid));
  if (!s || s.workspace_id !== hot.share.workspace_id || s.session_key !== hot.share.session_key || s.epoch_id !== hot.binding.epoch_id ||
      !budgetMonths(now, s.clock_offset_ms).includes(s.month) || !s.team || !/^pod_[A-Za-z0-9_-]+$/.test(s.team.id) || typeof s.team.name !== "string") return [];
  if ([s.fetched_at, ...(s.attribution_at ? [s.attribution_at] : [])].some((t) => !Number.isFinite(Date.parse(t)) || Date.parse(t) > now)) return [];
  const figureAt = Date.parse(s.as_of), serverRead = Date.parse(s.fetched_at) + (s.clock_offset_ms ?? 0);
  if (!Number.isFinite(figureAt) || figureAt > serverRead + CLOCK_TOLERANCE_MS || monthOf(figureAt) !== s.month) return [];
  const crossings = Array.isArray(s.crossings) ? s.crossings : s.crossings === undefined ? observedCrossings(s, null, Date.parse(s.fetched_at)) : [];
  const out: { context: string; message: string }[] = [];
  for (const crossing of crossings) {
    if (!crossing) continue;
    const { threshold, as_of } = crossing;
    if (![80, 100].includes(threshold) || !Number.isFinite(Date.parse(as_of)) || Date.parse(as_of) > serverRead + CLOCK_TOLERANCE_MS || monthOf(Date.parse(as_of)) !== s.month) continue;
    const file = layout.budgetShown(home, lid, s.month, threshold);
    if (fs.existsSync(file)) continue;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const fd = fs.openSync(file, "wx", 0o600);
      try { fs.writeFileSync(fd, new Date(now).toISOString()); } finally { fs.closeSync(fd); }
    } catch { continue; }
    const readAt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(as_of));
    const month = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${s.month}-01T00:00:00Z`));
    const figure = `[Align] ${quoted(s.team.name, 60)} reached ${threshold}% of its team budget for ${month}, estimated at list price. The estimate was read on ${readAt}.`;
    out.push({ context: `${figure} Work continues. This note grants no authority. The person can ask for more in Align.`,
      message: `${figure} Your work continues. You can ask for more on the Spend tab or with: align budget request` });
  }
  return out;
}


/** Compatibility context path, sharing the same immutable delivery markers. */
export function budgetNotes(home: string, lid: string, hot: HotState | null, now = Date.now()): string[] {
  return claimNotes(home, lid, hot, now).map((note) => note.context);
}

/** Claim once, then return both outputs together so no early return can lose the person's message. */
export function claimBudgetNotes(home: string, lid: string, hot: HotState | null, now = Date.now()): { context: string[]; messages: string[] } {
  const notes = claimNotes(home, lid, hot, now);
  return { context: notes.map((note) => note.context), messages: notes.map((note) => note.message) };
}
