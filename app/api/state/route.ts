import { sessionFrom } from "@/lib/auth";
import { ingestEvidence } from "@/lib/evidence";
import { recordExcludedPrep, viewFor } from "@/lib/flow";
import { handle } from "@/lib/http";
import { ensureRegistryFresh } from "@/lib/mapper";
import { mutate } from "@/lib/store";


export async function GET(req: Request) {
  return handle(async () => {
    const who = sessionFrom(req);
    const s = await mutate(async (st) => {
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
