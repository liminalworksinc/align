// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/team-asks-routes";

export const GET = bindRoute<{ ws: string }>(routes, "workspaces/[ws]/asks", "GET");
export const POST = bindRoute<{ ws: string }>(routes, "workspaces/[ws]/asks", "POST");
