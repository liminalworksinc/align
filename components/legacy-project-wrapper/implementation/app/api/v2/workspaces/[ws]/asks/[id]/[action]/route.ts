import { actOnAsk, assertAskAction } from "@/lib/v2/asks";
import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST .../asks/:id/{accept|decline|done|reopen|withdraw|mention} (cookie). mention carries {date, text, source_title}.
export const POST = route<{ ws: string; id: string; action: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return actOnAsk(pp, idParam(params.id, ID_RE), assertAskAction(params.action), await readJson(req, 8 * 1024));
});
