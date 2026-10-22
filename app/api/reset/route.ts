import { requireWsSession } from "@/lib/auth";
import { bodyFor, handle } from "@/lib/http";
import { teamOf } from "@/lib/labels";
import { takeWorkspaceAction } from "@/lib/ratelimit";
import { HttpError, resetState } from "@/lib/store";
import { resetWorkspace } from "@/lib/workspace-setup";


// Demo reset for rehearsals: restores goals/proposals/timer from the fixture, keeps ingested Sparta evidence.
export async function POST(req: Request) {
  return handle(async () => {
    const who = requireWsSession(req);
    const { confirm } = await bodyFor<{ confirm?: string }>(req, who.ws);
    if (confirm !== "reset") throw new HttpError(400, 'Send {"confirm":"reset"}');
    if (who.ws !== "northstar") {
      // A custom workspace restarts its own conflict from the saved setup input. Leadership only.
      const s = await who.read();
      if (who.actor !== "leadership") throw new HttpError(403, `Only ${teamOf(s, "ceo")} can restart this scenario`);
      takeWorkspaceAction(who.ws, "restart"); // a Restart loop can't churn the audit archive (review M5)
      await resetWorkspace(who.ws, who);
      return { ok: true };
    }
    // A custom scenario is leadership's workspace: only leadership may reset it. Northstar keeps the any-role rule.
    const s = await who.read();
    if (s.scenario === "custom") {
      if (who.actor !== "leadership") throw new HttpError(403, `Only ${teamOf(s, "ceo")} can reset this scenario`);
      await resetState(who, { fresh: true });
      return { ok: true };
    }
    await resetState(who);
    return { ok: true };
  });
}
