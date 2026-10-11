"use client";
import { useState } from "react";
import type { Measure } from "@/lib/types";
import type { ViewProps } from "./props";
import { currentGoal, priorVersion } from "./select";
import { Badge, Button, Section, fmtTime } from "./ui";

function MeasureList({ measures, compare }: { measures: Measure[]; compare?: Measure[] }) {
  const prior = new Map((compare ?? []).map((m) => [m.id, m.text]));
  return (
    <ul className="space-y-2">
      {measures.map((m) => {
        const isNew = compare && !prior.has(m.id);
        const changed = compare && prior.has(m.id) && prior.get(m.id) !== m.text;
        return (
          <li key={m.id} className={`rounded-lg px-3 py-2 text-[16px] ring-1 ${isNew || changed ? "bg-violet-50 ring-violet-300" : "bg-white ring-zinc-200"}`}>
            <span className="mr-2 font-mono text-[13px] text-zinc-500">{m.id}</span>
            {m.text}
            {isNew && <span className="ml-2"><Badge tone="violet">new</Badge></span>}
            {changed && <span className="ml-2"><Badge tone="violet">changed</Badge></span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Leadership's company goal: current version, the drafted next version, and Ratify & push. */
export function OrgView(props: ViewProps) {
  const { s, me, act } = props;
  const ceo = currentGoal(s, "ceo");
  const prev = priorVersion(s, ceo);
  const draft = s.org_draft;
  const lastPush = s.pushes.at(-1);
  const [objective, setObjective] = useState(draft?.objective ?? "");
  const [busy, setBusy] = useState(false);
  const canPush = me.actor === "leadership" && !!draft;

  async function push() {
    if (!draft) return;
    setBusy(true);
    await act("/api/org/push", { objective: objective.trim() || draft.objective, measures: draft.measures, success_criteria: draft.success_criteria });
    setBusy(false);
  }

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <div>
        <h1 className="font-display text-[30px] font-normal leading-[1.1]">Company goal</h1>
        <p className="text-[16px] text-zinc-600">
          Ratified by Leadership and pushed to every team. Teams inherit it; agents are matched against it.
        </p>
      </div>

      {ceo && (
        <Section title={`Current · ${ceo.version}`} right={<Badge tone="neutral">Ratified {fmtTime(ceo.approved_at)}</Badge>}>
          <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-300">
            <p className="mb-3 text-[19px] font-semibold leading-snug">{ceo.objective}</p>
            <MeasureList measures={ceo.measures} compare={prev?.measures} />
          </div>
        </Section>
      )}

      {draft ? (
        <Section title={`Next version · ${ceo ? `v${Number(ceo.version.replace(/^v/, "")) + 1}` : "v1"}`} right={<Badge tone="violet">Draft</Badge>}>
          <div className="rounded-xl bg-white p-5 ring-1 ring-violet-300">
            <label className="mb-3 block">
              <span className="mb-1 block al-lbl">Objective</span>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={2}
                disabled={me.actor !== "leadership"}
                className="w-full rounded-lg px-3 py-2 text-[18px] font-semibold ring-1 ring-zinc-300"
              />
            </label>
            <div className="mb-1 al-lbl">Key results</div>
            <MeasureList measures={draft.measures} compare={ceo?.measures} />
            <div className="mt-4 flex items-center gap-3">
              {canPush ? (
                <Button onClick={push} disabled={busy}>
                  {busy ? "Pushing…" : "Ratify & push to teams"}
                </Button>
              ) : (
                <span className="text-[15px] text-zinc-500">Only Leadership can ratify and push the company goal.</span>
              )}
              <span className="text-[14px] text-zinc-500">Pushes to Product Director and Alex / Security Lead. The prior version is kept.</span>
            </div>
          </div>
        </Section>
      ) : (
        <p className="rounded-xl bg-zinc-50 px-4 py-3 text-[15px] text-zinc-600 ring-1 ring-zinc-200">No draft in progress.</p>
      )}

      {lastPush && (
        <Section title="Push record">
          <div className="rounded-xl bg-white p-4 text-[16px] ring-1 ring-zinc-200">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Pushed</Badge>
              Company goal {lastPush.version} · CEO / Leadership · {fmtTime(lastPush.pushed_at)}
            </div>
            <div className="mt-2 text-[15px] text-zinc-600">
              Reached: Product Director, Alex / Security Lead. Goal registry {lastPush.registry_version}: agent sessions are re-matched against the new goals.
            </div>
            <div className="mt-3 flex gap-2">
              <Button kind="secondary" onClick={() => props.go("work")}>See where agent work is going</Button>
              <Button kind="ghost" onClick={() => props.go("goals")}>Open line of sight</Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
