// Steering and the unshared-work note: decided from local files only (hook-safe: node:fs, node:path, node:crypto).
// Steering: when the workspace has it on, a shared session that starts on a goal at least STEER_GAP points over its
// target, while another goal it can see is at least STEER_GAP points under, gets one line naming both shares, once.
// Targets are launched goal content (the cached feed has only launched versions); a goal on hold is never steered
// from or toward, and a stopped or held session gets no line. It names goals and whole percents, never people. Each
// line shown is queued as a small file and reported by the next sync pass (src/allocation.ts) so the workspace can
// count them.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { clean } from "./envelope.ts";
import { readJson, writeJsonAtomic } from "./fsx.ts";
import { layout } from "./layout.ts";
import type { FeedFile, Goal } from "./types.ts";

export const STEER_GAP = 10;
export const UNSHARED_NOTE_MIN = 3;
/** Upper bound of a steering line (fixed text plus two 60-character titles). */
export const STEER_MAX = 320;

export interface SteeringPick {
  text: string;
  goal_id: string;
  suggested_goal_id: string;
  share: number;
  target: number;
}

/** The one steering line for a session bound to `goalId`, or null. Pure: same feed in, same answer out. */
export function steeringLine(goalId: string, feed: FeedFile | null): SteeringPick | null {
  if (!feed || feed.steering !== "on") return null;
  const goal = feed.goals.find((g) => g.id === goalId);
  const a = goal?.allocation;
  if (!goal || goal.status !== "active" || !a || a.held || a.target_share === null || a.gap_7d === null || a.gap_7d < STEER_GAP) return null;
  let best: Goal | null = null;
  for (const g of feed.goals) {
    const b = g.allocation;
    if (g.id === goalId || g.status !== "active" || !b || b.held || b.target_share === null || b.target_share <= 0 || b.gap_7d === null || b.gap_7d > -STEER_GAP) continue;
    if (!best || (b.gap_7d as number) < (best.allocation!.gap_7d as number)) best = g;
  }
  if (!best) return null;
  const u = best.allocation!;
  // Wording chosen by the Trinity one-shot experiment (2026-10-27): adding the goal's first measure made suggestions
  // concrete but agents stopped mentioning the gap during specific tasks, so the line stays as short as this.
  const text = `[Align] Last 7 days: "${clean(goal.title, 60)}" had ${a.share_7d}% of the workspace's agent time (target ${a.target_share}%); "${clean(best.title, 60)}" has ${u.share_7d}% of its ${u.target_share}% target. Tell the user once if relevant; don't switch tasks on your own.`;
  return { text, goal_id: goal.id, suggested_goal_id: best.id, share: a.share_7d, target: a.target_share };
}

export interface QueuedSteering {
  local_id: string;
  workspace_id: string;
  goal_id: string;
  suggested_goal_id: string;
  share: number;
  target: number;
  at: string;
}

/** Queue a shown steering line for the next sync pass. */
export function queueSteering(home: string, e: QueuedSteering): void {
  const name = `${Date.now().toString().padStart(14, "0")}-${crypto.randomBytes(4).toString("hex")}.json`;
  writeJsonAtomic(path.join(layout.steeringDir(home), name), e);
}

export function listSteering(home: string): string[] {
  try {
    return fs
      .readdirSync(layout.steeringDir(home))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => path.join(layout.steeringDir(home), f));
  } catch {
    return [];
  }
}

/** Monday 00:00 UTC of the week containing `t`, as YYYY-MM-DD. */
export function weekKey(t: number): string {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * 86_400_000).toISOString().slice(0, 10);
}

export interface UnsharedDigest {
  computed_at: string;
  total_tokens: number;
  unshared_tokens: number;
  share: number;
  top: { dir: string; tokens: number }[];
}

/** The once-a-week user-only note about agent time outside shared sessions, or null. Marks the week as shown. */
export function unsharedNote(home: string, now = Date.now()): string | null {
  const d = readJson<UnsharedDigest>(layout.unsharedDigest(home));
  if (!d || d.share <= UNSHARED_NOTE_MIN || !d.top.length) return null;
  const week = weekKey(now);
  if (readJson<{ week: string }>(layout.unsharedShown(home))?.week === week) return null;
  writeJsonAtomic(layout.unsharedShown(home), { week, at: new Date(now).toISOString() });
  const dirs = d.top
    .slice(0, 3)
    .map((t) => path.basename(t.dir) || t.dir)
    .join(", ");
  return `Align: ${Math.round(d.share)}% of this machine's agent time in the last 7 days was in sessions not shared toward any goal (mostly ${dirs}). Run \`align share --dir <folder> --workspace <workspace> --goal <goal>\` to count a folder toward a goal. This stays on this machine.`;
}
