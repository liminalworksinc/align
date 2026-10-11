import { requireSession } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { pushCompanyGoal } from "@/lib/org";
import { mutate } from "@/lib/store";
import type { OrgDraft } from "@/lib/types";

export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const edits = await body<Partial<OrgDraft>>(req);
    return mutate((s) => pushCompanyGoal(s, who, edits));
  });
}
