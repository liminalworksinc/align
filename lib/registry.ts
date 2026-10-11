import { createHash } from "node:crypto";
import type { AppState, Goal, RegistryEntry } from "./types";

const ORG = "Northstar Security";
const TEAM: Record<string, string> = { ceo: "Company", product: "Product", security: "Security" };

/** Current (non-superseded) accepted goals. */
export function currentGoals(s: AppState): Goal[] {
  const superseded = new Set(s.goals.map((g) => g.supersedes).filter(Boolean));
  return s.goals.filter((g) => !superseded.has(g.id));
}

function label(g: Goal): string {
  const measures = g.measures.map((m) => `${m.id}: ${m.text}`).join("; ");
  return `${TEAM[g.owner_id]} goal ${g.version}: ${g.objective} Measures: ${measures}`.slice(0, 600);
}

/** The live goal registry: every current accepted goal, plus "none". This is the enum Jev classifies against. */
export function activeRegistry(s: AppState): RegistryEntry[] {
  const order = { ceo: 0, product: 1, security: 2 } as const;
  const entries: RegistryEntry[] = currentGoals(s)
    .sort((a, b) => order[a.owner_id] - order[b.owner_id])
    .map((g) => ({ key: g.id, goal_id: g.id, version: g.version, label: label(g), owner: g.owner_id, team: TEAM[g.owner_id], org: ORG }));
  entries.push({ key: "none", goal_id: null, version: null, label: "Does not clearly serve any accepted goal", owner: null, team: "Unassigned", org: ORG });
  return entries;
}

export function registryVersion(s: AppState): string {
  const keys = activeRegistry(s).map((e) => `${e.key}@${e.version ?? "-"}`).join("|");
  return createHash("sha256").update(keys).digest("hex").slice(0, 10);
}

/** Recompute and store the registry version. Returns true when it changed. */
export function refreshRegistry(s: AppState): boolean {
  const v = registryVersion(s);
  if (v === s.registry_version) return false;
  s.registry_version = v;
  return true;
}
