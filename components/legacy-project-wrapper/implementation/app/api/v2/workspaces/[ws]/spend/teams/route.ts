import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { budgetTeams } from "@/lib/v2/budgets";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, p) =>
  budgetTeams(enter(await eitherAuth(req), idParam(p.ws, ID_RE))));
