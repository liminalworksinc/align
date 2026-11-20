import { eitherAuth, idParam, route, readJson, webWrite } from "@/lib/v2/http";
import { budgetBurn, writeBudget } from "@/lib/v2/budgets";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string; team: string }>(async (req, p) =>
  budgetBurn(enter(await eitherAuth(req), idParam(p.ws, ID_RE)), idParam(p.team, ID_RE), new URL(req.url).searchParams.get("month")));
export const PUT = route<{ ws: string; team: string }>(async (req, p) =>
  writeBudget(enter(await webWrite(req), idParam(p.ws, ID_RE)), idParam(p.team, ID_RE), new URL(req.url).searchParams.get("month"), await readJson(req, 16 * 1024)));
export const DELETE = route<{ ws: string; team: string }>(async (req, p) =>
  writeBudget(enter(await webWrite(req), idParam(p.ws, ID_RE)), idParam(p.team, ID_RE), new URL(req.url).searchParams.get("month"), null));
