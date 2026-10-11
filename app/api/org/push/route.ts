import { requireSession } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { pushCompanyGoal } from "@/lib/org";
import { mutate } from "@/lib/store";
import type { OrgDraft } from "@/lib/types";
import { emitAuthority } from "@/lib/events";

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const edits = await body<Partial<OrgDraft>>(req);
    const out = await mutate((s) => {
      const r = pushCompanyGoal(s, who, edits);
      return { ...r, event_id: `push:${s.pushes.at(-1)?.id}` };
    });
    emitAuthority({ event_id: out.event_id, kind: "push", at: out.pushed_at });
    return out;
  });
}
