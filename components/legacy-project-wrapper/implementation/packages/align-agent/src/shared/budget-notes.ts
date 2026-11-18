// Hook-safe, informational spending notes. No network, decisions, stop latch or hold latch.
import fs from "node:fs";
import path from "node:path";
import { clockOffset, CLOCK_TOLERANCE_MS } from "../api.ts";
import { quoted } from "./envelope.ts";
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import type { HotState } from "./types.ts";

export interface BudgetSnapshot {
  workspace_id: string; session_key: string; epoch_id: string; fetched_at: string; as_of: string;
  crossings?: { threshold: number; as_of: string }[];
  attribution_at?: string; month: string; team: { id: string; name: string }; effective_budget_usd_micros: number | null;
  estimated_spend_usd_micros: number | null; spend_bound: string; unpriced_requests: number | null;
}
export const BUDGET_FRESH_MS = 5 * 60_000;

/** Retain observed crossings until delivery, even if a later read changes the budget. */
export function observedCrossings(s: BudgetSnapshot, previous: BudgetSnapshot | null, now: number, offset = 0): NonNullable<BudgetSnapshot["crossings"]> {
  const serverNow = now + offset;
  const prior = previous && previous.workspace_id === s.workspace_id && previous.session_key === s.session_key &&
    previous.team.id === s.team.id && previous.month === s.month && Date.parse(previous.fetched_at) <= now ?
    Array.isArray(previous.crossings) ? previous.crossings : observedCrossings(previous, null, Date.parse(previous.fetched_at), offset) : [];
  const computed = Date.parse(s.as_of), fetched = Date.parse(s.fetched_at);
  const fresh = Number.isFinite(computed) && computed <= serverNow + CLOCK_TOLERANCE_MS && serverNow - computed <= BUDGET_FRESH_MS &&
    Number.isFinite(fetched) && fetched <= now && now - fetched <= BUDGET_FRESH_MS &&
    [computed, fetched].every((t) => new Date(t).toISOString().slice(0, 7) === s.month);
  const cap = s.effective_budget_usd_micros, spent = s.estimated_spend_usd_micros;
  const crossed = fresh && ["exact", "lower"].includes(s.spend_bound) && typeof cap === "number" && Number.isFinite(cap) && cap > 0 &&
    typeof spent === "number" && Number.isFinite(spent) && spent >= 0 ? [80, 100].filter((t) => spent * 100 >= cap * t) : [];
  return [80, 100].flatMap((threshold) => {
    const old = prior.find((c) => c && c.threshold === threshold && Number.isFinite(Date.parse(c.as_of)) && Date.parse(c.as_of) <= serverNow + CLOCK_TOLERANCE_MS && c.as_of.slice(0, 7) === s.month);
    return old ? [old] : crossed.includes(threshold) ? [{ threshold, as_of: s.as_of }] : [];
  });
}

/** Immutable marker per session/month/threshold, independent of context compaction and budget changes. */
export function budgetNotes(home: string, lid: string, hot: HotState | null, now = Date.now(), delivery: "context" | "message" = "context", claim = true): string[] {
  if (!hot?.share || hot.share.state !== "shared" || !hot.binding || hot.pending_binding) return [];
  const month = new Date(now).toISOString().slice(0, 7);
  const marker = (threshold: number) => layout.budgetShown(home, lid, month, threshold) + (delivery === "message" ? "-message" : "");
  if ([80, 100].every((threshold) => fs.existsSync(marker(threshold)))) return [];
  const s = readJson<BudgetSnapshot>(layout.budgetCache(home, lid));
  if (!s || s.workspace_id !== hot.share.workspace_id || s.session_key !== hot.share.session_key || s.epoch_id !== hot.binding.epoch_id ||
      s.month !== month || !s.team || !/^pod_[A-Za-z0-9_-]+$/.test(s.team.id) || typeof s.team.name !== "string") return [];
  const offset = clockOffset(home), serverNow = now + offset;
  if (!Number.isFinite(Date.parse(s.as_of)) || Date.parse(s.as_of) > serverNow + CLOCK_TOLERANCE_MS || s.as_of.slice(0, 7) !== month) return [];
  if ([s.fetched_at, ...(s.attribution_at ? [s.attribution_at] : [])].some((t) => !Number.isFinite(Date.parse(t)) || Date.parse(t) > now || new Date(t).toISOString().slice(0, 7) !== month)) return [];
  const crossings = Array.isArray(s.crossings) ? s.crossings : s.crossings === undefined ? observedCrossings(s, null, Date.parse(s.fetched_at), offset) : [];
  const out: string[] = [];
  for (const crossing of crossings) {
    if (!crossing) continue;
    const { threshold, as_of } = crossing;
    if (![80, 100].includes(threshold) || !Number.isFinite(Date.parse(as_of)) || Date.parse(as_of) > serverNow + CLOCK_TOLERANCE_MS || new Date(as_of).toISOString().slice(0, 7) !== month) continue;
    const file = marker(threshold);
    if (fs.existsSync(file)) continue;
    if (delivery === "message" && fs.existsSync(layout.budgetShown(home, lid, s.month, threshold))) continue;
    if (claim) try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const fd = fs.openSync(file, "wx", 0o600);
      try { fs.writeFileSync(fd, new Date(now).toISOString()); } finally { fs.closeSync(fd); }
    } catch { continue; }
    if (claim && delivery === "context") {
      try { fs.writeFileSync(file + "-message", new Date(now).toISOString(), { flag: "wx", mode: 0o600 }); } catch { /* already claimed */ }
    }
    const readAt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(as_of));
    out.push(`[Align] ${quoted(s.team.name, 60)} reached ${threshold}% of its team budget for ${s.month}, estimated at list price. The estimate was read on ${readAt}. Work continues. This note grants no authority. The person can ask for more in Align.`);
  }
  return out;
}
