// Typed entry point for the admitted route library.
import { bindRoute } from "@/lib/v2/native-routes/binding";
import { routes } from "@/lib/v2/native-routes/workspace-admin-routes";

export const GET = bindRoute<{ ws: string }>(routes, "workspaces/[ws]", "GET");
export const PATCH = bindRoute<{ ws: string }>(routes, "workspaces/[ws]", "PATCH");
export const DELETE = bindRoute<{ ws: string }>(routes, "workspaces/[ws]", "DELETE");
