import { connection } from "next/server";
import { bindWs } from "@/lib/auth";
import { handle } from "@/lib/http";
import { HttpError } from "@/lib/store";
import type { Actor, Owner } from "@/lib/types";
import { parseCustomWs, workspaceExists } from "@/lib/workspace";

const ROLES: { id: Actor; slot: Owner; blurb: string }[] = [
  { id: "leadership", slot: "ceo", blurb: "sets the company goal" },
  { id: "product", slot: "product", blurb: "asks for the change" },
  { id: "security", slot: "security", blurb: "owns the goal being changed" },
];

// Public by design (the sign-in screen needs it): company and team names (and the company note, when set up with
// one) only, never person names or constraints.
export async function GET(_req: Request, ctx: RouteContext<"/api/workspaces/[id]/login-info">) {
  await connection();
  return handle(async () => {
    const ws = parseCustomWs((await ctx.params).id);
    if (!ws || !workspaceExists(ws)) throw new HttpError(404, "This workspace no longer exists");
    // A read, with no session: bound to this workspace only, never Northstar.
    const s = await bindWs({ actor: "leadership", sid: "", ws }).read();
    const note = s.scenario_config?.company_note;
    return { name: s.company, ...(note ? { company_note: note } : {}), roles: ROLES.map((r) => ({ id: r.id, team: s.teams?.[r.slot]?.team ?? "", blurb: r.blurb })) };
  });
}
