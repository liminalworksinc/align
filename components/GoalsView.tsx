"use client";
import { useEffect, useRef, useState } from "react";
import type { Goal, Measure } from "@/lib/types";
import type { ViewProps } from "./props";
import { ProofStrip } from "./ProofStrip";
import { comparablePair, currentGoal } from "./select";
import { EditTag, MissingGoal, RING, TeamLens, VersionTag, depRelation, isSel, workFor } from "./TeamLens";
import { Badge, Button, STATE_LABEL, StateBadge } from "./ui";

type Lens = "company" | "team" | "me";
const LENS_LABEL: Record<Lens, string> = { company: "Company", team: "Teams", me: "My goal" };
const LINE = "border-zinc-300";

function MeasureRow({ m, changed, conflict }: { m: Measure; changed?: boolean; conflict?: boolean }) {
  return (
    <li className={`rounded-md px-2.5 py-1 text-[15px] ${changed ? "bg-amber-50 ring-1 ring-amber-300" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="flex-1 text-zinc-900">{m.text}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
        {changed && <Badge tone="amber">Changed today</Badge>}
        {conflict && <Badge tone="amber">Clashes with the CEO&apos;s new requirement</Badge>}
        {m.inherited_from && <Badge tone="neutral" icon={false}>From the CEO&apos;s goal</Badge>}
        {m.verifiable_by === "sparta" && <span className="text-[13px] text-zinc-500">Can be checked in a practice test</span>}
      </div>
    </li>
  );
}

function CeoCard({ props, g, only }: { props: ViewProps; g: Goal; only?: string }) {
  const onClick = () => {
    props.select({ kind: "goal", id: g.id });
    props.mark("ceo_change_viewed");
  };
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl bg-white px-5 py-4 text-left ring-1 ring-zinc-300 hover:ring-zinc-400 ${isSel(props.selection, "goal", g.id) ? RING : ""}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-bold text-zinc-600">{g.owner_name}</span>
        <Badge tone="neutral">Set by CEO · view only</Badge>
        <Badge tone="neutral" icon={false}>{g.version}</Badge>
      </div>
      <p className="mb-2 text-[19px] font-semibold leading-snug text-zinc-900">{g.objective}</p>
      <ul className="space-y-0.5">
        {g.measures
          .filter((m) => !only || m.id === only)
          .map((m) => (
            <MeasureRow key={m.id} m={m} changed={m.id === "KR2" && g.changed} />
          ))}
      </ul>
    </button>
  );
}

function TeamCard({ props, owner, allWork }: { props: ViewProps; owner: "product" | "security"; allWork?: boolean }) {
  const { s, me, selection, select } = props;
  const g = currentGoal(s, owner);
  if (!g) return <MissingGoal owner={owner} />;
  const unresolved = depRelation(s)?.status === "UNKNOWN";
  const work = workFor(s, g).slice(0, allWork ? undefined : 3);
  return (
    <article className={`flex h-full flex-col rounded-xl bg-white ring-1 ring-zinc-300 ${isSel(selection, "goal", g.id) ? RING : ""}`}>
      <button onClick={() => select({ kind: "goal", id: g.id })} className="flex flex-1 flex-col justify-start rounded-t-xl p-4 text-left hover:bg-zinc-50">
        <div className="mb-1 text-[16px] font-bold text-zinc-900">{g.owner_name}</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <VersionTag s={s} g={g} />
          <EditTag g={g} me={me} />
        </div>
        <p className="mb-3 text-[17px] font-semibold leading-snug text-zinc-900">{g.objective}</p>
        <ul className="space-y-1">
          {g.measures.map((m) => (
            <MeasureRow key={m.id} m={m} conflict={m.id === "S-M1" && unresolved} />
          ))}
        </ul>
      </button>
      <div className="border-t border-zinc-200 p-3">
        <div className="mb-1 px-1 al-lbl">Work in priority order</div>
        {work.length ? (
          <ol className="space-y-1">
            {work.map((w, i) => (
              <li key={w.id}>
                <button
                  onClick={() => select({ kind: "work", id: w.id })}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[15px] hover:bg-zinc-50 ${isSel(selection, "work", w.id) ? RING : ""}`}
                >
                  <span className="font-mono text-[13px] text-zinc-500">#{i + 1}</span>
                  <span className="flex-1 text-zinc-900">{w.task}</span>
                  <span className="shrink-0 text-[13px] text-zinc-500">{w.observed_status}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-1 text-[15px] text-zinc-500">No work linked to this goal yet.</p>
        )}
      </div>
    </article>
  );
}

