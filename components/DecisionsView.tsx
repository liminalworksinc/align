"use client";
import { useState } from "react";
import { customStateLabel, labelsFor, poss } from "@/lib/labels";
import type { ViewProps } from "./props";
import { agreementStatus, recordFacts } from "./launch";
import { STATE_LABEL, fmtTime } from "./ui";
import { Pill, type PillTone } from "./v6/record";

type Filter = "all" | "open" | "accepted";

interface Row {
  key: string;
  kind: "open" | "accepted";
  pill: string;
  tone: PillTone;
  title: string;
  sub: string;
  at: string;
  open: () => void;
}

/**
 * v6 Decisions: every proposal still in play (Open = not ratified, not rejected) and every acceptance, newest first.
 * An accepted row carries the one agreement status (agreementStatus, lib/labels.ts wording), amber while its
 * conditions are open. A row opens the record (accepted) or the proposal (open).
 */
export function DecisionsView(props: ViewProps) {
  const { s } = props;
  const L = labelsFor(s);
  const [filter, setFilter] = useState<Filter>("all");
  const owning = L.team.security;

  const openRows: Row[] = s.proposals
    .filter((p) => !["RATIFIED", "REJECTED"].includes(p.state))
    .map((p) => {
      const latest = p.counter_versions.at(-1);
      return {
        key: `p-${p.id}`,
        kind: "open",
        pill: "Open",
        tone: "violet",
        title: `Change ${poss(owning)} goal`,
        sub: `${customStateLabel(p.state, L) ?? STATE_LABEL[p.state] ?? p.state} · ${latest?.proposed_measure_text ?? p.proposed_measure_text}`,
        at: latest?.at ?? p.created_at,
        open: () => {
          props.select({ kind: "proposal", id: p.id });
          props.go("proposals");
        },
      };
    });

  const accRows: Row[] = s.acceptances.map((a) => {
    const { target, conditions } = recordFacts(s, a);
    const n = conditions ? conditions.split("\n").filter((c) => c.trim()).length : 0;
    return {
      key: `a-${a.proposal_id}-${a.accepted_version}`,
      kind: "accepted",
      // Northstar keeps its own wording; custom states the agreement and leadership's launch call one way.
      pill: L.northstar ? "Agreement reached" : agreementStatus(a),
      tone: n ? "amber" : "white",
      title: `${poss(owning)} goal ${a.accepted_version}`,
      sub: `Approved by ${L.person.security}${n ? ` · ${n} condition${n === 1 ? "" : "s"}` : ""}${target ? ` · ${target}` : ""}`,
      at: a.ratified_at,
      open: () => props.go("decision"),
    };
  });

  const rows = [...openRows, ...accRows]
    .filter((r) => filter === "all" || r.kind === filter)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const seg = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className={`rounded-md px-3 py-1.5 text-[13px] ${filter === f ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex max-w-[880px] flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[30px] font-semibold tracking-[-0.01em] text-zinc-900">Decisions</h1>
        <span role="group" aria-label="Filter decisions" className="ml-auto inline-flex gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {seg("all", "All")}
          {seg("open", "Open")}
          {seg("accepted", "Accepted")}
        </span>
      </div>
      {rows.map((r) => (
        <button
          key={r.key}
          onClick={r.open}
          className="flex w-full items-start gap-3.5 rounded-[14px] border border-zinc-200 bg-white px-[18px] py-4 text-left text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--al-focus)]"
        >
          <Pill tone={r.tone}>{r.pill}</Pill>
          <div className="min-w-0 flex-1">
            <b>{r.title}</b>
            <div className="text-[14px] text-zinc-500">{r.sub}</div>
          </div>
          <span className="font-mono text-[12.5px] text-zinc-600">{fmtTime(r.at)}</span>
        </button>
      ))}
      {rows.length === 0 && <div className="rounded-[14px] border border-dashed border-zinc-200 p-5 text-zinc-500">Nothing here yet.</div>}
    </div>
  );
}
