// Scenario labels and ids, shared by client and server. No node: imports.
// Northstar reads only the frozen literals below, so its output stays byte-identical.
// Custom scenarios read state.teams and state.scenario_config.

import type { Acceptance, Actor, AppState, Owner, ScenarioKind, ScenarioTeam } from "./types";

type LabelState = Pick<AppState, "company" | "simulations" | "scenario" | "teams" | "scenario_config"> & Partial<Pick<AppState, "acceptances">>;

export interface Labels {
  northstar: boolean;
  launchApproved: boolean; // custom: leadership approved the launch of the latest agreement (statuses read "launch approved")
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

// A custom state without teams (never written by setup) shows the slot names, never Northstar's.
const SLOT_TEAMS: Record<Owner, ScenarioTeam> = {
  ceo: { team: "ceo", lead: "ceo" },
  product: { team: "product", lead: "product" },
  security: { team: "security", lead: "security" },
};

/** Custom is decided by scenarioOf alone, the same test profileFor uses. */
function customTeams(s: Pick<AppState, "scenario" | "teams">): Record<Owner, ScenarioTeam> | null {
  return scenarioOf(s) === "custom" ? (s.teams ?? SLOT_TEAMS) : null;
}

export function teamOf(s: Pick<AppState, "scenario" | "teams">, slot: Owner): string {
  return customTeams(s)?.[slot].team ?? NORTHSTAR.team[slot];
}

export function leadOf(s: Pick<AppState, "scenario" | "teams">, slot: Owner): string {
  return customTeams(s)?.[slot].lead ?? NORTHSTAR.person[slot];
}

export function labelsFor(s: LabelState): Labels {
  const t = customTeams(s);
  if (!t) {
    return {
      northstar: true,
      launchApproved: false,
      sandbox: true,
      company: NORTHSTAR.company,
      team: { ...NORTHSTAR.team },
      role: { ...NORTHSTAR.role },
      person: { ...NORTHSTAR.person },
    };
  }
  return {
    northstar: false,
    launchApproved: s.acceptances?.at(-1)?.launch_decision?.decision === "approved",
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
 * The one way a custom scenario states an approved decision (founder ruling 10-22, P1 item 3): the record, the
 * agents' directive and MCP, and every screen say the same thing, so nobody reads the agreement as a go.
 */
export const AGREED_STATUS = "Agreed, launch pending";
/** The same status once leadership has decided the launch (custom launch decision, components/launch.ts). */
export const agreedStatus = (launchApproved: boolean) => (launchApproved ? "Agreed, launch approved" : AGREED_STATUS);
/** Conditions are recorded, never checked (P1 item 4): every place that shows them says so. */
export const CONDITIONS_UNCONFIRMED = "Not confirmed yet";
export const conditionsUnconfirmedNote = (n: number) =>
  n > 1 ? "Nobody has confirmed these are met. Align records them; it doesn't check them." : "Nobody has confirmed this is met. Align records it; it doesn't check it.";

/** The one role-switch instruction for a tester playing every team: the in-app Switch team control (founder ruling
 *  10-22, LIM-2437 bd53f6f6; it replaced every browser-window wording). */
export const ROLE_SWITCH = "Testing on your own? Use Switch team (top right) to act as the next team. Your work is saved.";
/** The waiting screen's version, naming the team whose move it is. */
export const switchHint = (team: string) => `Testing on your own? Use Switch team to act as ${team} next.`;
export const AGREED_NOT_LAUNCH = "Both teams agreed. This is not approval to launch: the launch decision is still pending.";

/**
 * Team-specific proposal states in a custom scenario. Returns undefined for Northstar and for every
 * other state, so callers fall back to their own STATE_LABEL and Northstar text never changes.
 */
export function customStateLabel(state: string, L: Labels): string | undefined {
  if (L.northstar) return undefined;
  if (state === "PENDING_SECURITY") return `Waiting for ${L.team.security}`;
  if (state === "COUNTERED") return `${L.team.security} asked for changes`;
  if (state === "ACKNOWLEDGED_BY_PRODUCT") return `${L.team.product} accepted changes`;
  if (state === "RATIFIED") return agreedStatus(L.launchApproved); // follows leadership's launch decision
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
