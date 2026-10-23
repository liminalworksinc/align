"use client";
// v6 record building blocks (Claude Design "Align App v6", vRecord / vDecisions). Presentation only: every status
// wording comes from lib/labels.ts or components/launch.ts, and every fact comes from /api/state.
import { useState, type ReactNode } from "react";
import { poss, type Labels } from "@/lib/labels";
import type { StateView } from "@/lib/types";
import { fmtDuration, fmtTime } from "../ui";

export type PillTone = "amber" | "violet" | "red" | "mint" | "grey" | "white";

const PILL: Record<PillTone, string> = {
  amber: "text-[var(--al-warn)] bg-[var(--al-warn-bg)] border-[var(--al-warn)]",
  violet: "text-[var(--al-accent)] bg-[var(--al-accent-bg)] border-[var(--al-accent)]",
  red: "text-[var(--al-fail)] bg-[var(--al-fail-bg)] border-[var(--al-fail)]",
  mint: "text-[var(--al-pass)] bg-[var(--al-pass-bg)] border-[var(--al-pass)]",
  grey: "text-zinc-700 bg-zinc-50 border-zinc-200",
  white: "text-[var(--al-bg)] bg-[var(--al-ink)] border-[var(--al-ink)]",
};

/** The v6 filled status pill. */
export function Pill({ tone, children, small }: { tone: PillTone; children: ReactNode; small?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold leading-[1.3] ${small ? "px-[7px] py-px text-[11px]" : "px-2.5 py-[3px] text-[12.5px]"} ${PILL[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={`rounded-[14px] border border-zinc-200 bg-white ${className}`}>
      {children}
    </section>
  );
}

export type RecordTab = "summary" | "receipts" | "legend";

const TABS: { id: RecordTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "receipts", label: "Receipts" },
  { id: "legend", label: "How to read this" },
];

/** Summary is always the default tab: the record's facts are what a reader sees first. */
export function useRecordTab() {
  return useState<RecordTab>("summary");
}

export function RecordTabs({ tab, setTab }: { tab: RecordTab; setTab: (t: RecordTab) => void }) {
  return (
    <div role="tablist" aria-label="Decision record" className="flex border-b border-zinc-200">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={`-mb-px border-b-2 px-3.5 py-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--al-focus)] ${tab === t.id ? "border-[var(--al-accent)] text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-900"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Header: the one status pill and the approval time, then the title. */
export function RecordHeader({ pill, tone, at, title, children }: { pill: string; tone: PillTone; at?: string | null; title: string; children?: ReactNode }) {
  return (
    <div className="al-in flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="al-lbl !text-violet-700">Decision record</span>
        <span className="ml-auto">
          <Pill tone={tone}>{pill}</Pill>
        </span>
        {at && <span className="text-[13px] text-zinc-500">{fmtTime(at)}</span>}
      </div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900">{title}</h1>
      {children}
    </div>
  );
}

/** The three columns: Approved · Only proposed · Never tested. */
export function TruthColumns({ approved, proposed, untested }: { approved: ReactNode; proposed: ReactNode; untested: ReactNode }) {
  const col = "flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-zinc-200 bg-white p-4 text-[15px] text-zinc-900";
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <section aria-label="Approved" className={col}>
        <h2 className="al-lbl !text-[var(--al-pass)]">Approved</h2>
        {approved}
      </section>
      <section aria-label="Only proposed" className={col}>
        <h2 className="al-lbl !text-[var(--al-warn)]">Only proposed</h2>
        {proposed}
      </section>
      <section aria-label="Never tested" className={col}>
        <h2 className="al-lbl !text-[var(--al-fail)]">Never tested</h2>
        {untested}
      </section>
    </div>
  );
}

export function Tile({ label, accent, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 rounded-[14px] border bg-white px-4 py-3.5 ${accent ? "border-[var(--al-pass)]" : "border-zinc-200"}`}>
      <span className={`al-lbl ${accent ? "!text-[var(--al-pass)]" : ""}`}>{label}</span>
      {children}
    </div>
  );
}

/** Measured time to agreement, from the flow timer. Prep (sandbox runs) is excluded and listed, never hidden. */
export function measuredTime(s: StateView): { value: string; running: boolean } {
  const t = s.timer;
  if (!t?.started_at) return { value: "Not started", running: false };
  if (!t.ended_at) return { value: "Still running", running: true };
  return { value: fmtDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()), running: false };
}

export function MeasuredTile({ s }: { s: StateView }) {
  const m = measuredTime(s);
  const n = s.timer?.touchpoints.length ?? 0;
  return (
    <Tile label="In Align · measured">
      <span className="text-[24px] font-semibold text-zinc-900">{m.value}</span>
      <span className="text-[13px] text-zinc-500">
        {n} touchpoint{n === 1 ? "" : "s"} · prep excluded
      </span>
    </Tile>
  );
}

