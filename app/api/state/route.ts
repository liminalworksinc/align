import { stateContext } from "@/lib/auth";
import { ingestEvidence } from "@/lib/evidence";
import { recordExcludedPrep, viewFor } from "@/lib/flow";
import { config } from "@/lib/config";
import { handle } from "@/lib/http";
import { HttpError } from "@/lib/store";
import { ensureRegistryFresh } from "@/lib/mapper";


export async function GET(req: Request) {
  return handle(async () => {
    // Anonymous is Northstar, as before. A custom session ended by expiry or revocation gets 401, never Northstar.
    const ctx = stateContext(req);
    const who = ctx.who;
    // Hosted: Northstar is not public. Anonymous callers get 404 unless ALIGN_NORTHSTAR_PUBLIC=1.
    if (!who && config().hosted && !config().northstarPublic) throw new HttpError(404, "Not found");
    if (who && who.ws !== "northstar") {
      // Custom workspaces have no Sparta evidence, prep exclusions or agent registry.
      return viewFor(await ctx.read(), who.actor);
    }
    const s = await ctx.mutate(async (st) => {
      try {
        await ingestEvidence(st);
        st.ingest_errors = [];
      } catch (e) {
        // A malformed or half-written evidence file must not freeze both sessions.
        st.ingest_errors = [e instanceof Error ? e.message : String(e)];
      }
      recordExcludedPrep(st);
      return st;
    });
    // Keeps registry_version current. A registry change (org push, ratify) re-maps every captured agent session,
    // but only when the external model is on (B1-4: ensureRegistryFresh checks mappingEnabled()). Fire and forget.
    void ensureRegistryFresh();
    return viewFor(s, who?.actor ?? null);
  });
}
