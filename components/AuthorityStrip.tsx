"use client";
import type { ReactNode } from "react";
import type { SimulationRun, StateView } from "@/lib/types";
import { accepted, activeProposal, comparablePair } from "./select";
import { StateBadge, fmtTime } from "./ui";

/**
 * Authority → agent behavior → observed result, as four steps built only from recorded data:
 * the baseline practice run, Leadership's push, the owner's approval, and the approved plan's run.
 * Agent lines appear only when a captured agent session actually received the change.
 */
function deliveries(s: StateView, eventId: string) {
  let n = 0;
  let first: string | undefined;
  let acted = 0;
  for (const sess of s.sessions ?? []) {
    const d = sess.directives?.find((x) => x.event_id === eventId);
    if (!d) continue;
    n++;
    if (d.acted_at) acted++;
    if (!first || d.delivered_at < first) first = d.delivered_at;
  }
  return { n, first, acted };
}

const passed = (r?: SimulationRun) => (r ? r.checks.filter((c) => c.passed).length : 0);

function Score({ run }: { run?: SimulationRun }) {
  if (!run) return <StateBadge state="UNTESTED" />;
  const ok = run.verdict === "PASS";
  return (
    <span className={`text-[48px] font-semibold leading-none tracking-[-0.02em] ${ok ? "text-emerald-700" : "text-red-700"}`}>
      {passed(run)}/{run.checks.length}
    </span>
  );
}

function Step({ n, title, state, children }: { n: string; title: string; state: "done" | "now" | "later"; children: ReactNode }) {
  const tone = state === "done" ? "border-zinc-300 bg-white" : state === "now" ? "border-amber-700 bg-white" : "border-dashed border-zinc-300 bg-zinc-50 opacity-70";
  return (
    <li className={`flex min-w-0 flex-col gap-2 rounded-[14px] border p-4 ${tone}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] text-zinc-500">{n}</span>
        <span className="al-lbl !text-zinc-700">{title}</span>
      </div>
      {children}
    </li>
  );
}

export function AuthorityStrip({ s }: { s: StateView }) {
  const push = s.pushes?.at(-1);
  if (!push) return null;
  const { baseline, candidate } = comparablePair(s);
  const acc = accepted(s);
  const prop = activeProposal(s);
  const pushDel = deliveries(s, `push:${push.id}`);
  const accDel = acc ? deliveries(s, `accept:${acc.proposal_id}`) : { n: 0, first: undefined, acted: 0 };
  // A run of the approved plan recorded after approval counts as the agent following it; otherwise show the tested result.
  const after =
    acc && acc.ratified_at
      ? [...s.simulations].reverse().find((r) => r.plan_id === acc.plan_ref.plan_id && r.scenario === "normal" && r.ingested_at > acc.ratified_at!)
      : undefined;
  const afterRun = after ?? candidate;
  const agents = (k: number) => `${k} AI agent session${k === 1 ? "" : "s"}`;

  return (
    <section aria-label="From the CEO's change to the agent's result" className="flex flex-col gap-2">
      <div className="al-lbl">Authority → agent behavior → result</div>
      <ol className="grid grid-cols-4 gap-3">
        <Step n="01" title="Before" state="done">
          <div className="text-[16px] font-semibold text-zinc-900">Security v1 · oldest tickets first</div>
          <Score run={baseline} />
          <div className="text-[14px] text-zinc-600">
            {baseline ? "checks passed in the practice test" : "No practice test of the current plan yet"}
          </div>
        </Step>
        <Step n="02" title="CEO changes the goal" state="done">
          <div className="text-[16px] font-semibold text-zinc-900">Beta customers&apos; issues first</div>
          <div className="text-[14px] text-zinc-700">Sent to every team at {fmtTime(push.pushed_at)}</div>
          <div className="text-[14px] text-zinc-600">
            {pushDel.n
              ? `Reached ${agents(pushDel.n)} at ${fmtTime(pushDel.first)}${pushDel.acted ? "; the agent checked its authority" : ""}`
              : "No connected AI agent sessions"}
          </div>
        </Step>
        <Step n="03" title="Human decision" state={acc ? "done" : "now"}>
          {acc ? (
            <>
              <div className="text-[16px] font-semibold text-zinc-900">Security approved its goal {acc.accepted_version}</div>
              <div className="text-[14px] text-zinc-700">
                {acc.ratified_at ? `at ${fmtTime(acc.ratified_at)}` : ""} · Product accepted Security&apos;s changes
              </div>
              <span className="self-start">
                <StateBadge state="ACCEPTED" />
              </span>
            </>
          ) : (
            <>
              <div className="text-[16px] font-semibold text-zinc-900">Security decides</div>
              <span className="self-start">
                <StateBadge state={prop && !["RATIFIED", "REJECTED"].includes(prop.state) ? prop.state : "UNKNOWN"} />
              </span>
              <div className="text-[14px] text-zinc-600">Only Security can approve a change to its goal.</div>
            </>
          )}
        </Step>
        <Step n="04" title="After" state={acc ? "done" : "later"}>
          <div className="text-[16px] font-semibold text-zinc-900">{acc ? "Approved plan: beta issues first" : "Tested alternative: beta issues first"}</div>
          <Score run={afterRun} />
          <div className="text-[14px] text-zinc-600">
            {after
              ? `checks passed when the agent ran the approved plan (${fmtTime(after.ingested_at)})`
              : acc
                ? accDel.n
                  ? `tested result · approval reached ${agents(accDel.n)} at ${fmtTime(accDel.first)}`
                  : "tested result before approval"
                : "tested result · waits for Security's approval"}
          </div>
        </Step>
      </ol>
    </section>
  );
}
