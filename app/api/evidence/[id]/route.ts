import { readEvidenceFile, readTrace } from "@/lib/evidence";
import { handle } from "@/lib/http";
import { HttpError, readState } from "@/lib/store";
import path from "node:path";


export async function GET(_req: Request, ctx: RouteContext<"/api/evidence/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const s = await readState();
    const run = s.simulations.find((r) => r.id === id);
    if (!run) throw new HttpError(404, "Evidence not found");
    const report = await readEvidenceFile(run.report_path);
    const trace = readTrace(path.basename(run.report_path, ".json"));
    return { run, report, trace };
  });
}
