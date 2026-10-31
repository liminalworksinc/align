import { route, webAuth } from "@/lib/v2/http";
import { previewInvite } from "@/lib/v2/workspaces";

// GET /api/v2/invites/:token (cookie): which workspace and role, and whether my email matches.
export const GET = route<{ token: string }>(async (req, { token }) => previewInvite(token, (await webAuth(req)).user));
