import { requireSession } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { HttpError, resetState } from "@/lib/store";


// Demo reset for rehearsals: restores goals/proposals/timer from the fixture, keeps ingested Sparta evidence.
export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const { confirm } = await body<{ confirm?: string }>(req);
    if (confirm !== "reset") throw new HttpError(400, 'Send {"confirm":"reset"}');
    await resetState(who);
    return { ok: true };
  });
}
