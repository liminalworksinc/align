import { requireSession } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { teamOf } from "@/lib/labels";
import { HttpError, readState, resetState } from "@/lib/store";


// Demo reset for rehearsals: restores goals/proposals/timer from the fixture, keeps ingested Sparta evidence.
export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const { confirm } = await body<{ confirm?: string }>(req);
    if (confirm !== "reset") throw new HttpError(400, 'Send {"confirm":"reset"}');
    // A custom scenario is leadership's workspace: only leadership may reset it. Northstar keeps the any-role rule.
    const s = await readState();
    if (s.scenario === "custom") {
      if (who.actor !== "leadership") throw new HttpError(403, `Only ${teamOf(s, "ceo")} can reset this scenario`);
      await resetState(who, { fresh: true });
      return { ok: true };
    }
    await resetState(who);
    return { ok: true };
  });
}