function DependencyButton({ props }: { props: ViewProps }) {
  const rel = depRelation(props.s);
  if (!rel) return <div className={`w-full border-t-2 border-dashed ${LINE}`} aria-hidden />;
  const open = rel.status === "UNKNOWN";
  return (
    <>
      <div className={`absolute inset-x-0 top-[3.25rem] border-t-2 ${open ? "border-dashed border-amber-400" : LINE}`} aria-hidden />
      <button
        onClick={() => props.select({ kind: "relation", id: rel.id })}
        aria-label={`Product needs Security: ${rel.label}. Status: ${STATE_LABEL[rel.status] ?? rel.status}`}
        className={`relative z-10 mx-2 flex flex-col items-center gap-1.5 rounded-lg px-2.5 py-2 text-center ${open ? "ring-1 ring-amber-300 [background:linear-gradient(var(--al-warn-bg),var(--al-warn-bg)),var(--al-surface)]" : "bg-white ring-1 ring-zinc-300"} hover:brightness-125 ${isSel(props.selection, "relation", rel.id) ? RING : ""}`}
      >
        <span className="al-lbl">Product needs Security</span>
        <span className="text-[14px] font-semibold leading-snug text-zinc-900">{rel.label}</span>
        {rel.status === "ACCEPTED" ? <Badge tone="neutral">Agreed by Security</Badge> : <StateBadge state={rel.status} />}
      </button>
    </>
  );
}

function Leg({ side, label }: { side: "left" | "right"; label: string }) {
  return (
    <div className="relative">
      <div className={`absolute top-5 border-t-2 ${LINE} ${side === "left" ? "left-1/2 right-0" : "left-0 right-1/2"}`} />
      <div className={`absolute bottom-0 left-1/2 top-5 border-l-2 ${LINE}`} />
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 text-[11px] leading-none text-zinc-400">▼</span>
      <span className="absolute left-1/2 top-6 ml-2 text-[13px] font-medium text-zinc-500">{label}</span>
    </div>
  );
}

/** Elbow connectors from the CEO card to both team cards, aligned to the team-row grid. */
function InheritConnectors({ props }: { props: ViewProps }) {
  const label = (id: string) => props.s.relations.find((r) => r.id === id)?.label ?? "follows";
  return (
    <div className="relative grid h-12 grid-cols-[1fr_184px_1fr]" aria-hidden>
      <div className={`absolute left-1/2 top-0 h-5 border-l-2 ${LINE}`} />
      <Leg side="left" label={label("r-ceo-product")} />
      <div className="relative">
        <div className={`absolute inset-x-0 top-5 border-t-2 ${LINE}`} />
      </div>
      <Leg side="right" label={label("r-ceo-security")} />
    </div>
  );
}

