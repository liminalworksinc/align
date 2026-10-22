import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { handle, requireJson } from "@/lib/http";
import { checkCodeFailures, clientOf, recordCodeFailure, takeCreateToken } from "@/lib/ratelimit";
import { ScenarioInvalid } from "@/lib/scenario";
import { HttpError } from "@/lib/store";
import { BAD_INVITE, createWorkspace, inviteUnused } from "@/lib/workspace";
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
    // Access comes from config only: open create (serve.sh, loopback), a single-use invite code (ALIGN_SIGNUP_CODES,
    // required when hosted), or Mode L's shared signup code. Wrong codes are limited per client.
    let invite: string | undefined;
    if (!cfg.allowOpenCreate) {
      const client = clientOf(req);
      checkCodeFailures(client);
      const given = parsed.signup_code;
      invite = cfg.signupCodes.find((c) => codeMatches(given, c));
      const ok = invite !== undefined ? await inviteUnused(invite) : codeMatches(given, cfg.signupCode);
      if (!ok) {
        recordCodeFailure(client);
        // Invites: one message for wrong and spent, so the answer never confirms that a guessed code is real.
        if (cfg.signupCodes.length) throw new HttpError(403, BAD_INVITE);
        throw new HttpError(403, cfg.signupCode ? "That signup code isn’t right" : "Workspace creation is closed");
      }
    }
    const state = initialWorkspaceState(parsed.input, parsed.input_sha256);
    const ws = await createWorkspace({ name: parsed.input.company, state, scenario: parsed.input, invite, takeToken: takeCreateToken });
    return Response.json(
      { workspace: { id: ws.id, name: ws.name, path: `/w/${ws.id}` }, passcodes: ws.passcodes, shown_once: true },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  });
}
