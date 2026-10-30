import { connection } from "next/server";
import { getAuth } from "@/lib/v2/auth";
import { ready } from "@/lib/v2/init";

// Better Auth's endpoints (sign-in, OAuth callbacks, session, sign-out) under /api/v2/auth.
// A device token is never a browser session: any Authorization header is refused here too.
async function handle(req: Request): Promise<Response> {
  await connection();
  if (req.headers.get("authorization") !== null) return Response.json({ error: "bearer_not_allowed", message: "Web routes do not accept device tokens" }, { status: 403 });
  await ready();
  return getAuth().handler(req);
}

export const GET = handle;
export const POST = handle;
