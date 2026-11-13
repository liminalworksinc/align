// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/sessions-directives-routes";

export const GET = bindRoute<{ ws: string; goal: string }>(routes, "workspaces/[ws]/goals/[goal]/requests", "GET");
export const POST = bindRoute<{ ws: string; goal: string }>(routes, "workspaces/[ws]/goals/[goal]/requests", "POST");
