import { badRequest } from "@/lib/v2/errors";
import { idParam, route, webAuth } from "@/lib/v2/http";
import { spendCsv, spendMonth } from "@/lib/v2/spend-export";
import { ID_RE } from "@/lib/v2/validate";
import { enter, need } from "@/lib/v2/workspaces";

export const GET = route<{ ws: string }>(async (req, params) => {
  const pp = enter(await webAuth(req), idParam(params.ws, ID_RE));
  need(pp, "spend.read");
  const months = new URL(req.url).searchParams.getAll("month");
  if (months.length !== 1) throw badRequest("Supply one month in YYYY-MM format");
  const range = spendMonth(months[0]);
  return new Response(spendCsv(pp, range), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="align-spend-${range.month}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
