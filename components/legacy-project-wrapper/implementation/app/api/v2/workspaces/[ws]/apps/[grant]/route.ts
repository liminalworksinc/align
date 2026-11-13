// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/connected-apps-routes";

export const DELETE = bindRoute<{ ws: string; grant: string }>(routes, "workspaces/[ws]/apps/[grant]", "DELETE");
