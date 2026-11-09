// Caller-owned provider assembly. Behavior belongs to the qualified library.
import { audit, run } from "./db";
import { newId } from "./ids";
import { insertAlignment } from "./alignments";
import { insertChangeRequest } from "./changes";
import { goalRow, insertGoal, type Measure } from "./goals";
import { newLimitId, type Limit } from "./goal-limits";
import type { PodRole, PolicyPrincipal } from "./policy";
import type { WebPrincipal } from "./http";
import { createWorkspace } from "./workspaces";
import { create_sample } from "../native/.bindings/server_sample.js";

interface SampleRuntime {
  createSampleWorkspace: (req: Request, p: WebPrincipal, code: string | null) => Promise<{ id: string; name: string; role: "owner"; }>;
  SAMPLE_NAME: "Northstar (sample)";
  SAMPLE_REASON: "This is a sample change request. Onboarding can't launch to regulated customers until a pen test is booked, so this asks the security goal to measure that too. In a real workspace a teammate proposes changes to a goal they don't own and the goal's owner or team lead decides. Here you own the goal, so you can approve it (then launch it, which is when agents get the new version), suggest a change, reject it, withdraw it or update it to try each step.";
  SAMPLE_LIMIT_TEXT: "Push the pen-test window past May";
}

const sampleService = create_sample({
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  insertAlignment: (...args: Parameters<typeof insertAlignment>) => insertAlignment(...args),
  insertChangeRequest: (...args: Parameters<typeof insertChangeRequest>) => insertChangeRequest(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  insertGoal: (...args: Parameters<typeof insertGoal>) => insertGoal(...args),
  newLimitId: (...args: Parameters<typeof newLimitId>) => newLimitId(...args),
  createWorkspace: (...args: Parameters<typeof createWorkspace>) => createWorkspace(...args),
  readDate: () => Date,
}) as unknown as SampleRuntime;

export const SAMPLE_NAME: SampleRuntime["SAMPLE_NAME"] = sampleService.SAMPLE_NAME;
export const SAMPLE_REASON: SampleRuntime["SAMPLE_REASON"] = sampleService.SAMPLE_REASON;
export const SAMPLE_LIMIT_TEXT: SampleRuntime["SAMPLE_LIMIT_TEXT"] = sampleService.SAMPLE_LIMIT_TEXT;

export async function createSampleWorkspace(req: Request, p: WebPrincipal, code: string | null): Promise<{ id: string; name: string; role: "owner"; }> {
  return (0, sampleService.createSampleWorkspace)(req, p, code);
}
