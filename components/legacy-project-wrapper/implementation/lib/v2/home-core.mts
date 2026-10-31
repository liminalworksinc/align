// The workspace Home's plain rules (PORT2-001), with no imports so the server (lib/v2/home.ts), the web app's Home and
// Node tests all load this file as is: the evidence class of an agent-status item, what an open change request or
// alignment waits for and on whom, and whether an approved change waits on a launch (LAUNCH-001).

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

// ---- LAUNCH-001: approved, not launched ----
// Under the launch ruling (LIM-2454 33ad545d) approving a change records the decision and agents get the new version
// only at launch. The change-request view (lib/v2/changes.ts) carries `launch`: "pending" (approved, nobody decided the
// launch yet), "not_yet", "launched", "superseded" (before launch) or null, with `launchers` (the approval set plus the
// workspace owners) and `can.launch`. An approved change that is pending or not yet launched joins the Home queue as
// "Approved, not launched": waiting on the reader when `can.launch` is true, else on the launchers. Any other shape is
// "not waiting on a launch".

/** The launch states that leave an approved change waiting on a launcher. */
export const UNLAUNCHED_STATES = ["pending", "not_yet"] as const;
export type UnlaunchedState = (typeof UNLAUNCHED_STATES)[number];

const isPerson = (p: unknown): p is HomePerson => !!p && typeof p === "object" && typeof (p as HomePerson).id === "string" && typeof (p as HomePerson).name === "string";

/** An approved change waiting on a launch, from a change-request view: its launch state, whether the reader may launch
 *  it, and who may. */
export function launchWaits(v: unknown): { state: UnlaunchedState; can_launch: boolean; launchers: HomePerson[] } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { state?: unknown; launch?: unknown; launchers?: unknown; can?: unknown };
  if (o.state !== "approved" || typeof o.launch !== "string" || !(UNLAUNCHED_STATES as readonly string[]).includes(o.launch)) return null;
  const can = o.can && typeof o.can === "object" ? (o.can as { launch?: unknown }).launch : undefined;
  return { state: o.launch as UnlaunchedState, can_launch: can === true, launchers: Array.isArray(o.launchers) ? o.launchers.filter(isPerson).map((p) => ({ id: p.id, name: p.name })) : [] };
}
