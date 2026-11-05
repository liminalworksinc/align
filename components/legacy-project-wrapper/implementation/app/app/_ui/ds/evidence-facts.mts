import type { ChangeRequest, Goal } from "../types";

// The evidence behind one item (LIM-2472 direction 9b5b870f: judgment is the unit, agent work is its evidence), as facts
// in the evidence classes' words. Pure: EvidenceSummary renders it on Home's rows, the goal lines and the review, and
// design/prototypes/lim-2472/s/evidence-facts.check.mjs runs it on the seeded requests. Each fact says only what Align
// sent, recorded or was told:
//   Receipt         Align recorded it: a launch directive's received receipts, or a goal read that served the version;
//   Agent reported  an agent's own account: evidence links added through a connected app, align CLI usage times;
//   Self-reported   a person's own evidence links;
//   Not observed    Align has nothing for it.
// Never what an agent did with something, and never "verified": Align doesn't check links.

/** The four evidence classes, the same ids as EvidenceLabel's kinds. */
export type FactKind = "receipt" | "reported" | "self" | "unobserved";
export interface Fact {
  kind: FactKind;
  /** A few words for a chip on a one-line row ("v2 · 1 of 1 received"). */
  short: string;
  /** The same fact as a sentence, for the full summary. */
  long: string;
}

export const FACT_WORD: Record<FactKind, string> = { receipt: "Receipt", reported: "Agent reported", self: "Self-reported", unobserved: "Not observed" };
const RANK: Record<FactKind, number> = { receipt: 0, reported: 1, self: 2, unobserved: 3 };

/** What GET …/change-requests/<id>/value says about a launch (lib/v2/value.ts ValueView: delivery, apps). */
export interface Delivery {
  delivery: { sessions: number; received: number; applied: number } | null;
  apps: { everyone: boolean; items: { id: string }[] } | null;
}

export type ChangeInput = Pick<ChangeRequest, "revision" | "revisions" | "launch" | "version">;
export type GoalInput = Pick<Goal, "allocation">;

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** A launched version's delivery: sessions that sent a receipt for it and apps a goal read served it to. */
function deliveryFacts(version: number, d: Delivery): Fact[] {
  const out: Fact[] = [];
  const s = d.delivery;
  const apps = d.apps?.items.length ?? 0;
  if (s && s.received > 0)
    out.push({ kind: "receipt", short: `v${version} · ${s.received} of ${s.sessions} received`, long: `${s.received} of ${n(s.sessions, "session")} that Align sent v${version} to sent a receipt for it.` });
  if (s && s.received === 0)
    out.push({ kind: "unobserved", short: `v${version} · 0 of ${s.sessions} received`, long: `Align sent v${version} to ${n(s.sessions, "session")}; none has sent a receipt yet.` });
  if (apps > 0)
    out.push({
      kind: "receipt",
      short: `v${version} · ${n(apps, "app")}`,
      long: `Align sent v${version} to ${n(apps, "connected app")} when ${apps === 1 ? "it" : "they"} read the goals${d.apps?.everyone ? "" : " (yours; owners see everyone's)"}.`,
    });
  if (!s && apps === 0) out.push({ kind: "unobserved", short: `v${version} · not sent yet`, long: `Align hasn't sent v${version} to a session or a connected app yet.` });
  return out;
}

const byStrength = (facts: Fact[]) => facts.map((f, i) => [f, i] as const).sort((a, b) => RANK[a[0].kind] - RANK[b[0].kind] || a[1] - b[1]).map(([f]) => f);

/**
 * A change request's evidence: links on its current revision, and once launched what Align recorded delivering it.
 * `value` is the …/value read; undefined when it wasn't read (no delivery facts then), null when it can't be.
 */
export function changeFacts(cr: ChangeInput, value?: Delivery | null): Fact[] {
  const facts: Fact[] = [];
  if (cr.launch === "launched" && cr.version && value) facts.push(...deliveryFacts(cr.version, value));
  const ev = cr.revisions.find((r) => r.revision === cr.revision)?.evidence ?? [];
  const agent = ev.filter((e) => e.reported_as === "agent-reported").length;
  const self = ev.length - agent;
  if (agent) facts.push({ kind: "reported", short: n(agent, "link"), long: `${n(agent, "evidence link")} added through a connected app. Align doesn't check links.` });
  if (self) facts.push({ kind: "self", short: n(self, "link"), long: `${n(self, "evidence link")} added by a person. Align doesn't check links.` });
  if (!ev.length) facts.push({ kind: "unobserved", short: "no links", long: `No evidence links on revision ${cr.revision}.` });
  return byStrength(facts);
}

/**
 * A goal's evidence: its newest launched version's delivery (`launched`: the version and its …/value read; null when
 * nothing is launched, undefined when not read) and its share of the workspace's agent time over 7 days (align CLI
 * usage, so agent reported; the goals feed carries it for active goals only).
 */
export function goalFacts(goal: GoalInput, launched?: { version: number; value: Delivery | null } | null): Fact[] {
  const facts: Fact[] = [];
  if (launched?.value) facts.push(...deliveryFacts(launched.version, launched.value));
  const a = goal.allocation;
  if (a && a.share_7d > 0)
    facts.push({
      kind: "reported",
      short: `${a.share_7d}% agent time`,
      long: `${a.share_7d}% of the workspace's agent time in the last 7 days${a.target_share !== null ? ` (target ${a.target_share}%)` : ""}, from align CLI usage.`,
    });
  if (a && a.share_7d === 0) facts.push({ kind: "unobserved", short: "no agent time", long: "No agent time reported toward it in the last 7 days." });
  return byStrength(facts);
}
