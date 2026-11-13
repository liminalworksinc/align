import { idParam, route } from "@/lib/v2/http";
import { openStream } from "@/lib/v2/live";
import { ID_RE } from "@/lib/v2/validate";

// GET (cookie, members and viewers): the workspace's live stream (LIM-2503, lib/v2/live.ts), Server-Sent Events. It
// says which of the reader's own views moved after a write (`change`), never their content; the page reads them again.
// A non-member 404, an Authorization header 403 bearer_not_allowed, a fifth stream of one person here 429.
export const GET = route<{ ws: string }>(async (req, params) => openStream(req, idParam(params.ws, ID_RE)));
