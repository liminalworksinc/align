"use client";

import { OutcomePeriods } from "./outcome-periods";
import { useEffect, useRef, useState } from "react";
import type { ExpectationView } from "@/lib/v2/expectations";
import { OUTCOME_WORDS } from "@/lib/v2/launch-words";
import { isBlankText } from "@/lib/v2/text-core.mts";
import { EvidenceLabel } from "./ds/evidence-label";
import { NeedAction } from "./ds/need";
import { api, Btn, Err, Field, Input, labelledFieldError, Select, TextArea, useAction, when } from "./kit";
import type { ChangeRequest, Goal } from "./types";

interface ExpectationDraft {
  measure_id: string;
  expected: string;
  due_on: string;
  evidence: string;
}

export const EMPTY_EXPECTATION: ExpectationDraft = { measure_id: "", expected: "", due_on: "", evidence: "" };

export function expectationBody(draft: ExpectationDraft) {
  return Object.values(draft).some((v) => !isBlankText(v)) ? { expectation: draft } : {};
}

export function expectationError(draft: ExpectationDraft): string | null {
  if (!expectationBody(draft).expectation) return null;
  if (!draft.measure_id) return "Choose a measure for your expectation.";
  if (isBlankText(draft.expected)) return "Enter what you expect to change.";
  const { min, max } = dueBounds();
  if (!draft.due_on || draft.due_on < min || draft.due_on > max) return "Choose a due date from today through 366 days from now.";
  return null;
}

export function expectationValidationMessage(message: string): string {
  return labelledFieldError(message, "expected", "Expected value") ??
    labelledFieldError(message, "evidence", "Counts as evidence") ?? message;
}

