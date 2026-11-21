import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { listBudgetRequests } from "@/lib/v2/budgets";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, p) =>
  listBudgetRequests(enter(await eitherAuth(req), idParam(p.ws, ID_RE)), undefined, new URL(req.url).searchParams.get("month"), { limit: new URL(req.url).searchParams.get("limit"), cursor: new URL(req.url).searchParams.get("cursor") }));
