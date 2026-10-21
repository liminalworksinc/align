import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { mappingEnabled, remapAll } from "@/lib/mapper";
import { activeRegistry } from "@/lib/registry";
import { HttpError, readState } from "@/lib/store";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    // B1-3: mappings describe captured sessions, so they need a signed-in session too.
    requireSession(req);
    const s = await readState();
    return { registry: activeRegistry(s), registry_version: s.registry_version, mappings: s.mappings };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    // B1-4: remapping sends every captured session to the external model, so it is leadership only.
    const who = requireSession(req);
    if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can remap sessions");
    const b = await body<{ action?: string }>(req);
    if (b.action !== "remap") throw new HttpError(400, "Unknown action");
    if (!mappingEnabled()) return { ok: true, attempted: false, reason: "external model off" };
    remapAll();
    return { ok: true, attempted: true };
  });
}
