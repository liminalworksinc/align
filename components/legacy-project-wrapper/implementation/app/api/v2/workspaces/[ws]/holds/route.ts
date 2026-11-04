import { idParam, route, webAuth } from "@/lib/v2/http";
import { listHolds } from "@/lib/v2/requests";
import { ID_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// GET (cookie): the held goals I can read, for the banners on the Goals and Sessions tabs.
export const GET = route<{ ws: string }>(async (req, params) => ({ holds: listHolds(enter(await webAuth(req), idParam(params.ws, ID_RE))) }));
