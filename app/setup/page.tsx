"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { labelsFor } from "@/lib/labels";
import type { Actor, AnonStateView, StateView } from "@/lib/types";

// Leadership sets up its own two-team conflict. Reached by URL only (/setup); nothing links here.
// Every field maps 1:1 to the POST /api/scenario schema (lib/scenario.ts). Operator text is rendered as plain text only.

type Side = "asking" | "owning";
interface TeamForm {
  team: string;
  lead: string;
  objective: string;
  measures: string[];
}
interface WorkRow {
  team: Side;
  task: string;
  status: string;
}
interface Form {
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
type Issues = Record<string, string[]>;

const emptyTeam = (): TeamForm => ({ team: "", lead: "", objective: "", measures: [""] });
const EMPTY: Form = {
  company: "",
  timeframe: "",
  leadership: { team: "Leadership", lead: "" },
  company_goal: { objective: "", measures: [""] },
  company_measure: 0,
  asking: emptyTeam(),
  owning: emptyTeam(),
  owner_measure: 0,
  dependency: "",
  work_items: [
    { team: "asking", task: "", status: "" },
    { team: "owning", task: "", status: "" },
  ],
  plan: { title: "", text: "" },
};

/** The request body: trimmed text, optional fields dropped when empty. */
function toBody(f: Form) {
  const t = (s: string) => s.trim();
  return {
    confirm: "replace",
    company: t(f.company),
    ...(t(f.timeframe) ? { timeframe: t(f.timeframe) } : {}),
    leadership: { team: t(f.leadership.team), lead: t(f.leadership.lead) },
    company_goal: { objective: t(f.company_goal.objective), measures: f.company_goal.measures.map(t) },
    company_measure: f.company_measure,
    asking: { ...f.asking, team: t(f.asking.team), lead: t(f.asking.lead), objective: t(f.asking.objective), measures: f.asking.measures.map(t) },
    owning: { ...f.owning, team: t(f.owning.team), lead: t(f.owning.lead), objective: t(f.owning.objective), measures: f.owning.measures.map(t) },
    owner_measure: f.owner_measure,
    dependency: t(f.dependency),
    work_items: f.work_items.map((w) => ({ team: w.team, task: t(w.task), ...(t(w.status) ? { status: t(w.status) } : {}) })),
    plan: { title: t(f.plan.title), text: t(f.plan.text) },
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

const field = "w-full rounded-[10px] border border-zinc-300 bg-white px-3 py-2.5 text-[16px] text-zinc-900 focus:border-violet-700 focus:outline-none";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string[]; children: ReactNode }) {
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
      <h2 className="mb-4 text-[20px] font-semibold text-zinc-900">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

export default function SetupPage() {
  const [actor, setActor] = useState<Actor | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(EMPTY);
  const [issues, setIssues] = useState<Issues>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ company: string; team: string } | null>(null);
  const [team, setTeam] = useState("Leadership"); // leadership's team name in the current workspace, for the role line

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((m: { actor: Actor | null }) => setActor(m.actor))
      .catch(() => setActor(null));
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((st: StateView | AnonStateView) => setTeam(labelsFor({ simulations: [], ...st }).role.leadership))
      .catch(() => undefined);
  }, []);

  const set = (fn: (f: Form) => Form) => setForm((f) => fn(structuredClone(f)));
  const err = (path: string) => issues[path];

  async function submit() {
    setBusy(true);
    setProblem(null);
    setIssues({});
    try {
      const res = await fetch("/api/scenario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toBody(form)),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone({ company: data.company, team: form.leadership.team.trim() });
        return;
      }
      if (res.status === 400 && Array.isArray(data.issues)) {
        const next: Issues = {};
        for (const i of data.issues as { path: string; message: string }[]) (next[i.path || "form"] ??= []).push(plain(i.message));
        setIssues(next);
        setProblem("Some fields need fixing. They are marked below.");
      } else if (res.status === 413) setProblem("This setup is too long. Shorten the plan or the work items and try again.");
      else if (res.status === 415) setProblem("The setup could not be sent. Reload the page and try again.");
      else setProblem(typeof data.error === "string" ? data.error : "The setup could not be saved. Try again.");
      setConfirming(false);
    } catch {
      setProblem("The server did not answer. Check that Align is running and try again.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const page = (children: ReactNode) => <main className="mx-auto min-h-screen max-w-3xl bg-zinc-50 px-5 py-8 text-[16px] text-zinc-900">{children}</main>;

  if (actor === undefined) return page(<p>Loading…</p>);
  if (actor !== "leadership")
    return page(
      <p className="text-[18px]">
        Only leadership can set up a new scenario. Sign in as leadership on the main page, then come back to this address.
      </p>,
    );

  if (done)
    return page(
      <section className="rounded-[14px] border border-zinc-200 bg-white p-6">
        <p className="mb-1 text-[16px] text-zinc-600">You are: {done.team}</p>
        <h1 className="mb-3 text-[24px] font-semibold">Scenario ready: {done.company}</h1>
        <p className="mb-5 text-[16px]">Each team lead can now sign in and see the conflict. Nothing has been sandbox-tested.</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-[10px] bg-violet-700 px-[18px] text-[16px] font-semibold text-black hover:brightness-110">
          Open the scenario
        </Link>
      </section>,
    );

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
          <Field key={i} label={side === "owning" && i === form.owner_measure ? `Measure ${i + 1} (measured on today)` : `Measure ${i + 1}`} error={err(`${side}.measures.${i}`)}>
            <div className="flex gap-2">
              <input className={field} value={m} onChange={(e) => set((f) => ((f[side].measures[i] = e.target.value), f))} />
              {side === "owning" && (
                <Button kind="ghost" onClick={() => set((f) => ((f.owner_measure = i), f))} disabled={form.owner_measure === i}>
                  {form.owner_measure === i ? "Picked" : "Pick"}
                </Button>
              )}
              {t.measures.length > 1 && (
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
        {t.measures.length < 5 && (
          <div className="mb-4">
            <Button kind="ghost" onClick={() => set((f) => (f[side].measures.push(""), f))}>
              Add a measure
            </Button>
          </div>
        )}
        {extra}
      </Step>
    );
  };

  const named = (side: Side) => form[side].team.trim() || (side === "asking" ? "the asking team" : "the owning team");
  const unplaced = Object.entries(issues).filter(([p]) => p === "form" || p === "");

  return page(
    <>
      <p className="mb-1 text-[16px] text-zinc-600">You are: {team}</p>
      <h1 className="mb-2 text-[28px] font-semibold">Set up your own conflict</h1>
      <p className="mb-6 text-[16px] text-zinc-700">
        Describe one real disagreement between two teams. Saving replaces everything currently in Align with this scenario.
      </p>

      <Step n={1} title="Company and leadership">
        <Field label="Company name" error={err("company")}>
          <input className={field} value={form.company} onChange={(e) => set((f) => ((f.company = e.target.value), f))} />
        </Field>
        <Field label="Timeframe (optional)" hint="For example: This quarter" error={err("timeframe")}>
          <input className={field} value={form.timeframe} onChange={(e) => set((f) => ((f.timeframe = e.target.value), f))} />
        </Field>
        <Field label="Leadership team name" error={err("leadership.team")}>
          <input className={field} value={form.leadership.team} onChange={(e) => set((f) => ((f.leadership.team = e.target.value), f))} />
        </Field>
        <Field label="Leadership lead" error={err("leadership.lead")}>
          <input className={field} value={form.leadership.lead} onChange={(e) => set((f) => ((f.leadership.lead = e.target.value), f))} />
        </Field>
      </Step>

      <Step n={2} title="The company goal that changed">
        <Field label="Company goal" error={err("company_goal.objective")}>
          <input className={field} value={form.company_goal.objective} onChange={(e) => set((f) => ((f.company_goal.objective = e.target.value), f))} />
        </Field>
        {form.company_goal.measures.map((m, i) => (
          <Field key={i} label={i === form.company_measure ? `Requirement ${i + 1} (the one in conflict)` : `Requirement ${i + 1}`} error={err(`company_goal.measures.${i}`)}>
            <div className="flex gap-2">
              <input className={field} value={m} onChange={(e) => set((f) => ((f.company_goal.measures[i] = e.target.value), f))} />
              <Button kind="ghost" onClick={() => set((f) => ((f.company_measure = i), f))} disabled={form.company_measure === i}>
                {form.company_measure === i ? "Picked" : "Pick"}
              </Button>
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
        {form.company_goal.measures.length < 5 && (
          <Button kind="ghost" onClick={() => set((f) => (f.company_goal.measures.push(""), f))}>
            Add a requirement
          </Button>
        )}
      </Step>

      {teamStep("asking", 3, "The team that asks for the change")}
      {teamStep(
        "owning",
        4,
        "The team that owns the goal being changed",
        <>
          {err("owner_measure")?.map((m) => (
            <p key={m} className="mb-3 text-[16px] text-red-700">
              {m}
            </p>
          ))}
          <Field label={`Why ${named("asking")} needs ${named("owning")}`} hint="The dependency in one or two sentences." error={err("dependency")}>
            <textarea className={field} rows={3} value={form.dependency} onChange={(e) => set((f) => ((f.dependency = e.target.value), f))} />
          </Field>
        </>,
      )}

      <Step n={5} title="Work in progress">
        <p className="mb-4 text-[16px] text-zinc-700">At least one item for each team. These show who has work on the old plan after a decision.</p>
        {form.work_items.map((w, i) => (
          <div key={i} className="mb-4 rounded-[10px] border border-zinc-200 p-3">
            <Field label="Team" error={err(`work_items.${i}.team`)}>
              <select className={field} value={w.team} onChange={(e) => set((f) => ((f.work_items[i].team = e.target.value as Side), f))}>
                <option value="asking">{named("asking")}</option>
                <option value="owning">{named("owning")}</option>
              </select>
            </Field>
            <Field label="Work item" error={err(`work_items.${i}.task`)}>
              <input className={field} value={w.task} onChange={(e) => set((f) => ((f.work_items[i].task = e.target.value), f))} />
            </Field>
            <Field label="Status (optional)" hint="For example: in progress" error={err(`work_items.${i}.status`)}>
              <input className={field} value={w.status} onChange={(e) => set((f) => ((f.work_items[i].status = e.target.value), f))} />
            </Field>
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
        {form.work_items.length < 20 && (
          <Button kind="ghost" onClick={() => set((f) => (f.work_items.push({ team: "asking", task: "", status: "" }), f))}>
            Add a work item
          </Button>
        )}
      </Step>

      <Step n={6} title="The proposed plan">
        <Field label="Plan title" error={err("plan.title")}>
          <input className={field} value={form.plan.title} onChange={(e) => set((f) => ((f.plan.title = e.target.value), f))} />
        </Field>
        <Field label="The plan" hint="What would change, and what the asking team gives in return. 20 to 4,000 characters." error={err("plan.text")}>
          <textarea className={field} rows={6} value={form.plan.text} onChange={(e) => set((f) => ((f.plan.text = e.target.value), f))} />
        </Field>
        <p className="text-[16px] text-zinc-600">This plan has not been sandbox-tested. Approving it later will need an explicit acknowledgement.</p>
      </Step>

      {problem && (
        <div role="alert" className="mb-4 rounded-[10px] border border-red-300 bg-red-50 p-4 text-[16px] text-red-800">
          {problem}
          {unplaced.flatMap(([, ms]) => ms).map((m) => (
            <span key={m} className="mt-1 block">
              {m}
            </span>
          ))}
        </div>
      )}

      {!confirming ? (
        <Button onClick={() => setConfirming(true)}>Save this scenario</Button>
      ) : (
        <div className="rounded-[14px] border border-amber-300 bg-amber-50 p-5">
          <p className="mb-4 text-[16px] text-zinc-900">This replaces everything currently in Align, including any open work in the demo. Continue?</p>
          <div className="flex gap-3">
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Yes, replace and save"}
            </Button>
            <Button kind="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Go back
            </Button>
          </div>
        </div>
      )}
    </>,
  );
}
