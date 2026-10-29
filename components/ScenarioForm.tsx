"use client";
import { type ReactNode } from "react";
import { Button } from "@/components/ui";
import { ConflictSentence } from "@/components/v6/ConflictSentence";

// The two-team conflict form, shared by /setup (replace the demo workspace) and /new (create a workspace).
// Every field maps 1:1 to the scenario schema in lib/scenario.ts. Operator text is rendered as plain text only.

export type Side = "asking" | "owning";
export interface TeamForm {
  team: string;
  lead: string;
  objective: string;
  measures: string[];
}
export interface WorkRow {
  team: Side;
  task: string;
  status: string;
}
export interface Form {
  company: string;
  timeframe: string;
  leadership: { team: string; lead: string };
  company_goal: { objective: string; measures: string[] };
  company_measure: number;
  asking: TeamForm;
  owning: TeamForm;
  owner_measure: number;
  dependency: string;
  work_items: WorkRow[];
  plan: { title: string; text: string };
}
export type Issues = Record<string, string[]>;

export const MAX_WORK_PER_TEAM = 3; // same cap as the API

const emptyTeam = (measures: string[]): TeamForm => ({ team: "", lead: "", objective: "", measures });
export const EMPTY: Form = {
  company: "",
  timeframe: "",
  leadership: { team: "", lead: "" },
  company_goal: { objective: "", measures: [""] },
  company_measure: 0,
  asking: emptyTeam([]), // optional
  owning: emptyTeam([""]),
  owner_measure: 0,
  dependency: "",
  work_items: [
    { team: "asking", task: "", status: "" },
    { team: "owning", task: "", status: "" },
  ],
  plan: { title: "", text: "" },
};

/** The request body without /setup's confirm: trimmed text, optional fields dropped when empty (the server fills in its defaults). */
export function toBody(f: Form) {
  const t = (s: string) => s.trim();
  const leadership = { ...(t(f.leadership.team) ? { team: t(f.leadership.team) } : {}), ...(t(f.leadership.lead) ? { lead: t(f.leadership.lead) } : {}) };
  return {
    company: t(f.company),
    ...(t(f.timeframe) ? { timeframe: t(f.timeframe) } : {}),
    ...(Object.keys(leadership).length ? { leadership } : {}),
    company_goal: { objective: t(f.company_goal.objective), measures: f.company_goal.measures.map(t) },
    company_measure: f.company_measure,
    asking: { ...f.asking, team: t(f.asking.team), lead: t(f.asking.lead), objective: t(f.asking.objective), measures: f.asking.measures.map(t).filter(Boolean) },
    owning: { ...f.owning, team: t(f.owning.team), lead: t(f.owning.lead), objective: t(f.owning.objective), measures: f.owning.measures.map(t) },
    owner_measure: f.owner_measure,
    dependency: t(f.dependency),
    work_items: f.work_items.map((w) => ({ team: w.team, task: t(w.task), ...(t(w.status) ? { status: t(w.status) } : {}) })),
    plan: { ...(t(f.plan.title) ? { title: t(f.plan.title) } : {}), text: t(f.plan.text) },
  };
}

/** Plain-language versions of the schema's length messages; anything else (e.g. the cross-field rules) is already plain. */
function plain(message: string): string {
  const min = /expected (?:string|array) to have >=(\d+)/.exec(message);
  if (min) return Number(min[1]) <= 1 ? "Fill this in." : `Write at least ${min[1]} characters.`;
  const max = /expected (?:string|array) to have <=(\d+)/.exec(message);
  if (max) return `Keep this under ${max[1]} characters.`;
  if (/^Invalid input/.test(message)) return "Fill this in.";
  return message;
}

/** Group the API's {path, message} issues by field path, in plain language. "form" holds issues with no field. */
export function issuesFrom(list: { path: string; message: string }[]): Issues {
  const next: Issues = {};
  for (const i of list) (next[i.path || "form"] ??= []).push(plain(i.message));
  return next;
}

