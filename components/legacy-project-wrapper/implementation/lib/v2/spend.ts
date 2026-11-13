// Caller-owned spend types and explicit resource bindings.
import { all } from "./db";
import { badRequest } from "./errors";
import { goalObj, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { need } from "./workspaces";
import { create_spend } from "../native/.bindings/server_spend.js";

declare const BASES: readonly ["api_usd","subscription_included","workspace_credits","estimated_list_usd","unknown"];
declare const NUMS: readonly ["requests","input","output","cache_read","cache_write_5m","cache_write_1h","cache_write_unsplit","est_list_usd_micros","unpriced_requests"];
type Basis = (typeof BASES)[number];

type Num = (typeof NUMS)[number];

export type Sums = Record<Num, number> & {
    by_basis: Record<Basis, Record<Num, number>>;
};

interface Agg extends Record<Num, number> {
    goal_id: string | null;
    session_key: string;
    session_owner: string;
    basis: Basis;
}

export type SpendBy = "goal" | "team" | "session";

interface SpendRuntime {
  spend: (pp: PolicyPrincipal, by: SpendBy, from: string | null, to: string | null) => { by: SpendBy; from: string | null; to: string | null; note: string; total: Sums; unallocated: Sums; unpriced_requests: number; rows: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<Basis, Record<Num, number>>; key: string; kind: string; label: string; goal?: { id: string; title: string; }; team?: { id: string; name: string; }; }[]; };
  goalSpend: (ws: string, goalId: string, from: string, to: string) => { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<Basis, Record<Num, number>>; model: string; }[]; };
}
const spendService = create_spend({
  all: (...args: Parameters<typeof all>) => all(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
}) as unknown as SpendRuntime;

export function spend(pp: PolicyPrincipal, by: SpendBy, from: string | null, to: string | null): { by: SpendBy; from: string | null; to: string | null; note: string; total: Sums; unallocated: Sums; unpriced_requests: number; rows: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<Basis, Record<Num, number>>; key: string; kind: string; label: string; goal?: { id: string; title: string; }; team?: { id: string; name: string; }; }[]; } {
    return (0, spendService.spend)(pp, by, from, to);
}
/** One goal's usage in [from, to): the total and one row per model, summed exactly as spend() sums a goal's row (every
 *  session's usage under the goal, by the epoch it was uploaded with). No visibility check: the caller decides who sees
 *  it (the change-request snapshot, lib/v2/evidence.ts, stores it and shows it to readers who may read spend). */
export function goalSpend(ws: string, goalId: string, from: string, to: string): { total: Sums; by_model: { requests: number; input: number; output: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; cache_write_unsplit: number; est_list_usd_micros: number; unpriced_requests: number; by_basis: Record<Basis, Record<Num, number>>; model: string; }[]; } {
    return (0, spendService.goalSpend)(ws, goalId, from, to);
}
