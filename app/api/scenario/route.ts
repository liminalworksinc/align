import { requireSession } from "@/lib/auth";
import { handle, requireJson } from "@/lib/http";
import { readScenarioInput, ScenarioInvalid, setupScenario } from "@/lib/scenario";
import { HttpError } from "@/lib/store";

// Leadership replaces the workspace with its own two-team conflict. Validation errors come back as {error, issues}.
export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can set up a scenario");
    requireJson(req);
    try {
      const { input, input_sha256 } = await readScenarioInput(req);
      return await setupScenario(who, input, input_sha256);
    } catch (e) {
      if (e instanceof ScenarioInvalid) return Response.json({ error: e.message, issues: e.issues }, { status: 400 });
      throw e;
    }
  });
}
