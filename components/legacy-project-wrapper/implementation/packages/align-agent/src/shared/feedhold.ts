// A goal hold known only from the cached goals feed (cycle 6): the server holds every session bound to a held goal, but a
// session hears it from a hold directive at a sync. Hook-safe: reads only the hot, injected, rules and feed files, so the
// PreToolUse hook, `::align status` and the CLI's `align status` and `align latch status` all see the same thing.
import { readJson } from "./fsx.ts";
import { layout } from "./layout.ts";
import { matchRule, readRules } from "./rules.ts";
import type { FeedFile, HotState, InjectedState } from "./types.ts";

/**
 * The goal the cached feed says is held (`allocation.held`) for this session, when no hold or release of it has reached
 * the session: its live share's goal (the one the hook opened last, until the sync has it) or, for a session a folder
 * rule is sharing that has no share yet, the rule's goal it was given at its start. A release it got wins over a stale
 * feed. Null otherwise. The caller checks the session's own hold file first: a hold that reached it is told as such.
 */
export function feedHold(home: string, lid: string, cwd: string | null): { goal_id: string; goal_title: string; workspace_id: string } | null {
  const hot = readJson<HotState>(layout.hot(home, lid));
  const inj = readJson<Partial<InjectedState>>(layout.injected(home, lid)) || {};
  let ws: string | null = null;
  let goalId: string | null = null;
  const share = hot?.share;
  if (share && (share.state === "shared" || share.state === "pending")) {
    ws = share.workspace_id;
    goalId = inj.opened_epoch ? (inj.opened_epoch.goal?.id ?? null) : (hot!.goal?.id ?? null);
  } else if (!share && inj.share_state === "shared" && inj.goal_id) {
    const rule = matchRule(readRules(home), cwd || hot?.cwd || null);
    if (rule && rule.goal_id === inj.goal_id) [ws, goalId] = [rule.workspace_id, rule.goal_id];
  }
  if (!ws || !goalId) return null;
  const g = readJson<FeedFile>(layout.feed(home, ws))?.goals?.find((x) => x.id === goalId);
  if (!g?.allocation?.held) return null;
  if ((hot?.released_holds || []).some((r) => r.goal_id === goalId)) return null;
  return { goal_id: g.id, goal_title: g.title, workspace_id: ws };
}

/** The deny reason (and status wording) of such a hold. */
export function feedHoldReason(title: string, clean: (s: string, n: number) => string): string {
  return `Align: all agents on goal "${clean(title, 100)}" were paused from its Align workspace. Work resumes when the hold is released. Your work so far is saved.`;
}
