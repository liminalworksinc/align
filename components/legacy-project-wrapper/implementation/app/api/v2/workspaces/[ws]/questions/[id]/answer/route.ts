import { idParam, readJson, route, webWrite } from "@/lib/v2/http";
import { answerQuestion } from "@/lib/v2/questions";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (cookie; the goal's owner) {answer: continue|steer|switch, text?, goal_id?}: answer an agent's question. The
// answer reaches the asking session as an `answer` directive.
export const POST = route<{ ws: string; id: string }>(async (req, params) => {
  const pp = enter(await webWrite(req), idParam(params.ws, ID_RE));
  return answerQuestion(pp, idParam(params.id, ID_RE), await readJson(req, 8 * 1024));
});
