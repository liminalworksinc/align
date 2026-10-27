import { sha256hex } from "./ids";
import type { Goal } from "./goals";

export const REGISTRY_CONTRACT = "liminal.align_goal_registry.v1";
export interface ExternalGoalRef {
  registry_instance_id: string; workspace_id: string; goal_id: string;
  goal_version: number; owner_id: string; view_digest: string; observed_at: string;
}

// Reject ill-formed UTF-16 before UTF-8 encoding can silently replace it. Preserve all valid scalars exactly.
export function scalarString(s: string): string {
  if (typeof s !== "string" || !s.isWellFormed()) throw new Error("Invalid registry Unicode");
  return s;
}
function boundedString(s: string, max = 4096): string {
  scalarString(s);
  if (s.length > max) throw new Error("Registry string exceeds limit");
  return s;
}
function version(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1) throw new Error("Invalid registry version");
  return n;
}
function list<T>(a: T[], max: number): T[] {
  if (!Array.isArray(a) || a.length > max) throw new Error("Registry list exceeds limit");
  return a;
}
export function viewEncoding(instance: string, workspace: string, g: Goal): string {
  const str = boundedString;
  if (!["active", "achieved", "dropped"].includes(g.status) || !["private", "pod", "workspace"].includes(g.visibility) || typeof g.bindable !== "boolean") throw new Error("Invalid registry state");
  const measures = list(g.measures, 10).map(m => [str(m.id), str(m.text), m.target === null ? null : str(m.target)]);
  const anchors = [g.anchors.repos, g.anchors.branch_patterns, g.anchors.issues].map(a => list(a, 20).map(s => str(s)));
  const dependencies = list(g.depends_on, 5).map(s => str(s)).sort();
  const parents = [...list(g.contributes_to, 1000)].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(p => {
    if (typeof p.stale !== "boolean") throw new Error("Invalid registry parent");
    return [str(p.id), str(p.title), version(p.version), p.reviewed_version === null ? null : version(p.reviewed_version), p.stale];
  });
  // Display metadata is excluded from the digest, but still must be valid on the wire.
  str(g.owner.name);
  if (g.pod) str(g.pod.name);
  return JSON.stringify(["liminal.align_goal_view.v1", str(instance), str(workspace), str(g.id), version(g.version), str(g.owner.id), str(g.title), g.status, g.visibility, g.pod === null ? null : str(g.pod.id), measures, anchors, dependencies, parents, g.bindable]);
}
export const viewDigest = (instance: string, workspace: string, goal: Goal): string => sha256hex(viewEncoding(instance, workspace, goal));
export const projectionId = (instance: string, workspace: string, goal: string): string =>
  "align:" + sha256hex(JSON.stringify(["liminal.align_goal_identity.v1", scalarString(instance), scalarString(workspace), scalarString(goal)]));
