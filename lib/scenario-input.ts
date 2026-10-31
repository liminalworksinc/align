import { z } from "zod";

// The bring-your-own scenario's input schema, shared by the server (lib/scenario.ts validates every create and setup
// with it) and the /new form (InterviewPanel's "Draft so far" reads which required fields are still missing from it).
// Zod only: no server imports, so it is safe in a client bundle.

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