export const field =
  "w-full rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[16px] leading-[1.5] text-zinc-900 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--al-focus)]";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string[]; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-[16px] font-semibold text-zinc-900">{label}</span>
      {hint && <span className="mb-1.5 block text-[16px] text-zinc-600">{hint}</span>}
      {children}
      {error?.map((m) => (
        <span key={m} className="mt-1 block text-[16px] text-red-700">
          {m}
        </span>
      ))}
    </label>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-[14px] border border-zinc-200 bg-white p-5">
      <h2 className="mb-4 flex items-baseline gap-2.5 text-[20px] font-semibold text-zinc-900">
        <span className="font-mono text-[12px] text-zinc-500">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

/** The optional-detail toggle and the six steps. The page owns the state and the submit. */
export function ScenarioFields({
  form,
  set,
  issues,
  more,
  setMore,
}: {
  form: Form;
  set: (fn: (f: Form) => Form) => void;
  issues: Issues;
  more: boolean;
  setMore: (fn: (m: boolean) => boolean) => void;
}) {
  const err = (path: string) => issues[path];
  const teamStep = (side: Side, n: number, title: string, extra?: ReactNode) => {
    const t = form[side];
    return (
      <Step n={n} title={title}>
        <Field label="Team name" error={err(`${side}.team`)}>
          <input className={field} value={t.team} onChange={(e) => set((f) => ((f[side].team = e.target.value), f))} />
        </Field>
        <Field label="Team lead" hint="The person who speaks for this team." error={err(`${side}.lead`)}>
          <input className={field} value={t.lead} onChange={(e) => set((f) => ((f[side].lead = e.target.value), f))} />
        </Field>
        <Field label="Team goal" error={err(`${side}.objective`)}>
          <input className={field} value={t.objective} onChange={(e) => set((f) => ((f[side].objective = e.target.value), f))} />
        </Field>
        {t.measures.map((m, i) => (
          <Field key={i} label={side === "asking" ? `Measure ${i + 1} (optional)` : t.measures.length > 1 && i === form.owner_measure ? `Measure ${i + 1} (measured on today)` : `Measure ${i + 1}`} error={err(`${side}.measures.${i}`)}>
            <div className="flex gap-2">
              <input className={field} value={m} onChange={(e) => set((f) => ((f[side].measures[i] = e.target.value), f))} />
              {side === "owning" && t.measures.length > 1 && (
                <Button kind="ghost" onClick={() => set((f) => ((f.owner_measure = i), f))} disabled={form.owner_measure === i}>
                  {form.owner_measure === i ? "Measured on this today" : "Pick"}
                </Button>
              )}
              {(side === "asking" || t.measures.length > 1) && (
                <Button
                  kind="ghost"
                  onClick={() =>
                    set((f) => {
                      f[side].measures.splice(i, 1);
                      if (side === "owning") f.owner_measure = Math.min(f.owner_measure, f.owning.measures.length - 1);
                      return f;
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </Field>
        ))}
        {err(`${side}.measures`)?.map((m) => (
          <p key={m} className="mb-3 text-[16px] text-red-700">
            {m}
          </p>
        ))}
        {more && t.measures.length < 5 && (
          <div className="mb-4">
            <Button kind="ghost" onClick={() => set((f) => (f[side].measures.push(""), f))}>
              {side === "asking" ? "Add a measure (optional)" : "Add another measure"}
            </Button>
          </div>
        )}
        {extra}
      </Step>
    );
  };

  const workCount = (side: Side) => form.work_items.filter((w) => w.team === side).length;
  const full = (side: Side) => workCount(side) >= MAX_WORK_PER_TEAM;
  const named = (side: Side) => form[side].team.trim() || (side === "asking" ? "the asking team" : "the owning team");
  const show = (value: string) => more || value !== ""; // an optional field: visible when expanded, or once it has a value
  // The two starting rows (one per team) need no team picker; any other mix shows it.
  const simpleWork = form.work_items.length === 2 && form.work_items[0].team === "asking" && form.work_items[1].team === "owning";

  return (
    <>
    <section aria-label="The conflict in one sentence" className="mb-6 rounded-[14px] border border-zinc-200 bg-white px-5 py-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500">Say it as one sentence</span>
      <ConflictSentence
        asking={form.asking.team}
        owning={form.owning.team}
        measure={form.owning.measures[form.owner_measure] ?? ""}
        because={form.company_goal.measures[form.company_measure] ?? ""}
      />
      <p className="mt-1 text-[14px] text-zinc-500">Fill in the steps below; this line updates as you type.</p>
    </section>
    <div className="mb-6 rounded-[14px] border border-zinc-200 bg-white p-4">
      <Button kind="ghost" onClick={() => setMore((m) => !m)}>
        {more ? "Hide optional detail" : "Add more detail (optional)"}
      </Button>
      <p className="mt-2 text-[16px] text-zinc-600">
        {more
          ? "Optional fields are marked below. Anything left empty is filled in for you."
          : "Only the fields needed for the conflict are shown. More detail adds a timeframe, leadership names, more requirements and measures, more work items, statuses and a plan title."}
      </p>
    </div>

    <Step n={1} title={more ? "Company and leadership" : "Company"}>
      <Field label="Company name" error={err("company")}>
        <input className={field} value={form.company} onChange={(e) => set((f) => ((f.company = e.target.value), f))} />
      </Field>
      {show(form.timeframe) && (
        <Field label="Timeframe (optional)" hint="For example: This quarter" error={err("timeframe")}>
          <input className={field} value={form.timeframe} onChange={(e) => set((f) => ((f.timeframe = e.target.value), f))} />
        </Field>
      )}
      {show(form.leadership.team) && (
        <Field label="Leadership team name (optional)" hint="Leave empty to use: Leadership" error={err("leadership.team")}>
          <input className={field} placeholder="e.g. Leadership" value={form.leadership.team} onChange={(e) => set((f) => ((f.leadership.team = e.target.value), f))} />
        </Field>
      )}
      {show(form.leadership.lead) && (
        <Field label="Leadership lead (optional)" hint="Leave empty to use: Leadership" error={err("leadership.lead")}>
          <input className={field} value={form.leadership.lead} onChange={(e) => set((f) => ((f.leadership.lead = e.target.value), f))} />
        </Field>
      )}
    </Step>

    <Step n={2} title="The priority that changed">
      <Field label="Company goal" error={err("company_goal.objective")}>
        <input className={field} value={form.company_goal.objective} onChange={(e) => set((f) => ((f.company_goal.objective = e.target.value), f))} />
      </Field>
      {form.company_goal.measures.map((m, i) => (
        <Field
          key={i}
          label={form.company_goal.measures.length === 1 ? "The requirement in conflict" : i === form.company_measure ? `Requirement ${i + 1} (the one in conflict)` : `Requirement ${i + 1}`}
          error={err(`company_goal.measures.${i}`)}
        >
          <div className="flex gap-2">
            <input className={field} value={m} onChange={(e) => set((f) => ((f.company_goal.measures[i] = e.target.value), f))} />
            {form.company_goal.measures.length > 1 && (
              <Button kind="ghost" onClick={() => set((f) => ((f.company_measure = i), f))} disabled={form.company_measure === i}>
                {form.company_measure === i ? "This is the one in conflict" : "Pick"}
              </Button>
            )}
            {form.company_goal.measures.length > 1 && (
              <Button
                kind="ghost"
                onClick={() =>
                  set((f) => {
                    f.company_goal.measures.splice(i, 1);
                    f.company_measure = Math.min(f.company_measure, f.company_goal.measures.length - 1);
                    return f;
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
        </Field>
      ))}
      {[...(err("company_goal.measures") ?? []), ...(err("company_measure") ?? [])].map((m) => (
        <p key={m} className="mb-3 text-[16px] text-red-700">
          {m}
        </p>
      ))}
      {more && form.company_goal.measures.length < 5 && (
        <Button kind="ghost" onClick={() => set((f) => (f.company_goal.measures.push(""), f))}>
          Add another requirement
        </Button>
      )}
    </Step>

    {teamStep("asking", 3, "Who’s changing the priority")}
    {teamStep(
      "owning",
      4,
      "Whose plan has to change",
      <>
        {err("owner_measure")?.map((m) => (
          <p key={m} className="mb-3 text-[16px] text-red-700">
            {m}
          </p>
        ))}
        <Field label={`Why ${named("asking")} needs ${named("owning")}`} hint="What they need from the team whose plan changes, in one or two sentences." error={err("dependency")}>
          <textarea className={field} rows={3} value={form.dependency} onChange={(e) => set((f) => ((f.dependency = e.target.value), f))} />
        </Field>
      </>,
    )}

    <Step n={5} title="Work already running on the old plan">
      <p className="mb-4 text-[16px] text-zinc-700">
        One item for each side, up to {MAX_WORK_PER_TEAM}: a project, a ticket, or an AI agent session already working on the old plan. After the decision, Align shows what
        is still on the old plan, and which connected agents haven’t read the new one yet.
      </p>
      {form.work_items.map((w, i) => (
        <div key={i} className="mb-4 rounded-[10px] border border-zinc-200 p-3">
          {(more || !simpleWork) && (
            <Field label="Team" error={err(`work_items.${i}.team`)}>
              <select className={field} value={w.team} onChange={(e) => set((f) => ((f.work_items[i].team = e.target.value as Side), f))}>
                <option value="asking" disabled={w.team !== "asking" && full("asking")}>
                  {named("asking")}
                </option>
                <option value="owning" disabled={w.team !== "owning" && full("owning")}>
                  {named("owning")}
                </option>
              </select>
            </Field>
          )}
          <Field label={more || !simpleWork ? "Work item" : `Work item for ${named(w.team)}`} error={err(`work_items.${i}.task`)}>
            <input className={field} value={w.task} onChange={(e) => set((f) => ((f.work_items[i].task = e.target.value), f))} />
          </Field>
          {show(w.status) && (
            <Field label="Status (optional)" hint="For example: in progress" error={err(`work_items.${i}.status`)}>
              <input className={field} value={w.status} onChange={(e) => set((f) => ((f.work_items[i].status = e.target.value), f))} />
            </Field>
          )}
          {form.work_items.length > 2 && (
            <Button kind="ghost" onClick={() => set((f) => (f.work_items.splice(i, 1), f))}>
              Remove this item
            </Button>
          )}
        </div>
      ))}
      {err("work_items")?.map((m) => (
        <p key={m} className="mb-3 text-[16px] text-red-700">
          {m}
        </p>
      ))}
      {(["asking", "owning"] as const).filter(full).map((side) => (
        <p key={side} className="mb-3 text-[16px] text-zinc-700">
          {named(side)} has {MAX_WORK_PER_TEAM} work items, the most this form takes.
        </p>
      ))}
      {more && !(full("asking") && full("owning")) && (
        <Button kind="ghost" onClick={() => set((f) => (f.work_items.push({ team: workCount("owning") < workCount("asking") ? "owning" : "asking", task: "", status: "" }), f))}>
          Add a work item
        </Button>
      )}
    </Step>

    <Step n={6} title="The proposed plan">
      {show(form.plan.title) && (
        <Field label="Plan title (optional)" hint="Leave empty to use: The proposed plan" error={err("plan.title")}>
          <input className={field} value={form.plan.title} onChange={(e) => set((f) => ((f.plan.title = e.target.value), f))} />
        </Field>
      )}
      <Field label="The plan" hint="What changes now, and what the side changing the priority gives in return. 20 to 4,000 characters." error={err("plan.text")}>
        <textarea className={field} rows={6} value={form.plan.text} onChange={(e) => set((f) => ((f.plan.text = e.target.value), f))} />
      </Field>
      <p className="text-[16px] text-zinc-600">This plan has not been sandbox-tested. Approving it later will need an explicit acknowledgement.</p>
    </Step>

    </>
  );
}
