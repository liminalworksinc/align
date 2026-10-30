// The bound goal's place in the goal tree, read from the cached feed. Hook-safe: node:fs and node:path only.
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import type { ContextGoal, FeedFile, GoalSnapshot } from "./types.ts";

export function snapshot(goal: { id: string; version: number; title: string; measures: unknown; status: string } | null | undefined): GoalSnapshot | null {
  if (!goal) return null;
  return {
    id: goal.id,
    version: goal.version,
    title: goal.title,
    measures: Array.isArray(goal.measures) ? (goal.measures as GoalSnapshot["measures"]) : [],
    status: goal.status as GoalSnapshot["status"],
  };
}

/** The bound goal's parents (at most 2) and dependencies (at most 2), as the cached feed has them. */
export function contextGoals(home: string, ws: string, goalId: string | null | undefined): ContextGoal[] {
  if (!goalId) return [];
  const feed = readJson<FeedFile>(layout.feed(home, ws));
  const byId = new Map((feed?.goals || []).map((g) => [g.id, g]));
  const me = byId.get(goalId);
  if (!me) return [];
  const out: ContextGoal[] = [];
  for (const p of (me.contributes_to || []).slice(0, 2)) {
    const g = snapshot(byId.get(p.id));
    if (g) out.push({ rel: "parent", stale: !!p.stale, goal: g });
  }
  for (const id of (me.depends_on || []).slice(0, 2)) {
    const g = snapshot(byId.get(id));
    if (g) out.push({ rel: "depends", stale: false, goal: g });
  }
  return out;
}
