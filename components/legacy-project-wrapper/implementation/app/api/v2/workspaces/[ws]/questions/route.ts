import { eitherAuth, idParam, route } from "@/lib/v2/http";
import { listQuestions } from "@/lib/v2/questions";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie or Bearer): the agents' questions on goals this person reads (LIM-2505), open first.
export const GET = route<{ ws: string }>(async (req, params) => listQuestions(enter(await eitherAuth(req), idParam(params.ws, ID_RE))));
