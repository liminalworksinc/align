import type { ChangeRequest, Goal } from "../types";

// The evidence behind one item (LIM-2472 direction 9b5b870f: judgment is the unit, agent work is its evidence), as facts
// in the evidence classes' words. Pure: EvidenceSummary renders it on Home's rows, the goal lines and the review, and
// design/prototypes/lim-2472/s/evidence-facts.check.mjs runs it on the seeded requests. Each fact says only what Align
// sent, recorded or was told:
//   Receipt         Align recorded it: a launch directive's received receipts, or a goal read that served the version;
//   Agent reported  an agent's own account: evidence links added through a connected app, align CLI usage times;
//   Self-reported   a person's own evidence links;
//   Not observed    only for a launched version's delivery: no session on the goal and no app sent it, or no receipt.
// An absence is never a fact of its own otherwise: no agent time and no links give no chip (no report is not an agent's
// report; no links is a fact about the request, not an observation of work); `hasEvidence` lets a consumer say "No
// evidence attached" in words. Never what an agent did with something, and never "verified": Align doesn't check links.

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
  apps: { everyone: boolean; items: { id: string; name?: string }[] } | null;
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
    out.push({ kind: "receipt", short: `v${version} · ${s.received} of ${s.sessions} received`, long: `Align sent v${version} to ${n(s.sessions, "session")}; ${s.received} sent a receipt for it.` });
  if (s && s.sessions > 0 && s.received === 0)
    out.push({ kind: "unobserved", short: `v${version} · 0 of ${s.sessions} received`, long: `Align sent v${version} to ${n(s.sessions, "session")}; none has sent a receipt yet.` });
  if (apps > 0)
    out.push({
      kind: "receipt",
      short: `v${version} · ${n(apps, "app")}`,
      long: `Align sent v${version} to ${n(apps, "connected app")} when ${apps === 1 ? "it" : "they"} read the goals${d.apps?.everyone ? "" : " (yours; owners see everyone's)"}.`,
    });
  // No directive target (…/value delivery null after a launch, or 0 sessions): no session was on the goal at launch.
  const noSession = !s || s.sessions === 0;
  // A non-owner's apps are their own: an empty list says nothing about anyone else's apps.
  const everyone = !!d.apps?.everyone;
  if (noSession && apps === 0 && !everyone)
    out.push({ kind: "unobserved", short: `v${version} · no session on this goal`, long: `No session was on this goal when v${version} was launched. None of your connected apps has been sent it yet; owners see everyone's.` });
  if (noSession && apps === 0 && everyone)
    out.push({
      kind: "unobserved",
      short: `v${version} · no session or app yet`,
      long: `No session was on this goal when v${version} was launched, and no connected app has been sent it in a goal read since.`,
    });
  if (noSession && apps > 0) out.push({ kind: "unobserved", short: `v${version} · no session on this goal`, long: `No session was on this goal when v${version} was launched.` });
  return out;
}

/**
 * "I launched it. Did it reach them?" (LIM-2472 round 2): one plain statement of a launched version's delivery, from the
 * same …/value read as the facts. Counts only; "received" is the furthest it goes (the CLI's own "applied" would be
 * Agent reported, and isn't said). `d` null: the read failed, and the sentence says so instead of guessing.
 */
export function deliveryStatement(version: number, d: Delivery | null): string {
  if (!d) return `Align couldn't read where v${version} was sent. Reload to try again.`;
  const s = d.delivery;
  const apps = d.apps?.items ?? [];
  const sessions =
    !s || s.sessions === 0
      ? `No session was on this goal when v${version} was launched.`
      : `Align sent v${version} to ${n(s.sessions, "session")}; ${s.received === 0 ? "none has" : s.received === s.sessions ? (s.sessions === 1 ? "it has" : "all have") : `${s.received} ${s.received === 1 ? "has" : "have"}`} sent a receipt${s.received === 0 ? " yet" : ""}.`;
  const named = apps.map((a) => a.name).filter(Boolean) as string[];
  // Anyone but a workspace owner sees only their own apps, so the sentence says whose it is talking about.
  const mine = !d.apps?.everyone;
  const appWords =
    apps.length === 0
      ? `${mine ? "None of your connected apps has" : "No connected app has"} been sent it in a goal read yet.`
      : `${mine ? "Your " : ""}${named.length === apps.length && apps.length <= 2 ? named.join(" and ") : n(apps.length, "connected app")} ${apps.length === 1 ? "was" : "were"} sent it when ${apps.length === 1 ? "it" : "they"} read the goals.`;
  return `${sessions} ${appWords}`;
}

/** One wording for a read this page couldn't load: never "not read", which on a page about apps reading the goals can be
 *  heard as the apps not reading. */
export const NOT_LOADED = "Couldn't load this just now. Reload to try again.";

/**
 * Work's "Align sent it to" row for a launched version (the …/value read's apps), in four cases: still loading (null:
 * say nothing yet, never "No app yet" before the read answers), the read failed (NOT_LOADED), no app was sent it, and
 * the apps it was sent to. `everyone`: a workspace owner sees every app, anyone else their own.
 */
export function sentToLine(s: { loading: boolean; failed: boolean; apps: { everyone: boolean; items: { id: string }[] } | null }): string | null {
  if (s.loading) return null;
  if (s.failed) return NOT_LOADED;
  const n = s.apps?.items.length ?? 0;
  if (!n) return s.apps?.everyone ? "No app yet. Align sends it when a connected app next reads the goals." : "None of your apps yet (owners see everyone's). Align sends it when a connected app next reads the goals.";
  return `${n} connected ${n === 1 ? "app" : "apps"}${s.apps?.everyone ? "" : " (yours; owners see everyone's)"}`;
}

/** Whether the request's current revision has any evidence link: a consumer says "No evidence attached" in words when
 *  it doesn't, never as an evidence chip. */
export function hasEvidence(cr: Pick<ChangeRequest, "revision" | "revisions">): boolean {
  return (cr.revisions.find((r) => r.revision === cr.revision)?.evidence.length ?? 0) > 0;
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
  return byStrength(facts);
}

/**
 * A goal's evidence: its newest launched version's delivery (`launched`: the version and its …/value read; null when
 * nothing is launched, undefined when not read) and its share of the workspace's agent time over 7 days (align CLI
 * usage, so agent reported; the goals feed carries it for active goals only). No agent time gives no fact. `quiet` is
 * kept for callers that pass it and changes nothing now: no fact of pure absence is ever produced for a goal.
 */
export function goalFacts(goal: GoalInput, launched?: { version: number; value: Delivery | null } | null, opts: { quiet?: boolean } = {}): Fact[] {
  const facts: Fact[] = [];
  if (launched?.value) facts.push(...deliveryFacts(launched.version, launched.value));
  const a = goal.allocation;
  if (a && a.share_7d > 0)
    facts.push({
      kind: "reported",
      short: `${a.share_7d}% of reported agent time, 7 days`,
      long: `${a.share_7d}% of the workspace's reported agent time in the last 7 days${a.target_share !== null ? ` (target ${a.target_share}%)` : ""}, from align CLI usage.`,
    });
  void opts;
  return byStrength(facts);
}
