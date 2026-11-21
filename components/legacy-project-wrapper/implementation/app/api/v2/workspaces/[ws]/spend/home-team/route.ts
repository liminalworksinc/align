import { eitherAuth, idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { chooseSpendHomeTeam, spendHomeTeam } from "@/lib/v2/spend-home";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, p) =>
  spendHomeTeam(enter(await eitherAuth(req), idParam(p.ws, ID_RE))));
export const PUT = route<{ ws: string }>(async (req, p) =>
  chooseSpendHomeTeam(enter(await webWrite(req), idParam(p.ws, ID_RE)), await readJson(req, 16 * 1024)));
