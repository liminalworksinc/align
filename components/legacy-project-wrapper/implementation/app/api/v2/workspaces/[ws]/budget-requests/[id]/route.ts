import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { getBudgetRequest } from "@/lib/v2/budgets";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string; id: string }>(async (req, p) =>
  getBudgetRequest(enter(await eitherAuth(req), idParam(p.ws, ID_RE)), idParam(p.id, ID_RE)));
