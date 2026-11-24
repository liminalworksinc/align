"use client";

import { useState } from "react";
import { Panel } from "../app/_ui/ds/panel";
import { SAMPLE } from "./sample";

// The three steps on one page: bring the runs, see exactly what is sent and click to send, read the report.
// Report order is recommendation first (Nov 19 feedback): try this, why, numbers, the runs, then purpose, how you will
// know, and what the audit cannot tell, as a footnote. Nothing here is stored; reloading the page clears it.

// The participant prompt (agent-audit-wave-1.md, prompt v2).
const PROMPT = `I want an outside read on how this agent or workflow is doing. Please write the following as markdown.

1. What this agent is for, in two sentences, and the instructions or system prompt it runs with (paste them in full).
2. Its most recent runs, up to 10, each under a heading like "## Run R1 (date)". For each: what it was asked to do; the sources it used; each change I asked for and what I asked, as "Changes requested: N (change xN, ...)"; roughly how many minutes I spent; and whether I used the result.
3. The three things I correct most often.
4. One thing I wish it did that it does not.

If there are fewer than 10 runs, give what exists and say how many. Leave out client names, personal data, credentials and anything confidential. If you are unsure whether something is private, leave it out and say you did.`;

interface Run { id: string; date: string; asked: string; changes: { category: string; note: string }[]; minutes: number | null; used: "yes" | "no" | "unknown" }
interface Preview { runs: Run[]; skipped: string[]; redacted: { email: number; phone: number; key: number }; thin: boolean; payload: string; provider: string; permission: string; expiresAt: number }
interface Row { id: string; date: string; total: number; byCategory: Record<string, number>; minutes: number | null; used: Run["used"] }
interface Report {
  try_this: { text: string; exact_text: string | null } | null;
  why: { kind: "costs_time" | "caught_by_person" | "working"; claim: string; runs: string[] }[];
  purpose: string | null;
  cannot_tell: string[];
  how_you_will_know: string | null;
  withheld: string | null;
  numbers: { runs: number; runsUsed: number; runsUnknown: number; totalChanges: number; medianChanges: number; minutesPerRun: number | null; minutesPerUsedRun: number | null; minutesPerUsedRunMissing: string | null; topSharePercent: number | null; thin: boolean; top_category: string | null; top_count: number | null; dominant: boolean };
  categories: { category: string; count: number; runs: string[] }[];
  table: Row[];
  model: string;
}

type Step = "paste" | "preview" | "report";
const STEPS: { key: Step; label: string }[] = [
  { key: "paste", label: "Bring your agent's runs" },
  { key: "preview", label: "Check what is sent" },
  { key: "report", label: "Read the audit" },
];

// Series colors for the chart, by category order (theme tokens, readable on both themes).
const SERIES = ["var(--accent-text)", "var(--ev-reported)", "var(--st-launched)", "var(--ev-receipt)", "var(--text-3)"];

async function post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: json.error ?? "error", message: json.message ?? "Something went wrong. Try again." };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: "network", message: "The server could not be reached. Check your connection and try again." };
  }
}

