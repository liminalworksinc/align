import type { Ctx } from "./context.ts";
import { renderHot, snapshot } from "./hot.ts";
import { api, apiOk, HttpError } from "./api.ts";
import { layout } from "./shared/layout.ts";
import { readJson, writeJsonAtomic } from "./shared/fsx.ts";
import type { FeedFile, Goal, MeFile } from "./shared/types.ts";

export function loadMe(home: string): MeFile | null {
  return readJson<MeFile>(layout.me(home));
}

export async function refreshMe(ctx: Ctx): Promise<MeFile> {
  const me = (await apiOk(ctx, "GET", "/api/v2/me")) as MeFile;
  const prev = loadMe(ctx.home);
  const next: MeFile = { ...me, default_workspace: prev?.default_workspace ?? ctx.config.default_workspace ?? (me.workspaces.length === 1 ? me.workspaces[0].id : null) };
  writeJsonAtomic(layout.me(ctx.home), next);
  return next;
}

export function loadFeed(home: string, ws: string): FeedFile | null {
  return readJson<FeedFile>(layout.feed(home, ws));
}

export async function refreshFeed(ctx: Ctx, ws: string): Promise<{ changed: boolean; feed: FeedFile | null }> {
  const prev = loadFeed(ctx.home, ws);
  const me = loadMe(ctx.home);
  const name = me?.workspaces.find((w) => w.id === ws)?.name || prev?.workspace_name || ws;
  const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(ws)}/goals`, { headers: prev?.etag ? { "if-none-match": prev.etag } : {} });
  if (r.status === 304 && prev) {
    const next = { ...prev, fetched_at: new Date().toISOString() };
    writeJsonAtomic(layout.feed(ctx.home, ws), next);
    return { changed: false, feed: next };
  }
  if (r.status !== 200) throw new HttpError(r.status, r.json?.error ?? null, r.json);
  const feed: FeedFile = {
    workspace_id: ws,
    workspace_name: name,
    version: String(r.json?.version ?? ""),
    etag: r.headers.get("etag"),
    fetched_at: new Date().toISOString(),
    goals: Array.isArray(r.json?.goals) ? (r.json.goals as Goal[]) : [],
  };
  writeJsonAtomic(layout.feed(ctx.home, ws), feed);
  syncSnapshots(ctx, feed);
  return { changed: true, feed };
}

/** Bring bound and pending goal snapshots up to the feed's version (never backwards). */
export function syncSnapshots(ctx: Ctx, feed: FeedFile): void {
  const byId = new Map(feed.goals.map((g) => [g.id, g]));
  const touched = new Set<string>();
  const shares = ctx.db.prepare("SELECT local_id, binding_goal, goal_json FROM shares WHERE workspace_id=? AND binding_goal IS NOT NULL").all(feed.workspace_id) as {
    local_id: string;
    binding_goal: string;
    goal_json: string | null;
  }[];
  for (const s of shares) {
    const g = byId.get(s.binding_goal);
    const cur = s.goal_json ? JSON.parse(s.goal_json) : null;
    if (g && (!cur || g.version > cur.version)) {
      ctx.db.prepare("UPDATE shares SET goal_json=? WHERE local_id=?").run(JSON.stringify(snapshot(g)), s.local_id);
      touched.add(s.local_id);
    }
  }
  const pend = ctx.db
    .prepare("SELECT p.local_id, p.goal_id, p.goal_json FROM pending_bindings p JOIN shares s ON s.local_id=p.local_id WHERE s.workspace_id=? AND p.goal_id IS NOT NULL")
    .all(feed.workspace_id) as { local_id: string; goal_id: string; goal_json: string | null }[];
  for (const p of pend) {
    const g = byId.get(p.goal_id);
    const cur = p.goal_json ? JSON.parse(p.goal_json) : null;
    if (g && (!cur || g.version > cur.version)) {
      ctx.db.prepare("UPDATE pending_bindings SET goal_json=? WHERE local_id=?").run(JSON.stringify(snapshot(g)), p.local_id);
      touched.add(p.local_id);
    }
  }
  // Every shared session in this workspace re-reads its parents and dependencies from the new feed.
  const all = ctx.db.prepare("SELECT local_id FROM shares WHERE workspace_id=?").all(feed.workspace_id) as { local_id: string }[];
  for (const s of all) touched.add(s.local_id);
  for (const lid of touched) renderHot(ctx, lid);
}

/** Resolve a workspace by id or case-insensitive name from the cached /me. */
export function resolveWorkspace(home: string, ref: string | null | undefined): { id: string; name: string } | null {
  const me = loadMe(home);
  if (!me) return null;
  const wsList = me.workspaces || [];
  if (!ref) {
    const def = me.default_workspace ? wsList.find((w) => w.id === me.default_workspace) : wsList.length === 1 ? wsList[0] : null;
    return def ? { id: def.id, name: def.name } : null;
  }
  const exact = wsList.find((w) => w.id === ref) || wsList.find((w) => w.name.toLowerCase() === ref.toLowerCase());
  return exact ? { id: exact.id, name: exact.name } : null;
}

export class GoalRefError extends Error {}

/** Resolve a goal by id, or by a unique case-insensitive title prefix among goals in the feed. */
export function resolveGoal(feed: FeedFile | null, ref: string): Goal {
  const goals = feed?.goals || [];
  const byId = goals.find((g) => g.id === ref);
  if (byId) return byId;
  const q = ref.trim().toLowerCase();
  const exact = goals.filter((g) => g.title.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const prefix = goals.filter((g) => g.title.toLowerCase().startsWith(q));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) throw new GoalRefError(`"${ref}" matches ${prefix.length} goals; use the goal id`);
  throw new GoalRefError(`no goal matches "${ref}" in the cached feed; try \`align goals --refresh\``);
}
