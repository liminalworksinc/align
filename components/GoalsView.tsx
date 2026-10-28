"use client";
import { useEffect, useRef, useState } from "react";
import { companyMeasureId, conflictMeasureId, labelsFor, poss, type Labels } from "@/lib/labels";
import { LIMIT_WORDS, limitsFor } from "@/lib/limits";
import type { Goal, StateView } from "@/lib/types";
import { agreementStatus } from "./launch";
import type { ViewProps } from "./props";
import { ProofStrip } from "./ProofStrip";
import { activeProposal, changedToday, currentGoal, priorVersion } from "./select";
import { MissingGoal, depRelation, workFor } from "./TeamLens";
import { Button, STATE_LABEL } from "./ui";
import { Chip, H1, Lbl, NODE, Pill, Row, Seg, nodeState, type PillTone } from "./v6/kit";

// v6 "Goals": the company node, then the two team nodes with the dependency between them. The lens dims what
// doesn't connect to the chosen team; the strip under the tree explains the selected node and offers one next step.

type Lens = "all" | "product" | "security";
type Sel = "ceo" | "product" | "security" | "dep";

/** Where the dependency stands, from state only: agreed, a proposal in flight, or unresolved. */
function depStage(s: StateView): "accepted" | "pending" | "open" {
  if (s.acceptances.length) return "accepted";
  const p = activeProposal(s);
  if (p && p.state !== "RATIFIED") return "pending";
  return "open";
}

function depPill(s: StateView, L: Labels): { tone: PillTone; text: string } {
  const st = depStage(s);
  if (st === "accepted") return { tone: "white", text: L.northstar ? STATE_LABEL.ACCEPTED : agreementStatus(s.acceptances.at(-1)) };
  if (st === "pending") return { tone: "violet", text: STATE_LABEL.PROPOSED };
  return { tone: "amber", text: STATE_LABEL[depRelation(s)?.status ?? "UNKNOWN"] ?? STATE_LABEL.UNKNOWN };
}

