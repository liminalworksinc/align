import { idParam, readJson, requireRecentSignIn, route, webAuth, webWrite } from "@/lib/v2/http";
import { issueReadingCredential, readingCredentials } from "@/lib/v2/measure-sources";
import { ID_RE } from "@/lib/v2/validate";
import { enter, need } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  return { credentials: readingCredentials(pp) };
});

export const POST = route<{ ws: string }>(async (req, params) => {
  const principal = await webWrite(req);
  const pp = enter(principal, idParam(params.ws, ID_RE));
  need(pp, "workspace.manage");
  requireRecentSignIn(principal, "create a CI reading credential");
  const credential = await issueReadingCredential(pp, await readJson(req, 4096));
  return Response.json(credential, { status: 201, headers: { "cache-control": "private, no-store" } });
});
