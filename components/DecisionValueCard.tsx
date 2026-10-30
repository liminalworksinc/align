"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { recordFacts } from "@/components/launch";
import type { ViewProps } from "@/components/props";
import { accepted, currentGoal } from "@/components/select";
import { Button } from "@/components/ui";
import { api } from "@/components/useAlign";
import { stillOnOldPlan } from "@/components/v6/OldPlanWork";
import { companyMeasureId, conflictMeasureId, labelsFor, poss } from "@/lib/labels";
import type { Acceptance, Proposal, ValueReport } from "@/lib/types";
import { ESTIMATES, MAX_VALUE_TEXT, VALUE_QUESTION, estimateSaid, spanWords, type Estimate, type FunnelAction } from "@/lib/value";

// "What this decision gave you" (issue #30 item 2, LIM-2445). Custom workspaces, once the proposal is RATIFIED, for every
// role, on Your turn and on the decision record. Every fact comes from /api/state; the measured times come from the
// proposal's and the acceptance's own timestamps. The tester's estimate is shown as theirs, apart from what was measured.
// Funnel events go through POST /api/timer (no new route); the server keeps the first of each per role and proposal.

const PITCH = "Liminal helps prevent wasted AI-agent work by giving teams one approved plan as priorities change.";
// The LOI link's words say what opening it does. Default target: the waitlist form, whose last step is the optional LOI.
// Opening the link signs nothing; an operator-set ALIGN_LOI_URL (a page or an email) gets the plain request wording.
const LOI_IN_FORM = "Want to evaluate Align on a real workflow? The waitlist form ends with an optional, non-binding letter of intent.";
const LOI_ELSEWHERE = "Want to evaluate Align on a real workflow? Ask about a non-binding letter of intent.";
const sent = new Set<string>(); // value_card_viewed already sent from this page, per workspace, proposal and role

