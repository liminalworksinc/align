// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/sessions-directives-routes";

export const GET = bindRoute<{ ws: string; goal: string }>(routes, "workspaces/[ws]/goals/[goal]/hold", "GET");
export const PUT = bindRoute<{ ws: string; goal: string }>(routes, "workspaces/[ws]/goals/[goal]/hold", "PUT");
export const DELETE = bindRoute<{ ws: string; goal: string }>(routes, "workspaces/[ws]/goals/[goal]/hold", "DELETE");
