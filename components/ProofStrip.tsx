"use client";
import { useEffect, useState } from "react";
import type { StateView } from "@/lib/types";
import { Badge, OWNER_LABEL, fmtDuration, fmtTime } from "./ui";

const DECISIONS = new Set(["propose", "counter", "acknowledge", "ratify"]);

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="text-[13px] font-bold uppercase tracking-wide text-zinc-500">{label}</div>
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
    <div className="@container"><div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4" aria-label="Proof strip">
      <Tile label="Manual baseline · estimate">
        <div className="text-[28px] font-bold leading-tight text-zinc-900">≈ {manualMin} min</div>
        <div className="text-[16px] text-zinc-800">{manualSteps} coordination steps</div>
        <div className="text-[14px] text-zinc-500">Operator-supplied estimate, not measured</div>
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

      <Tile label="In-app workflow · measured">
        {!t.started_at ? (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-400">Not started</div>
            <div className="text-[14px] text-zinc-500">Starts when the CEO change is first viewed</div>
          </>
        ) : t.ended_at ? (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-900">
              {fmtDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime())}
            </div>
            <div className="text-[14px] text-zinc-500">from CEO change viewed to accepted version seen in both sessions</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[28px] font-bold leading-tight text-zinc-900">
                {fmtDuration(now - new Date(t.started_at).getTime())}
              </span>
              <Badge tone="amber">running</Badge>
            </div>
            <div className="text-[14px] text-zinc-500">since CEO change viewed at {fmtTime(t.started_at)}</div>
          </>
        )}
        <div className="text-[16px] text-zinc-800">
          2 owners · {decisions} decision{decisions === 1 ? "" : "s"}
        </div>
        {t.excluded_prep.length > 0 && (
          <div className="text-[14px] text-zinc-600">
            Excluded prep:{" "}
            {t.excluded_prep.map((e) => `${e.label} (${fmtDuration(e.seconds * 1000)})`).join(", ")}
          </div>
        )}
      </Tile>

      <Tile label="Human decision">
        {acc ? (
          <ul className="space-y-2 text-[16px]">
            <li>
              <div className="font-semibold text-zinc-900">{OWNER_LABEL.product}</div>
              <div className="text-zinc-600">{acc.acknowledged_via === "authored_in_proposal" ? "commitment written in its proposal at" : "acknowledged at"} {fmtTime(acc.acknowledged_at)}</div>
            </li>
            <li>
              <div className="font-semibold text-zinc-900">{OWNER_LABEL.security}</div>
              <div className="text-zinc-600">
                ratified {acc.accepted_version} at {fmtTime(acc.ratified_at)}
              </div>
            </li>
          </ul>
        ) : (
          <>
            <div className="text-[28px] font-bold leading-tight text-zinc-400">Pending</div>
            <div className="text-[14px] text-zinc-500">Two accountable owners: Product and Security</div>
          </>
        )}
      </Tile>

      <Tile label="Sandbox outcome · narrow">
        {!acc ? (
          <Badge tone="amber">Pending: no accepted version yet</Badge>
        ) : verified ? (
          <Badge tone="green">VERIFIED: ticket triage check passed in Sparta</Badge>
        ) : (
          <Badge tone="amber">
            {acc.test_status === "STALE"
              ? "STALE: accepted plan was not re-run in Sparta"
              : acc.test_status === "UNTESTED"
                ? "UNTESTED: no comparable Sparta run"
                : `Candidate run ${candidate ? candidate.verdict : "missing"}: not verified`}
          </Badge>
        )}
        {acc && (
          <div className="text-[15px] text-zinc-700">
            Test status: <span className="font-semibold">{acc.test_status}</span>
            {candidate && (
              <>
                {" "}
                · candidate run <span className="font-mono text-[13px]">{candidate.id.slice(0, 12)}</span> {candidate.verdict}
              </>
            )}
          </div>
        )}
        <div className="text-[14px] text-zinc-500">Company beta readiness not verified.</div>
      </Tile>
    </div></div>
  );
}
