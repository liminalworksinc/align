"use client";
import type { ReactNode } from "react";
import { agreementStatus, launchState, recordFacts } from "@/components/launch";
import type { View, ViewProps } from "@/components/props";
import { accepted, currentGoal } from "@/components/select";
import { Badge, STATE_LABEL, type Tone } from "@/components/ui";
import { companyMeasureId, dependencyId, labelsFor, poss, type Labels } from "@/lib/labels";
import type { Actor, Proposal, StateView } from "@/lib/types";

// v6 "Your turn": the landing view for every role, built from state only. Waiting on you = proposals whose next action
// is the signed-in actor's (the same rules the server enforces in lib/flow.ts), each quoting the exact measure text with
// one CTA to the review view. Then what waits on others, and what changed today. No hand-off control: nothing on the
// server records a hand-off.

const OPEN = (p: Proposal) => !["RATIFIED", "REJECTED"].includes(p.state);

/** Who acts next on an open proposal, as lib/flow.ts allows it. DRAFT has no next actor. */
export function nextActor(p: Proposal): Actor | null {
  if (p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT") return p.recipient_owner;
  if (p.state === "COUNTERED") return p.proposing_owner;
  return null;
}

/** The measure text the next actor is deciding on: the proposal's, or the owning team's latest changes. */
function quotedText(p: Proposal) {
  if (p.state === "PENDING_SECURITY") return p.proposed_measure_text;
  return p.counter_versions.at(-1)?.proposed_measure_text ?? p.proposed_measure_text;
}

const avatar = (team: string) => {
  const w = team.split(/[\s/]+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return (w[0] ?? "").slice(0, 2).toUpperCase();
};

interface Item {
  key: string;
  team: string; // avatar source
  me?: boolean;
  title: ReactNode;
  quote?: string;
  sub?: ReactNode;
  cta: string;
  open: () => void;
}

/** Waiting-on-you sentence per state, from the viewer's side. */
function mineTitle(p: Proposal, L: Labels) {
  if (p.state === "PENDING_SECURITY") return `${L.person[p.proposing_owner]} asks to change your goal`;
  if (p.state === "COUNTERED") return `${L.person[p.recipient_owner]} asked for changes to your proposal`;
  return `${L.person[p.proposing_owner]} accepted your changes. Your final approval is next`;
}
function mineCta(p: Proposal) {
  if (p.state === "PENDING_SECURITY") return "Review the proposal";
  if (p.state === "COUNTERED") return "Review the changes";
  return "Review and approve";
}
function othersTitle(p: Proposal, who: Actor, L: Labels) {
  if (p.state === "PENDING_SECURITY") return `${L.person[who]} reviews the proposal`;
  if (p.state === "COUNTERED") return `${L.person[who]} reviews ${poss(L.team.security)} changes`;
  return `${L.person[who]} gives the final approval`;
}

function Card({ it, hot }: { it: Item; hot?: boolean }) {
  return (
    <button
      type="button"
      onClick={it.open}
      className={`flex w-full items-start gap-3.5 rounded-[14px] border bg-white px-[18px] py-4 text-left transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 ${hot ? "border-violet-700" : "border-zinc-200"}`}
    >
      <span
        aria-hidden
        className={`grid size-[34px] shrink-0 place-items-center rounded-full border text-[12px] font-bold ${it.me ? "border-violet-700 bg-violet-50 text-violet-700" : "border-zinc-300 bg-zinc-100 text-zinc-700"}`}
      >
        {avatar(it.team)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[16px] font-semibold leading-snug text-zinc-900">{it.title}</span>
        {it.quote && <span className="text-[15px] leading-snug text-zinc-700">“{it.quote}”</span>}
        {it.sub && <span className="text-[14px] leading-snug text-zinc-500">{it.sub}</span>}
      </span>
      <span
        className={`inline-flex min-h-[34px] shrink-0 items-center self-center rounded-[10px] border px-3 text-[14px] font-semibold ${hot ? "border-transparent bg-violet-700 text-black" : "border-zinc-300 text-zinc-900"}`}
      >
        {it.cta}
      </span>
    </button>
  );
}

/** What waits on the signed-in actor. Exported so the shell's nav badge counts the same list. */
export function waitingOnMe(s: StateView, actor: Actor, open: (v: View, p?: Proposal) => void): Item[] {
  const L = labelsFor(s);
  const items: Item[] = [];
  for (const p of [...s.proposals].reverse()) {
    if (!OPEN(p) || nextActor(p) !== actor) continue;
    items.push({
      key: p.id,
      team: L.role[actor],
      me: true,
      title: mineTitle(p, L),
      quote: quotedText(p),
      sub: `${poss(L.team.security)} goal ${p.target_goal_version}`,
      cta: mineCta(p),
      open: () => open("proposals", p),
    });
  }
  // The asking team can propose once the company requirement is unresolved and nothing is open (createProposal).
  const rel = s.relations.find((r) => r.id === dependencyId(s));
  if (actor === "product" && rel?.status === "UNKNOWN" && !s.proposals.some(OPEN)) {
    const kr = currentGoal(s, "ceo")?.measures.find((m) => m.id === companyMeasureId(s));
    items.push({
      key: "propose",
      team: L.role.product,
      me: true,
      title: `The new company requirement needs ${L.team.security} to change its goal`,
      quote: kr?.text,
      sub: `${L.team.product} and ${L.team.security} haven’t agreed yet`,
      cta: "Propose a change",
      open: () => open("proposals"),
    });
  }
  // Northstar: the next company goal waits on leadership to approve and send it. Same rule as OrgView's button
  // (canPush: leadership, and a draft exists); the card opens that screen.
  if (actor === "leadership" && L.northstar && s.org_draft) {
    items.push({
      key: "push",
      team: L.role.leadership,
      me: true,
      title: "The next company goal is ready. Approve it and send it to every team",
      quote: s.org_draft.objective,
      sub: `Then ${L.team.product} and ${L.team.security} see what changed for their goals`,
      cta: "Review and send",
      open: () => open("company"),
    });
  }
  // Custom: leadership decides the launch once the teams agree (lib/flow.ts launch decision, custom only).
  const acc = accepted(s);
  if (actor === "leadership" && !L.northstar && acc && !acc.launch_decision) {
    items.push({
      key: "launch",
      team: L.role.leadership,
      me: true,
      title: `${L.team.product} and ${L.team.security} agreed. The launch decision is yours`,
      quote: recordFacts(s, acc).target || undefined,
      sub: agreementStatus(acc),
      cta: "Decide the launch",
      open: () => open("company"),
    });
  }
  return items;
}

export function YourTurnView(props: ViewProps) {
  const { s, me, go, select, mark } = props;
  const L = labelsFor(s);
  const actor = me.actor as Actor;
  // The server allows one open proposal, and ProposalsView opens it (activeProposal) when nothing else is selected,
  // so a card only re-points a selection left on a different proposal. Other selections (the rail's dependency
  // details by default) stay as they are.
  const open = (v: View, p?: Proposal) => {
    if (p && props.selection?.kind === "proposal" && props.selection.id !== p.id) select({ kind: "proposal", id: p.id });
    go(v);
  };
  const mine = waitingOnMe(s, actor, open);

  const others: Item[] = [];
  for (const p of [...s.proposals].reverse()) {
    const who = nextActor(p);
    if (!OPEN(p) || !who || who === actor) continue;
    others.push({
      key: p.id,
      team: L.role[who],
      title: othersTitle(p, who, L),
      quote: quotedText(p),
      sub: `${poss(L.team.security)} goal ${p.target_goal_version}`,
      cta: "Open",
      open: () => open("proposals", p),
    });
  }
  const acc = accepted(s);
  if (acc && !L.northstar && !acc.launch_decision && actor !== "leadership") {
    others.push({
      key: "launch",
      team: L.role.leadership,
      title: `${L.person.leadership} decides the launch`,
      sub: agreementStatus(acc),
      cta: "Open",
      open: () => go("decision"),
    });
  }

  const ceo = currentGoal(s, "ceo");
  const kr = ceo?.measures.find((m) => m.id === companyMeasureId(s));
  const rel = s.relations.find((r) => r.id === dependencyId(s));
  const depStatus: { text: string; tone: Tone } | null = !rel
    ? null
    : rel.status === "ACCEPTED"
      ? { text: L.northstar ? STATE_LABEL.ACCEPTED : agreementStatus(acc), tone: "neutral" }
      : rel.status === "UNKNOWN"
        ? { text: "Not agreed yet", tone: "amber" }
        : { text: "Proposal in progress", tone: "violet" };
  const decided = acc ? recordFacts(s, acc) : null;

  return (
    <div className="flex max-w-[880px] flex-col gap-[22px]">
      <div>
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">Your turn</h1>
        <p className="mt-1.5 text-[16px] text-zinc-500">
          {mine.length ? `${mine.length} thing${mine.length === 1 ? "" : "s"} waiting on you.` : "Nothing waiting on you."}
        </p>
      </div>

      <section aria-label="Waiting on you" className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="al-lbl">Waiting on you</h2>
          <span className={`grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-[12px] font-bold ${mine.length ? "bg-violet-700 text-black" : "bg-zinc-100 text-zinc-900"}`}>
            {mine.length}
          </span>
        </div>
        {mine.map((it) => (
          <Card key={it.key} it={it} hot />
        ))}
        {mine.length === 0 && <div className="rounded-[14px] border border-dashed border-zinc-300 p-5 text-[15px] text-zinc-500">Nothing is waiting on you.</div>}
      </section>

      {others.length > 0 && (
        <section aria-label="Waiting on others" className="flex flex-col gap-2.5">
          <h2 className="al-lbl">Waiting on others</h2>
          {others.map((it) => (
            <Card key={it.key} it={it} />
          ))}
        </section>
      )}

      {(kr || (acc && decided)) && (
        <section aria-label="Changed today" className="flex flex-col gap-2.5">
          <h2 className="al-lbl">Changed today</h2>
          {kr && (
            <div className="flex items-start gap-3.5 rounded-[14px] border border-zinc-200 bg-white px-[18px] py-4">
              <Badge tone="amber" icon={false}>
                {L.northstar ? "CEO" : L.team.ceo}
              </Badge>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[16px] font-semibold leading-snug text-zinc-900">{kr.text}</span>
                <span className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-500">
                  Affects {poss(L.team.security)} goal and what {L.team.product} needs from {L.team.security}
                  {depStatus && <Badge tone={depStatus.tone}>{depStatus.text}</Badge>}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  mark("ceo_change_viewed");
                  if (ceo) select({ kind: "goal", id: ceo.id });
                  go("goals");
                }}
                className="inline-flex min-h-[34px] shrink-0 items-center self-center rounded-[10px] px-3 text-[14px] font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
              >
                See goals
              </button>
            </div>
          )}
          {acc && decided && (
            <Card
              it={{
                key: "decided",
                team: L.role.security,
                title: `${L.team.product} and ${L.team.security} agreed on ${poss(L.team.security)} goal ${acc.accepted_version}`,
                quote: decided.target || undefined,
                sub: (
                  <Badge tone={L.northstar || launchState(acc) === "approved" ? "neutral" : "amber"}>
                    {L.northstar ? STATE_LABEL.ACCEPTED : agreementStatus(acc)}
                  </Badge>
                ),
                cta: "See the decision",
                open: () => go("decision"),
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
