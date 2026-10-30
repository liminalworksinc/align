import { RECEIPT_STATES, recordReceipt } from "@/lib/v2/directives";
import { deviceAuth, idParam, readJson, route } from "@/lib/v2/http";
import { ID_RE, iso, oneOf, str } from "@/lib/v2/validate";

// POST /api/v2/directives/:id/receipts (Bearer, at most 2 KB) { session_key, state, at }: idempotent.
export const POST = route<{ id: string }>(async (req, params) => {
  const dev = deviceAuth(req);
  const b = await readJson(req, 2048);
  return recordReceipt(dev, idParam(params.id, ID_RE), str(b, "session_key", 43), oneOf(b, "state", RECEIPT_STATES), iso(b, "at"));
});
