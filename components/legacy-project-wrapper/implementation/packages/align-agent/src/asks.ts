// The asks feed inside the one-pass sync: `GET /api/v2/workspaces/:ws/asks` with If-None-Match into
// feeds/asks-<ws>.json. It keeps the asks of this person's teams and the asks they recorded (at most 200; open and
// accepted first), for `align asks`, the "Asked of your teams" part of `align team`, and the accepted asks the envelope
// quotes (D3). Fails silently: an older server without the route, or no network, leaves the cached file as it was.
import type { Ctx } from "./context.ts";
import { api } from "./api.ts";
import { loadMe } from "./goals.ts";
import { askOrder, myTeams, readAsks } from "./shared/asks.ts";
import { writeJsonAtomic } from "./shared/fsx.ts";
import { layout } from "./shared/layout.ts";
import type { Ask, AsksFile } from "./shared/types.ts";

const KEEP = 200;

/** Only the fields the agent shows; the server's `can` flags (and anything newer) are not kept. */
function keep(a: Ask): Ask {
  return {
    id: a.id,
    state: a.state,
    team: a.team,
    goal: a.goal ?? null,
    text: a.text,
    from_label: a.from_label ?? null,
    requester: a.requester,
    source: a.source,
    mentions: Array.isArray(a.mentions) ? a.mentions.slice(0, 10) : [],
    decided_by: a.decided_by ?? null,
    decided_at: a.decided_at ?? null,
    created_at: a.created_at,
    updated_at: a.updated_at,
    waiting_on_me: !!a.waiting_on_me,
  };
}

const wellFormed = (a: unknown): a is Ask => {
  const r = a as Ask;
  return !!r && typeof r === "object" && typeof r.id === "string" && typeof r.text === "string" && typeof r.state === "string" && !!r.team && typeof r.team.id === "string";
};

/** Revalidate one workspace's asks. Returns whether the cached list changed. */
export async function fetchAsks(ctx: Ctx, ws: string): Promise<boolean> {
  const prev = readAsks(ctx.home, ws);
  const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(ws)}/asks`, { headers: prev?.etag ? { "if-none-match": prev.etag } : {} });
  if (r.status === 304 && prev) {
    writeJsonAtomic(layout.asksFeed(ctx.home, ws), { ...prev, fetched_at: new Date().toISOString() });
    return false;
  }
  if (r.status !== 200 || !Array.isArray(r.json?.asks)) return false;
  const me = loadMe(ctx.home);
  const teams = new Set(myTeams(me, ws).map((t) => t.id));
  const asks = (r.json.asks as unknown[])
    .filter(wellFormed)
    .filter((a) => teams.has(a.team.id) || (!!me?.user?.id && a.requester?.id === me.user.id))
    .sort(askOrder)
    .slice(0, KEEP)
    .map(keep);
  const next: AsksFile = { workspace_id: ws, version: String(r.json.version ?? ""), etag: r.headers.get("etag"), fetched_at: new Date().toISOString(), asks };
  writeJsonAtomic(layout.asksFeed(ctx.home, ws), next);
  return true;
}
