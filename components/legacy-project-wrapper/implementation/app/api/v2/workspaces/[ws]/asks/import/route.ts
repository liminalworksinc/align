// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/team-asks-routes";

export const POST = bindRoute<{ ws: string }>(routes, "workspaces/[ws]/asks/import", "POST");
