// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/sessions-directives-routes";

export const POST = bindRoute<{ ws: string; key: string }>(routes, "workspaces/[ws]/sessions/[key]/stop-sharing", "POST");
