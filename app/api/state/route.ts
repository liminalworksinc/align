import { sessionFrom } from "@/lib/auth";
import { ingestEvidence } from "@/lib/evidence";
import { viewFor } from "@/lib/flow";
import { handle } from "@/lib/http";
import { mutate } from "@/lib/store";


export async function GET(req: Request) {
  return handle(async () => {
    const who = sessionFrom(req);
    const s = await mutate(async (st) => {
      await ingestEvidence(st);
      return st;
    });
    return viewFor(s, who?.actor ?? null);
  });
}