/** The limits this goal's owner confirmed, under its measures: what agents read word for word. */
function Limits({ s, g }: { s: StateView; g: Goal }) {
  const ls = limitsFor(s, g);
  if (!ls.length) return null;
  return (
    <ul aria-label="Limits" className="flex flex-col gap-1 text-left">
      {ls.map((l) => (
        <li key={l.id} className="flex items-baseline gap-2 text-[13.5px] text-zinc-700">
          <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.04em] text-zinc-500">{LIMIT_WORDS[l.type]}</span>
          <span className="min-w-0 flex-1">{l.text}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamNode({ props, L, owner, sel, dim, onPick }: { props: ViewProps; L: Labels; owner: "product" | "security"; sel: boolean; dim: boolean; onPick: () => void }) {
  const { s, me } = props;
  const g = currentGoal(s, owner);
  if (!g) return <MissingGoal owner={L.northstar ? owner : L.team[owner]} />;
  const prior = priorVersion(s, g);
  const conflictId = conflictMeasureId(s);
  const open = depStage(s) === "open";
  const work = workFor(s, g).slice(0, 3);
  const updated = owner === "security" && s.acceptances.length > 0;
  return (
    <div className={`relative ${NODE} ${updated ? "border-[var(--al-ink)]" : "border-zinc-200"} ${nodeState(sel, dim)}`}>
      {/* The whole card selects the node: one empty button over it (no list or block content inside a button). */}
      <button
        type="button"
        onClick={onPick}
        aria-pressed={sel}
        aria-label={`${L.team[owner]} goal ${g.version}`}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Lbl>
          {L.team[owner]} · {me.actor === owner ? "you" : "peer"}
        </Lbl>
        <Chip>{prior ? `${prior.version} → ${g.version}` : g.version}</Chip>
      </div>
      <span className="text-[17px] font-semibold leading-[1.3]">{g.objective}</span>
      <ul className="flex flex-col gap-1">
        {g.measures.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-2 text-[13.5px] text-zinc-600">
            <span className="min-w-0 flex-1">{m.text}</span>
            {owner === "security" && m.id === conflictId && open && <Pill tone="amber" small>{L.northstar ? "Clashes with the CEO's new requirement" : "In conflict"}</Pill>}
          </li>
        ))}
      </ul>
      <Limits s={s} g={g} />
      <div className="border-t border-zinc-200 pt-2">
        {work.length ? (
          work.map((w, i) => (
            <Row key={w.id} n={`#${i + 1}`} status={w.observed_status} statusTone={w.observed_status === "not prioritized" ? "amber" : undefined}>
              {w.task}
            </Row>
          ))
        ) : (
          <p className="py-2 text-[14px] text-zinc-500">No work linked to this goal yet.</p>
        )}
      </div>
    </div>
  );
}

function selInfo(props: ViewProps, L: Labels, sel: Sel) {
  const { s, me, go, openDrawer } = props;
  const st = depStage(s);
  const acc = s.acceptances.at(-1);
  const ceo = currentGoal(s, "ceo");
  const kr = ceo?.measures.find((m) => m.id === companyMeasureId(s));
  const sec = currentGoal(s, "security");
  const oldMeasure = sec?.measures.find((m) => m.id === conflictMeasureId(s));
  const pill = depPill(s, L);
  // The one next step per stage. Ways forward is Northstar's brief; custom has no generated options, so it goes to Proposals.
  const forward = L.northstar
    ? { cta: "See ways forward", run: () => openDrawer("brief") }
    : { cta: me.actor === "product" ? "Open proposals" : "See proposals", run: () => go("proposals") };
  const record = L.northstar ? { cta: "Open record", run: () => go("decision") } : { cta: "Open proposals", run: () => go("proposals") };
  const next = st === "accepted" ? record : st === "pending" ? { cta: "Open proposal", run: () => go("proposals") } : forward;

  if (sel === "ceo")
    return {
      tone: (ceo?.changed ? "amber" : "grey") as PillTone,
      text: ceo?.changed ? (changedToday(ceo) ? "changed today" : "changed") : (ceo?.version ?? "—"),
      title: kr?.text ?? ceo?.objective ?? `No current goal has been shared for ${L.team.ceo}.`,
      sub: `Set by ${L.person.ceo}. Read-only for both teams; ${L.team.security} inherits it and ${L.team.product} depends on it.`,
      ...next,
    };
  if (sel === "product") {
    const g = currentGoal(s, "product");
    return {
      tone: "grey" as PillTone,
      text: g?.version ?? "—",
      title: g ? `${L.team.product} owns: ${g.objective}` : `No current goal has been shared for ${L.team.product}.`,
      sub: `Depends on ${L.team.security}: ${depRelation(s)?.label ?? "no dependency recorded"}.`,
      cta: "Open dependency",
      run: undefined,
    };
  }
  if (sel === "security")
    return {
      tone: (st === "accepted" ? "white" : "amber") as PillTone,
      text: st === "accepted" ? `${acc?.accepted_version ?? sec?.version} ${L.northstar ? STATE_LABEL.ACCEPTED.toLowerCase() : ""}`.trim() : "in conflict",
      title: st === "accepted" ? `${poss(L.team.security)} goal ${sec?.version}: ${sec?.objective}` : `${L.team.security} is measured on: ${oldMeasure?.text ?? "not shared"}`,
      sub: st === "accepted" ? `Approved by ${L.person.security}. The earlier version is kept as superseded.` : `That measure doesn't cover what ${L.person.ceo} now requires.`,
      ...(st === "accepted" ? record : next),
    };
  return {
    tone: pill.tone,
    text: pill.text,
    title: depRelation(s)?.label ?? `${L.team.product} depends on ${L.team.security}`,
    sub:
      st === "accepted"
        ? `${depPill(s, L).text}: both owners signed off.`
        : st === "pending"
          ? `A proposal is in progress between ${L.team.product} and ${L.person.security}.`
          : `Work can complete while the goal is still not met: ${poss(L.team.security)} measure hasn't changed.`,
    ...next,
  };
}

export function GoalsView(props: ViewProps) {
  const { s, mark, select } = props;
  const L = labelsFor(s);
  const [lens, setLens] = useState<Lens>("all");
  const [sel, setSel] = useState<Sel>("dep");
  const accepted = s.acceptances.length > 0;
  const sawAccepted = useRef(false);
  useEffect(() => {
    if (accepted && !sawAccepted.current) {
      sawAccepted.current = true;
      mark("saw_accepted_version");
    }
  }, [accepted, mark]);

  const ceo = currentGoal(s, "ceo");
  const rel = depRelation(s);
  const pill = depPill(s, L);
  const st = depStage(s);
  const krId = companyMeasureId(s);
  const dimP = lens === "security";
  const dimS = lens === "product";

  const pick = (next: Sel) => {
    setSel(next);
    if (next === "ceo" && ceo) {
      select({ kind: "goal", id: ceo.id });
      mark("ceo_change_viewed");
    } else if (next === "dep" && rel) select({ kind: "relation", id: rel.id });
    else if (next === "product" || next === "security") {
      const g = currentGoal(s, next);
      if (g) select({ kind: "goal", id: g.id });
    }
  };
  const setLensAndSel = (l: Lens) => {
    setLens(l);
    if (l !== "all") pick(l);
  };

  /** Which team inherits a company measure, for the chip arrow ("KR2 · … → Security"). */
  const inheritor = (mId: string) =>
    (["product", "security"] as const).find((o) => currentGoal(s, o)?.measures.some((m) => m.inherited_from === mId)) ??
    (mId === krId ? "security" : undefined); // the requirement in conflict is, by construction, the owning team's

  const info = selInfo(props, L, sel);
  const line = st === "accepted" ? "border-solid border-zinc-700" : st === "pending" ? "border-dashed border-violet-500" : "border-dashed border-amber-500";
  const depBorder = st === "accepted" ? "border-[var(--al-ink)]" : st === "pending" ? "border-violet-500" : "border-amber-500";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-3">
        <H1 sub="Select a team to see only what connects to it.">Goals</H1>
        <span className="ml-auto">
          <Seg
            label="Lens"
            value={lens}
            onChange={setLensAndSel}
            options={[
              { id: "all", label: "Everything" },
              { id: "product", label: L.team.product },
              { id: "security", label: L.team.security },
            ]}
          />
        </span>
      </div>

      <div className="flex justify-center">
        {ceo ? (
          <button type="button" onClick={() => pick("ceo")} aria-pressed={sel === "ceo"} className={`${NODE} max-w-[720px] border-zinc-200 ${nodeState(sel === "ceo", false)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <Lbl>
                {L.team.ceo} · {L.person.ceo}
              </Lbl>
              <Chip>read-only</Chip>
              <Chip>{ceo.version}</Chip>
              {ceo.changed && (
                <span className="ml-auto">
                  <Pill tone="amber" small>
                    {`${ceo.measures.some((m) => m.id === krId) ? "Requirement changed" : "Changed"}${changedToday(ceo) ? " today" : ""}`}
                  </Pill>
                </span>
              )}
            </div>
            <span className="text-[18px] font-semibold leading-[1.3]">{ceo.objective}</span>
            <Limits s={s} g={ceo} />
            <div className="flex flex-wrap gap-1.5">
              {ceo.measures.map((m) => {
                const to = inheritor(m.id);
                return (
                  <Chip key={m.id} tone={m.id === krId && ceo.changed ? "amber" : undefined}>
                    {L.northstar ? `${m.id} · ` : ""}
                    {m.text}
                    {to ? ` → ${L.team[to]}` : ""}
                  </Chip>
                );
              })}
            </div>
          </button>
        ) : (
          <MissingGoal owner={L.northstar ? "ceo" : L.team.ceo} />
        )}
      </div>

      {/* Connectors: from the company node down to both teams; each leg dims with its team. */}
      <div className="grid h-7 grid-cols-[1fr_200px_1fr]" aria-hidden>
        <div className={`relative transition-opacity ${dimP ? "opacity-30" : ""}`}>
          <div className="absolute left-1/2 right-0 top-0 border-t-2 border-zinc-300" />
          <div className="absolute bottom-0 left-1/2 top-0 border-l-2 border-zinc-300" />
        </div>
        <div className="relative">
          <div className="absolute inset-x-0 top-0 border-t-2 border-zinc-300" />
          <div className="absolute -top-4 left-1/2 h-4 border-l-2 border-zinc-300" />
        </div>
        <div className={`relative transition-opacity ${dimS ? "opacity-30" : ""}`}>
          <div className="absolute left-0 right-1/2 top-0 border-t-2 border-zinc-300" />
          <div className="absolute bottom-0 left-1/2 top-0 border-l-2 border-zinc-300" />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_200px_1fr] items-stretch">
        <TeamNode props={props} L={L} owner="product" sel={sel === "product"} dim={dimP} onPick={() => pick("product")} />
        <div className="relative flex justify-center pt-[18px]">
          <div className={`absolute inset-x-0 top-[46px] border-t-2 ${line}`} aria-hidden />
          {rel ? (
            <button
              type="button"
              onClick={() => pick("dep")}
              aria-pressed={sel === "dep"}
              aria-label={`${L.team.product} depends on ${L.team.security}: ${rel.label}. Status: ${pill.text}`}
              className={`${NODE} relative z-10 h-fit w-[176px] items-center px-3 py-3.5 text-center ${depBorder} ${nodeState(sel === "dep", false)}`}
            >
              <Lbl>
                {L.team.product} → {L.team.security}
              </Lbl>
              <span className="text-[14px] font-semibold leading-[1.3]">{rel.label}</span>
              <Pill tone={pill.tone}>{pill.text}</Pill>
              <span className="text-[12.5px] text-zinc-500">{st === "accepted" ? `goal ${currentGoal(s, "security")?.version ?? ""}` : st === "pending" ? "proposal in progress" : "select to see why"}</span>
            </button>
          ) : (
            <span className="relative z-10 mt-6 bg-[var(--al-bg)] px-2 text-[12.5px] text-zinc-500">No dependency recorded</span>
          )}
        </div>
        <TeamNode props={props} L={L} owner="security" sel={sel === "security"} dim={dimS} onPick={() => pick("security")} />
      </div>

      <div className="al-in flex w-full max-w-[1000px] items-start gap-3.5 self-center rounded-[14px] border border-zinc-200 bg-white px-[18px] py-4" role="status">
        <Pill tone={info.tone}>{info.text}</Pill>
        <div className="min-w-0 flex-1">
          <b className="text-zinc-900">{info.title}</b>
          <div className="text-[14px] text-zinc-500">{info.sub}</div>
        </div>
        <span className="self-center">
          <Button onClick={info.run ?? (() => pick("dep"))}>{info.cta}</Button>
        </span>
      </div>

      {accepted && <ProofStrip s={s} />}
    </div>
  );
}
