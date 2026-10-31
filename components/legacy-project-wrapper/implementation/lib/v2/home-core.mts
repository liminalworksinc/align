// The workspace Home's plain rules (PORT2-001), with no imports so the server (lib/v2/home.ts), the web app's Home and
// Node tests all load this file as is: the evidence class of an agent-status item, what an open change request or
// alignment waits for and on whom, and the launch state LAUNCH-001 will add, read defensively.

/** Where an agent-status claim comes from (LIM-2454 3770c6c4, the checklist's §E2). Every agent-status item carries
 *  exactly one:
 *    delivery_receipt  Align observed it: a received, applied or enforced receipt, or a read Align served;
 *    agent_reported    the agent's own claim or evidence link, never verified;
 *    not_observed      Align has nothing.
 *  Nothing is ever inferred from these (no "working", "stuck", "blocked" or "diverged"). */
export const EVIDENCE_CLASSES = ["delivery_receipt", "agent_reported", "not_observed"] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/** The words the web app shows for each class. "Agent reported" never reads like an observation. */
export const EVIDENCE_WORDS: Record<EvidenceClass, string> = {
  delivery_receipt: "Delivery receipt",
  agent_reported: "Agent reported",
  not_observed: "Not observed",
};

/** A connected app: a read Align served is a delivery receipt; an app with no read yet is not observed. */
export const appEvidence = (lastReadAt: string | null | undefined): EvidenceClass => (typeof lastReadAt === "string" && lastReadAt ? "delivery_receipt" : "not_observed");

export interface HomePerson {
  id: string;
  name: string;
}

/** What an open item needs next: an approver decides, the requester accepts (or withdraws) a counter, the requester
 *  updates the request to the goal's current version, someone who may launch launches it (LAUNCH-001), a team lead
 *  accepts an ask, the team marks an accepted ask done. */
export type HomeNext = "decide" | "accept_counter" | "rebase" | "launch" | "accept" | "done";

/** Where an open change request stands, from the fields every change-request view has: who it waits on and for what.
 *  Pending and behind the goal's version: the requester has to update it first (no approver can approve it yet).
 *  Pending: its approvers (the effective approval set; empty means nobody can approve it yet). Countered: the
 *  requester. Anything else is not open: null. */
export function changeWaits(v: {
  state: string;
  behind: boolean;
  requester: HomePerson;
  approvers: HomePerson[];
}): { next: HomeNext; waiting_on: HomePerson[] } | null {
  if (v.state === "countered") return { next: "accept_counter", waiting_on: [v.requester] };
  if (v.state !== "pending") return null;
  if (v.behind) return { next: "rebase", waiting_on: [v.requester] };
  return { next: "decide", waiting_on: v.approvers };
}

/** Where an open alignment stands: countered waits on its requester; pending on everyone who could satisfy a
 *  requirement nobody has satisfied yet. */
export function alignmentWaits(a: {
  state: string;
  requester: HomePerson;
  requirements: { approvers: HomePerson[]; approved_by: HomePerson | null }[];
}): { next: HomeNext; waiting_on: HomePerson[] } | null {
  if (a.state === "countered") return { next: "accept_counter", waiting_on: [a.requester] };
  if (a.state !== "pending") return null;
  const seen = new Map<string, HomePerson>();
  for (const r of a.requirements) if (!r.approved_by) for (const p of r.approvers) seen.set(p.id, p);
  return { next: "decide", waiting_on: [...seen.values()].sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id)) };
}

// ---- LAUNCH-001: approved, not launched (built in parallel; not on this branch) ----
// Under the launch ruling (LIM-2454 33ad545d) approving a change records the decision and agents get the new version
// only at launch. LAUNCH-001 adds that state to the change-request view: "approved, not launched", and "launch:
// not_yet" once someone chose not yet. Until it lands no view carries a launch state, so launchWaits() is null for
// every request and nothing extra shows. Once it does, an approved change waiting on a launcher joins the Home queue:
// waiting on the reader when the view's `can.launch` is true, else on the view's launchers, else on the approval set
// plus the workspace owners (who may launch, per the ruling). The field is read defensively: `launch` may be a string
// or an object with `state`; any other shape, or none, is "not waiting on a launch". Align it with LAUNCH-001's view
// when the two are merged.

/** The launch states that leave an approved change waiting on a launcher. */
export const UNLAUNCHED_STATES = ["not_launched", "not_yet"] as const;
export type UnlaunchedState = (typeof UNLAUNCHED_STATES)[number];

const isPerson = (p: unknown): p is HomePerson => !!p && typeof p === "object" && typeof (p as HomePerson).id === "string" && typeof (p as HomePerson).name === "string";

/** An approved change waiting on a launch, read from a change-request view that may not have the field yet. */
export function launchWaits(v: unknown): { state: UnlaunchedState; can_launch: boolean; launchers: HomePerson[] | null } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { state?: unknown; launch?: unknown; launchers?: unknown; can?: unknown };
  if (o.state !== "approved") return null;
  const raw = typeof o.launch === "string" ? o.launch : o.launch && typeof o.launch === "object" ? (o.launch as { state?: unknown }).state : undefined;
  if (typeof raw !== "string" || !(UNLAUNCHED_STATES as readonly string[]).includes(raw)) return null;
  const fromLaunch = o.launch && typeof o.launch === "object" ? (o.launch as { waiting_on?: unknown }).waiting_on : undefined;
  const list = Array.isArray(fromLaunch) ? fromLaunch : Array.isArray(o.launchers) ? o.launchers : null;
  const can = o.can && typeof o.can === "object" ? (o.can as { launch?: unknown }).launch : undefined;
  return { state: raw as UnlaunchedState, can_launch: can === true, launchers: list ? list.filter(isPerson).map((p) => ({ id: p.id, name: p.name })) : null };
}
