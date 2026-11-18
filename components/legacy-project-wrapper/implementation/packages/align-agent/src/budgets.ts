import type { Ctx } from "./context.ts";
import { boundTo, loadCredentials, NetworkError, rawRequest } from "./api.ts";
import fs from "node:fs";
import { layout } from "./shared/layout.ts";
import { readJson, removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import { observedCrossings, type BudgetSnapshot } from "./shared/budget-notes.ts";
import type { Goal } from "./shared/types.ts";
import path from "node:path";
import { matchRule, readRules, realDir } from "./shared/rules.ts";

export function budgetFolder(ctx: Ctx, cwd: string) {
  const rule = matchRule(readRules(ctx.home), cwd);
  if (rule) return { workspace_id: rule.workspace_id, goal_id: rule.goal_id };
  const dir = realDir(cwd);
  const rows = ctx.db.prepare("SELECT h.workspace_id, h.binding_goal AS goal_id, s.cwd FROM shares h JOIN sessions s ON s.local_id = h.local_id WHERE h.state = 'shared'").all() as { workspace_id: string; goal_id: string | null; cwd: string | null }[];
  const matches = rows.filter((r) => r.cwd && (dir === realDir(r.cwd) || dir.startsWith(realDir(r.cwd) + path.sep)));
  const unique = [...new Map(matches.map((r) => [`${r.workspace_id}:${r.goal_id ?? ""}`, r])).values()];
  if (unique.length > 1) throw new Error("Several shared goals apply to this folder. Pass --workspace and --team, and --goal when requesting for a goal.");
  return unique[0] ?? null;
}

/** Explicit selection or the folder goal's team, then a sole current membership. Never guess among teams. */
export function budgetTeam(goal: Pick<Goal, "team"> | null, explicit: string | undefined, teams: { id: string; name?: string }[]): string {
  if (explicit) {
    const names = teams.filter((t) => t.name?.toLowerCase() === explicit.toLowerCase());
    if (names.length === 1) return names[0].id;
    if (names.length > 1) throw new Error("Several teams have that name. Choose a team in Align.");
    if (/^pod_[A-Za-z0-9_-]+$/.test(explicit)) return explicit;
    throw new Error("That team is unavailable. Choose one of the team names listed above.");
  }
  const team = goal?.team?.id || (teams.length === 1 ? teams[0].id : null);
  if (!team) throw new Error("No single team applies to this folder. Pass --team <name> from the teams listed above.");
  return team;
}

export function requestAmount(value: string | undefined): number {
  const n = value === undefined || !/^\d+(?:\.\d{1,2})?$/.test(value) ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new Error("--amount must be a positive USD amount in whole cents, at most 1,000,000.");
  return n;
}

/** Budget reads use the current access token only: no refresh, retry or lock wait under the sync lock. */
export const BUDGET_READS_MAX = 120, BUDGET_PASS_MS = 2_000;
const WINDOW_MS = 5 * 60_000;
type ObservedBudget = Pick<BudgetSnapshot, "team" | "month" | "as_of" | "effective_budget_usd_micros" | "estimated_spend_usd_micros" | "spend_bound" | "unpriced_requests">;
type Share = { local_id: string; workspace_id: string; session_key: string; binding_epoch: string | null };
type Attribution = { workspace_id: string; session_key: string; epoch_id: string | null; month: string; at: number; team: BudgetSnapshot["team"] | null };
type TeamRead = { at: number; budget: ObservedBudget | null };
function entries(dir: string): fs.Dirent[] { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }
const attributionFile = (home: string, lid: string) => path.join(home, "budget-attribution", `${lid}.json`);

export async function refreshSessionBudgets(ctx: Ctx): Promise<void> {
  const now = Date.now(), deadline = now + BUDGET_PASS_MS, month = new Date(now).toISOString().slice(0, 7);
  const fresh = (at: number) => Number.isFinite(at) && at <= now && now - at < WINDOW_MS;
  const shared = ctx.db.prepare("SELECT local_id, workspace_id, session_key, binding_epoch FROM shares WHERE state='shared' ORDER BY local_id").all() as Share[];
  const active = new Set(shared.map((s) => `${s.local_id}.json`));
  for (const dir of ["budgets-cache", "budget-attribution"]) {
    for (const name of entries(path.join(ctx.home, dir))) {
      if (name.isFile() && name.name !== "cursor.json" && name.name !== "teams.json" && !active.has(name.name)) removeFile(path.join(ctx.home, dir, name.name));
    }
  }
  const markerRoot = path.join(ctx.home, "budget-shown");
  for (const dir of entries(markerRoot)) {
    if (!dir.isDirectory()) continue;
    for (const marker of fs.readdirSync(path.join(markerRoot, dir.name))) {
      if (!marker.startsWith(month + "-")) removeFile(path.join(markerRoot, dir.name, marker));
    }
    if (!fs.readdirSync(path.join(markerRoot, dir.name)).length) fs.rmdirSync(path.join(markerRoot, dir.name));
  }
  const cursorFile = path.join(ctx.home, "budgets-cache", "cursor.json");
  if (!shared.length) { removeFile(cursorFile); removeFile(path.join(ctx.home, "budgets-cache", "teams.json")); return; }
  const cursor = readJson<{ local_id: string }>(cursorFile)?.local_id ?? "";
  let start = shared.findIndex((s) => s.local_id > cursor);
  if (start < 0) start = 0;
  const shares = [...shared.slice(start), ...shared.slice(0, start)].slice(0, 100);
  const teamsFile = path.join(ctx.home, "budgets-cache", "teams.json");
  const teams = Object.fromEntries(Object.entries(readJson<Record<string, TeamRead>>(teamsFile) ?? {}).filter(([k, v]) => k.endsWith(`:${month}`) && fresh(v.at)));
  let reads = 0, last: string | null = null;
  const read = async (route: string) => {
    const remaining = deadline - Date.now(), c = loadCredentials(ctx.home);
    if (remaining <= 0 || reads >= BUDGET_READS_MAX || !c || c.signed_out || !c.access_token || Date.parse(c.access_expires_at ?? "") <= Date.now() || !boundTo(ctx, c)) return undefined;
    reads++;
    return rawRequest(c.server_url, "GET", route, { headers: { authorization: `Bearer ${c.access_token}` }, timeoutMs: Math.max(1, Math.min(1000, remaining)) });
  };
  for (const s of shares) {
    if (reads >= BUDGET_READS_MAX || Date.now() >= deadline) break;
    last = s.local_id;
    const file = layout.budgetCache(ctx.home, s.local_id), af = attributionFile(ctx.home, s.local_id);
    try {
      const cached = readJson<BudgetSnapshot>(file);
      let attr = readJson<Attribution>(af);
      if (!attr || attr.workspace_id !== s.workspace_id || attr.session_key !== s.session_key || attr.epoch_id !== s.binding_epoch || attr.month !== month || !fresh(attr.at)) {
        const r = await read(`/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/sessions/${encodeURIComponent(s.session_key)}/budget?attribution=1`);
        if (!r) break;
        const b = r.status === 200 && r.json?.epoch_id === s.binding_epoch && r.json?.month === month ? r.json : null;
        if (r.status !== 200 && r.status !== 404) { if (r.status < 500) removeFile(file); continue; }
        attr = { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch, month, at: now, team: b?.team ?? null };
        writeJsonAtomic(af, attr);
      }
      if (!attr.team) { removeFile(file); continue; }
      if (cached && (cached.workspace_id !== s.workspace_id || cached.session_key !== s.session_key || cached.month !== month || cached.team?.id !== attr.team.id)) removeFile(file);
      const key = `${s.workspace_id}:${attr.team.id}:${month}`;
      if (!teams[key]) {
        const r = await read(`/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/teams/${encodeURIComponent(attr.team.id)}/budget?month=${month}`);
        if (!r) { last = shares[shares.indexOf(s) - 1]?.local_id ?? cursor; break; }
        if (r.status !== 200 && r.status !== 404) { if (r.status < 500) removeFile(file); continue; }
        teams[key] = { at: now, budget: r.status === 200 && r.json?.month === month && r.json?.team?.id === attr.team.id ? r.json : null };
      }
      const b = teams[key].budget;
      const live = ctx.db.prepare("SELECT state, workspace_id, session_key, binding_epoch FROM shares WHERE local_id=?").get(s.local_id) as Share & { state: string } | undefined;
      if (!b) { removeFile(file); continue; }
      if (!live || live.state !== "shared" || live.workspace_id !== s.workspace_id || live.session_key !== s.session_key || live.binding_epoch !== s.binding_epoch || !boundTo(ctx, loadCredentials(ctx.home))) { removeFile(file); removeFile(af); continue; }
      const snapshot: BudgetSnapshot = { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch!, fetched_at: new Date(teams[key].at).toISOString(), attribution_at: new Date(attr.at).toISOString(), as_of: b.as_of,
        month: b.month, team: b.team, effective_budget_usd_micros: b.effective_budget_usd_micros, estimated_spend_usd_micros: b.estimated_spend_usd_micros, spend_bound: b.spend_bound, unpriced_requests: b.unpriced_requests };
      snapshot.crossings = observedCrossings(snapshot, cached, Date.now());
      writeJsonAtomic(file, snapshot);
    } catch (e) { if (!(e instanceof NetworkError)) removeFile(file); }
  }
  const current = loadCredentials(ctx.home);
  if (!current || current.signed_out || !boundTo(ctx, current)) {
    for (const dir of ["budgets-cache", "budget-attribution"]) fs.rmSync(path.join(ctx.home, dir), { recursive: true, force: true });
    return;
  }
  writeJsonAtomic(teamsFile, teams);
  if (last) writeJsonAtomic(cursorFile, { local_id: last });
}
