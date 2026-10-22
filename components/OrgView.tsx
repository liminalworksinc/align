"use client";
import Link from "next/link";
import { useState } from "react";
import { labelsFor, poss } from "@/lib/labels";
import type { Acceptance, Measure } from "@/lib/types";
import { launchLine, recordFacts } from "./launch";
import type { ViewProps } from "./props";
import { accepted, currentGoal, priorVersion } from "./select";
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
            {m.text}
            {isNew && <span className="ml-2"><Badge tone="violet">New</Badge></span>}
            {changed && <span className="ml-2"><Badge tone="violet">Changed</Badge></span>}
          </li>
        );
      })}
    </ul>
  );
}

const MAX_NOTE = 500;

/** Custom only: the teams' decision record, read-only, and leadership's launch decision on it. */
function LaunchRecord({ props, acc }: { props: ViewProps; acc: Acceptance }) {
  const { s, me, act } = props;
  const L = labelsFor(s);
  const { target, conditions } = recordFacts(s, acc);
  const d = acc.launch_decision;
  const [note, setNote] = useState(d?.note ?? "");
  const [busy, setBusy] = useState(false);
  const canDecide = me.actor === "leadership";

  async function decide(decision: "approved" | "not_yet") {
    setBusy(true);
    await act(`/api/proposals/${acc.proposal_id}/launch`, { decision, note: note.trim() });
    setBusy(false);
  }

  return (
    <>
      <Section title="Decision record" right={<Badge tone="neutral">Agreement reached</Badge>}>
        <div className="flex flex-col gap-3 rounded-xl bg-white p-5 ring-1 ring-zinc-300">
          <p style={{ fontSize: 17 }} className="text-zinc-700">
            {L.team.product} and {L.team.security} agreed. {poss(L.team.security)} updated goal ({acc.accepted_version}) is now the shared plan.
          </p>
          <div>
            <div className="mb-1 al-lbl">Approved target</div>
            <p className="text-[18px] font-semibold leading-snug">{target}</p>
          </div>
          {conditions && (
            <section aria-label="Conditions" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <h2 className="al-lbl !text-amber-700">Conditions</h2>
              <p className="mt-1 whitespace-pre-wrap text-[16px] text-zinc-900">{conditions}</p>
            </section>
          )}
          <ul aria-label="What this record shows" className="flex flex-col gap-1.5 text-[17px] text-zinc-900">
            <li>
              <span className="font-semibold">Decision:</span> recorded
            </li>
            <li>
              <span className="font-semibold">Work done:</span> not verified yet
            </li>
            <li>
              <span className="font-semibold">Outcome:</span> not measured yet
            </li>
            {conditions && (
              <li>
                <span className="font-semibold">Conditions:</span> not confirmed yet
              </li>
            )}
          </ul>
          <p className="text-[16px] font-semibold text-zinc-900">{launchLine(acc, L)}</p>
          {d?.note && <p className="whitespace-pre-wrap text-[15px] text-zinc-600">Note: {d.note}</p>}
          {d && <p className="text-[14px] text-zinc-500">Decided {fmtTime(d.at)}.</p>}
        </div>
      </Section>
      {canDecide && (
        <Section title={d ? "Change the launch decision" : "Launch decision"}>
          <div className="flex flex-col gap-3 rounded-xl bg-white p-5 ring-1 ring-violet-300">
            <p style={{ fontSize: 16 }} className="text-zinc-700">
              The teams agreed on the plan. Only you decide whether it launches. Both teams see your decision on their record.
            </p>
            <label className="block">
              <span className="mb-1 block al-lbl">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_NOTE}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-[16px] ring-1 ring-zinc-300"
              />
              <span className="text-[13px] text-zinc-500">
                {note.length}/{MAX_NOTE}
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => decide("approved")} disabled={busy}>
                Approve launch
              </Button>
              <Button kind="secondary" onClick={() => decide("not_yet")} disabled={busy}>
                Not yet
              </Button>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

/** Leadership's company goal: current version, the drafted next version, and Approve and send. */
export function OrgView(props: ViewProps) {
  const { s, me, act } = props;
  const ceo = currentGoal(s, "ceo");
  const prev = priorVersion(s, ceo);
  const draft = s.org_draft;
  const lastPush = s.pushes.at(-1);
  const [objective, setObjective] = useState(draft?.objective ?? "");
  const [busy, setBusy] = useState(false);
  const canPush = me.actor === "leadership" && !!draft;
  const L = labelsFor(s);
  const teamGoals = (["product", "security"] as const).map((slot) => ({ slot, goal: currentGoal(s, slot) }));
  const acc = L.northstar ? null : accepted(s);

  async function push() {
    if (!draft) return;
    setBusy(true);
    await act("/api/org/push", { objective: objective.trim() || draft.objective, measures: draft.measures, success_criteria: draft.success_criteria });
    setBusy(false);
  }

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">Company goal</h1>
        {L.northstar ? (
          <p className="text-[16px] text-zinc-600">
            Approved by leadership and sent to every team. Each team&apos;s goals build on it, and AI coding sessions are linked to it.
          </p>
        ) : (
          <p style={{ fontSize: 17 }} className="text-zinc-600">
            Set by {L.team.ceo} and shared with {L.team.product} and {L.team.security}. Each team’s goal builds on it.
          </p>
        )}
      </div>

      {ceo && (
        <Section title={`Current goal · ${ceo.version}`} right={<Badge tone="neutral">Approved {fmtTime(ceo.approved_at)}</Badge>}>
          <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-300">
            <p className="mb-3 text-[19px] font-semibold leading-snug">{ceo.objective}</p>
            <MeasureList measures={ceo.measures} compare={prev?.measures} />
          </div>
        </Section>
      )}

      {L.northstar ? (
        <>
          {draft ? (
            <Section title={`Next version (draft) · ${ceo ? `v${Number(ceo.version.replace(/^v/, "")) + 1}` : "v1"}`} right={<Badge tone="violet">Draft</Badge>}>
              <div className="rounded-xl bg-white p-5 ring-1 ring-violet-300">
                <label className="mb-3 block">
                  <span className="mb-1 block al-lbl">Goal</span>
                  <textarea
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    rows={2}
                    disabled={me.actor !== "leadership"}
                    className="w-full rounded-lg px-3 py-2 text-[18px] font-semibold ring-1 ring-zinc-300"
                  />
                </label>
                <div className="mb-1 al-lbl">CEO requirements</div>
                <MeasureList measures={draft.measures} compare={ceo?.measures} />
                <div className="mt-4 flex items-center gap-3">
                  {canPush ? (
                    <Button onClick={push} disabled={busy}>
                      {busy ? "Sending…" : "Approve and send to teams"}
                    </Button>
                  ) : (
                    <span className="text-[15px] text-zinc-500">Only leadership can approve and send the company goal.</span>
                  )}
                  <span className="text-[14px] text-zinc-500">Goes to the Product Director and Alex (Security Lead). The previous version is kept.</span>
                </div>
              </div>
            </Section>
          ) : lastPush ? (
            <p className="rounded-xl bg-zinc-50 px-4 py-3 text-[15px] text-zinc-600 ring-1 ring-zinc-200">
              Nothing to approve: company goal {lastPush.version} was already sent at {fmtTime(lastPush.pushed_at)}. To run the decisions again, open{" "}
              <Link href="/?ops" className="underline">Align with ?ops</Link> and click <b>Start the demo over</b>, or run <code>scripts/run-of-show.sh reset</code>.
            </p>
          ) : (
            <p className="rounded-xl bg-zinc-50 px-4 py-3 text-[15px] text-zinc-600 ring-1 ring-zinc-200">No new version is being drafted.</p>
          )}

          {lastPush && (
            <Section title="Last sent to teams">
              <div className="rounded-xl bg-white p-4 text-[16px] ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">Sent</Badge>
                  Company goal {lastPush.version} · sent by CEO / Leadership · {fmtTime(lastPush.pushed_at)}
                </div>
                <div className="mt-2 text-[15px] text-zinc-600">
                  Sent to the Product Director and Alex (Security Lead). AI coding sessions are being re-checked against the new goals.
                </div>
                <div className="mt-3 flex gap-2">
                  <Button kind="secondary" onClick={() => props.go("work")}>See where AI agent work is going</Button>
                  <Button kind="ghost" onClick={() => props.go("goals")}>See how the goals connect</Button>
                </div>
              </div>
            </Section>
          )}
        </>
      ) : (
        <>
          {acc ? (
            <LaunchRecord props={props} acc={acc} />
          ) : (
            <p style={{ fontSize: 17 }} className="rounded-xl bg-zinc-50 px-4 py-3 text-zinc-700 ring-1 ring-zinc-200">
              You set the company goal. {L.team.product} and {L.team.security} agree on a plan between themselves; you don&apos;t approve
              their goals. Once they agree, the decision record comes to you here, and you decide whether it launches. Until then, there&apos;s
              nothing for you to do.
            </p>
          )}
          {teamGoals.some((t) => t.goal) && (
            <Section title="Team goals that build on it">
              <ul className="space-y-3">
                {teamGoals.map(({ slot, goal }) =>
                  goal ? (
                    <li key={slot} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
                      <div style={{ fontSize: 16 }} className="text-zinc-600">
                        {L.team[slot]} · {L.person[slot]}
                      </div>
                      <p style={{ fontSize: 18 }} className="mt-1 font-semibold leading-snug">{goal.objective}</p>
                    </li>
                  ) : null,
                )}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
