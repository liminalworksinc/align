// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/workspace-reporting-routes";

export const GET = bindRoute<{ ws: string }>(routes, "workspaces/[ws]/allocation", "GET");
