// Scenario labels and ids, shared by client and server. No node: imports.
// Northstar reads only the frozen literals below, so its output stays byte-identical.
// Custom scenarios read state.teams and state.scenario_config.

import type { Acceptance, Actor, AppState, Owner, ScenarioKind } from "./types";

type LabelState = Pick<AppState, "company" | "simulations" | "scenario" | "teams" | "scenario_config">;

export interface Labels {
  northstar: boolean;
  sandbox: boolean; // northstar, or a custom scenario that has sandbox runs; everything tied to runs hides when false
  company: string;
  team: Record<Owner, string>; // team name per goal slot
  role: Record<Actor, string>; // team name per signed-in role
  person: Record<Owner | Actor, string>; // who speaks for each slot or role
}

// Copied verbatim from the files that hardcode them at 850971e: components/ui.tsx OWNER_LABEL,
// app/page.tsx TEAM_OF, lib/registry.ts ORG and TEAM, lib/flow.ts and lib/org.ts ids.
export const NORTHSTAR = {
  company: "Northstar Security",
  team: { ceo: "Company", product: "Product", security: "Security" },
  role: { product: "Product", security: "Security", leadership: "Leadership" },
  person: {
    ceo: "CEO",
    product: "Product Director",
    security: "Alex / Security Lead",
    leadership: "CEO / Leadership",
  },
  ids: {
    company_measure: "KR2",
    conflict_measure: "S-M1",
    decision_measure: "S-M3",
    dependency: "r-product-security",
  },
} as const;

const SLOT_OF: Record<Actor, Owner> = { product: "product", security: "security", leadership: "ceo" };

export function scenarioOf(s: Pick<AppState, "scenario">): ScenarioKind {
  return s.scenario ?? "northstar";
}

function custom(s: Pick<AppState, "scenario" | "teams">): s is Pick<AppState, "scenario"> & { teams: NonNullable<AppState["teams"]> } {
  return scenarioOf(s) === "custom" && !!s.teams;
}

export function teamOf(s: Pick<AppState, "scenario" | "teams">, slot: Owner): string {
  return custom(s) ? s.teams[slot].team : NORTHSTAR.team[slot];
}

export function leadOf(s: Pick<AppState, "scenario" | "teams">, slot: Owner): string {
  return custom(s) ? s.teams[slot].lead : NORTHSTAR.person[slot];
}

export function labelsFor(s: LabelState): Labels {
  if (!custom(s)) {
    return {
      northstar: true,
      sandbox: true,
      company: NORTHSTAR.company,
      team: { ...NORTHSTAR.team },
      role: { ...NORTHSTAR.role },
      person: { ...NORTHSTAR.person },
    };
  }
  const t = s.teams;
  return {
    northstar: false,
    sandbox: s.simulations.length > 0,
    company: s.company,
    team: { ceo: t.ceo.team, product: t.product.team, security: t.security.team },
    role: { product: t.product.team, security: t.security.team, leadership: t.ceo.team },
    person: {
      ceo: t.ceo.lead,
      product: t.product.lead,
      security: t.security.lead,
      leadership: t.ceo.lead,
    },
  };
}

/** Goal slot a signed-in role speaks for (leadership owns the company goal). */
export function slotOf(actor: Actor): Owner {
  return SLOT_OF[actor];
}

/** Possessive with the curly apostrophe the Northstar copy uses: "Security’s", "Sales’". */
export function poss(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/**
 * Team-specific proposal states in a custom scenario. Returns undefined for Northstar and for every
 * other state, so callers fall back to their own STATE_LABEL and Northstar text never changes.
 */
export function customStateLabel(state: string, L: Labels): string | undefined {
  if (L.northstar) return undefined;
  if (state === "PENDING_SECURITY") return `Waiting for ${L.team.security}`;
  if (state === "COUNTERED") return `${L.team.security} asked for changes`;
  if (state === "ACKNOWLEDGED_BY_PRODUCT") return `${L.team.product} accepted changes`;
  return undefined;
}

// ---- ids. Northstar keeps its literals; custom reads scenario_config (set by setup). ----

type IdState = Pick<AppState, "scenario" | "scenario_config">;

function config(s: IdState) {
  return scenarioOf(s) === "custom" ? s.scenario_config : undefined;
}

/** The company measure the conflict hangs on (Northstar KR2). */
export function companyMeasureId(s: IdState): string {
  return config(s)?.company_measure_id ?? NORTHSTAR.ids.company_measure;
}

/** The owning team's measure that the proposal replaces (Northstar S-M1). */
export function conflictMeasureId(s: IdState): string {
  return config(s)?.owner_measure_id ?? NORTHSTAR.ids.conflict_measure;
}

/** The dependency relation between the two teams (Northstar r-product-security). */
export function dependencyId(s: IdState): string {
  return config(s)?.dependency_id ?? NORTHSTAR.ids.dependency;
}

/** The measure an approval created. Custom reads it from the acceptance; Northstar is always S-M3. */
export function decisionMeasureId(s: IdState, acceptance?: Pick<Acceptance, "new_measure_id"> | null): string {
  if (config(s)) return acceptance?.new_measure_id ?? "";
  return NORTHSTAR.ids.decision_measure;
}
