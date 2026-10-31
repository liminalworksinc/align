import { idParam, route, webWrite } from "@/lib/v2/http";
import { cancelRequest } from "@/lib/v2/requests";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// DELETE (cookie; the sender or a workspace owner): cancel the request. Sessions that have not answered get a
// cancelled request directive and their state becomes expired. -> 200 { request }.
export const DELETE = route<{ ws: string; goal: string; id: string }>(async (req, params) =>
  cancelRequest(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.goal, ID_RE), idParam(params.id, ID_RE)),
);
