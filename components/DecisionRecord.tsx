"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CONDITIONS_UNCONFIRMED, conditionsUnconfirmedNote, poss, type Labels } from "@/lib/labels";
import type { Acceptance, StateView } from "@/lib/types";
import { agreementStatus, launchLine, recordFacts } from "./launch";
import { Badge, Button, fmtDuration, fmtTime } from "./ui";

// The custom decision record (v6 vRecord), shared by the teams' Next decision and leadership's Company goal so the
// record reads the same everywhere. Summary states what was approved, what is only proposed and what was never tested;
// Receipts is the audit log and the coordination timer; How to read this is the legend. Custom scenarios only.

type Tab = "summary" | "receipts" | "legend";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "receipts", label: "Receipts" },
  { id: "legend", label: "How to read this" },
];

const NEVER_TESTED = "The company outcome. Align recorded the agreement; nothing here tested whether it works.";
const NO_CONDITIONS = "No open conditions";

const ACTION_LABEL: Record<string, string> = {
  scenario_setup: "set up the scenario",
  workspace_created: "created the workspace",
  propose: "proposed a change",
  counter: "asked for changes",
  acknowledge: "accepted the changes",
  ratify: "approved",
  ratify_untested: "approved without a sandbox test",
  reject: "turned it down",
  launch_approved: "approved the launch",
  launch_not_yet: "launch: not yet",
  reset: "restarted the scenario",
  saw_accepted_version: "saw the agreed version",
};

