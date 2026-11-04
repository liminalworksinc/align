import { all } from "./db";

// Approval sets: who may consent on a goal's behalf, wherever its consent is needed (alignment requirements here,
// change requests in lib/v2/changes.ts). Computed when needed, never stored on the goal:
//   the goal's owner, every lead of its owning team, and for a company goal every workspace owner,
//   keeping only current workspace members with role owner or member (viewers and people who left never approve).
// The requester rule: the requester counts toward a set only if they own the goal. When the set then holds nobody,
// the workspace owners other than the requester are the set (which may still be empty: the request stays open).
// Launching an approved change request (lib/v2/changes.ts) is open to its effective set plus every workspace owner.

export interface ApprovalGoal {
  id: string;
  ws_id: string;
  owner_id: string;
  pod_id: string | null;
  level?: string;
}

const canApprove = (wsId: string) =>
  new Set(all<{ user_id: string }>("SELECT user_id FROM v2_members WHERE ws_id = ? AND role IN ('owner','member')", wsId).map((r) => r.user_id));

const workspaceOwners = (wsId: string) => all<{ user_id: string }>("SELECT user_id FROM v2_members WHERE ws_id = ? AND role = 'owner' ORDER BY user_id", wsId).map((r) => r.user_id);

/** Everyone any one of whom may approve on this goal's behalf, sorted. */
export function approvalSet(g: ApprovalGoal): string[] {
  const set = new Set<string>([g.owner_id]);
  if (g.pod_id) for (const r of all<{ user_id: string }>("SELECT user_id FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'", g.ws_id, g.pod_id)) set.add(r.user_id);
  if (g.level === "company") for (const u of workspaceOwners(g.ws_id)) set.add(u);
  const eligible = canApprove(g.ws_id);
  return [...set].filter((u) => eligible.has(u)).sort();
}

/** The set that decides for this goal on a request by `requesterId`, after the requester rule and the fallback. */
export function effectiveSet(g: ApprovalGoal, requesterId: string): string[] {
  const base = approvalSet(g);
  if (requesterId === g.owner_id && base.includes(requesterId)) return base;
  const others = base.filter((u) => u !== requesterId);
  if (others.length) return others;
  return workspaceOwners(g.ws_id).filter((u) => u !== requesterId);
}

/** Who may launch an approved change request by `requesterId` (LAUNCH-001, owner decision 2026-10-31): its effective
 *  approval set plus every workspace owner, sorted. Viewers never (neither set holds one). */
export function launchSet(g: ApprovalGoal, requesterId: string): string[] {
  return [...new Set([...effectiveSet(g, requesterId), ...workspaceOwners(g.ws_id)])].sort();
}
