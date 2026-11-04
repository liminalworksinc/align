"use client";
import { Btn, Field, Input, TextArea, listOf } from "./kit";
import type { Goal } from "./types";
import { isBlankText } from "@/lib/v2/text-core.mts";

// Measures and anchors editors, shared by "new goal" and "new version". The limits editor lives in limits.tsx and is
// re-exported here with them.
export { LimitEditor, limitsDraft, limitsOut, sameLimits, type LimitDraft } from "./limits";

export type MeasureDraft = { id?: string; text: string; target: string };
export type AnchorDraft = { repos: string; branch_patterns: string; issues: string };

export const measuresDraft = (g?: Goal): MeasureDraft[] => (g ? g.measures.map((m) => ({ id: m.id, text: m.text, target: m.target ?? "" })) : [{ text: "", target: "" }]);
export const anchorsDraft = (g?: Goal): AnchorDraft => ({
  repos: g?.anchors.repos.join("\n") ?? "",
  branch_patterns: g?.anchors.branch_patterns.join("\n") ?? "",
  issues: g?.anchors.issues.join("\n") ?? "",
});

/** The measures to send: a row with nothing a person can read (spaces, or only invisible characters: E2E-WEB cycle 14
 *  C14-2) left out, as the server would refuse it; a blank target is none. */
export const measuresOut = (m: MeasureDraft[]) =>
  m.filter((x) => !isBlankText(x.text)).map((x) => ({ ...(x.id ? { id: x.id } : {}), text: x.text.trim(), target: isBlankText(x.target) ? null : x.target.trim() }));
export const anchorsOut = (a: AnchorDraft) => ({ repos: listOf(a.repos), branch_patterns: listOf(a.branch_patterns), issues: listOf(a.issues) });

export function MeasuresEditor({ value, onChange }: { value: MeasureDraft[]; onChange: (v: MeasureDraft[]) => void }) {
  return (
    <div className="mb-3">
      <span className="mb-1 block text-[14px] text-zinc-600">Measures</span>
      {value.map((m, i) => (
        // Below 640px (sm) the measure takes its own line and the target and Remove share the next, so the row fits a
        // 320px phone (the measure never collapses, nothing scrolls sideways).
        <div key={i} className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto] [&>*:first-child]:max-sm:col-span-2">
          <Input aria-label={`Measure ${i + 1}`} placeholder="What you will measure" value={m.text} maxLength={300} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <Input aria-label={`Target ${i + 1}`} placeholder="Target (optional)" value={m.target} maxLength={100} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
          <Btn kind="secondary" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Btn>
        </div>
      ))}
      {value.length < 10 && (
        <Btn kind="secondary" onClick={() => onChange([...value, { text: "", target: "" }])}>
          Add a measure
        </Btn>
      )}
    </div>
  );
}

export function AnchorsEditor({ value, onChange }: { value: AnchorDraft; onChange: (v: AnchorDraft) => void }) {
  return (
    <details className="mb-3">
      <summary className="cursor-pointer text-[14px] text-zinc-600">Anchors (matched on your machine only, to suggest this goal for a session)</summary>
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
