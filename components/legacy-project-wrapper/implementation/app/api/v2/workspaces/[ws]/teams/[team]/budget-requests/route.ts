import { eitherAuth, eitherWrite, idParam, readJson, route } from "@/lib/v2/http";
import { createBudgetRequest, listBudgetRequests } from "@/lib/v2/budgets";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string; team: string }>(async (req, p) =>
  listBudgetRequests(enter(await eitherAuth(req), idParam(p.ws, ID_RE)), idParam(p.team, ID_RE), new URL(req.url).searchParams.get("month"), { limit: new URL(req.url).searchParams.get("limit"), cursor: new URL(req.url).searchParams.get("cursor") }));
export const POST = route<{ ws: string; team: string }>(async (req, p) => {
  const principal = await eitherWrite(req), pp = enter(principal, idParam(p.ws, ID_RE));
  return Response.json(await createBudgetRequest(pp, idParam(p.team, ID_RE), await readJson(req, 16 * 1024), "deviceId" in principal ? "terminal" : "browser"), { status: 201 });
});
