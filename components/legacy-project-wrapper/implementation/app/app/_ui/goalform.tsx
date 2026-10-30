"use client";
import { Btn, Field, Input, TextArea, listOf } from "./kit";
import type { Goal } from "./types";

// Measures and anchors editors, shared by "new goal" and "new version".

export type MeasureDraft = { id?: string; text: string; target: string };
export type AnchorDraft = { repos: string; branch_patterns: string; issues: string };

export const measuresDraft = (g?: Goal): MeasureDraft[] => (g ? g.measures.map((m) => ({ id: m.id, text: m.text, target: m.target ?? "" })) : [{ text: "", target: "" }]);
export const anchorsDraft = (g?: Goal): AnchorDraft => ({
  repos: g?.anchors.repos.join("\n") ?? "",
  branch_patterns: g?.anchors.branch_patterns.join("\n") ?? "",
  issues: g?.anchors.issues.join("\n") ?? "",
});

export const measuresOut = (m: MeasureDraft[]) => m.filter((x) => x.text.trim()).map((x) => ({ ...(x.id ? { id: x.id } : {}), text: x.text.trim(), target: x.target.trim() || null }));
export const anchorsOut = (a: AnchorDraft) => ({ repos: listOf(a.repos), branch_patterns: listOf(a.branch_patterns), issues: listOf(a.issues) });

export function MeasuresEditor({ value, onChange }: { value: MeasureDraft[]; onChange: (v: MeasureDraft[]) => void }) {
  return (
    <div className="mb-3">
      <span className="mb-1 block text-[14px] text-zinc-600">Measures</span>
      {value.map((m, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_180px_auto] gap-2">
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
