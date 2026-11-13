// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/connected-apps-routes";

export const GET = bindRoute<{ ws: string }>(routes, "workspaces/[ws]/apps", "GET");
