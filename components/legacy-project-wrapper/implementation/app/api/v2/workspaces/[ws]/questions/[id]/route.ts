import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { getQuestion } from "@/lib/v2/questions";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie or Bearer): one agent question, 404 unless this person reads its goal.
export const GET = route<{ ws: string; id: string }>(async (req, params) => getQuestion(enter(await eitherAuth(req), idParam(params.ws, ID_RE)), idParam(params.id, ID_RE)));
