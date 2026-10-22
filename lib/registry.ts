import { createHash } from "node:crypto";
import type { AppState, Goal, Owner, RegistryEntry } from "./types";
import { scenarioOf, teamOf } from "./labels";

const ORG = "Northstar Security";
const TEAM: Record<string, string> = { ceo: "Company", product: "Product", security: "Security" };

/** Current (non-superseded) accepted goals. */
export function currentGoals(s: AppState): Goal[] {
  const superseded = new Set(s.goals.map((g) => g.supersedes).filter(Boolean));
  return s.goals.filter((g) => !superseded.has(g.id));
}

// A custom scenario's registry names its own company and teams (MCP work map and goal list); Northstar's is unchanged.
// registryVersion hashes keys and versions only, so labels never move it.
const teamName = (s: AppState, owner: Owner) => (scenarioOf(s) === "custom" ? teamOf(s, owner) : TEAM[owner]);
const orgName = (s: AppState) => (scenarioOf(s) === "custom" ? s.company : ORG);

function label(s: AppState, g: Goal): string {
  const measures = g.measures.map((m) => `${m.id}: ${m.text}`).join("; ");
  return `${teamName(s, g.owner_id)} goal ${g.version}: ${g.objective} Measures: ${measures}`.slice(0, 600);
}

/**
 * The live goal registry: every current accepted shared goal, plus "none". This is the enum Jev classifies against.
 * B1-6 (A-7): private goals never enter it, so their labels reach neither GET /api/mappings nor the Jev payload.
 */
export function activeRegistry(s: AppState): RegistryEntry[] {
  const order = { ceo: 0, product: 1, security: 2 } as const;
  const entries: RegistryEntry[] = currentGoals(s)
    .filter((g) => g.visibility === "shared")
    .sort((a, b) => order[a.owner_id] - order[b.owner_id])
    .map((g) => ({ key: g.id, goal_id: g.id, version: g.version, label: label(s, g), owner: g.owner_id, team: teamName(s, g.owner_id), org: orgName(s) }));
  entries.push({ key: "none", goal_id: null, version: null, label: "Does not clearly serve any accepted goal", owner: null, team: "Unassigned", org: orgName(s) });
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
