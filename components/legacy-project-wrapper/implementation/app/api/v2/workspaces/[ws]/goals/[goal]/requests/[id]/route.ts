// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/sessions-directives-routes";

export const DELETE = bindRoute<{ ws: string; goal: string; id: string }>(routes, "workspaces/[ws]/goals/[goal]/requests/[id]", "DELETE");
