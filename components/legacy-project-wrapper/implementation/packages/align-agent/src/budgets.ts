import type { Ctx } from "./context.ts";
import { api } from "./api.ts";
import { layout } from "./shared/layout.ts";
import { readJson, removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import type { BudgetSnapshot } from "./shared/budget-notes.ts";
import type { Goal } from "./shared/types.ts";
import path from "node:path";
import { matchRule, readRules, realDir } from "./shared/rules.ts";

export function budgetFolder(ctx: Ctx, cwd: string) {
  const rule = matchRule(readRules(ctx.home), cwd);
  if (rule) return { workspace_id: rule.workspace_id, goal_id: rule.goal_id };
  const dir = realDir(cwd);
  const rows = ctx.db.prepare("SELECT h.workspace_id, h.binding_goal AS goal_id, s.cwd FROM shares h JOIN sessions s ON s.local_id = h.local_id WHERE h.state = 'shared'").all() as { workspace_id: string; goal_id: string | null; cwd: string | null }[];
  const matches = rows.filter((r) => r.cwd && (dir === realDir(r.cwd) || dir.startsWith(realDir(r.cwd) + path.sep)));
  const unique = [...new Map(matches.map((r) => [`${r.workspace_id}:${r.goal_id ?? ""}`, r])).values()];
  if (unique.length > 1) throw new Error("Several shared goals apply to this folder. Pass --workspace and --team, and --goal when requesting for a goal.");
  return unique[0] ?? null;
}

/** Explicit selection or the folder goal's team, then a sole current membership. Never guess among teams. */
export function budgetTeam(goal: Pick<Goal, "team"> | null, explicit: string | undefined, teams: { id: string }[]): string {
  const team = explicit || goal?.team?.id || (teams.length === 1 ? teams[0].id : null);
  if (!team) throw new Error("No single team applies to this folder. Pass --team <id>.");
  if (!/^pod_[A-Za-z0-9_-]+$/.test(team)) throw new Error("Pass a team id with --team.");
  return team;
}

export function requestAmount(value: string | undefined): number {
  const n = value === undefined || !/^\d+(?:\.\d{1,2})?$/.test(value) ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new Error("--amount must be a positive USD amount in whole cents, at most 1,000,000.");
  return n;
}

/** One bounded pass. Session attribution is reused briefly; team/month amounts are read once per pass. */
type ObservedBudget = Pick<BudgetSnapshot, "team" | "month" | "as_of" | "effective_budget_usd_micros" | "estimated_spend_usd_micros" | "spend_bound" | "unpriced_requests">;

export async function refreshSessionBudgets(ctx: Ctx): Promise<void> {
  const cursorFile = path.join(ctx.home, "budgets-cache", "cursor.json");
  const cursor = readJson<{ local_id: string }>(cursorFile)?.local_id ?? "";
  type Share = { local_id: string; workspace_id: string; session_key: string; binding_epoch: string | null };
  let shares = ctx.db.prepare("SELECT local_id, workspace_id, session_key, binding_epoch FROM shares WHERE state='shared' AND local_id > ? ORDER BY local_id LIMIT 100").all(cursor) as Share[];
  if (!shares.length && cursor) shares = ctx.db.prepare("SELECT local_id, workspace_id, session_key, binding_epoch FROM shares WHERE state='shared' ORDER BY local_id LIMIT 100").all() as Share[];
  const teams = new Map<string, ObservedBudget | null>(), now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  for (const s of shares) {
    const file = layout.budgetCache(ctx.home, s.local_id);
    try {
      const cached = readJson<BudgetSnapshot>(file);
      const age = now - Date.parse(cached?.attribution_at ?? "");
      const reuse = cached && cached.workspace_id === s.workspace_id && cached.session_key === s.session_key && cached.epoch_id === s.binding_epoch && cached.month === month && age >= 0 && age < 5 * 60_000;
      let team = reuse ? cached.team : null, b: ObservedBudget | null = null;
      if (!reuse) {
        const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/sessions/${encodeURIComponent(s.session_key)}/budget?attribution=1`);
        if (r.status !== 200 || !r.json || r.json.epoch_id !== s.binding_epoch) { removeFile(file); continue; }
        team = r.json.team;
      }
      {
        const key = `${s.workspace_id}:${team!.id}:${month}`;
        if (!teams.has(key)) {
          const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/teams/${encodeURIComponent(team!.id)}/budget?month=${month}`);
          teams.set(key, r.status === 200 ? r.json : null);
        }
        b = teams.get(key) ?? null;
      }
      const live = ctx.db.prepare("SELECT state, workspace_id, session_key, binding_epoch FROM shares WHERE local_id=?").get(s.local_id) as Share & { state: string } | undefined;
      if (!b || !live || live.state !== "shared" || live.workspace_id !== s.workspace_id || live.session_key !== s.session_key || live.binding_epoch !== s.binding_epoch) { removeFile(file); continue; }
      const snapshot: BudgetSnapshot = { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch!, fetched_at: new Date().toISOString(), attribution_at: reuse ? cached.attribution_at : new Date(now).toISOString(), as_of: b.as_of,
        month: b.month, team: b.team, effective_budget_usd_micros: b.effective_budget_usd_micros, estimated_spend_usd_micros: b.estimated_spend_usd_micros, spend_bound: b.spend_bound, unpriced_requests: b.unpriced_requests };
      writeJsonAtomic(file, snapshot);
    } catch { removeFile(file); }
  }
  writeJsonAtomic(cursorFile, { local_id: shares.at(-1)?.local_id ?? "" });
}