function Banner({ props }: { props: ViewProps }) {
  const { s } = props;
  const acc = s.acceptances.at(-1);
  if (acc)
    return (
      <div className="al-in flex items-center gap-3.5 rounded-xl border border-zinc-300 bg-white px-[18px] py-3 text-[17px] text-zinc-900">
        <Badge tone="neutral">Approved</Badge>
        <span>Agreement reached: Security approved its updated goal ({acc.accepted_version}), and Product accepted Security&apos;s changes.</span>
      </div>
    );
  if (depRelation(s)?.status !== "UNKNOWN") return null;
  const oldMeasure = currentGoal(s, "security")?.measures.find((m) => m.id === "S-M1");
  const kr2 = currentGoal(s, "ceo")?.measures.find((m) => m.id === "KR2");
  const { baseline } = comparablePair(s);
  const passed = baseline?.checks.filter((c) => c.passed).length ?? 0;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3.5 rounded-xl border border-zinc-200 bg-zinc-50 px-[18px] py-3" role="status">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="al-lbl">What Security&apos;s AI agents aim for now</span>
        <span className="text-[17px] text-zinc-900">{oldMeasure?.text ?? "Unknown: Security hasn't shared its target"}</span>
        {baseline && (
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-zinc-500">
            <StateBadge state={baseline.verdict} />
            Current plan: oldest tickets first · {passed} of {baseline.checks.length} independent checks passed in the practice test (Sparta sandbox)
          </span>
        )}
      </div>
      <span aria-label="does not match" className="font-mono text-[20px] text-zinc-500">
        ≠
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="al-lbl !text-amber-700">{s.pushes.at(-1) ? `Company goal ${s.pushes.at(-1)!.version}` : "The CEO"} now requires</span>
        <span className="line-clamp-2 text-[17px] text-zinc-900" title={kr2?.text}>
          {kr2?.text ?? "Unknown"}
        </span>
      </div>
      <Button
        kind="secondary"
        onClick={() => {
          const ceo = currentGoal(s, "ceo");
          if (ceo) props.select({ kind: "goal", id: ceo.id });
          props.mark("ceo_change_viewed");
        }}
      >
        Show impact
      </Button>
    </div>
  );
}

function Ladder({ props }: { props: ViewProps }) {
  const ceo = currentGoal(props.s, "ceo");
  return (
    <div>
      <div className="mx-auto max-w-[560px]">{ceo ? <CeoCard props={props} g={ceo} /> : <MissingGoal owner="ceo" />}</div>
      <InheritConnectors props={props} />
      <div className="grid grid-cols-[1fr_184px_1fr] items-stretch">
        <TeamCard props={props} owner="product" />
        <div className="relative flex items-start justify-center pt-5">
          <DependencyButton props={props} />
        </div>
        <TeamCard props={props} owner="security" />
      </div>
    </div>
  );
}

function MeLens({ props }: { props: ViewProps }) {
  const actor = props.me.actor;
  const ceo = currentGoal(props.s, "ceo");
  if (!actor) return <MissingGoal owner="you" />;
  if (actor === "leadership")
    return <div className="mx-auto max-w-[620px]">{ceo ? <CeoCard props={props} g={ceo} /> : <MissingGoal owner="ceo" />}</div>;
  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-3">
      <div className="al-lbl">The CEO&apos;s new requirement your goal depends on</div>
      {ceo ? <CeoCard props={props} g={ceo} only={ceo.measures.some((m) => m.id === "KR2") ? "KR2" : undefined} /> : <MissingGoal owner="ceo" />}
      <div className="flex justify-center" aria-hidden>
        <div className={`h-8 border-l-2 ${LINE}`} />
      </div>
      <TeamCard props={props} owner={actor} allWork />
    </div>
  );
}

export function GoalsView(props: ViewProps) {
  const [lens, setLens] = useState<Lens>("company");
  const accepted = props.s.acceptances.length > 0;
  const { mark } = props;
  const sawAccepted = useRef(false);
  useEffect(() => {
    if (accepted && !sawAccepted.current) {
      sawAccepted.current = true;
      mark("saw_accepted_version");
    }
  }, [accepted, mark]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[36px] font-normal leading-[1.1]">How the goals connect</h1>
        <div role="group" aria-label="Choose a view" className="inline-flex gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {(["company", "team", "me"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLens(l)}
              aria-pressed={lens === l}
              className={`min-h-9 rounded-md px-3.5 text-[14px] capitalize transition ${lens === l ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}
            >
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>
      </div>

      <Banner props={props} />

      {lens === "company" && <Ladder props={props} />}
      {lens === "team" && <TeamLens {...props} embedded />}
      {lens === "me" && <MeLens props={props} />}

      {accepted && <ProofStrip s={props.s} />}
    </div>
  );
}
