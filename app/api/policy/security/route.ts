import { sessionFrom } from "@/lib/auth";
import { handle } from "@/lib/http";
import { acceptedPlan } from "@/lib/policy";
import { readState } from "@/lib/store";

// Read-only: which plan the Security team's agents are authorized to run right now.
// A custom scenario's agreement (measures, plan text, conditions, commitment) goes to signed-in callers only, as
// B1-6 keeps scenario content out of anonymous reads; agents read it through the token-gated MCP tool instead.
export async function GET(req: Request) {
  void req.headers; // request-time route
  return handle(async () => {
    const { agreement, ...plan } = acceptedPlan(await readState());
    return agreement && sessionFrom(req) ? { ...plan, agreement } : plan;
  });
}
