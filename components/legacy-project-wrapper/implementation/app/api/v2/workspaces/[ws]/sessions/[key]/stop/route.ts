import { idParam, route, webWrite } from "@/lib/v2/http";
import { setAgentStop } from "@/lib/v2/sessions";
import { ID_RE, SESSION_KEY_RE } from "@/lib/v2/validate";
import { enter } from "@/lib/v2/workspaces";

// POST (cookie; the session's owner or a workspace owner): set the agent's local stop latch (stop directive).
export const POST = route<{ ws: string; key: string }>(async (req, params) =>
  setAgentStop(enter(await webWrite(req), idParam(params.ws, ID_RE)), idParam(params.key, SESSION_KEY_RE), true),
);
