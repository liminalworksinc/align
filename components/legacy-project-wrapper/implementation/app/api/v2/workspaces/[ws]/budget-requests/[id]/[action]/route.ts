import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { actOnBudgetRequest, budgetAction } from "@/lib/v2/budgets";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const POST = route<{ ws: string; id: string; action: string }>(async (req, p) =>
  actOnBudgetRequest(enter(await webWrite(req), idParam(p.ws, ID_RE)), idParam(p.id, ID_RE), budgetAction(p.action), await readJson(req, 16 * 1024)));
