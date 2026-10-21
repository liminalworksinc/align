import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { handle, requireJson } from "@/lib/http";
import { takeCreateToken } from "@/lib/ratelimit";
import { ScenarioInvalid } from "@/lib/scenario";
import { HttpError } from "@/lib/store";
import { createWorkspace } from "@/lib/workspace";
import { initialWorkspaceState, readWorkspaceInput } from "@/lib/workspace-setup";

function codeMatches(given: string | null, expected: string | null) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Create a custom workspace. Nothing existing is replaced. Passcodes are returned once and stored only as hashes.
export async function POST(req: Request) {
  return handle(async () => {
    requireJson(req);
    const cfg = config();
    let parsed: Awaited<ReturnType<typeof readWorkspaceInput>>;
    try {
      parsed = await readWorkspaceInput(req);
    } catch (e) {
      if (e instanceof ScenarioInvalid) return Response.json({ error: e.message, issues: e.issues }, { status: 400 });
      throw e;
    }
    // Access comes from config only: open create (serve.sh, loopback) or a matching signup code.
    if (!cfg.allowOpenCreate && !codeMatches(parsed.signup_code, cfg.signupCode)) {
      throw new HttpError(403, cfg.signupCode ? "That signup code isn’t right" : "Workspace creation is closed");
    }
    takeCreateToken();
    const state = initialWorkspaceState(parsed.input, parsed.input_sha256);
    const ws = await createWorkspace({ name: parsed.input.company, state, scenario: parsed.input });
    return Response.json(
      { workspace: { id: ws.id, name: ws.name, path: `/w/${ws.id}` }, passcodes: ws.passcodes, shown_once: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  });
}
