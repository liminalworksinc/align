import { badRequest } from "@/lib/v2/errors";
import { RECEIPT_STATES, recordReceipt } from "@/lib/v2/directives";
import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE, iso, oneOf, str } from "@/lib/v2/validate";

// POST /api/v2/directives/:id/receipts (Bearer, at most 2 KB) { session_key, state, at, auto_accepted? }: idempotent.
// accepted and declined answer a request directive; auto_accepted: true marks an accept the agent made on its own.
export const POST = route<{ id: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const b = await readJson(req, 2048);
  if (b.auto_accepted !== undefined && typeof b.auto_accepted !== "boolean") throw badRequest("auto_accepted must be true or false");
  return recordReceipt(dev, idParam(params.id, ID_RE), str(b, "session_key", 43), oneOf(b, "state", RECEIPT_STATES), iso(b, "at"), b.auto_accepted === true);
});