/** Coordination time so far: ticks once a second while the timer is still running. */
function useElapsed(t: StateView["timer"]): number | null {
  const running = !!t.started_at && !t.ended_at;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [running]);
  if (!t.started_at) return null;
  return (t.ended_at ? new Date(t.ended_at).getTime() : now) - new Date(t.started_at).getTime();
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[14px] border border-zinc-200 bg-white ${className}`}>{children}</div>;
}

function Lbl({ children, tone }: { children: ReactNode; tone?: "pass" | "warn" | "fail" }) {
  const color = tone === "pass" ? "!text-[var(--al-pass)]" : tone === "warn" ? "!text-[var(--al-warn)]" : tone === "fail" ? "!text-[var(--al-fail)]" : "";
  return <span className={`al-lbl ${color}`}>{children}</span>;
}

function initials(name: string) {
  return name
    .split(/[\s/]+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !["of", "and", "the"].includes(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 font-mono text-[12px] text-zinc-700">
      {initials(name)}
    </span>
  );
}

/** Everything the record states, computed once so Summary, the share card and Copy text never disagree. */
function facts(s: StateView, acc: Acceptance, L: Labels) {
  const { target, conditions } = recordFacts(s, acc);
  const conditionLines = conditions.split("\n").map((c) => c.trim()).filter(Boolean);
  const prop = s.proposals.find((p) => p.id === acc.proposal_id);
  const reason = prop?.counter_versions.at(-1)?.rationale?.trim() ?? "";
  const owner = L.person.security;
  const asker = L.person.product;
  const ownerDid = conditionLines.length ? "approved if the conditions hold" : "approved";
  const askerDid = acc.acknowledged_via === "authored_in_proposal" ? `proposed; committed to its part: ${prop?.reciprocal_commitment ?? ""}`.trim() : "accepted the changes";
  // Same count as the Work view's "still on the old plan" items (Mini S1's oldPlanItems(s, acc) in components/oldPlan.ts).
  const running = (acc.owning_work_item_ids ?? []).length + (acc.asking_work_item_ids ?? []).length;
  const title = `${poss(L.team.security)} goal ${acc.accepted_version}: ${target}`;
  return { target, conditionLines, reason, owner, asker, ownerDid, askerDid, running, title };
}

function plainText(s: StateView, acc: Acceptance, L: Labels): string {
  const f = facts(s, acc, L);
  return [
    `${s.company}: decision record`,
    f.title,
    `Status: ${agreementStatus(acc)}`,
    `Decided by: ${f.owner} (owner) ${f.ownerDid} at ${fmtTime(acc.ratified_at)}; ${f.asker} ${f.askerDid} at ${fmtTime(acc.acknowledged_at)}`,
    `Approved: ${f.target}`,
    `Only proposed: ${f.conditionLines.length ? f.conditionLines.map((c) => `${c} (${CONDITIONS_UNCONFIRMED.toLowerCase()})`).join("; ") : NO_CONDITIONS}`,
    `Never tested: ${NEVER_TESTED}`,
    launchLine(acc, L),
  ].join("\n");
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + TABS.length) % TABS.length;
    setTab(TABS[n].id);
    refs.current[n]?.focus();
  }
  return (
    <div role="tablist" aria-label="Decision record" className="flex flex-wrap border-b border-zinc-200">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          id={`record-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`record-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)}
          onKeyDown={(e) => onKey(e, i)}
          className={`-mb-px border-b-2 px-3.5 py-3 font-mono text-[13px] uppercase tracking-[0.06em] transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-700 ${
            tab === t.id ? "border-violet-700 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Summary({ s, acc, L, onMoveWork, children }: { s: StateView; acc: Acceptance; L: Labels; onMoveWork?: () => void; children?: ReactNode }) {
  const f = facts(s, acc, L);
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = s.timer;
  const elapsed = useElapsed(t);
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText(s, acc, L));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
        <Card className="flex flex-col gap-1.5 p-4">
          <Lbl tone="pass">Approved</Lbl>
          <span className="text-[16px] text-zinc-900">{f.target}</span>
        </Card>
        <Card className="flex flex-col gap-1.5 p-4">
          <Lbl tone="warn">Only proposed</Lbl>
          {f.conditionLines.length ? (
            <>
              <ul aria-label="Conditions" className="flex flex-col gap-2">
                {f.conditionLines.map((c, i) => (
                  <li key={i} className="flex flex-col items-start gap-1 text-[16px] text-zinc-900">
                    <span>{c}</span>
                    <Badge tone="amber">{CONDITIONS_UNCONFIRMED}</Badge>
                  </li>
                ))}
              </ul>
              <span className="text-[14px] text-zinc-600">{conditionsUnconfirmedNote(f.conditionLines.length)}</span>
            </>
          ) : (
            <span className="text-[16px] text-zinc-500">{NO_CONDITIONS}</span>
          )}
        </Card>
        <Card className="flex flex-col gap-1.5 p-4">
          <Lbl tone="fail">Never tested</Lbl>
          <span className="text-[16px] text-zinc-900">{NEVER_TESTED}</span>
        </Card>
      </div>

      {f.reason && (
        <p className="max-w-[720px] text-[16px] text-zinc-700">
          <span className="font-semibold text-zinc-900">Why {L.team.security} asked for changes:</span> {f.reason}
        </p>
      )}

      <section aria-label="Who decided">
        <div className="mb-2">
          <Lbl>Who decided</Lbl>
        </div>
        <Card className="flex flex-col px-[18px] py-1.5">
          {[
            { name: f.owner, role: "owner", did: f.ownerDid, at: acc.ratified_at },
            { name: f.asker, role: "", did: f.askerDid, at: acc.acknowledged_at },
          ].map((r) => (
            <div key={r.name} className="flex items-center gap-3 border-b border-zinc-200 py-2.5 text-[15px] last:border-b-0">
              <Avatar name={r.name} />
              <span className="min-w-0 flex-1 text-zinc-800">
                <b className="text-zinc-900">{r.name}</b>
                {r.role ? `, ${r.role}` : ""}: {r.did}
              </span>
              <span className="shrink-0 font-mono text-[13px] text-zinc-500">{fmtTime(r.at)}</span>
            </div>
          ))}
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        <Card className="flex flex-col gap-1.5 p-4">
          <Lbl>In Align · measured</Lbl>
          <span className="text-[24px] font-semibold leading-tight text-zinc-900">{elapsed === null ? "Not started" : fmtDuration(elapsed)}</span>
          <span className="text-[14px] text-zinc-500">
            {t.touchpoints.length} touchpoint{t.touchpoints.length === 1 ? "" : "s"} · prep excluded
          </span>
        </Card>
        <Card className="flex flex-col gap-1.5 p-4">
          <Lbl tone="warn">Sandbox test</Lbl>
          <span className="self-start">
            <Badge tone="amber">Not sandbox-tested</Badge>
          </span>
          <span className="text-[14px] text-zinc-600">{f.owner} approved this plan explicitly without a sandbox test.</span>
        </Card>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[16px] font-semibold text-zinc-900">{launchLine(acc, L)}</p>
        {acc.launch_decision?.note && <p className="whitespace-pre-wrap text-[15px] text-zinc-600">Note: {acc.launch_decision.note}</p>}
        {acc.launch_decision && <p className="text-[14px] text-zinc-500">Decided {fmtTime(acc.launch_decision.at)}.</p>}
      </div>
      {children}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-zinc-200 pt-4">
        <Button kind="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy text"}
        </Button>
        <Button kind="secondary" onClick={() => setShare((v) => !v)}>
          {share ? "Hide summary" : "Share summary"}
        </Button>
        <span className="text-[14px] text-zinc-500">A read-only link isn&apos;t built yet</span>
        {onMoveWork && f.running > 0 && (
          <span className="ml-auto">
            <Button onClick={onMoveWork}>Move running work → {f.running} items</Button>
          </span>
        )}
      </div>
      {share && (
        <Card className="flex flex-col gap-3 p-[18px]">
          <div className="flex items-center gap-2">
            <Lbl>Shareable summary</Lbl>
            <span className="ml-auto">
              <Button kind="secondary" onClick={copy}>
                {copied ? "Copied" : "Copy text"}
              </Button>
            </span>
          </div>
          <p className="text-[17px] font-semibold text-zinc-900">{f.title}</p>
          <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[15px]">
            <dt className="text-zinc-500">Decided by</dt>
            <dd className="text-zinc-900">
              {f.owner} ({f.ownerDid}), {f.asker} ({f.askerDid})
            </dd>
            <dt className="text-zinc-500">Approved</dt>
            <dd className="text-zinc-900">{f.target}</dd>
            <dt className="text-zinc-500">Only proposed</dt>
            <dd className="text-zinc-900">{f.conditionLines.length ? f.conditionLines.join("; ") : NO_CONDITIONS}</dd>
            <dt className="text-zinc-500">Never tested</dt>
            <dd className="text-zinc-900">{NEVER_TESTED}</dd>
          </dl>
          <p className="text-[14px] text-zinc-500">Read-only link not built yet · this is the text it would show</p>
        </Card>
      )}
    </div>
  );
}

