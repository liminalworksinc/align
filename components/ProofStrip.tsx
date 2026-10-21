"use client";
import { useEffect, useState } from "react";
import { labelsFor, poss, type Labels } from "@/lib/labels";
import type { StateView } from "@/lib/types";
import { Badge, OWNER_LABEL, STATE_LABEL, fmtDuration, fmtTime } from "./ui";

const DECISIONS = new Set(["propose", "counter", "acknowledge", "ratify"]);

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="al-lbl">{label}</div>
      {children}
    </div>
  );
}

/** Live clock that only ticks while `running` is true. */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

export function ProofStrip({ s }: { s: StateView }) {
  const L = labelsFor(s);
  return L.northstar ? <NorthstarProof s={s} /> : <CustomProof s={s} L={L} />;
}

/** Custom scenarios: who approved, and the sandbox status. No manual estimate and no practice-test claims. */
function CustomProof({ s, L }: { s: StateView; L: Labels }) {
  const acc = s.acceptances.at(-1) ?? null;
  return (
    <div className="grid grid-cols-2 gap-3" aria-label="Summary: approvals and sandbox test">
      <Tile label="Who approved">
        {acc ? (
          <ul className="space-y-2 text-[16px]">
            <li>
              <div className="font-semibold text-zinc-900">{L.person.product}</div>
              <div className="text-zinc-600">accepted {poss(L.team.security)} changes at {fmtTime(acc.acknowledged_at)}</div>
            </li>
            <li>
              <div className="font-semibold text-zinc-900">{L.person.security}</div>
              <div className="text-zinc-600">
                approved its goal ({acc.accepted_version}) at {fmtTime(acc.ratified_at)}
              </div>
            </li>
          </ul>
        ) : (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-400">Not yet</div>
            <div className="text-[16px] text-zinc-500">
              Two people must agree: {L.person.product} and {L.person.security}
            </div>
          </>
        )}
      </Tile>
      <Tile label="Sandbox test">
        <span className="self-start">
          <Badge tone="amber">Not sandbox-tested</Badge>
        </span>
        <div className="text-[16px] text-zinc-700">
          {acc ? `${L.person.security} approved this plan explicitly without a sandbox test.` : "This plan has no sandbox test. Approving it needs an explicit acknowledgement."}
        </div>
        <div className="text-[16px] text-zinc-500">Agreeing on the goal isn&apos;t proof the plan will work.</div>
      </Tile>
    </div>
  );
}

