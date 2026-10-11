import { ingestEvidence } from "@/lib/evidence";
import { handle } from "@/lib/http";
import { mutate } from "@/lib/store";
import { connection } from "next/server";


export async function GET() {
  await connection();
  return handle(() =>
    mutate(async (s) => {
      const added = await ingestEvidence(s);
      return { added, simulations: s.simulations };
    }),
  );
}
