import { createAlignment, listAlignments } from "@/lib/v2/alignments";
import { idParam, readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): the requests I am part of. POST { target_goal_id, source_goal_id, choice, session_keys, note }.
export const GET = route<{ ws: string }>(async (req, params) => listAlignments(enter(await webAuth(req), idParam(params.ws, ID_RE))));

export const POST = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return Response.json(await createAlignment(pp, await readJson(req, 16 * 1024)), { status: 201 });
});
