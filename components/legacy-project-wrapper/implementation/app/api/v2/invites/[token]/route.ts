import { route, webAuth } from "@/lib/v2/http";
import { previewInvite } from "@/lib/v2/workspaces";

// GET /api/v2/invites/:token (cookie): which workspace and role, whether my email matches, and (when it does) my paired
// devices that are not revoked, which accepting may give this workspace too.
export const GET = route<{ token: string }>(async (req, { token }) => previewInvite(token, (await webAuth(req)).user));
