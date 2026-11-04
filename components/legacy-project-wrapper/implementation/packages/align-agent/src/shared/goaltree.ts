// The bound goal's place in the goal tree, read from the cached feed. Hook-safe: node:fs and node:path only.
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import type { ContextGoal, FeedFile, GoalSnapshot, Limit } from "./types.ts";

const LIMIT_TYPES = new Set(["must", "must_not", "out_of_scope"]);

/** A version's limits as the feed or a directive carries them: well-formed items only, at most 5. */
export function limitsOf(v: unknown): Limit[] {
  if (!Array.isArray(v)) return [];
  const out: Limit[] = [];
  for (const l of v) {
    if (!l || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.text !== "string" || !r.text.trim() || !LIMIT_TYPES.has(String(r.type))) continue;
    const src = r.source && typeof r.source === "object" ? (r.source as Record<string, unknown>) : null;
    out.push({
      id: r.id,
      type: r.type as Limit["type"],
      text: r.text,
      source: src ? { kind: src.kind === "meeting" ? "meeting" : "manual", title: String(src.title ?? ""), date: String(src.date ?? "") } : null,
    });
    if (out.length === 5) break;
  }
  return out;
}

export function snapshot(goal: { id: string; version: number; title: string; measures: unknown; status: string; limits?: unknown } | null | undefined): GoalSnapshot | null {
  if (!goal) return null;
  const snap: GoalSnapshot = {
    id: goal.id,
    version: goal.version,
    title: goal.title,
    measures: Array.isArray(goal.measures) ? (goal.measures as GoalSnapshot["measures"]) : [],
    status: goal.status as GoalSnapshot["status"],
  };
  const limits = limitsOf(goal.limits);
  if (limits.length) snap.limits = limits;
  return snap;
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