function Receipts({ s, L }: { s: StateView; L: Labels }) {
  const rows = [...s.audit].reverse();
  const t = s.timer;
  const elapsed = useElapsed(t);
  const who = (a: string) => L.person[a as keyof Labels["person"]] ?? a;
  const th = "border-b border-zinc-200 px-2.5 py-2 text-left font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-zinc-500";
  const td = "border-b border-zinc-200 px-2.5 py-2 align-top";
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-[18px]">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
          <Lbl>Audit log</Lbl>
          <span className="text-[14px] text-zinc-500">Actor comes from the signed session, never the request</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr>
                <th className={th}>Time</th>
                <th className={th}>Actor</th>
                <th className={th}>Action</th>
                <th className={th}>Target</th>
                <th className={th}>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap font-mono text-zinc-600`}>{fmtTime(r.at)}</td>
                  <td className={`${td} text-zinc-900`}>{who(r.actor)}</td>
                  <td className={`${td} text-zinc-800`}>
                    {ACTION_LABEL[r.action] ?? r.action} <span className="font-mono text-[12px] text-zinc-500">{r.action}</span>
                  </td>
                  <td className={`${td} break-all font-mono text-[12px] text-zinc-600`}>{r.target}</td>
                  <td className={td}>
                    {/* Only actions that succeeded are written to the audit log. */}
                    <Badge tone="neutral" icon={false}>
                      ok
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-[18px]">
        <div className="mb-2">
          <Lbl>Coordination timer</Lbl>
        </div>
        <dl className="mb-3 grid grid-cols-[130px_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[15px]">
          <dt className="text-zinc-500">Elapsed</dt>
          <dd className="text-zinc-900">
            {elapsed === null ? "Not started" : fmtDuration(elapsed)}
            {t.started_at && !t.ended_at ? " (still running)" : ""}
          </dd>
          <dt className="text-zinc-500">Excluded prep</dt>
          <dd className="text-zinc-900">{t.excluded_prep.length ? fmtDuration(t.excluded_prep.reduce((n, e) => n + e.seconds, 0) * 1000) : "None"}</dd>
        </dl>
        <ul className="flex flex-col">
          {t.touchpoints.map((p, i) => (
            <li key={i} className="flex gap-3 border-b border-zinc-200 py-2 text-[14px] last:border-b-0">
              <span className="shrink-0 font-mono text-zinc-500">{fmtTime(p.at)}</span>
              <span className="text-zinc-900">{who(p.actor)}</span>
              <span className="text-zinc-700">{ACTION_LABEL[p.action] ?? p.action}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Legend() {
  const rows: { tone: "violet" | "amber" | "neutral"; pill: string; text: string }[] = [
    { tone: "violet", pill: "Proposed", text: "A candidate. Nobody has agreed to it yet." },
    { tone: "amber", pill: "Unknown", text: "Unresolved. Not 'fine', not 'broken'." },
    { tone: "neutral", pill: "Agreed", text: "Approved by the goal's owner. Not the same as success, or launch." },
    { tone: "amber", pill: CONDITIONS_UNCONFIRMED, text: "A condition someone asked for; nobody has checked it." },
  ];
  return (
    <Card className="grid max-w-[640px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-[18px] text-[15px]">
      {rows.map((r) => (
        <div key={r.pill} className="contents">
          <span className="justify-self-start">
            <Badge tone={r.tone}>{r.pill.toUpperCase()}</Badge>
          </span>
          <span className="text-zinc-800">{r.text}</span>
        </div>
      ))}
    </Card>
  );
}

/**
 * The decision record. `children` renders under the launch line on Summary (leadership's launch controls);
 * `onMoveWork` shows "Move running work → N items"; `onBack` shows "← Decisions".
 */
export function DecisionRecord({
  s,
  acc,
  L,
  onMoveWork,
  onBack,
  children,
}: {
  s: StateView;
  acc: Acceptance;
  L: Labels;
  onMoveWork?: () => void;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const f = facts(s, acc, L);
  return (
    <section aria-label="Decision record" className="al-in flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        {onBack && (
          <Button kind="ghost" onClick={onBack}>
            ← Decisions
          </Button>
        )}
        <span className="al-lbl">Decision record</span>
        <span className="ml-auto">
          <Badge tone="neutral">{agreementStatus(acc)}</Badge>
        </span>
        <span className="font-mono text-[13px] text-zinc-500">{fmtTime(acc.ratified_at)}</span>
      </div>
      <h1 className="text-[28px] font-semibold leading-[1.25] tracking-[-0.01em] text-zinc-900">{f.title}</h1>
      <Tabs tab={tab} setTab={setTab} />
      <div role="tabpanel" id={`record-panel-${tab}`} aria-labelledby={`record-tab-${tab}`}>
        {tab === "summary" ? (
          <Summary s={s} acc={acc} L={L} onMoveWork={onMoveWork}>
            {children}
          </Summary>
        ) : tab === "receipts" ? (
          <Receipts s={s} L={L} />
        ) : (
          <Legend />
        )}
      </div>
    </section>
  );
}
