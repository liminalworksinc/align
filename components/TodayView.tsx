"use client";
import type { ReactNode } from "react";
import type { ViewProps } from "./props";
import { currentGoal, priorVersion } from "./select";
import { Badge, Button, Mono, OWNER_LABEL, Section, fmtDuration, fmtTime } from "./ui";

function Item({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="min-w-0 flex-1 text-[16px] text-zinc-900">{children}</div>
      {action}
    </li>
  );
}

export function TodayView(props: ViewProps) {
  const { s, me } = props;
  const actor = me.actor ?? "product";
  const t = s.timer;
  const ceo = currentGoal(s, "ceo");
  const prevCeo = priorVersion(s, ceo);
  const kr2 = ceo?.measures.find((m) => m.id === "KR2");
  const latestAcc = s.acceptances.at(-1) ?? null;

  const openProposal = (id: string) => {
    props.select({ kind: "proposal", id });
    props.go("proposals");
  };

  const items: ReactNode[] = [];
  if (actor === "product") {
    if (!t.started_at) {
      items.push(
        <Item key="ceo" action={<Button onClick={() => props.go("goals")}>Review CEO change</Button>}>
          <Badge tone="amber">Unreviewed</Badge> The CEO changed the company goal ({ceo?.version ?? "v2"}). Review how it affects your goals.
        </Item>,
      );
    }
    for (const p of s.proposals.filter((x) => x.state === "COUNTERED")) {
      items.push(
        <Item key={p.id} action={<Button onClick={() => openProposal(p.id)}>Review counter</Button>}>
          <Badge tone="amber">Security countered</Badge> {OWNER_LABEL.security} revised your proposal ({p.counter_versions.at(-1)?.version}). Your
          acknowledgment is needed.
        </Item>,
      );
    }
    if (t.started_at && !s.proposals.some((p) => p.state !== "REJECTED")) {
      items.push(
        <Item key="compose" action={<Button kind="secondary" onClick={() => props.go("proposals")}>Propose a change</Button>}>
          No proposal sent yet to {OWNER_LABEL.security}.
        </Item>,
      );
    }
  } else {
    for (const p of s.proposals.filter((x) => x.state === "PENDING_SECURITY" || x.state === "ACKNOWLEDGED_BY_PRODUCT")) {
      items.push(
        <Item key={p.id} action={<Button onClick={() => openProposal(p.id)}>Decide</Button>}>
          <Badge tone="amber">{p.state === "PENDING_SECURITY" ? "Pending your decision" : "Product acknowledged"}</Badge> Proposal to change your
          Security goal {p.target_goal_version} from {OWNER_LABEL[p.proposing_owner]}.
        </Item>,
      );
    }
  }
  if (latestAcc && !t.acked_by.includes(actor)) {
    items.push(
      <Item key="acc" action={<Button kind="secondary" onClick={() => openProposal(latestAcc.proposal_id)}>See accepted version</Button>}>
        <Badge tone="neutral">Accepted</Badge> Security goal {latestAcc.accepted_version} was ratified at {fmtTime(latestAcc.ratified_at)}.
      </Item>,
    );
  }

  const timerText = !t.started_at
    ? "Not started"
    : t.ended_at
      ? `Finished in ${fmtDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime())}`
      : `Running since ${fmtTime(t.started_at)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-[28px] font-bold text-zinc-900">Good to see you, {OWNER_LABEL[actor]}</h1>
        <p className="text-[16px] text-zinc-600">
          {s.company} · {s.timeframe}
        </p>
      </header>

      <Section title="What needs you">
        {items.length ? (
          <ul className="space-y-3">{items}</ul>
        ) : (
          <p className="rounded-xl bg-zinc-50 p-4 text-[16px] text-zinc-600 ring-1 ring-zinc-200">Nothing needs your decision right now.</p>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="What changed today">
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <div className="flex flex-wrap items-center gap-2 text-[15px] text-zinc-600">
              CEO goal {prevCeo ? `${prevCeo.version} → ` : ""}
              {ceo?.version ?? "v2"} {ceo?.changed && <Badge tone="amber">changed today</Badge>}
            </div>
            <p className="mt-1 text-[16px] font-semibold text-zinc-900">{ceo?.objective}</p>
            {kr2 && (
              <p className="mt-2 text-[16px] text-zinc-800">
                <Mono>KR2</Mono> {kr2.text}
              </p>
            )}
            <div className="mt-3">
              <Button kind="secondary" onClick={() => props.go("goals")}>
                Open Goals
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Alignment timer">
          <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-bold text-zinc-900">{timerText}</span>
              {t.started_at && !t.ended_at && <Badge tone="amber">running</Badge>}
            </div>
            <p className="mt-1 text-[15px] text-zinc-600">
              Measured from CEO change viewed to accepted version seen in both sessions · {t.touchpoints.length} touchpoint
              {t.touchpoints.length === 1 ? "" : "s"} recorded
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
