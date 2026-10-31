"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AGREED_STATUS, CONDITIONS_UNCONFIRMED, companyMeasureId, conditionsUnconfirmedNote, conflictMeasureId, customStateLabel, labelsFor, poss, type Labels } from "@/lib/labels";
import type { Actor, Proposal, ProposalState, StateView } from "@/lib/types";
import { NextStepAction, ProgressStrip } from "./Handoff";
import type { ViewProps } from "./props";
import { currentGoal } from "./select";
import { Badge, Button, ForEngineers, STATE_LABEL, StateBadge, fmtTime } from "./ui";
import { api } from "./useAlign";
import { Collapsible, NumberedLines, Option, conditionLines } from "./v6/thread";

// Lane C (custom scenarios, open proposals only): understand the change, then decide.
// Order on screen: what is approved vs what is proposed -> what would change (derived from the request text, never
// evidence) -> the decisions this role may take in this state -> that decision's one required input -> a
// confirmation -> the same API call and body as before. The server still revalidates every write (lib/flow.ts);
// nothing here widens or narrows what it accepts. Northstar keeps its own review screen unchanged.

/** Mirrors lib/flow.ts MAX_CONDITIONS (the server refuses longer conditions). */
const MAX_CONDITIONS = 1000;
const MAX_TARGET = 300;

export type Decision = "approve" | "acceptIf" | "counter" | "decline" | "acknowledge";
type Run = <T>(path: string, body?: unknown) => Promise<T | null>;
/** A notice that must survive the remount a state change causes (ProposalsView keeps it). */
export type ReviewNotice = { kind: "stale" | "refused" | "done"; text: string } | null;

const inputCls =
  "w-full rounded-lg bg-white px-3 py-2 text-[16px] leading-relaxed text-zinc-900 ring-1 ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

/**
 * What lib/flow.ts lets this role do to this proposal in this state, for the custom scenario.
 * recipient (owning team): PENDING_SECURITY | ACKNOWLEDGED_BY_PRODUCT -> approve (ratify), accept if (counter, same
 * target + conditions), counter, decline (reject). proposer (asking team): COUNTERED -> acknowledge. Everyone else, and
 * every other state: nothing (the screen says whose move it is). flow.ts also lets the owner reject while COUNTERED;
 * the screen has never offered that, and this lane keeps it that way.
 */
export function allowedDecisions(p: Proposal, actor: Actor | null | undefined): Decision[] {
  if (actor === p.recipient_owner && (p.state === "PENDING_SECURITY" || p.state === "ACKNOWLEDGED_BY_PRODUCT"))
    return ["approve", "acceptIf", "counter", "decline"];
  if (actor === p.proposing_owner && p.state === "COUNTERED") return ["acknowledge"];
  return [];
}

/** Mirrors the custom profile's nextVersion (lib/scenario-profile.ts): v1 -> v2. */
const nextVersion = (v: string | undefined) => `v${(parseInt(String(v ?? "").replace(/^v/, ""), 10) || 1) + 1}`;

function stateText(state: ProposalState | string, L: Labels): string {
  return customStateLabel(state, L) ?? STATE_LABEL[state] ?? state;
}