function NorthstarProof({ s }: { s: StateView }) {
  const t = s.timer;
  const running = !!t.started_at && !t.ended_at;
  const now = useNow(running);

  // 1. Manual baseline (estimate)
  const manualMin = s.manual_baseline.reduce((a, b) => a + b.est_minutes, 0);
  const manualSteps = s.manual_baseline.length;

  // 2. In-app workflow (measured)
  const decisions = t.touchpoints.filter((tp) => DECISIONS.has(tp.action)).length;

  // 3/4. Latest acceptance
  const acc = s.acceptances.at(-1) ?? null;
  const runs = acc ? s.simulations.filter((r) => acc.evidence_version.includes(r.id)) : [];
  const candidate = acc
    ? runs.find((r) => r.plan_id === acc.plan_ref.plan_id && r.plan_version === acc.plan_ref.plan_version && r.plan_hash === acc.plan_ref.plan_hash) ??
      runs.find((r) => r.plan_id === acc.plan_ref.plan_id)
    : undefined;
  const verified = !!acc && acc.test_status === "TESTED" && candidate?.verdict === "PASS";

  return (
    <div className="@container"><div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4" aria-label="Summary: time, approvals and test result">
      <Tile label="Doing it by hand · estimate">
        <div className="text-[28px] font-bold leading-tight text-zinc-900">≈ {manualMin} min</div>
        <div className="text-[16px] text-zinc-800">{manualSteps} steps (meetings, messages, docs)</div>
        <div className="text-[14px] text-zinc-500">Our own estimate, not measured</div>
        <details className="mt-1 text-[15px]">
          <summary className="cursor-pointer rounded font-semibold text-zinc-700 focus-visible:outline-2 focus-visible:outline-violet-600">
            Show steps
          </summary>
          <ol className="mt-2 space-y-1.5">
            {s.manual_baseline.map((m) => (
              <li key={m.step} className="flex gap-2">
                <span className="font-mono font-bold text-zinc-500">{m.step}</span>
                <span className="flex-1 text-zinc-800">{m.description}</span>
                <span className="whitespace-nowrap text-zinc-600">~{m.est_minutes} min</span>
              </li>
            ))}
          </ol>
        </details>
      </Tile>

      <Tile label="Time to agreement in Align · measured">
        {!t.started_at ? (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-400">Not started</div>
            <div className="text-[14px] text-zinc-500">Starts when someone first opens the CEO&apos;s change</div>
          </>
        ) : t.ended_at ? (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-900">
              {fmtDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime())}
            </div>
            <div className="text-[14px] text-zinc-500">from opening the CEO&apos;s change to both teams seeing the approved goal</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[28px] font-bold leading-tight text-zinc-900">
                {fmtDuration(now - new Date(t.started_at).getTime())}
              </span>
              <Badge tone="amber">still running</Badge>
            </div>
            <div className="text-[14px] text-zinc-500">since the CEO&apos;s change was opened at {fmtTime(t.started_at)}</div>
          </>
        )}
        <div className="text-[16px] text-zinc-800">
          2 people · {decisions} step{decisions === 1 ? "" : "s"}
        </div>
        {t.excluded_prep.length > 0 && (
          <div className="text-[14px] text-zinc-600">
            Not counted: {t.excluded_prep.length} practice test run{t.excluded_prep.length === 1 ? "" : "s"} done beforehand (
            {fmtDuration(t.excluded_prep.reduce((n, e) => n + e.seconds, 0) * 1000)})
          </div>
        )}
      </Tile>

      <Tile label="Who approved">
        {acc ? (
          <ul className="space-y-2 text-[16px]">
            <li>
              <div className="font-semibold text-zinc-900">{OWNER_LABEL.product}</div>
              <div className="text-zinc-600">{acc.acknowledged_via === "authored_in_proposal" ? "wrote what it will do into its proposal at" : "accepted Security's changes at"} {fmtTime(acc.acknowledged_at)}</div>
            </li>
            <li>
              <div className="font-semibold text-zinc-900">{OWNER_LABEL.security}</div>
              <div className="text-zinc-600">
                approved its goal ({acc.accepted_version}) at {fmtTime(acc.ratified_at)}
              </div>
            </li>
          </ul>
        ) : (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-400">Not yet</div>
            <div className="text-[14px] text-zinc-500">Two people must agree: Product and Security</div>
          </>
        )}
        <div className="text-[14px] text-zinc-500">Agreeing on the goal isn&apos;t proof the launch will work.</div>
      </Tile>

      <Tile label="Practice test result">
        {!acc ? (
          <Badge tone="amber">Not yet: no approved goal</Badge>
        ) : verified ? (
          <Badge tone="green">Passed: the new plan handled the practice tickets correctly</Badge>
        ) : (
          <Badge tone="amber">
            {acc.test_status === "STALE"
              ? "Needs a new test: the approved changes alter how the agent works, and the test wasn't run again"
              : acc.test_status === "UNTESTED"
                ? "Not tested: no matching practice test"
                : candidate ? (candidate.verdict === "PASS" ? "Passed, but not confirmed" : "Failed: the new plan did not pass the practice test") : "No test run found for the new plan: not confirmed"}
          </Badge>
        )}
        {acc && (
          <div className="text-[15px] text-zinc-700">
            Test status: <span className="font-semibold">{STATE_LABEL[acc.test_status] ?? acc.test_status}</span>
            {candidate && (
              <>
                {" "}
                · new plan {candidate.verdict === "PASS" ? "passed" : "failed"}
                {candidate.checks.length > 0 && ` (${candidate.checks.filter((c) => c.passed).length} of ${candidate.checks.length} checks passed)`}
              </>
            )}
          </div>
        )}
        <div className="text-[14px] text-zinc-500">Covers the practice tickets only. Whether the beta launch succeeds isn&apos;t known yet. This test can&apos;t tell you that.</div>
      </Tile>
    </div></div>
  );
}
