import { handle } from "@/lib/http";
import { acceptedPlan } from "@/lib/policy";
import { readState } from "@/lib/store";

// Read-only: which plan the Security team's agents are authorized to run right now.
export async function GET(req: Request) {
  void req.headers; // request-time route
  return handle(async () => acceptedPlan(await readState()));
}
