"use client";
import type { Me } from "./server";
import type { Goal } from "./types";

// The goal page's "Agent activity" card (PORT-003): sessions shared toward the goal in the last 14 days, how many are
// active now, by harness, the last activity, and (for its owner, its team and workspace owners) the files and the
// reader's own sessions. From bindings, usage times and work signals, never from what agents wrote.
//
// PORT-001 declares this slot and its props; it renders nothing until PORT-003 fills it in.

export function GoalActivityCard(props: { ws: string; goal: Goal; me: Me }) {
  void props;
  return null;
}