function Card({ children, tone = "plain", label }: { children: ReactNode; tone?: "plain" | "readonly" | "violet"; label?: string }) {
  const c = { plain: "bg-white ring-zinc-200", readonly: "bg-zinc-50 ring-zinc-200", violet: "bg-violet-50 ring-violet-300" }[tone];
  return (
    <div aria-label={label} className={`min-w-0 rounded-xl p-4 ring-1 ${c}`}>
      {children}
    </div>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="al-lbl !text-[11px]">{k}</dt>
      <dd className="text-[15px] text-zinc-900 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function ReviewDecide(
  props: ViewProps & { p: Proposal; busy: boolean; run: Run; notice: ReviewNotice; setNotice: (n: ReviewNotice) => void; tryApprove: ReactNode },
) {
  const { s, me, p, busy, notice, setNotice } = props;
  const L = labelsFor(s);
  const who = (k: string) => (L.person as Record<string, string>)[k] ?? k;
  const own = L.team.security;
  const ask = L.team.product;
  const target = s.goals.find((g) => g.id === p.target_goal_id);
  const approverSlot = target?.owner_id ?? "security";
  const replaced = target?.measures.find((m) => m.id === conflictMeasureId(s));
  const otherMeasures = target?.measures.filter((m) => m.id !== replaced?.id) ?? [];
  const lastCounter = p.counter_versions.at(-1);
  const latestText = lastCounter?.proposed_measure_text ?? p.proposed_measure_text;
  const revisionId = lastCounter?.version ?? "original proposal";
  const revisionLabel = lastCounter ? `Revision ${lastCounter.version}` : "Original proposal";
  const conditions = conditionLines(lastCounter?.conditions);
  const runs = s.simulations.filter((r) => p.simulation_refs.includes(r.id));
  const plan = s.plans.find((x) => x.plan_id === p.plan_ref.plan_id && x.plan_version === p.plan_ref.plan_version);
  const ceo = currentGoal(s, "ceo");
  const companyNow = ceo?.measures.find((m) => m.id === companyMeasureId(s))?.text;
  const decisions = allowedDecisions(p, me.actor);
  const actorName = me.actor ? `${who(me.actor)} (${L.role[me.actor]})` : "Not known";
  // Custom: every approval of a plan without a passing sandbox test needs accept_untested (the server refuses otherwise).
  const needsUntestedAck = p.test_status !== "TESTED";
  const approvedVersion = lastCounter?.version ?? nextVersion(target?.version);
  const counterVersion = `${nextVersion(target?.version)}.${p.counter_versions.length + 1}`;

  const [choice, setChoice] = useState<Decision | null>(null);
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [untested, setUntested] = useState(false);
  const [condText, setCondText] = useState("");
  const [counterText, setCounterText] = useState(latestText);
  const [why, setWhy] = useState("");
  const [counterConds, setCounterConds] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const firstInput = useRef<HTMLElement | null>(null);
  const errRef = useRef<HTMLParagraphElement | null>(null);
  const confirmHead = useRef<HTMLHeadingElement | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const picked = useRef(false);

  // Focus follows the step: the revealed input after a choice, the confirmation heading, the error.
  useEffect(() => {
    if (!picked.current) return;
    if (step === "confirm") confirmHead.current?.focus();
    else firstInput.current?.focus();
  }, [choice, step]);
  useEffect(() => {
    if (err) errRef.current?.focus();
  }, [err]);
  useEffect(() => {
    if (notice && notice.kind !== "done") noticeRef.current?.focus();
  }, [notice]);

  const pick = (d: Decision) => {
    picked.current = true;
    setChoice(d);
    setStep("input");
    setErr(null);
    setNotice(null);
  };

  const condLines = conditionLines(condText);
  const condJoined = condLines.join("\n");
  const counterCondLines = conditionLines(counterConds);

  const TITLE: Record<Decision, string> = {
    approve: "Approve this exact revision",
    acceptIf: "Accept if…",
    counter: "Counter",
    decline: "Decline",
    acknowledge: `Accept ${poss(own)} changes`,
  };
  const SUB: Record<Decision, string> = {
    approve: `It becomes ${poss(own)} goal ${approvedVersion}`,
    acceptIf: "Keep the target, add conditions",
    counter: "Propose a different target",
    decline: `${poss(own)} goal stays at ${target?.version ?? "its current version"}`,
    acknowledge: "Then the owner gives the final approval",
  };

  function validate(): string | null {
    if (choice === "approve" && needsUntestedAck && !untested) return "Tick the box to approve this plan without a sandbox test. The server refuses the approval without it.";
    if (choice === "acceptIf") {
      if (!condLines.length) return "Write at least one condition, one per line.";
      if (condJoined.length > MAX_CONDITIONS) return `Keep the conditions to ${MAX_CONDITIONS} characters or fewer.`;
    }
    if (choice === "counter") {
      if (!counterText.trim()) return "Write your revised target.";
      if (counterText.trim() === latestText.trim() && !counterCondLines.length)
        return "Your target is the same as the one under review. Change it, or choose Accept if… to keep it and add conditions.";
      if (counterCondLines.join("\n").length > MAX_CONDITIONS) return `Keep the conditions to ${MAX_CONDITIONS} characters or fewer.`;
    }
    return null;
  }

  function request(): { path: string; body: Record<string, unknown> } | null {
    const base = `/api/proposals/${p.id}`;
    switch (choice) {
      case "approve":
        return { path: `${base}/accept`, body: needsUntestedAck ? { rationale: why, accept_untested: true } : { rationale: why } };
      case "acceptIf":
        return { path: `${base}/counter`, body: { proposed_measure_text: latestText, rationale: why, conditions: condJoined } };
      case "counter":
        return {
          path: `${base}/counter`,
          body: { proposed_measure_text: counterText, rationale: why, ...(counterCondLines.length ? { conditions: counterCondLines.join("\n") } : {}) },
        };
      case "decline":
        return { path: `${base}/reject`, body: {} };
      case "acknowledge":
        return { path: `${base}/acknowledge`, body: {} };
      default:
        return null;
    }
  }

  const review = () => {
    const v = validate();
    if (v) {
      setErr(null); // re-set so focus moves even when the same message repeats
      queueMicrotask(() => setErr(v));
      return;
    }
    setErr(null);
    setStep("confirm");
  };

  const submit = async () => {
    const req = request();
    if (!req || sending) return;
    setSending(true);
    try {
      // The screen's own freshness check: is the revision on screen still the one the server holds? The server checks
      // again on the write (a 409 for a state that no longer allows this); this only makes the common case plain.
      try {
        const now = await api<StateView>("/api/state");
        const cur = now.proposals?.find((x) => x.id === p.id);
        if (cur && (cur.state !== p.state || cur.counter_versions.length !== p.counter_versions.length)) {
          const v = cur.counter_versions.at(-1)?.version ?? "the original proposal";
          setNotice({
            kind: "stale",
            text: `Not recorded. This request changed after you opened it: it is now “${stateText(cur.state, L)}” at ${v}. Nothing was sent. Read the current version below and decide again.`,
          });
          return;
        }
      } catch {
        // Couldn't read the latest state: send anyway and let the server decide (it revalidates every write).
      }
      const out = await props.run(req.path, req.body);
      if (out) {
        setNotice({ kind: "done", text: `Recorded: ${confirmDecisionLine()}.` });
      } else {
        setNotice({
          kind: "refused",
          text: "Not recorded. The server refused this decision, so nothing changed. Its reason is shown at the top of the page. If the request changed meanwhile, read the current version below and decide again.",
        });
      }
    } finally {
      setSending(false);
    }
  };

  function confirmDecisionLine(): string {
    switch (choice) {
      case "approve":
        return `you approved ${revisionLabel.toLowerCase()} as ${poss(own)} goal ${approvedVersion}`;
      case "acceptIf":
        return `you sent your conditions to ${ask}`;
      case "counter":
        return `you sent a revised target to ${ask}`;
      case "decline":
        return "you declined this request";
      case "acknowledge":
        return `you accepted ${poss(own)} changes`;
      default:
        return "";
    }
  }

  const transition = (): string => {
    const from = stateText(p.state, L);
    switch (choice) {
      case "approve":
        return `${from} → ${AGREED_STATUS}. ${poss(own)} goal becomes ${approvedVersion}; ${target?.version ?? "the current version"} is kept as superseded.`;
      case "acceptIf":
      case "counter":
        return `${from} → ${stateText("COUNTERED", L)}. Your version is recorded as revision ${counterVersion}.`;
      case "decline":
        return `${from} → ${STATE_LABEL.REJECTED}. ${poss(own)} goal stays at ${target?.version ?? "its current version"}.`;
      case "acknowledge":
        return `${from} → ${stateText("ACKNOWLEDGED_BY_PRODUCT", L)}. ${who(p.recipient_owner)} then gives the final approval.`;
      default:
        return "";
    }
  };

  const ackLine = (): string => {
    switch (choice) {
      case "approve":
        return p.product_ack_at && lastCounter
          ? `${ask} accepted revision ${lastCounter.version} at ${fmtTime(p.product_ack_at)} (their statement).`
          : `${ask} committed to its part when it sent the proposal. No further acknowledgement is outstanding.`;
      case "acceptIf":
      case "counter":
        return `Outstanding: ${ask} must accept your changes before you can give the final approval.`;
      case "decline":
        return "None. Declining needs no acknowledgement.";
      case "acknowledge":
        return conditions.length
          ? `Accepting is your statement that ${ask} accepts ${conditions.length === 1 ? "this condition" : "these conditions"}. Align records it; it doesn't verify ${conditions.length === 1 ? "it" : "them"}.`
          : `Accepting is your statement that ${ask} accepts this revision.`;
      default:
        return "";
    }
  };

  const enteredRows = (): [string, ReactNode][] => {
    const rows: [string, ReactNode][] = [];
    if (choice === "approve" && needsUntestedAck) rows.push(["Acknowledged", "Approving without a sandbox test. The record will say so."]);
    if (choice === "acceptIf") rows.push(["Your conditions", <NumberedLines key="c" lines={condLines} />]);
    if (choice === "counter") {
      rows.push(["Your revised target", <span key="t" className="whitespace-pre-wrap">{counterText.trim()}</span>]);
      if (counterCondLines.length) rows.push(["Your conditions", <NumberedLines key="c" lines={counterCondLines} />]);
    }
    if (why.trim() && choice !== "decline" && choice !== "acknowledge") rows.push(["Your reason", why.trim()]);
    if (!rows.length) rows.push(["What you entered", "Nothing. This decision needs no text."]);
    return rows;
  };

  return (
    <div className="max-w-[880px] min-w-0 space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={p.state} labels={L} />
          {needsUntestedAck && <Badge tone="amber">Not sandbox-tested</Badge>}
        </div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.01em] text-zinc-900 [overflow-wrap:anywhere]">
          Proposed change to {poss(own)} goal ({p.target_goal_version})
        </h1>
        <p className="text-[15px] text-zinc-600">Understand the change, then decide.</p>
        <ProgressStrip p={p} acc={null} L={L} viewer={me.actor ?? ""} />
      </header>

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          role={notice.kind === "done" ? "status" : "alert"}
          className={`rounded-[10px] px-4 py-2.5 text-[15px] text-zinc-900 ${focusRing} ${
            notice.kind === "done" ? "border border-zinc-300 bg-zinc-50" : "border border-red-700 bg-red-50"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* 1. Understand: approved vs proposed, with the facts a reviewer needs. */}
      <CompareBaseline
        id={p.id}
        approvedVersion={target?.version ?? "Not known"}
        approvedText={replaced?.text ?? target?.objective ?? "Not known"}
        approvedObjective={replaced ? target?.objective : undefined}
        otherMeasures={otherMeasures.map((m) => m.text)}
        proposedLabel={revisionLabel}
        proposedText={latestText}
        requester={who(p.proposing_owner)}
        approver={who(approverSlot)}
        stateLabel={stateText(p.state, L)}
      />

      {/* 2. What would change: derived from the request text, never evidence. */}
      <WhatWouldChange
        id={p.id}
        target={
          lastCounter && latestText.trim() === (p.counter_versions.at(-2)?.proposed_measure_text ?? p.proposed_measure_text).trim()
            ? `Kept as ${ask} proposed: “${latestText}”.`
            : replaced
              ? `“${replaced.text}” would be replaced by “${latestText}”.`
              : `“${latestText}” would be added as a new target. No current target is replaced (the one this conflict was about was already changed in an earlier version).`
        }
        statements={[
          { label: `${ask} would do in return.`, text: p.reciprocal_commitment ? `“${p.reciprocal_commitment}”` : "Nothing stated." },
          ...(p.rationale ? [{ label: `${poss(ask)} reason, as written.`, text: `“${p.rationale}”` }] : []),
          ...(lastCounter?.rationale ? [{ label: `${poss(own)} reason for revision ${lastCounter.version}, as written.`, text: `“${lastCounter.rationale}”` }] : []),
        ]}
        conditions={conditions}
        conditionsBy={own}
        conditionsAck={
          p.product_ack_at && conditions.length
            ? `${ask} said it accepts ${conditions.length === 1 ? "this condition" : "these conditions"} at ${fmtTime(p.product_ack_at)}. That is their statement, not a check.`
            : undefined
        }
        context={companyNow ? `Why this came up: ${poss(L.team.ceo)} requirement, “${companyNow}”` : undefined}
        evidence={runs.map((r) => ({
          id: r.id,
          failed: r.verdict === "FAIL",
          text: `Source: sandbox run, ${r.checks.filter((c) => c.passed).length} of ${r.checks.length} checks passed`,
        }))}
        plan={plan?.text ? { title: plan.title, text: plan.text } : undefined}
      />

      {/* 3-4. Decide: choose first, then that choice's one required input, then confirm. */}
      {decisions.length > 0 ? (
        <section aria-labelledby={`decide-${p.id}`} className="space-y-3 border-t border-zinc-200 pt-4">
          <h2 id={`decide-${p.id}`} className="al-lbl">
            Your decision
          </h2>
          {step === "input" && (
            <>
              <p className="text-[15px] text-zinc-700">
                {decisions.length > 1 ? "Choose what should happen. Nothing is sent until you confirm." : "Nothing is sent until you confirm."}
              </p>
              <div role="group" aria-label="Your answer" className="flex flex-wrap gap-2.5">
                {decisions.map((d) => (
                  <Option key={d} on={choice === d} title={TITLE[d]} sub={SUB[d]} onPick={() => pick(d)} />
                ))}
              </div>
            </>
          )}

          {choice && step === "input" && (
            <div className="al-in space-y-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
              {choice === "approve" &&
                (needsUntestedAck ? (
                  <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-[16px] text-amber-950 ring-1 ring-amber-300">
                    <input
                      ref={(el) => {
                        firstInput.current = el;
                      }}
                      type="checkbox"
                      className={`mt-1 size-4 accent-violet-700 ${focusRing}`}
                      checked={untested}
                      onChange={(e) => setUntested(e.target.checked)}
                    />
                    <span>
                      <span className="font-semibold">I&apos;m approving this plan without a sandbox test</span>
                      <span className="block text-[15px] text-amber-900">The decision record will say it was approved as not sandbox-tested.</span>
                    </span>
                  </label>
                ) : (
                  <p className="text-[15px] text-zinc-700">This approval needs no text.</p>
                ))}
              {choice === "acceptIf" && (
                <label className="block">
                  <span className="mb-1 block text-[15px] font-semibold text-zinc-800">I&apos;ll accept if… (one condition per line)</span>
                  <textarea
                    ref={(el) => {
                      firstInput.current = el;
                    }}
                    className={inputCls}
                    rows={3}
                    maxLength={MAX_CONDITIONS}
                    value={condText}
                    onChange={(e) => setCondText(e.target.value)}
                  />
                  <span className="mt-1 block text-[14px] text-zinc-500">The target stays as written. {ask} accepts the conditions, then you give the final approval.</span>
                </label>
              )}
              {choice === "counter" && (
                <label className="block">
                  <span className="mb-1 block text-[15px] font-semibold text-zinc-800">Your revised target</span>
                  <textarea
                    ref={(el) => {
                      firstInput.current = el;
                    }}
                    className={inputCls}
                    rows={3}
                    maxLength={MAX_TARGET}
                    value={counterText}
                    onChange={(e) => setCounterText(e.target.value)}
                  />
                  {counterText.length >= MAX_TARGET && <span className="mt-1 block text-[14px] text-amber-700">Keep the target under {MAX_TARGET} characters.</span>}
                </label>
              )}
              {choice === "decline" && (
                <p className="text-[15px] text-zinc-700">
                  Declining needs no text. {poss(own)} goal stays as it is, and {ask} sees that you declined.
                </p>
              )}
              {choice === "acknowledge" && (
                <p className="text-[15px] text-zinc-700">
                  Accepting needs no text. It sends the request back to {who(p.recipient_owner)} for the final approval.
                </p>
              )}

              {(choice === "approve" || choice === "acceptIf" || choice === "counter") && (
                <div>
                  <button
                    type="button"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((o) => !o)}
                    className={`inline-flex min-h-[44px] items-center rounded text-[14px] font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-900 ${focusRing}`}
                  >
                    {choice === "counter" ? "Add a reason or conditions (optional)" : "Add a reason (optional)"}
                  </button>
                  {moreOpen && (
                    <div className="al-in mt-2 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Your reason (optional)</span>
                        <input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} />
                      </label>
                      {choice === "counter" && (
                        <label className="block">
                          <span className="mb-1 block text-[15px] font-semibold text-zinc-700">Conditions (optional, one per line)</span>
                          <textarea className={inputCls} rows={2} maxLength={MAX_CONDITIONS} value={counterConds} onChange={(e) => setCounterConds(e.target.value)} />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}

              {err && (
                <p ref={errRef} tabIndex={-1} role="alert" className={`rounded-lg border border-red-700 bg-red-50 px-3 py-2 text-[15px] text-zinc-900 ${focusRing}`}>
                  {err}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  wrap
                  onClick={review}
                  ref={(el) => {
                    if (choice === "decline" || choice === "acknowledge" || (choice === "approve" && !needsUntestedAck)) firstInput.current = el;
                  }}
                >
                  Review this decision
                </Button>
              </div>
            </div>
          )}

          {/* 4. Confirmation: everything the commit will do, before it does it. */}
          {choice && step === "confirm" && (
            <div className="al-in space-y-3 rounded-xl bg-white p-4 ring-1 ring-violet-300" aria-labelledby={`confirm-${p.id}`} role="region">
              <h3 id={`confirm-${p.id}`} ref={confirmHead} tabIndex={-1} className={`text-[18px] font-semibold text-zinc-900 ${focusRing}`}>
                Confirm: {TITLE[choice]}
              </h3>
              <dl className="space-y-2.5 text-[15px] text-zinc-900">
                <ConfirmRow k="Acting as">{actorName}</ConfirmRow>
                <ConfirmRow k="On">
                  <span className="block font-semibold">{revisionLabel}</span>
                  <span className="block whitespace-pre-wrap">“{latestText}”</span>
                </ConfirmRow>
                <ConfirmRow k="Decision">{TITLE[choice]}</ConfirmRow>
                {enteredRows().map(([k, v]) => (
                  <ConfirmRow key={k} k={k}>
                    {v}
                  </ConfirmRow>
                ))}
                <ConfirmRow k="What happens">{transition()}</ConfirmRow>
                <ConfirmRow k={`${ask}’s acknowledgement`}>{ackLine()}</ConfirmRow>
                <ConfirmRow k="Launch">
                  {choice === "decline"
                    ? "Nothing goes to launch. The goal stays as it is."
                    : `Approval is not launch. ${L.person.leadership} decides the launch separately, after the two teams agree.`}
                </ConfirmRow>
              </dl>
              <p className="text-[13px] text-zinc-500">The server checks this again when you confirm. If the request changed meanwhile, it is refused and nothing changes.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button wrap disabled={busy || sending} onClick={() => void submit()}>
                  {busy || sending ? "Recording…" : choice === "decline" ? "Confirm: decline this request" : `Confirm: ${TITLE[choice].replace(/…$/, "")}`}
                </Button>
                <Button
                  kind="secondary"
                  disabled={busy || sending}
                  onClick={() => {
                    setStep("input");
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          <p className="rounded-lg bg-zinc-50 px-3.5 py-2.5 text-[14px] text-zinc-600 ring-1 ring-zinc-200">
            Agreement between two teams is not approval to launch. {L.person.leadership} decides the launch.
          </p>
        </section>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
          {me.actor === p.recipient_owner && p.state === "COUNTERED" ? (
            <Badge tone="amber" wrap>
              Waiting for {ask} to accept your changes
            </Badge>
          ) : me.actor === p.proposing_owner ? (
            <Badge tone="amber" wrap>
              {p.state === "PENDING_SECURITY" ? `Waiting for ${who("security")}` : `You accepted the changes · waiting for ${who("security")} to approve`}
            </Badge>
          ) : (
            <span className="min-w-0 flex-[1_1_16rem] text-[15px] text-zinc-700">
              Only {who(approverSlot)} can decide on this request. {me.actor === "leadership" ? "Your decision is the launch, after the two teams agree." : ""}
            </span>
          )}
          {me.actor === p.proposing_owner && props.tryApprove}
          <NextStepAction p={p} viewer={me.actor ?? ""} L={L} onSwitch={props.switchTeam} />
        </div>
      )}

      <History p={p} L={L} />

      {/* 5. Technical fields: kept, behind a disclosure. */}
      <ForEngineers label="Details">
        <div>proposal_id: {p.id}</div>
        <div>state: {p.state}</div>
        <div>
          target_goal: {p.target_goal_id} ({p.target_goal_version})
        </div>
        <div>revision_under_review: {revisionId}</div>
        <div>revisions: {p.counter_versions.length ? p.counter_versions.map((c) => c.version).join(", ") : "none"}</div>
        <div>approver_slot: {approverSlot}</div>
        <div>test_status: {p.test_status}</div>
        <div>
          plan_ref: {p.plan_ref.plan_id}@{p.plan_ref.plan_version} · hash {p.plan_ref.plan_hash}
        </div>
        <div>simulation_refs (sandbox ids): {p.simulation_refs.length ? p.simulation_refs.join(", ") : "none"}</div>
        <div>source_refs: {p.source_refs.length ? p.source_refs.join(", ") : "none"}</div>
        <div>created_at: {p.created_at}</div>
        <div>product_ack_at: {p.product_ack_at ?? "none"}</div>
      </ForEngineers>
    </div>
  );
}

// ---- Presentational pieces, props only and no data fetching, so a later decision-workflow lens can reuse them. ----

/** Approved vs proposed, side by side (stacked in a narrow column), with the baseline facts a reviewer needs. */
export function CompareBaseline(props: {
  id: string;
  approvedVersion: string;
  approvedText: string;
  approvedObjective?: string;
  otherMeasures?: string[];
  proposedLabel: string;
  proposedText: string;
  requester: string;
  approver: string;
  stateLabel: string;
}) {
  return (
    <section aria-labelledby={`understand-${props.id}`} className="space-y-3">
      <h2 id={`understand-${props.id}`} className="al-lbl">
        Approved now and proposed
      </h2>
      <div className="grid min-w-0 gap-3 @[660px]:grid-cols-2">
        <Card tone="readonly" label="Approved now">
          <div className="al-lbl !text-[11px]">Approved · {props.approvedVersion}</div>
          <p className="mt-1 text-[16px] font-semibold text-zinc-900 [overflow-wrap:anywhere]">{props.approvedText}</p>
          {props.approvedObjective && <p className="mt-1 text-[14px] text-zinc-600 [overflow-wrap:anywhere]">Goal: {props.approvedObjective}</p>}
          {!!props.otherMeasures?.length && (
            <ul className="mt-2 space-y-0.5 text-[14px] text-zinc-600">
              {props.otherMeasures.map((m, i) => (
                <li key={i} className="[overflow-wrap:anywhere]">
                  {props.approvedObjective ? "Also measured on" : "Measured on"}: {m}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card tone="violet" label="Proposed">
          <div className="al-lbl !text-[11px] !text-violet-700">Proposed · {props.proposedLabel}</div>
          <p className="mt-1 whitespace-pre-wrap text-[16px] font-semibold text-zinc-900 [overflow-wrap:anywhere]">{props.proposedText}</p>
          <p className="mt-1 text-[14px] text-zinc-600">Not approved. It changes nothing until {props.approver} approves it.</p>
        </Card>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 @[660px]:grid-cols-4">
        <Fact k="Approved version">{props.approvedVersion}</Fact>
        <Fact k="Requested by">{props.requester}</Fact>
        <Fact k="Decides">{props.approver}</Fact>
        <Fact k="Request state">{props.stateLabel}</Fact>
      </dl>
    </section>
  );
}

/** What the request says would change. Always labelled as read from the request text, never as evidence; evidence is
 *  listed separately with its source, or "Evidence unavailable". */
export function WhatWouldChange(props: {
  id: string;
  target: string;
  statements: { label: string; text: string }[];
  conditions: string[];
  conditionsBy: string;
  conditionsAck?: string;
  context?: string;
  evidence: { id: string; failed: boolean; text: string }[];
  plan?: { title?: string; text: string };
}) {
  return (
    <section aria-labelledby={`change-${props.id}`} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`change-${props.id}`} className="al-lbl">
          What would change
        </h2>
        <Badge tone="neutral" wrap>
          From the request text · not evidence
        </Badge>
      </div>
      <ul className="space-y-2.5 rounded-xl bg-white p-4 text-[15px] text-zinc-900 ring-1 ring-zinc-200">
        <li className="[overflow-wrap:anywhere]">
          <b>Target.</b> {props.target}
        </li>
        {props.statements.map((st) => (
          <li key={st.label} className="[overflow-wrap:anywhere]">
            <b>{st.label}</b> {st.text}
          </li>
        ))}
        {props.conditions.length > 0 && (
          <li className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <b>{poss(props.conditionsBy)} conditions</b>
              <Badge tone="amber">{CONDITIONS_UNCONFIRMED}</Badge>
            </div>
            <NumberedLines lines={props.conditions} />
            <p className="text-[13px] text-zinc-500">{conditionsUnconfirmedNote(props.conditions.length)}</p>
            {props.conditionsAck && <p className="text-[13px] text-zinc-600">{props.conditionsAck}</p>}
          </li>
        )}
        {props.context && <li className="text-[14px] text-zinc-600 [overflow-wrap:anywhere]">{props.context}</li>}
      </ul>
      <div className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <div className="al-lbl !text-[11px]">Evidence</div>
        {props.evidence.length > 0 ? (
          <ul className="space-y-1.5 text-[15px]">
            {props.evidence.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={r.failed ? "red" : "neutral"}>{r.failed ? "Failed" : "Passed"}</Badge>
                <span className="text-zinc-900">{r.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[15px] text-zinc-700">
            <Badge tone="amber">Evidence unavailable</Badge>
            <span>No test result is attached to this request. Nothing in it was run or checked.</span>
          </div>
        )}
        {props.plan && (
          <Collapsible title={`The plan as written${props.plan.title ? `: ${props.plan.title}` : ""}`}>
            <p className="whitespace-pre-wrap text-[15px] text-zinc-900 [overflow-wrap:anywhere]">{props.plan.text}</p>
            <p className="mt-1 text-[14px] text-zinc-600">Plan text from setup. It is a description, not a test result.</p>
          </Collapsible>
        )}
      </div>
    </section>
  );
}

function ConfirmRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 @[540px]:grid-cols-[11rem_minmax(0,1fr)] @[540px]:gap-3">
      <dt className="al-lbl !text-[11px] pt-0.5">{k}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Every version of the target in order, so a reviewer can see how it got here. Plain text only. */
function History({ p, L }: { p: Proposal; L: Labels }) {
  const who = (k: string) => (L.person as Record<string, string>)[k] ?? k;
  return (
    <Collapsible title={`History (${p.counter_versions.length + 1} version${p.counter_versions.length ? "s" : ""})`}>
      <ol className="space-y-2 text-[15px] text-zinc-900">
        <li className="[overflow-wrap:anywhere]">
          <span className="font-semibold">Original proposal</span> · {who(p.proposing_owner)} · {fmtTime(p.created_at)}
          <span className="block whitespace-pre-wrap text-zinc-700">{p.proposed_measure_text}</span>
        </li>
        {p.counter_versions.map((c) => {
          const lines = conditionLines(c.conditions);
          return (
            <li key={c.version} className="[overflow-wrap:anywhere]">
              <span className="font-semibold">Revision {c.version}</span> · {who(c.by)} · {fmtTime(c.at)}
              <span className="block whitespace-pre-wrap text-zinc-700">{c.proposed_measure_text}</span>
              {lines.length > 0 && (
                <span className="mt-1 block">
                  <span className="text-[13px] text-zinc-500">Conditions ({CONDITIONS_UNCONFIRMED.toLowerCase()}):</span>
                  <NumberedLines lines={lines} />
                </span>
              )}
            </li>
          );
        })}
        {p.product_ack_at && (
          <li>
            <span className="font-semibold">{who(p.proposing_owner)} accepted the changes</span> · {fmtTime(p.product_ack_at)}
          </li>
        )}
      </ol>
    </Collapsible>
  );
}
