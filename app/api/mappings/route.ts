import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { body, handle, requireSameOrigin } from "@/lib/http";
import { mapperStatus, remapAll } from "@/lib/mapper";
import { activeRegistry } from "@/lib/registry";
import { HttpError, readState } from "@/lib/store";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    // B1-3: mappings describe captured sessions, so they need a signed-in session too.
    requireSession(req);
    const s = await readState();
    return { registry: activeRegistry(s), registry_version: s.registry_version, mappings: s.mappings, mapper: mapperStatus() };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    // B1-4: remapping sends every captured session to the external model, so it is leadership only.
    const who = requireSession(req);
    if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can remap sessions");
    requireSameOrigin(req); // cross-port CSRF (review M4)
    const b = await body<{ action?: string }>(req);
    if (b.action !== "remap") throw new HttpError(400, "Unknown action");
    // B1-5: with the control off or no key, nothing is attempted and the reason is reported.
    const mapper = mapperStatus();
    if (mapper.status !== "on") return { ok: true, attempted: false, reason: mapper.message, mapper };
    remapAll();
    return { ok: true, attempted: true, mapper };
  });
}
