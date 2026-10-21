import type { AppState } from "./types";
import type { Session } from "./auth";
import { cappedJson } from "./http";
import { buildCustomState, MAX_BODY_BYTES, ScenarioInput, ScenarioInvalid } from "./scenario";
import { id, now, replaceWorkspaceState, sha256 } from "./store";
import { readScenarioFile, type CustomWsId } from "./workspace";

// Custom workspaces reuse the /setup schema and state builder from lib/scenario.ts unchanged. The body is the
// setup input without `confirm`, plus an optional signup_code. Nothing here touches Northstar state.

export interface WorkspaceInput {
  input: ScenarioInput;
  input_sha256: string;
  signup_code: string | null;
}

function validate(raw: Record<string, unknown>): { input: ScenarioInput; input_sha256: string } {
  const parsed = ScenarioInput.safeParse({ ...raw, confirm: "replace" });
  if (!parsed.success) throw new ScenarioInvalid(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return { input: parsed.data, input_sha256: sha256(JSON.stringify(parsed.data)) };
}

export async function readWorkspaceInput(req: Request): Promise<WorkspaceInput> {
  const raw = await cappedJson(req, MAX_BODY_BYTES, "This setup is too large. Keep it under 64 KB.");
  const { signup_code, confirm, ...rest } = raw;
  if (confirm !== undefined) throw new ScenarioInvalid([{ path: "confirm", message: "Not used when creating a workspace" }]);
  if (signup_code !== undefined && typeof signup_code !== "string") throw new ScenarioInvalid([{ path: "signup_code", message: "Must be text" }]);
  return { ...validate(rest), signup_code: (signup_code as string | undefined) ?? null };
}

/** A new workspace starts fresh: no sessions, mappings or simulations, and one audit row with the input hash. */
export function initialWorkspaceState(input: ScenarioInput, input_sha256: string): AppState {
  const at = now();
  const s = buildCustomState(input, at, input_sha256);
  s.audit = [{ id: id("a"), actor: "leadership", session_id: "create", action: "workspace_created", target: `sha256:${input_sha256}`, at }];
  return s;
}

/** Restart: rebuild from the saved setup input. Keeps the audit log; proposals, acceptances and timer start over. */
export async function resetWorkspace(ws: CustomWsId, who: Session) {
  const { confirm: _confirm, ...saved } = (await readScenarioFile(ws)) as Record<string, unknown>;
  void _confirm;
  const { input, input_sha256 } = validate(saved);
  await replaceWorkspaceState(ws, (current) => {
    const next = buildCustomState(input, now(), input_sha256);
    next.audit = [...current.audit, { id: id("a"), actor: who.actor, session_id: who.sid, action: "reset", target: "workspace", at: now() }];
    return next;
  });
}
