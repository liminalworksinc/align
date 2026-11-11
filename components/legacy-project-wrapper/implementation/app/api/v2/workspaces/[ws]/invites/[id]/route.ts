// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/workspace-admin-routes";

export const DELETE = bindRoute<{ ws: string; id: string }>(routes, "workspaces/[ws]/invites/[id]", "DELETE");
