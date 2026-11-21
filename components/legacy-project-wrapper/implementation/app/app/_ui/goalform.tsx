"use client";
import { useId } from "react";
import { Btn, Field, Input, Select, TextArea, listOf } from "./kit";
import type { Goal } from "./types";
import { isBlankText } from "@/lib/v2/text-core.mts";

// Measures and anchors editors, shared by "new goal" and "new version". The limits editor lives in limits.tsx and is
// re-exported here with them.
export { LimitEditor, limitsDraft, limitsOut, sameLimits, type LimitDraft } from "./limits";

import type { MeasureSource } from "@/lib/v2/measure-sources";

export type MeasureDraft = { id?: string; text: string; target: string; source?: MeasureSource | null };
export type AnchorDraft = { repos: string; branch_patterns: string; issues: string };

export const measuresDraft = (g?: Goal): MeasureDraft[] => (g ? g.measures.map((m) => ({ id: m.id, text: m.text, target: m.target ?? "", source: m.source })) : [{ text: "", target: "" }]);
export const anchorsDraft = (g?: Goal): AnchorDraft => ({
  repos: g?.anchors.repos.join("\n") ?? "",
  branch_patterns: g?.anchors.branch_patterns.join("\n") ?? "",
  issues: g?.anchors.issues.join("\n") ?? "",
});

const missingMeasureLabel = (m: MeasureDraft) => !!m.source && isBlankText(m.text);
export const hasUnlabelledSource = (measures: MeasureDraft[]) => measures.some(missingMeasureLabel);

/** Blank optional rows are omitted. Keep an automated source attached to its measure for server validation. */
export const measuresOut = (m: MeasureDraft[], configureSource = false) =>
  m.filter((x) => (configureSource && x.source) || !isBlankText(x.text)).map((x) => ({ ...(x.id ? { id: x.id } : {}), text: x.text.trim(), target: isBlankText(x.target) ? null : x.target.trim(),
    ...(configureSource && x.source !== undefined ? { source: x.source } : {}),
  }));
export const anchorsOut = (a: AnchorDraft) => ({ repos: listOf(a.repos), branch_patterns: listOf(a.branch_patterns), issues: listOf(a.issues) });

/** `keepOne`: the New goal form never offers to remove its only measure row (founder ruling, PR 68 pass 1 item 19). */
export function MeasuresEditor({ value, onChange, keepOne = false, configureSource = false, showLabelErrors = false, liveMeasures }: {
  value: MeasureDraft[]; onChange: (v: MeasureDraft[]) => void; keepOne?: boolean; configureSource?: boolean; showLabelErrors?: boolean;
  liveMeasures?: Goal["measures"];
}) {
  const removable = !keepOne || value.length > 1;
  const errorId = useId();
  return (
    <div className="mb-3">
      <span className="mb-1 block text-[14px] text-(--text-2)">Measures</span>
      {value.some((m) => !isBlankText(m.text) && (!m.id || (liveMeasures && !liveMeasures.some(({ id }) => id === m.id)))) && (
        <p className="mb-2 text-[14px] text-(--text-2)">
          {liveMeasures ? "New measures become available after launch." :
            "Reading unknown for new measures. Add a dated reading on the goal page after saving."}
        </p>
      )}
      {value.map((m, i) => {
        const label = `Measure ${i + 1}`;
        const error = configureSource && showLabelErrors && missingMeasureLabel(m);
        return (
          // Below 640px (sm) the measure takes its own line and the target and Remove share the next, so the row fits a
          // 320px phone (the measure never collapses, nothing scrolls sideways).
          <div key={i} className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto] [&>*:first-child]:max-sm:col-span-2">
            <div>
              <Input aria-label={label} aria-invalid={error || undefined} aria-describedby={error ? `${errorId}-${i}` : undefined}
                placeholder="What you will measure" value={m.text} maxLength={300} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              {error && <p id={`${errorId}-${i}`} role="alert" className="mt-1 text-[14px] text-red-700">Enter a label for {label}.</p>}
            </div>
            <Input aria-label={`Target ${i + 1}`} placeholder="Target (optional)" value={m.target} maxLength={100} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
            {removable ? (
              <Btn kind="secondary" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                Remove
              </Btn>
            ) : (
              <span aria-hidden />
            )}
            {configureSource && <MeasureSourceFields source={m.source} onChange={(source) => onChange(value.map((x, j) => j === i ? { ...x, source } : x))} />}
          </div>
        );
      })}
      {value.length < 10 && (
        <Btn kind="secondary" onClick={() => onChange([...value, { text: "", target: "" }])}>
          Add a measure
        </Btn>
      )}
    </div>
  );
}

