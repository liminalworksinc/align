import { z } from "zod";
import type { AppState, Goal, GoalRelation, Measure, Plan, PlanParams, WorkItem } from "./types";
import type { Session } from "./auth";
import { captureConsents, hasCaptureConsent, HttpError, id, mutate, normalizePlanText, now, setCaptureConsents, sha256 } from "./store";
import { registryVersion } from "./registry";

// Bring-your-own two-team conflict. Leadership enters it on /setup; the server builds the whole state from the
// validated input. The client never supplies ids. Nothing here reads or writes files.

export const MAX_BODY_BYTES = 64 * 1024;

const text = (max: number) => z.string().trim().min(1).max(max);
const measures = z.array(text(300)).min(1).max(5);

const team = <M extends z.ZodType>(m: M) =>
  z
    .object({
      team: text(80), // e.g. "Data Platform"
      lead: text(80), // e.g. "Data Platform Lead"
      objective: text(300),
      measures: m,
    })
    .strict();

export const MAX_WORK_PER_TEAM = 3;

export const ScenarioInput = z
  .object({
    confirm: z.literal("replace"),
    company: text(80),
    company_note: text(200).optional(), // e.g. "Example company (fictional), …": shown under the company name
    timeframe: text(40).optional(),
    leadership: z // optional: defaults to "Leadership" for both
      .object({ team: text(80).default("Leadership"), lead: text(80).default("Leadership") })
      .strict()
      .default({ team: "Leadership", lead: "Leadership" }),
    company_goal: z.object({ objective: text(300), measures }).strict(),
    company_measure: z.number().int().min(0).default(0), // index into company_goal.measures: the requirement the conflict hangs on
    asking: team(z.array(text(300)).max(5).default([])), // the team that proposes the change; its measures are optional
    owning: team(measures), // the team that owns the goal being changed
    owner_measure: z.number().int().min(0).default(0), // index into owning.measures: what the owning team is measured on today
    dependency: text(300), // why the asking team needs the owning team
    work_items: z
      .array(z.object({ team: z.enum(["asking", "owning"]), task: text(300), status: text(80).optional() }).strict())
      .min(2)
      .max(2 * MAX_WORK_PER_TEAM),
    plan: z.object({ title: text(120).optional(), text: z.string().trim().min(20).max(4000) }).strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.company_measure >= v.company_goal.measures.length)
      ctx.addIssue({ code: "custom", path: ["company_measure"], message: "Pick one of the company goal's measures" });
    if (v.owner_measure >= v.owning.measures.length)
      ctx.addIssue({ code: "custom", path: ["owner_measure"], message: "Pick one of the owning team's measures" });
    for (const side of ["asking", "owning"] as const) {
      const n = v.work_items.filter((w) => w.team === side).length;
      if (n === 0) ctx.addIssue({ code: "custom", path: ["work_items"], message: `Add at least one work item for ${v[side].team}` });
      if (n > MAX_WORK_PER_TEAM)
        ctx.addIssue({ code: "custom", path: ["work_items"], message: `${v[side].team} can have at most ${MAX_WORK_PER_TEAM} work items` });
    }
  });

export type ScenarioInput = z.infer<typeof ScenarioInput>;

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);

/** Throws 400 if any object key anywhere is __proto__, constructor or prototype. JSON.parse makes __proto__ an own key. */
function rejectReservedKeys(v: unknown, at = "body"): void {
  if (Array.isArray(v)) return v.forEach((x, i) => rejectReservedKeys(x, `${at}[${i}]`));
  if (v && typeof v === "object")
    for (const k of Object.keys(v)) {
      if (RESERVED.has(k)) throw new HttpError(400, `“${k}” is not allowed as a field name (at ${at})`);
      rejectReservedKeys((v as Record<string, unknown>)[k], `${at}.${k}`);
    }
}

/** Read at most MAX_BODY_BYTES (413 beyond that), parse JSON (400 if invalid), then validate (400 with issues). */
export async function readScenarioInput(req: Request): Promise<{ input: ScenarioInput; input_sha256: string }> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "This setup is too large. Keep it under 64 KB.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "This setup is too large. Keep it under 64 KB.");
      }
      chunks.push(value);
    }
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "The setup must be valid JSON");
  }
  rejectReservedKeys(raw);
  const parsed = ScenarioInput.safeParse(raw);
  if (!parsed.success) throw new ScenarioInvalid(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return { input: parsed.data, input_sha256: sha256(JSON.stringify(parsed.data)) };
}

/** 400 that carries zod issues; the route turns it into {error, issues}. */
export class ScenarioInvalid extends HttpError {
  constructor(public issues: { path: string; message: string }[]) {
    super(400, "Some setup fields need fixing");
  }
}

const measureList = (prefix: string, texts: string[]): Measure[] =>
  texts.map((t, i) => ({ id: `${prefix}${i + 1}`, text: t, verifiable_by: "none" }));