export function AuditFlow() {
  const [step, setStep] = useState<Step>("paste");
  const [paste, setPaste] = useState("");
  const [usingSample, setUsingSample] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; again: boolean } | null>(null);

  async function doPreview() {
    setBusy(true);
    setError(null);
    const r = await post<Preview>("/api/v2/audit/preview", { paste });
    setBusy(false);
    if (!r.ok) return setError({ message: r.message, again: false });
    setPreview(r.data);
    setStep("preview");
  }

  async function doSend() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const r = await post<Report>("/api/v2/audit/run", { payload: preview.payload, permission: preview.permission });
    setBusy(false);
    if (!r.ok) return setError({ message: r.message, again: r.code.startsWith("consent_") });
    setReport(r.data);
    setStep("report");
    window.scrollTo(0, 0);
  }

  function restart() {
    setStep("paste");
    setPreview(null);
    setReport(null);
    setError(null);
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-(--text-3)">
          <span className="font-semibold text-(--accent-text)">Liminal</span> · Agent audit
        </p>
        <p className="rounded-full bg-(--st-retry-soft) px-3 py-1 font-mono text-[11px] text-(--st-retry)">Early test · nothing is saved</p>
      </header>

      <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const current = s.key === step;
          return (
            <li key={s.key} aria-current={current ? "step" : undefined} className={`border-t-2 pt-2 ${current ? "border-(--accent-text) text-(--text-1)" : "border-(--line-strong) text-(--text-3)"}`}>
              <span className="block font-mono text-[11px]">Step {i + 1}</span>
              <span className="text-[14px] leading-snug">{s.label}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-m) border border-(--st-declined) bg-(--st-declined-soft) px-4 py-3 text-[14px]">
          <span>{error.message}</span>
          {error.again && <button type="button" onClick={doPreview} className="rounded-(--radius-s) border border-(--edge) px-3 py-1.5 text-[13px]">Preview again</button>}
        </div>
      )}

      {step === "paste" && (
        <PasteStep
          paste={paste}
          setPaste={(v) => { setPaste(v); setUsingSample(false); }}
          usingSample={usingSample}
          useSample={() => { setPaste(SAMPLE); setUsingSample(true); }}
          busy={busy}
          onNext={doPreview}
        />
      )}
      {step === "preview" && preview && <PreviewStep preview={preview} usingSample={usingSample} busy={busy} onBack={() => setStep("paste")} onSend={doSend} />}
      {step === "report" && report && <ReportView report={report} usingSample={usingSample} onRestart={restart} />}

      <p className="border-t border-(--line) pt-4 text-[12px] leading-relaxed text-(--text-3)">
        Liminal keeps nothing from this page: not your runs, not the report. The text you send is read by {preview?.provider ?? "Anthropic (Claude), under Liminal's account"}. This is an early test of the audit; a person at Liminal reviews how it works, not what you paste.
      </p>
    </>
  );
}

function PasteStep({ paste, setPaste, usingSample, useSample, busy, onNext }: { paste: string; setPaste: (v: string) => void; usingSample: boolean; useSample: () => void; busy: boolean; onNext: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied("Copied");
    } catch {
      setCopied("Select the prompt and copy it");
    }
  }
  return (
    <section aria-labelledby="h-paste" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 id="h-paste" className="text-balance text-[clamp(26px,5vw,38px)] leading-tight font-semibold">One change to try on your agent, from its own last ten runs.</h1>
        <p className="max-w-[62ch] text-[16px] text-(--text-2)">No sign-up and nothing to install. Ask the AI tool your agent runs in to describe its recent runs, paste the answer here, and get back one change to try, with the counts behind it.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel eyebrow="A · Ask your tool" title="Copy this into the chat where your agent runs">
          <div className="flex flex-col gap-3">
            <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-(--radius-s) bg-(--bg-inset) p-3 font-mono text-[12px] leading-relaxed text-(--text-2)">{PROMPT}</pre>
            <div className="flex items-center gap-3">
              <button type="button" onClick={copy} className="rounded-(--radius-s) border border-(--edge) px-3 py-2 text-[13px] font-medium">Copy prompt</button>
              <span role="status" className="text-[13px] text-(--text-3)">{copied}</span>
            </div>
          </div>
        </Panel>
        <Panel eyebrow="B · Paste the answer" title="What it gave back">
          <div className="flex flex-col gap-3">
            <label htmlFor="audit-paste" className="sr-only">Your agent&apos;s answer</label>
            <textarea
              id="audit-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              spellCheck={false}
              placeholder="## Run R1 (Nov 2)&#10;Asked: …&#10;Changes requested: 3 (…)&#10;Person's time: ~20 min&#10;Used: yes"
              className="min-h-[220px] w-full resize-y rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) p-3 font-mono text-[12px] leading-relaxed text-(--text-1)"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-(--text-3)">
              <button type="button" onClick={useSample} className="underline underline-offset-2">Use an example instead</button>
              {usingSample && <span>Example: a content agent that turns state law changes into posts. Illustrative runs, not real data.</span>}
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!paste.trim() || busy} onClick={onNext} className="rounded-(--radius-s) bg-(--accent) px-5 py-2.5 text-[14px] font-semibold text-(--text-on-accent) hover:bg-(--accent-hover) disabled:opacity-50">
          {busy ? "Reading your runs…" : "Check what would be sent"}
        </button>
        <span className="text-[13px] text-(--text-3)">Nothing is sent until you approve it on the next step.</span>
      </div>
    </section>
  );
}

