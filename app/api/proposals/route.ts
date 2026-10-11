import { requireSession } from "@/lib/auth";
import { createProposal } from "@/lib/flow";
import { body, handle } from "@/lib/http";
import { mutate } from "@/lib/store";


export async function POST(req: Request) {
  return handle(async () => {
    const who = requireSession(req);
    const b = await body(req);
    return mutate((s) => createProposal(s, who, b));
  });
}
