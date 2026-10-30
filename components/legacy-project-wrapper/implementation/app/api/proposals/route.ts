import { requireWsSession } from "@/lib/auth";
import { createProposal } from "@/lib/flow";
import { bodyFor, handle } from "@/lib/http";


export async function POST(req: Request) {
  return handle(async () => {
    const who = requireWsSession(req);
    const b = await bodyFor(req, who.ws);
    return who.mutate((s) => createProposal(s, who, b));
  });
}