function PreviewStep({ preview, usingSample, busy, onBack, onSend }: { preview: Preview; usingSample: boolean; busy: boolean; onBack: () => void; onSend: () => void }) {
  const removed = preview.redacted.email + preview.redacted.phone + preview.redacted.key;
  return (
    <section aria-labelledby="h-preview" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 id="h-preview" className="text-[clamp(24px,4.5vw,32px)] leading-tight font-semibold">We read {preview.runs.length} runs. Check them, then send.</h1>
        <p className="max-w-[62ch] text-[15px] text-(--text-2)">
          {preview.thin ? "With fewer than six runs, the audit is marked thin evidence and shows no percentages. " : ""}
          {removed ? `We removed ${removed} item${removed === 1 ? "" : "s"} that looked private (emails, phone numbers or keys) before showing you this. ` : ""}
          {usingSample ? "This is the example, not your data." : "If a run is wrong, go back and fix the paste."}
        </p>
      </div>

      <Panel eyebrow="What we found" title="Your runs" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3)">
                <th className="px-4 py-2 font-normal">Run</th><th className="px-2 py-2 font-normal">Date</th><th className="px-2 py-2 text-right font-normal">Changes</th><th className="px-2 py-2 font-normal">Most changed</th><th className="px-2 py-2 text-right font-normal">Minutes</th><th className="px-4 py-2 font-normal">Used</th>
              </tr>
            </thead>
            <tbody>
              {preview.runs.map((r) => {
                const counts = r.changes.reduce<Record<string, number>>((m, c) => ({ ...m, [c.category]: (m[c.category] ?? 0) + 1 }), {});
                const most = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
                return (
                  <tr key={r.id} className="border-t border-(--line)">
                    <td className="px-4 py-2 font-mono">{r.id}</td><td className="px-2 py-2">{r.date || "–"}</td><td className="px-2 py-2 text-right font-mono">{r.changes.length}</td><td className="px-2 py-2">{most ? most[0] : "–"}</td><td className="px-2 py-2 text-right font-mono">{r.minutes ?? "–"}</td><td className="px-4 py-2">{r.used}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {preview.skipped.length > 0 && (
          <details className="border-t border-(--line) px-4 py-3 text-[13px] text-(--text-3)">
            <summary className="cursor-pointer">{preview.skipped.length} line{preview.skipped.length === 1 ? "" : "s"} we did not use</summary>
            <ul className="mt-2 flex flex-col gap-1 font-mono text-[12px]">{preview.skipped.slice(0, 40).map((s, i) => <li key={i} className="break-words">{s}</li>)}</ul>
          </details>
        )}
      </Panel>

      <Panel eyebrow="Exactly what is sent" title={`Read by ${preview.provider}`}>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-(--text-2)">This is the whole text, byte for byte. Your original paste is not sent; only this table of your runs is.</p>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-(--radius-s) bg-(--bg-inset) p-3 font-mono text-[11px] leading-relaxed text-(--text-2)">{preview.payload}</pre>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={onSend} className="rounded-(--radius-s) bg-(--accent) px-5 py-2.5 text-[14px] font-semibold text-(--text-on-accent) hover:bg-(--accent-hover) disabled:opacity-50">
          {busy ? "Writing your audit…" : "Send this and write my audit"}
        </button>
        <button type="button" disabled={busy} onClick={onBack} className="rounded-(--radius-s) border border-(--edge) px-4 py-2.5 text-[14px]">Back</button>
        <span className="text-[13px] text-(--text-3)">This approval works once, for this text, for ten minutes.</span>
      </div>
    </section>
  );
}

const KIND: Record<Report["why"][number]["kind"], { label: string; color: string }> = {
  costs_time: { label: "Costs the most time", color: "var(--st-declined)" },
  caught_by_person: { label: "Caught by you", color: "var(--st-retry)" },
  working: { label: "Working", color: "var(--st-approved)" },
};

function ReportView({ report, usingSample, onRestart }: { report: Report; usingSample: boolean; onRestart: () => void }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"accept" | "reject" | "correct" | null>(null);
  const [copied, setCopied] = useState(false);
  const n = report.numbers;
  const cats = report.categories.map((c) => c.category);
  const max = Math.max(1, ...report.table.map((r) => r.total));

  return (
    <section aria-labelledby="h-report" className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">
          Audit of {n.runs} runs{n.thin ? " · thin evidence" : ""}{usingSample ? " · example data" : ""}
        </p>
        {report.try_this ? (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--accent-text)">Try this</p>
            <h1 id="h-report" className="text-balance text-[clamp(24px,4.5vw,34px)] leading-tight font-semibold">{report.try_this.text}</h1>
          </>
        ) : (
          <>
            <h1 id="h-report" className="text-[clamp(22px,4vw,30px)] leading-tight font-semibold">Your numbers are below. The recommendation is not shown.</h1>
            <p className="max-w-[62ch] text-[15px] text-(--text-2)">{report.withheld}</p>
          </>
        )}
      </div>

      {report.try_this?.exact_text && (
        <Panel eyebrow="Add this to your agent's instructions" title="Exact text">
          <div className="flex flex-col gap-3">
            <pre className="whitespace-pre-wrap break-words rounded-(--radius-s) bg-(--bg-inset) p-3 font-mono text-[13px] leading-relaxed">{report.try_this.exact_text}</pre>
            <div>
              <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(report.try_this!.exact_text!); setCopied(true); } catch { setCopied(false); } }} className="rounded-(--radius-s) border border-(--edge) px-3 py-1.5 text-[13px]">{copied ? "Copied" : "Copy"}</button>
            </div>
          </div>
        </Panel>
      )}

      {report.why.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold">Why</h2>
          {report.why.map((w, i) => (
            <div key={i} className="grid grid-cols-[4px_minmax(0,1fr)] gap-3">
              <span className="rounded-full" style={{ background: KIND[w.kind].color }} aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: KIND[w.kind].color }}>{KIND[w.kind].label}</span>
                <p className="text-[15px]">{w.claim}</p>
                <div className="flex flex-wrap gap-1.5">
                  {w.runs.map((id) => (
                    <button key={id} type="button" aria-pressed={focus === id} onClick={() => setFocus(focus === id ? null : id)} className={`rounded border px-2 py-0.5 font-mono text-[12px] ${focus === id ? "border-(--accent-text) text-(--accent-text)" : "border-(--line-strong) text-(--text-2)"}`}>{id}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 border-y border-(--line) sm:grid-cols-4">
        {[
          n.runsUnknown === n.runs ? ["–", "runs you used (not stated)"] : [`${n.runsUsed} of ${n.runs}`, "runs you used"],
          [String(n.medianChanges), "changes per run, median"],
          n.minutesPerUsedRun !== null
            ? [`${n.minutesPerUsedRun} min`, `your time per used run, abandoned runs included (estimate; ${n.minutesPerRun} min per run)`]
            : [n.minutesPerRun === null ? "–" : `${n.minutesPerRun} min`, `your time per run (estimate)${n.minutesPerUsedRunMissing ? `. Per used run not shown: ${n.minutesPerUsedRunMissing}` : ""}`],
          [n.top_count === null ? "–" : `${n.top_count} of ${n.totalChanges}`, n.top_category ? `changes were to the ${n.top_category}` : "changes"],
        ].map(([v, l], i) => (
          <div key={i} className={`flex min-w-0 flex-col gap-0.5 py-3 pr-3 ${i % 2 ? "pl-3 border-l border-(--line)" : ""} ${i === 2 ? "sm:pl-3 sm:border-l sm:border-(--line)" : ""}`}>
            <dt className="order-2 text-[12px] leading-snug text-(--text-3)">{l}</dt>
            <dd className="order-1 font-mono text-[20px] tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <Panel eyebrow="Every change you asked for" title="Run by run">
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-(--text-2)">
            {cats.map((c, i) => <li key={c} className="flex items-center gap-2"><span className="inline-block size-3 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} aria-hidden="true" />{c}</li>)}
          </ul>
          <div className="overflow-x-auto">
            <div className="flex min-w-[480px] items-end gap-2" role="img" aria-label={`Changes per run by category. ${report.table.map((r) => `${r.id}: ${r.total}`).join(", ")}.`}>
              {report.table.map((r) => (
                <button key={r.id} type="button" onClick={() => setFocus(focus === r.id ? null : r.id)} className={`flex min-w-0 flex-1 flex-col items-center gap-1 transition-opacity ${focus && focus !== r.id ? "opacity-30" : ""}`}>
                  <span className="font-mono text-[11px] text-(--text-1)">{r.total}</span>
                  <span className="flex h-[160px] w-full max-w-[36px] flex-col-reverse overflow-hidden rounded-sm bg-(--bg-inset)">
                    {cats.map((c, i) => r.byCategory[c] ? <span key={c} style={{ height: `${(r.byCategory[c] / max) * 100}%`, background: SERIES[i % SERIES.length] }} /> : null)}
                  </span>
                  <span className="font-mono text-[11px] text-(--text-3)">{r.id}</span>
                  {/* Always one line tall, so every bar sits on the same baseline. */}
                  <span className="h-[14px] font-mono text-[10px] leading-[14px] text-(--st-declined)">{r.used === "no" ? "not used" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        {report.purpose && (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3)">What the agent is for (assumed)</p>
            <p className="text-[14px] text-(--text-2)">{report.purpose}</p>
          </div>
        )}
        {report.how_you_will_know && (
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-(--text-3)">How you will know</p>
            <p className="text-[14px] text-(--text-2)">{report.how_you_will_know} Nothing here promises a result; the next audit measures it.</p>
          </div>
        )}
      </div>

      <Panel eyebrow="Your call" title="Is this the right change?">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Your call">
            {([["accept", "I'll try it"], ["reject", "Not useful"], ["correct", "Close, but wrong"]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={verdict === k} onClick={() => setVerdict(k)} className={`rounded-(--radius-s) border px-3 py-2 text-[13px] ${verdict === k ? "border-(--accent-text) text-(--accent-text)" : "border-(--edge)"}`}>{l}</button>
            ))}
          </div>
          {verdict && <p role="status" className="text-[13px] text-(--text-3)">Noted on this page only; nothing is saved. Tell Shruti directly what you think, and audit again after your next ten runs.</p>}
          <div><button type="button" onClick={onRestart} className="text-[13px] underline underline-offset-2">Start over with other runs</button></div>
        </div>
      </Panel>

      {report.cannot_tell.length > 0 && (
        <div className="text-[12px] leading-relaxed text-(--text-3)">
          <p className="font-semibold">What this audit can&apos;t tell you</p>
          <ul className="mt-1 list-disc pl-5">{report.cannot_tell.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <p className="mt-2">Minutes are estimates from your answer, not measurements. Every number above is counted from your runs; the wording is drafted by {report.model === "fake" ? "a test stand-in" : "Claude"} and checked before it is shown.</p>
        </div>
      )}
    </section>
  );
}
