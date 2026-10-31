import { readJson, route, webAuth, webWrite } from "@/lib/v2/http";
import { optStr, str } from "@/lib/v2/validate";
import { createWorkspace, deletedWorkspacesFor, workspacesFor } from "@/lib/v2/workspaces";

// GET /api/v2/workspaces (cookie): mine, and the deleted ones I own that can still be restored.
// POST { name, creation_code? }: create one (I am its owner). When hosted it passes the creation gate
// (lib/v2/creation.ts): a creation code in `codes` mode, the caps, and the Turnstile token in x-captcha-response when
// Turnstile is on. A code-gated create needs no recent sign-in.
export const GET = route(async (req) => {
  const p = await webAuth(req);
  return { workspaces: workspacesFor(p), deleted: deletedWorkspacesFor(p.user.id) };
});

export const POST = route(async (req) => {
  const p = await webWrite(req);
  const b = await readJson(req, 4096);
  return Response.json(await createWorkspace(req, p, str(b, "name", 100), optStr(b, "creation_code", 100)), { status: 201 });
});