/** Copies the record as plain text. There is no read-only link, so nothing here claims one. */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-zinc-300 px-[18px] text-[15px] font-semibold text-zinc-900 transition hover:border-zinc-500 hover:bg-zinc-100"
    >
      {copied === "ok" ? "Copied" : copied === "fail" ? "Couldn't copy" : "Copy text"}
    </button>
  );
}

// ---- Receipts ----

function actionWords(action: string, L: Labels) {
  const words: Record<string, string> = {
    ceo_change_viewed: L.northstar ? "saw the CEO's change" : "saw the company goal change",
    brief_reviewed: "read What to do next",
    scenario_reviewed: "opened the plan test",
    evidence_opened: "opened Evidence",
    propose: "proposed a change",
    counter: "asked for changes",
    acknowledge: `accepted ${poss(L.team.security)} changes`,
    ratify: "approved",
    ratify_and_push_company_goal: "approved the company goal and sent it to every team",
    saw_accepted_version: "saw the approved version",
    launch: "decided the launch",
    reset: "reset the demo",
  };
  return words[action] ?? action.replaceAll("_", " ");
}

const who = (L: Labels, actor: string) => (L.person as Record<string, string>)[actor] ?? actor;

/** Audit log: actor names come from the signed session, never the request. */
export function AuditTable({ s, L }: { s: StateView; L: Labels }) {
  const rows = [...s.audit].reverse();
  return (
    <Card label="Audit log" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
        <b className="text-zinc-900">Audit log</b>
        <span className="text-[13px] text-zinc-500">Names come from who was signed in, never from the request</span>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-[15px] text-zinc-600">Nothing recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full border-collapse text-left text-[13.5px]">
            <thead className="sticky top-0 bg-white">
              <tr className="al-lbl border-b border-zinc-200">
                <th className="px-2.5 py-2 font-medium">Time</th>
                <th className="px-2.5 py-2 font-medium">Who</th>
                <th className="px-2.5 py-2 font-medium">Action</th>
                <th className="px-2.5 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100 align-top">
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[12.5px] text-zinc-600">{fmtTime(a.at)}</td>
                  <td className="px-2.5 py-2 text-zinc-900">{who(L, a.actor)}</td>
                  <td className="px-2.5 py-2 text-zinc-900">{actionWords(a.action, L)}</td>
                  <td className="px-2.5 py-2 font-mono text-[12.5px] text-zinc-600 [overflow-wrap:anywhere]">{a.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Coordination timer: elapsed, excluded prep and every touchpoint. */
export function TimerCard({ s, L }: { s: StateView; L: Labels }) {
  const t = s.timer;
  const m = measuredTime(s);
  const prep = t?.excluded_prep ?? [];
  const range = t?.started_at ? `${fmtTime(t.started_at)} → ${t.ended_at ? fmtTime(t.ended_at) : "running"}` : "not started";
  return (
    <Card label="Coordination timer" className="flex flex-col gap-2.5 px-[18px] py-4">
      <div className="flex items-center justify-between gap-2">
        <b className="text-zinc-900">Coordination timer</b>
        <span className="font-mono text-[12.5px] text-zinc-600">{range}</span>
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-x-3.5 gap-y-2 text-[14.5px]">
        <dt className="text-zinc-500">Elapsed</dt>
        <dd className="text-zinc-900">{m.value} · from first seeing the company goal change to both teams seeing the approved version</dd>
        <dt className="text-zinc-500">Excluded prep</dt>
        <dd className="text-zinc-900">{prep.length ? `${prep.map((p) => `${p.seconds} s`).join(" + ")}, listed, not hidden` : "None"}</dd>
      </dl>
      {(t?.touchpoints ?? []).map((p, i) => (
        <div key={`${p.at}-${i}`} className="flex flex-wrap gap-3.5 text-[13.5px]">
          <span className="w-[72px] font-mono text-[12.5px] text-zinc-600">{fmtTime(p.at)}</span>
          <span className="w-[170px] text-zinc-900">{who(L, p.actor)}</span>
          <span className="text-zinc-900">{actionWords(p.action, L)}</span>
        </div>
      ))}
    </Card>
  );
}

// ---- How to read this ----

export function Legend({ L, agreed }: { L: Labels; agreed: string }) {
  const rows: [PillTone, string, string][] = [
    ["violet", "Proposed", "A candidate. Nobody has agreed to it yet."],
    ["amber", "Unknown", "Unresolved. Not “fine”, not “broken”."],
    ["white", agreed, "Approved by the goal's owner. Not the same as success."],
    ...(L.sandbox
      ? ([
          ["red", "Failed", "A sandbox check failed."],
          ["mint", "Passed", "Sandbox ticket outcome verified. Says nothing about company readiness."],
        ] as [PillTone, string, string][])
      : []),
  ];
  return (
    <Card label="How to read this" className="grid max-w-[640px] grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 p-[18px] text-[14.5px] text-zinc-900">
      {rows.map(([tone, label, text]) => (
        <div key={label} className="contents">
          <span>
            <Pill tone={tone}>{label}</Pill>
          </span>
          <span>{text}</span>
        </div>
      ))}
    </Card>
  );
}
