import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { body, handle } from "@/lib/http";
import { remapAll } from "@/lib/mapper";
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
    requireSession(req);
    const b = await body<{ action?: string }>(req);
    if (b.action !== "remap") throw new HttpError(400, "Unknown action");
    remapAll();
    return { ok: true };
  });
}