/** Build a complete custom state from validated input only. Ids follow the Build A §3 contract. */
export function buildCustomState(input: ScenarioInput, at: string, input_sha256: string): AppState {
  const timeframe = input.timeframe ?? "This quarter";
  const planText = normalizePlanText(input.plan.text);
  const plan: Plan = {
    plan_id: "p-custom",
    plan_version: 1,
    title: input.plan.title ?? "The proposed plan",
    params: {} as PlanParams, // custom plans are inline text; flow.ts never compares their params
    hash: sha256(planText),
    goal_text_ref: "inline:p-custom@1",
    text: planText,
    source: "inline",
  };

  const company: Goal = {
    id: "g-ceo-v1",
    owner_id: "ceo",
    owner_name: input.leadership.lead,
    kind: "org",
    parent_ids: [],
    visibility: "shared",
    version: "v1",
    objective: input.company_goal.objective,
    success_criteria: [],
    measures: measureList("KR", input.company_goal.measures),
    approved_at: at,
    approved_by: "ceo",
    changed: true, // arrives already sent: new this week
  };
  const teamGoal = (slot: "product" | "security", t: ScenarioInput["asking"], prefix: string): Goal => ({
    id: `g-${slot}-v1`,
    owner_id: slot,
    owner_name: t.lead,
    kind: "team",
    parent_ids: [company.id],
    visibility: "shared", // forced: viewFor sends shared goals to everyone, so nothing private can leak
    version: "v1",
    objective: t.objective,
    success_criteria: [],
    measures: measureList(prefix, t.measures),
    approved_at: at,
    approved_by: slot,
  });
  const asking = teamGoal("product", input.asking, "P-M");
  const owning = teamGoal("security", input.owning, "S-M");

  const follows = (target: Goal): GoalRelation => ({
    id: `r-ceo-${target.owner_id}`,
    source_goal: company.id,
    target_goal: target.id,
    type: "child",
    status: "ACCEPTED",
    label: "follows the company goal",
    provenance: `Company goals for ${timeframe}`,
  });
  const dependency: GoalRelation = {
    id: "r-product-security",
    source_goal: asking.id,
    target_goal: owning.id,
    type: "depends_on",
    status: "UNKNOWN",
    label: input.dependency,
    provenance: "Entered by leadership at setup",
  };

  const counters = { asking: 0, owning: 0 };
  const work_items: WorkItem[] = input.work_items.map((w) => {
    const n = ++counters[w.team];
    const goal = w.team === "asking" ? asking : owning;
    return {
      id: `w-${w.team === "asking" ? "p" : "s"}${n}`,
      goal_id: goal.id,
      source: input[w.team].team,
      task: w.task,
      owner: goal.owner_id,
      observed_status: w.status ?? "planned",
      priority_rank: n,
    };
  });

  const s: AppState = {
    company: input.company,
    timeframe,
    goals: [company, asking, owning],
    relations: [follows(asking), follows(owning), dependency],
    work_items,
    plans: [plan],
    simulations: [],
    brief: {
      goal_ref: dependency.id,
      headline: input.dependency,
      evidence_refs: [],
      priorities: [],
      disconfirmers: [],
      unknowns: [],
      alike_ref: null,
      alike_status: "unavailable",
    },
    proposals: [],
    acceptances: [],
    timer: { id: "t-1", started_at: null, ended_at: null, touchpoints: [], excluded_prep: [], acked_by: [] },
    audit: [],
    manual_baseline: [],
    private_constraints: [],
    org_draft: null,
    pushes: [],
    sessions: [],
    mappings: [],
    registry_version: "",
    scenario: "custom",
    teams: {
      ceo: { team: input.leadership.team, lead: input.leadership.lead },
      product: { team: input.asking.team, lead: input.asking.lead },
      security: { team: input.owning.team, lead: input.owning.lead },
    },
    scenario_config: {
      created_at: at,
      created_by: "leadership",
      input_sha256,
      dependency_id: dependency.id,
      owner_measure_id: `S-M${input.owner_measure + 1}`,
      company_measure_id: `KR${input.company_measure + 1}`,
      plan_id: plan.plan_id,
      plan_version: plan.plan_version,
      ...(input.company_note ? { company_note: input.company_note } : {}), // custom-only, last, absent when not sent
    },
  };
  s.registry_version = registryVersion(s);
  return s;
}

/**
 * Replace the whole workspace with the custom scenario. Capture consents and the audit log are kept. Sessions are
 * kept (directives cleared) only when their harness and repo has a capture consent, the same filter resetState uses.
 */
export async function setupScenario(who: Session, input: ScenarioInput, input_sha256: string) {
  return mutate((s) => {
    if (s.proposals.some((p) => !["RATIFIED", "REJECTED"].includes(p.state)))
      throw new HttpError(409, "There’s an open proposal. Finish or decline it before setting up a new scenario.");
    const at = now();
    const next = buildCustomState(input, at, input_sha256);
    next.sessions = (s.sessions ?? [])
      .filter((x) => hasCaptureConsent(s, x.harness, x.repo)) // R1 default: sessions without consent do not persist
      .map((x) => ({ ...x, directives: [] }));
    // The audit log is never erased. The setup event records only the input hash, never the text.
    next.audit = [
      ...s.audit,
      { id: id("a"), actor: who.actor, session_id: who.sid, action: "scenario_setup", target: `sha256:${input_sha256}`, at },
    ];
    const consents = captureConsents(s); // consent is per harness and repo, not per scenario
    for (const k of Object.keys(s)) delete (s as unknown as Record<string, unknown>)[k];
    Object.assign(s, next);
    setCaptureConsents(s, consents);
    return {
      ok: true as const,
      scenario: "custom" as const,
      company: next.company,
      goal_ids: next.goals.map((g) => g.id),
      dependency_id: next.scenario_config!.dependency_id,
      plan: { plan_id: next.plans[0].plan_id, plan_version: next.plans[0].plan_version, plan_hash: next.plans[0].hash },
      registry_version: next.registry_version,
    };
  });
}
