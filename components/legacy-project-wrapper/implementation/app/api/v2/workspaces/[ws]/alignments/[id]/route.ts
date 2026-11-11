// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/goals-deliberation-routes";

export const GET = bindRoute<{ ws: string; id: string }>(routes, "workspaces/[ws]/alignments/[id]", "GET");
