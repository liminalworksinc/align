// Caller-owned allocation types and explicit resource bindings.
import { all } from "./db";
import { badRequest } from "./errors";
import { goalObj, type GoalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { need } from "./workspaces";
import { create_allocation } from "../native/.bindings/server_allocation.js";

interface GoalAgg {
    goal_id: string | null;
    fresh: number;
    est: number;
    unpriced: number;
    sessions: number;
}

export interface AllocationRow {
    kind: "goal" | "private" | "unallocated";
    goal: {
        id: string;
        title: string;
    } | null;
    fresh_tokens: number;
    share: number;
    target_share: number | null;
    gap: number | null;
    est_list_usd_micros: number;
    unpriced_requests: number;
    sessions: number;
}

export interface FeedAllocation {
    target_share: number | null;
    share_7d: number;
    /** Points over (+) or under (-) the target, to one decimal: the Spend tab's gap, never the rounded share's, so steering
     *  (at 10 points or more) acts exactly where the page's pill turns amber (C5-2). null without a target, or with no
     *  shared usage in the window. */
    gap_7d: number | null;
    /** The goal is on hold (lib/v2/requests.ts): agents never steer from or toward it. */
    held: boolean;
}

interface AllocationRuntime {
  allocation: (pp: PolicyPrincipal, from: string | null, to: string | null) => { from: string | null; to: string | null; total_fresh_tokens: number; total_est_list_usd_micros: number; unpriced_requests: number; rows: AllocationRow[]; note: string; };
  weekStart: (t: number) => number;
  weeklyAllocation: (pp: PolicyPrincipal, weeks?: number, now?: number) => { week_start: string; total_fresh_tokens: number; rows: { kind: "goal" | "private" | "unallocated"; goal: { id: string; title: string; } | null; share: number; target_share: number | null; }[]; }[];
  feedAllocation: (pp: PolicyPrincipal, now?: number) => Map<string, FeedAllocation>;
}
const allocationService = create_allocation({
  all: (...args: Parameters<typeof all>) => all(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
  readDate: () => Date,
}) as unknown as AllocationRuntime;

/** Actual against target for [from, to). Active goals the caller can read appear with no usage when they have a target. */
export function allocation(pp: PolicyPrincipal, from: string | null, to: string | null): { from: string | null; to: string | null; total_fresh_tokens: number; total_est_list_usd_micros: number; unpriced_requests: number; rows: AllocationRow[]; note: string; } {
    return (0, allocationService.allocation)(pp, from, to);
}
/** Monday 00:00 UTC of the week containing `t`. */
export function weekStart(t: number): number {
    return (0, allocationService.weekStart)(t);
}
/** The last `weeks` calendar weeks (UTC, Monday start), oldest first: each week's share per readable goal. */
export function weeklyAllocation(pp: PolicyPrincipal, weeks = 6, now = Date.now()): { week_start: string; total_fresh_tokens: number; rows: { kind: "goal" | "private" | "unallocated"; goal: { id: string; title: string; } | null; share: number; target_share: number | null; }[]; }[] {
    return (0, allocationService.weeklyAllocation)(pp, weeks, now);
}
/** Trailing-7-day share (a whole percent) and gap (to one decimal, as `allocation` gives it) per active goal the caller
 *  can read, for the goals feed. */
export function feedAllocation(pp: PolicyPrincipal, now = Date.now()): Map<string, FeedAllocation> {
    return (0, allocationService.feedAllocation)(pp, now);
}
