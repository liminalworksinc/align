// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/goals-deliberation-routes";

export const POST = bindRoute<{ ws: string; goal: string; id: string; action: string }>(routes, "workspaces/[ws]/goals/[goal]/change-requests/[id]/[action]", "POST");
