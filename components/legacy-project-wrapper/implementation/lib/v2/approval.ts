// Caller-owned query binding. Membership rules belong to the qualified library.
import { all } from "./db";
import { create_approval } from "../native/.bindings/goal_approval.js";

export interface ApprovalGoal {
  id: string;
  ws_id: string;
  owner_id: string;
  pod_id: string | null;
  level?: string;
}

interface ApprovalRuntime {
  approvalSet(goal: ApprovalGoal): string[];
  effectiveSet(goal: ApprovalGoal, requesterId: string): string[];
  launchSet(goal: ApprovalGoal, requesterId: string): string[];
}

const approvalService = create_approval({
  all: (...args: Parameters<typeof all>) => all<{ user_id: string }>(...args),
}) as unknown as ApprovalRuntime;

export function approvalSet(g: ApprovalGoal): string[] {
  return (0, approvalService.approvalSet)(g);
}

export function effectiveSet(g: ApprovalGoal, requesterId: string): string[] {
  return (0, approvalService.effectiveSet)(g, requesterId);
}

export function launchSet(g: ApprovalGoal, requesterId: string): string[] {
  return (0, approvalService.launchSet)(g, requesterId);
}
