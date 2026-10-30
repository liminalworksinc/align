import { checkCreateCode } from "@/lib/create-access";
import { handle, requireJson } from "@/lib/http";
import { clientOf, takeCreateToken } from "@/lib/ratelimit";
import { ScenarioInvalid } from "@/lib/scenario";
import { createWorkspace } from "@/lib/workspace";
import { initialWorkspaceState, readWorkspaceInput } from "@/lib/workspace-setup";

// Create a custom workspace. Nothing existing is replaced. Passcodes are returned once and stored only as hashes.
export async function POST(req: Request) {
  return handle(async () => {
    requireJson(req);
    let parsed: Awaited<ReturnType<typeof readWorkspaceInput>>;
    try {
      parsed = await readWorkspaceInput(req);
    } catch (e) {
      if (e instanceof ScenarioInvalid) return Response.json({ error: e.message, issues: e.issues }, { status: 400 });
      throw e;
    }
    // The code check (open create, a single-use invite, or Mode L's shared code) is lib/create-access.ts.
    const invite = await checkCreateCode(clientOf(req), parsed.signup_code);
    const state = initialWorkspaceState(parsed.input, parsed.input_sha256);
    const ws = await createWorkspace({ name: parsed.input.company, state, scenario: parsed.input, invite, takeToken: takeCreateToken });
    return Response.json(
      { workspace: { id: ws.id, name: ws.name, path: `/w/${ws.id}` }, passcodes: ws.passcodes, shown_once: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  });
}