function when(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const post = (workspace: string, body: Record<string, unknown>) => api<{ ok: boolean; report?: ValueReport }>("/api/timer", { body, workspace });

/** The card, or nothing until the latest proposal is RATIFIED in a custom scenario. */
export function DecisionValueCard(props: ViewProps) {
  const L = labelsFor(props.s);
  const acc = accepted(props.s);
  const p = acc ? props.s.proposals.find((x) => x.id === acc.proposal_id) : undefined;
  if (L.northstar || !acc || !p || p.state !== "RATIFIED") return null;
  return <ValueCard props={props} acc={acc} p={p} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-t border-zinc-200 pt-3">
      <span className="al-lbl">{label}</span>
      <div className="min-w-0 text-[15px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}

function ValueCard({ props, acc, p }: { props: ViewProps; acc: Acceptance; p: Proposal }) {
  const { s, me, workspace, nextStep } = props;
  const L = labelsFor(s);
  const actor = me.actor;
  const mark = (action: FunnelAction) => void post(workspace, { action, proposal_id: p.id }).catch(() => undefined);

  // value_card_viewed once the card is at least half on screen (or fills half the screen), once per workspace, proposal and role. No
  // IntersectionObserver, no event: a card below the fold that nobody scrolled to was not viewed.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = `${workspace}:${p.id}:${actor}`;
    const el = ref.current;
    if (sent.has(key) || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        // Half the card on screen, or (a card taller than two screens, as on a phone) half the screen filled by it.
        const seen = (e: IntersectionObserverEntry) =>
          e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= 0.5 * (e.rootBounds?.height ?? window.innerHeight));
        if (!entries.some(seen) || sent.has(key)) return;
        sent.add(key);
        io.disconnect();
        void post(workspace, { action: "value_card_viewed", proposal_id: p.id }).catch(() => sent.delete(key));
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [workspace, p.id, actor]);

  // The accepted change: the owning team's target before and after.
  const before = s.goals.find((g) => g.id === p.target_goal_id);
  const oldTarget = before?.measures.find((m) => m.id === (acc.replaced_measure_id ?? conflictMeasureId(s)))?.text ?? before?.objective ?? "";
  const newTarget = recordFacts(s, acc).target;
  const company = currentGoal(s, "ceo")?.measures.find((m) => m.id === companyMeasureId(s))?.text ?? currentGoal(s, "ceo")?.objective ?? "";

  // Who approved, and when.
  const d = acc.launch_decision;
  const launch =
    d?.decision === "approved"
      ? `Approved by ${L.person.leadership}${d.untested ? ", without a sandbox test" : ""}, ${when(d.at)}`
      : d?.decision === "not_yet"
        ? `Not yet: ${L.person.leadership} said not yet, ${when(d.at)}`
        : `Not decided yet. ${L.person.leadership} decides the launch.`;

  // Work: the owning team's items tied to the goal that changed, split the way the Work screen splits them.
  const owning = (acc.owning_work_item_ids ?? []).map((id) => s.work_items.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
  const oldIds = new Set(stillOnOldPlan(s).map((w) => w.id));
  const onNew = owning.filter((w) => !oldIds.has(w.id));
  const onOld = owning.filter((w) => oldIds.has(w.id));

  // Measured, from timestamps only.
  const toAgreement = spanWords(p.created_at, acc.ratified_at);
  const toLaunch = d ? spanWords(p.created_at, d.at) : null;

  return (
    <section ref={ref} aria-label="What this decision gave you" className="flex flex-col gap-3 rounded-[14px] border border-zinc-200 bg-white p-[18px]">
      <h2 className="text-[20px] font-semibold leading-snug text-zinc-900">What this decision gave you</h2>

      <Row label="Accepted change">
        <span className="text-zinc-500">{poss(L.team.security)} target was:</span> {oldTarget || "—"}
        <br />
        <span className="text-zinc-500">Now:</span> <span className="font-semibold">{newTarget || "—"}</span>
      </Row>

      <Row label="Who approved">
        <ul className="flex flex-col gap-1">
          <li>
            {L.person.security} ({L.team.security}) approved goal {acc.accepted_version}, {when(acc.ratified_at)}
          </li>
          <li>
            {acc.acknowledged_via === "explicit"
              ? `${L.person.product} (${L.team.product}) accepted the changes, ${when(acc.acknowledged_at)}`
              : `${L.person.product} (${L.team.product}) proposed it, ${when(p.created_at)}`}
          </li>
          <li>
            <span className="font-semibold">Launch decision:</span> {launch}
          </li>
        </ul>
      </Row>

      <Row label="Affected goals and teams">
        <ul className="flex flex-col gap-1">
          <li>
            {poss(L.team.security)} goal {p.target_goal_version} → {acc.accepted_version}
          </li>
          {company && (
            <li>
              {poss(L.team.ceo)} goal it serves: {company}
            </li>
          )}
          <li>Teams: {[L.team.ceo, L.team.product, L.team.security].join(", ")}</li>
        </ul>
      </Row>

      <Row label="Work">
        {owning.length === 0 ? (
          <span>No work items were tied to this goal</span>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-semibold text-[var(--al-pass)]">On the new plan ({onNew.length})</span>
              {onNew.length ? onNew.map((w) => <span key={w.id}>{w.task}</span>) : <span className="text-zinc-500">None yet</span>}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-semibold text-amber-700">Still on the old plan ({onOld.length})</span>
              {onOld.length ? onOld.map((w) => <span key={w.id}>{w.task}</span>) : <span className="text-zinc-500">None</span>}
            </div>
          </div>
        )}
      </Row>

      <Row label="Measured in Align">
        <ul className="flex flex-col gap-1">
          <li>
            Proposal to agreement: <span className="font-semibold">{toAgreement ?? "—"}</span>
          </li>
          <li>
            {d ? (
              <>
                Proposal to launch decision ({d.decision === "approved" ? "approved" : "not yet"}): <span className="font-semibold">{toLaunch ?? "—"}</span>
              </>
            ) : (
              "Proposal to launch decision: no launch decision yet"
            )}
          </li>
        </ul>
      </Row>

      <Feedback props={props} p={p} measured={toAgreement} />

      {(nextStep?.waitlist || nextStep?.loi) && (
        <div className="flex flex-col gap-2.5 border-t border-zinc-200 pt-3">
          <p className="text-[15px] text-zinc-700">{PITCH}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {nextStep?.waitlist && (
              <a
                href={nextStep.waitlist}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => mark("waitlist_clicked")}
                className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-transparent bg-violet-700 px-[18px] text-[15px] font-semibold text-black hover:brightness-112 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
              >
                Join the Align waitlist
              </a>
            )}
            {nextStep?.loi && (
              <a
                href={nextStep.loi}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => mark("loi_cta_clicked")}
                className="text-[14px] text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
              >
                {nextStep.loi === nextStep.waitlist ? LOI_IN_FORM : LOI_ELSEWHERE}
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The one optional question, then the answer beside the measured time, each labelled as what it is. */
function Feedback({ props, p, measured }: { props: ViewProps; p: Proposal; measured: string | null }) {
  const stored = props.s.funnel?.reports.find((r) => r.proposal_id === p.id) ?? null; // the server sends only this role's own
  const [mine, setMine] = useState<ValueReport | null>(null);
  const [choice, setChoice] = useState<Estimate | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const report = stored ?? mine;

  if (report)
    return (
      <div aria-label="Your answer" className="flex flex-col gap-1.5 border-t border-zinc-200 pt-3 text-[15px]">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span>
            <span className="text-zinc-500">Your estimate:</span> <span className="font-semibold">{estimateSaid(report.estimate)}</span>
          </span>
          <span aria-hidden className="text-zinc-400">
            ·
          </span>
          <span>
            <span className="text-zinc-500">Measured here:</span> <span className="font-semibold">{measured ?? "—"}</span>
          </span>
        </p>
        {report.text && <p className="text-zinc-700">“{report.text}”</p>}
      </div>
    );

  const send = async () => {
    if (!choice) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await post(props.workspace, { action: "value_reported", proposal_id: p.id, feedback: { estimate: choice, ...(text.trim() ? { text } : {}) } });
      if (r.report) setMine(r.report);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
      <legend className="float-left mb-1 w-full text-[15px] font-semibold text-zinc-900">
        {VALUE_QUESTION} <span className="font-normal text-zinc-500">Optional</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {ESTIMATES.map((e) => (
          <label
            key={e.id}
            className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[14px] ${choice === e.id ? "border-violet-700 bg-violet-50 text-zinc-900" : "border-zinc-300 text-zinc-800 hover:bg-zinc-100"}`}
          >
            <input type="radio" name={`estimate-${p.id}`} value={e.id} checked={choice === e.id} onChange={() => setChoice(e.id)} className="accent-violet-700" />
            {e.label}
          </label>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={MAX_VALUE_TEXT}
        aria-label="Anything to add (optional)"
        placeholder="Anything to add (optional)"
        className="w-full rounded-[10px] border border-zinc-300 p-2.5 text-[14px] text-zinc-900"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button kind="secondary" disabled={!choice || busy} onClick={() => void send()}>
          Save my answer
        </Button>
        {err && (
          <span role="alert" className="text-[14px] text-red-700">
            {err}
          </span>
        )}
      </div>
    </fieldset>
  );
}