function MeasureSourceFields({ source, onChange }: { source?: MeasureSource | null; onChange: (value: MeasureSource | null) => void }) {
  return (
    <div className="col-span-full min-w-0">
      <Field label="Reading source">
        <Select value={source?.kind ?? "self"} onChange={(e) => {
          const kind = e.target.value;
          onChange(kind === "ci" ? { kind, repository: "", branch: "", check: "" }
            : kind === "command" ? { kind, device_id: "", executable: "", args: [] } : null);
        }}>
          <option value="self">By hand</option>
          <option value="ci">CI result</option>
          <option value="command">Command on a machine</option>
        </Select>
      </Field>
      {source && (
        <Field label="Stale after (days, optional)">
          <Input type="number" min={1} max={366} step={1} value={source.stale_after_days ?? ""}
            onChange={(e) => onChange({ ...source, stale_after_days: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </Field>
      )}
      {source?.kind === "ci" && (
        <>
          <Field label="Repository (owner/name)"><Input value={source.repository} required maxLength={201} onChange={(e) => onChange({ ...source, repository: e.target.value })} /></Field>
          <Field label="Branch"><Input value={source.branch} required maxLength={180} onChange={(e) => onChange({ ...source, branch: e.target.value })} /></Field>
          <Field label="CI check name"><Input value={source.check} required maxLength={120} onChange={(e) => onChange({ ...source, check: e.target.value })} /></Field>
        </>
      )}
      {source?.kind === "command" && (
        <>
          <p className="mb-2 text-[14px] text-(--text-2)">Ask the person using the machine to run <code>align measure device</code> for its ID. They will need to allow this exact command on that machine.</p>
          <Field label="Machine ID"><Input value={source.device_id} required maxLength={68} onChange={(e) => onChange({ ...source, device_id: e.target.value })} /></Field>
          <Field label="Executable path"><Input value={source.executable} required maxLength={400} placeholder="/absolute/path" onChange={(e) => onChange({ ...source, executable: e.target.value })} /></Field>
          {source.args.map((arg, index) => (
            <div className="flex min-w-0 flex-wrap items-center gap-2" key={index}>
              <Field label={`Argument ${index + 1}`}><Input maxLength={300} value={arg} onChange={(e) => onChange({ ...source, args: source.args.map((a, i) => i === index ? e.target.value : a) })} /></Field>
              <Btn kind="secondary" aria-label={`Remove argument ${index + 1}`} onClick={() => onChange({ ...source, args: source.args.filter((_, i) => i !== index) })}>Remove</Btn>
            </div>
          ))}
          {source.args.length < 20 && <Btn kind="secondary" onClick={() => onChange({ ...source, args: [...source.args, ""] })}>Add argument</Btn>}
        </>
      )}
    </div>
  );
}

export function AnchorsEditor({ value, onChange }: { value: AnchorDraft; onChange: (v: AnchorDraft) => void }) {
  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-[14px] text-(--text-2)">Anchors (matched on your machine only, to suggest this goal for a session)</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <Field label="Repos (one per line)">
          <TextArea rows={3} value={value.repos} onChange={(e) => onChange({ ...value, repos: e.target.value })} />
        </Field>
        <Field label="Branch patterns">
          <TextArea rows={3} value={value.branch_patterns} onChange={(e) => onChange({ ...value, branch_patterns: e.target.value })} />
        </Field>
        <Field label="Issues">
          <TextArea rows={3} value={value.issues} onChange={(e) => onChange({ ...value, issues: e.target.value })} />
        </Field>
      </div>
    </details>
  );
}

export const VISIBILITY_LABEL: Record<Goal["visibility"], string> = {
  private: "Only me",
  team: "My team",
  workspace: "Everyone in the workspace",
};

/** "Target share of agent time": a whole percent or blank. `taken` is what the other active goals you can see hold. */
export function TargetShareField({ value, onChange, taken }: { value: string; onChange: (v: string) => void; taken: number }) {
  const n = value.trim() === "" ? 0 : Number(value);
  return (
    <Field
      label="Target share of agent time (%)"
      hint={`Optional. Other active goals you can see already take ${taken}%, so up to ${Math.max(0, 100 - taken)}% is left (goals you can't see count too). Steering compares this with the share shared agent sessions actually spend on the goal.`}
    >
      <Input type="number" min={0} max={100} step={1} inputMode="numeric" aria-label="Target share of agent time" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={value.trim() !== "" && (!Number.isInteger(n) || n < 0 || n > 100)} />
    </Field>
  );
}

/** A target field's value: blank is null (no target), else the number (the server refuses anything but 0 to 100). */
export const targetOut = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/** The targets of the active goals in a list, leaving one goal out. */
export const takenBy = (goals: Goal[] | undefined, except?: string) => (goals ?? []).filter((g) => g.id !== except && g.status === "active").reduce((a, g) => a + (g.target_share ?? 0), 0);