function dueBounds() {
  const now = Date.now();
  return {
    min: new Date(now).toISOString().slice(0, 10),
    max: new Date(now + 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

export function ExpectationFields({ measures, value, onChange }: {
  measures: Goal["measures"];
  value: ExpectationDraft;
  onChange: (value: ExpectationDraft) => void;
}) {
  if (!measures.length) return null;
  const { min, max } = dueBounds();
  return (
    <details data-expectation-fields className="min-w-0 text-[14px] text-(--text-1)">
      <summary className="min-h-[44px] cursor-pointer py-3 underline underline-offset-2">What do you expect this to change?</summary>
      <div className="min-w-0 rounded-(--radius-s) border border-(--line) p-3">
        <Field label="Measure">
          <Select value={value.measure_id} onChange={(e) => onChange({ ...value, measure_id: e.target.value })}>
            <option value="">Choose a measure</option>
            {measures.map((m) => <option key={m.id} value={m.id}>{m.text}</option>)}
          </Select>
        </Field>
        <Field label="Expected value">
          <Input maxLength={200} value={value.expected} onChange={(e) => onChange({ ...value, expected: e.target.value })} />
        </Field>
        <Field label="Due date" hint="Dates use UTC.">
          <Input type="date" min={min} max={max} value={value.due_on} onChange={(e) => onChange({ ...value, due_on: e.target.value })} />
        </Field>
        <Field label="Counts as evidence (optional)">
          <TextArea rows={2} maxLength={280} value={value.evidence} onChange={(e) => onChange({ ...value, evidence: e.target.value })} />
        </Field>
        {expectationBody(value).expectation && <NeedAction onClick={() => onChange(EMPTY_EXPECTATION)}>Clear expectation</NeedAction>}
      </div>
    </details>
  );
}

type Outcome = keyof typeof OUTCOME_WORDS;
type Report = NonNullable<ExpectationView["outcome"]>;
const CHOICES = { met: "Met", not_met: "Not met", cant_tell: "Can't tell" } satisfies Record<Outcome, string>;

export function OutcomeForm({ ws, goal, request, onAnswered, correction }: {
  ws: string;
  goal: string;
  request: string;
  onAnswered: (report: Report) => void;
  correction?: Report;
}) {
  const act = useAction();
  const [note, setNote] = useState(correction?.note ?? "");
  const [link, setLink] = useState(correction?.evidence_url ?? "");
  const details = useRef<HTMLDetailsElement>(null);
  const noteError = labelledFieldError(act.error, "note", "Outcome note");
  const linkError = act.error === "evidence_url must be an https URL"
    ? "Use an HTTPS link."
    : labelledFieldError(act.error, "evidence_url", "Evidence link");
  const formError = act.error?.startsWith("outcome must ") ? "Choose Met, Not met, or Can't tell." : act.error;

  useEffect(() => {
    if ((noteError || linkError) && details.current) details.current.open = true;
  }, [linkError, noteError]);

  const save = (outcome: Outcome) => void act.run(async () => {
    const updated = await api<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${request}/outcome`, {
      body: { outcome, note, evidence_url: link.trim() || null, ...(correction ? { correction: true } : {}) },
    });
    if (updated.expectation?.outcome) onAnswered(updated.expectation.outcome);
  });
  return (
    <div className="flex min-w-0 flex-col gap-1 text-left" data-outcome-form>
      <details ref={details} className="text-[13px] text-(--text-2)">
        <summary className="min-h-[44px] cursor-pointer py-3 underline underline-offset-2">Note or evidence (optional)</summary>
        <Field label="Outcome note" error={noteError}>
          <TextArea rows={2} maxLength={280} value={note} onChange={(e) => {
            setNote(e.target.value);
            if (noteError) act.setError(null);
          }} />
        </Field>
        <Field label="Evidence link (HTTPS)" error={linkError}>
          <Input type="url" maxLength={2048} value={link} onChange={(e) => {
            setLink(e.target.value);
            if (linkError) act.setError(null);
          }} />
        </Field>
      </details>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={correction ? "Correct outcome" : "Report outcome"}>
        {(Object.keys(CHOICES) as Outcome[]).map((choice) => (
          <NeedAction key={choice} disabled={act.busy} onClick={() => save(choice)}>{CHOICES[choice]}</NeedAction>
        ))}
      </div>
      {!noteError && !linkError && <Err>{formError}</Err>}
    </div>
  );
}

export function ExpectationRecord({ ws, cr, me, onDone }: { ws: string; cr: ChangeRequest; me: string; onDone?: (report: Report) => void }) {
  const [correcting, setCorrecting] = useState(false);
  const e = cr.expectation;
  if (!e) return null;
  const outcome = e.outcome;
  return (
    <section aria-label="Launch expectation" data-expectation-record className="mt-2 min-w-0 rounded-(--radius-s) border border-(--line) p-3 text-[14px] text-(--text-1) [overflow-wrap:anywhere]">
      <EvidenceLabel kind="self" size="s" />
      <p>{e.measure_text}</p>
      <p>Expected: {e.expected} by {e.due_on}</p>
      {e.evidence && <p>Counts as evidence: {e.evidence}</p>}
      {outcome ? (
        <>
          <p>Reported {OUTCOME_WORDS[outcome.outcome]} by {outcome.reported_by.id === me ? "you" : outcome.reported_by.name}, {when(outcome.reported_at)}</p>
          {outcome.note && <p>{outcome.note}</p>}
          {outcome.evidence_url && (
            <a className="inline-flex min-h-[44px] items-center underline" href={outcome.evidence_url} target="_blank" rel="noopener noreferrer">Outcome evidence</a>
          )}
          <OutcomePeriods ws={ws} me={me} request={cr.id} />
          {onDone && e.can_correct && (
            <div>
              <Btn kind="secondary" onClick={() => setCorrecting(!correcting)} aria-expanded={correcting}>{correcting ? "Cancel correction" : "Correct outcome"}</Btn>
              {correcting && <OutcomeForm ws={ws} goal={cr.goal.id} request={cr.id} correction={outcome} onAnswered={(report) => { setCorrecting(false); onDone(report); }} />}
            </div>
          )}
        </>
      ) : (
        <>
          <p>Not answered yet</p>
          {onDone && e.can_answer && <OutcomeForm ws={ws} goal={cr.goal.id} request={cr.id} onAnswered={onDone} />}
        </>
      )}
    </section>
  );
}
