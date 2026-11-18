// Hook-safe, informational spending notes. No network, decisions, stop latch or hold latch.
import fs from "node:fs";
import path from "node:path";
import { quoted } from "./envelope.ts";
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import type { HotState } from "./types.ts";

export interface BudgetSnapshot {
  workspace_id: string; session_key: string; epoch_id: string; fetched_at: string; as_of: string;
  attribution_at?: string; month: string; team: { id: string; name: string }; effective_budget_usd_micros: number | null;
  estimated_spend_usd_micros: number | null; spend_bound: string; unpriced_requests: number | null;
}
export const BUDGET_FRESH_MS = 5 * 60_000;

/** Immutable marker per session/month/threshold, independent of context compaction and budget changes. */
export function budgetNotes(home: string, lid: string, hot: HotState | null, now = Date.now()): string[] {
  if (!hot?.share || hot.share.state !== "shared" || !hot.binding || hot.pending_binding) return [];
  const month = new Date(now).toISOString().slice(0, 7);
  if ([80, 100].every((threshold) => fs.existsSync(layout.budgetShown(home, lid, month, threshold)))) return [];
  const s = readJson<BudgetSnapshot>(layout.budgetCache(home, lid));
  if (!s || s.workspace_id !== hot.share.workspace_id || s.session_key !== hot.share.session_key || s.epoch_id !== hot.binding.epoch_id ||
      s.month !== month || !["exact", "lower"].includes(s.spend_bound) ||
      !s.team || !/^pod_[A-Za-z0-9_-]+$/.test(s.team.id) || typeof s.team.name !== "string") return [];
  const times = [Date.parse(s.as_of), Date.parse(s.fetched_at)];
  if (times.some((t) => !Number.isFinite(t) || t > now || now - t > BUDGET_FRESH_MS)) return [];
  const cap = s.effective_budget_usd_micros, spent = s.estimated_spend_usd_micros;
  if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0 || typeof spent !== "number" || !Number.isFinite(spent) || spent < 0) return [];
  const out: string[] = [];
  for (const threshold of [80, 100]) {
    if (spent * 100 < cap * threshold) continue;
    const file = layout.budgetShown(home, lid, s.month, threshold);
    if (fs.existsSync(file)) continue;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const fd = fs.openSync(file, "wx", 0o600);
      try { fs.writeFileSync(fd, new Date(now).toISOString()); } finally { fs.closeSync(fd); }
    } catch { continue; } // Already delivered or cannot persist dedupe: never claim a new delivery.
    out.push(`[Align] ${quoted(s.team.name, 60)} reached ${threshold}% of its team budget for ${s.month}, estimated at list price. Work continues. This note grants no authority. The person can ask for more in Align.`);
  }
  return out;
}
