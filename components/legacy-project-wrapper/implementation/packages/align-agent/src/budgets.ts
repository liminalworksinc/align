import type { Ctx } from "./context.ts";
import { boundTo, clockOffset, CLOCK_TOLERANCE_MS, loadCredentials, NetworkError, rawRequest } from "./api.ts";
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
type TeamRead = { at: number; stamp?: string | null; budget: ObservedBudget | null };
function entries(dir: string): fs.Dirent[] { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }
const attributionFile = (home: string, lid: string) => path.join(home, "budget-attribution", `${lid}.json`);

/** Unknown additive fields are ignored. An absent field preserves older-server behavior. */
export function receiveBudgetStamps(ctx: Ctx, value: unknown): void {
  if (!Array.isArray(value)) { ctx.budgetStamps = undefined; return; }
  const month = new Date().toISOString().slice(0, 7);
  ctx.budgetStamps = new Map(value.flatMap((v) => v && typeof v.ws === "string" && /^ws_[A-Za-z0-9_-]+$/.test(v.ws) &&
    typeof v.team === "string" && /^pod_[A-Za-z0-9_-]+$/.test(v.team) && v.month === month && typeof v.stamp === "string" && /^[a-f0-9]{64}$/.test(v.stamp) ?
    [[`${v.ws}:${v.team}:${month}`, v.stamp] as [string, string]] : []));
}

/** Both terminal reads and sync accept the same current, correctly attributed figures. */
function validatedBudget(value: unknown, team: string, month: string, now: number, offset: number): ObservedBudget | null {
  if (!value || typeof value !== "object") return null;
  const b = value as ObservedBudget;
  const numberOrNull = (n: unknown) => n === null || typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (b.team?.id !== team || typeof b.team.name !== "string" || b.month !== month || typeof b.as_of !== "string" ||
    !Number.isFinite(Date.parse(b.as_of)) || Date.parse(b.as_of) > now + offset + CLOCK_TOLERANCE_MS || b.as_of.slice(0, 7) !== month ||
    !numberOrNull(b.effective_budget_usd_micros) || !numberOrNull(b.estimated_spend_usd_micros) ||
    !numberOrNull(b.unpriced_requests) || !["exact", "lower", "unknown"].includes(b.spend_bound)) return null;
  return b;
}
function applyFigure(ctx: Ctx, s: Share, attr: Attribution, read: TeamRead, now: number): void {
  const file = layout.budgetCache(ctx.home, s.local_id), b = read.budget;
  const live = ctx.db.prepare("SELECT state, workspace_id, session_key, binding_epoch FROM shares WHERE local_id=?").get(s.local_id) as Share & { state: string } | undefined;
  if (!live || live.state !== "shared" || live.workspace_id !== s.workspace_id || live.session_key !== s.session_key ||
    live.binding_epoch !== s.binding_epoch || !s.binding_epoch || !boundTo(ctx, loadCredentials(ctx.home))) { removeFile(file); return; }
  if (!b || b.effective_budget_usd_micros === null) { removeFile(file); return; }
  const cached = readJson<BudgetSnapshot>(file);
  const snapshot: BudgetSnapshot = { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch,
    fetched_at: new Date(read.at).toISOString(), attribution_at: new Date(attr.at).toISOString(), as_of: b.as_of,
    month: b.month, team: b.team, effective_budget_usd_micros: b.effective_budget_usd_micros,
    estimated_spend_usd_micros: b.estimated_spend_usd_micros, spend_bound: b.spend_bound, unpriced_requests: b.unpriced_requests };
  snapshot.crossings = observedCrossings(snapshot, cached, now, clockOffset(ctx.home));
  writeJsonAtomic(file, snapshot);
}

/** A confirmed removal also clears sessions outside this pass's rotating attribution batch. */
function clearTeamSnapshots(ctx: Ctx, workspace: string, team: string, month: string): void {
  const dir = path.join(ctx.home, "budgets-cache");
  for (const entry of entries(dir)) {
    if (!entry.isFile() || entry.name === "teams.json" || entry.name === "cursor.json") continue;
    const file = path.join(dir, entry.name), cached = readJson<BudgetSnapshot>(file);
    if (cached?.workspace_id === workspace && cached.month === month && cached.team?.id === team) removeFile(file);
  }
}

export function cacheBudgetRead(ctx: Ctx, workspace: string, team: string, value: unknown, now = Date.now()): void {
  const month = new Date(now).toISOString().slice(0, 7), b = validatedBudget(value, team, month, now, clockOffset(ctx.home));
  if (!b) return;
  const stamp = (value as { budget_stamp?: unknown }).budget_stamp;
  const read: TeamRead = { at: now, budget: b, ...(typeof stamp === "string" || stamp === null ? { stamp } : {}) };
  const file = path.join(ctx.home, "budgets-cache", "teams.json");
  const teams = readJson<Record<string, TeamRead>>(file) ?? {};
  teams[`${workspace}:${team}:${month}`] = read;
  writeJsonAtomic(file, teams);
  if (b.effective_budget_usd_micros === null) clearTeamSnapshots(ctx, workspace, team, month);
  const shared = ctx.db.prepare("SELECT local_id, workspace_id, session_key, binding_epoch FROM shares WHERE state='shared' AND workspace_id=?").all(workspace) as Share[];
  for (const s of shared) {
    const attr = readJson<Attribution>(attributionFile(ctx.home, s.local_id));
    if (attr && attr.workspace_id === workspace && attr.session_key === s.session_key && attr.epoch_id === s.binding_epoch &&
      attr.month === month && attr.team?.id === team && attr.at <= now && now - attr.at < WINDOW_MS) applyFigure(ctx, s, attr, read, now);
  }
}

/** A terminal read has already succeeded. Cache only its team, never wait for sync or refresh credentials. */
export async function cacheTerminalBudget(ctx: Ctx, workspace: string, team: string, value: unknown, cwd: string): Promise<void> {
  const lock = path.join(ctx.home, "sync.lock");
  try { fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 }); } catch { return; }
  try {
    const now = Date.now(), month = new Date(now).toISOString().slice(0, 7), c = loadCredentials(ctx.home);
    const b = validatedBudget(value, team, month, now, clockOffset(ctx.home));
    if (!c || c.signed_out || !boundTo(ctx, c) || !b) return;
    cacheBudgetRead(ctx, workspace, team, value, now);
    if (b.effective_budget_usd_micros === null) return;
    const dir = realDir(cwd);
    const shared = ctx.db.prepare("SELECT h.local_id, h.workspace_id, h.session_key, h.binding_epoch, s.cwd FROM shares h JOIN sessions s ON s.local_id=h.local_id WHERE h.state='shared' AND h.workspace_id=? ORDER BY s.last_active DESC, h.local_id").all(workspace) as (Share & { cwd: string | null })[];
    const s = shared.find((s) => s.cwd && (dir === realDir(s.cwd) || dir.startsWith(realDir(s.cwd) + path.sep)));
    if (!s?.binding_epoch) return;
    const af = attributionFile(ctx.home, s.local_id), attr = readJson<Attribution>(af);
    if (attr && attr.workspace_id === workspace && attr.session_key === s.session_key && attr.epoch_id === s.binding_epoch &&
      attr.month === month && attr.at <= now && now - attr.at < WINDOW_MS) return;
    if (!c.access_token || Date.parse(c.access_expires_at ?? "") <= now) return;
    const r = await rawRequest(c.server_url, "GET", `/api/v2/workspaces/${encodeURIComponent(workspace)}/sessions/${encodeURIComponent(s.session_key)}/budget?attribution=1`,
      { headers: { authorization: `Bearer ${c.access_token}` }, timeoutMs: 1000 });
    if (r.status !== 200 || r.json?.epoch_id !== s.binding_epoch || r.json?.month !== month || r.json?.team?.id !== team) return;
    const current = loadCredentials(ctx.home);
    if (!current || current.signed_out || current.device_id !== c.device_id || !boundTo(ctx, current)) return;
    const confirmed: Attribution = { workspace_id: workspace, session_key: s.session_key, epoch_id: s.binding_epoch, month, at: Date.now(), team: r.json.team };
    writeJsonAtomic(af, confirmed);
    applyFigure(ctx, s, confirmed, { at: now, budget: b }, Date.now());
  } catch { /* Local cache, database or credential failures cannot fail a successful server read. */ }
  finally { removeFile(lock); }
}

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
  const refreshed = new Set<string>();
  const rejected = new Set<string>();
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
      const key = `${s.workspace_id}:${attr.team.id}:${month}`;
      if (rejected.has(key)) continue;
      const stamp = ctx.budgetStamps?.get(key) ?? null;
      if (!refreshed.has(key) && (!teams[key] || ctx.budgetStamps && (teams[key].stamp ?? null) !== stamp)) {
        const r = await read(`/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/teams/${encodeURIComponent(attr.team.id)}/budget?month=${month}`);
        if (!r) { last = shares[shares.indexOf(s) - 1]?.local_id ?? cursor; break; }
        if (r.status !== 200 && r.status !== 404) { if (r.status < 500) removeFile(file); continue; }
        const budget = r.status === 200 ? validatedBudget(r.json, attr.team.id, month, Date.now(), clockOffset(ctx.home)) : null;
        if (r.status === 200 && !budget) { rejected.add(key); continue; }
        teams[key] = { at: now, stamp: typeof r.json?.budget_stamp === "string" ? r.json.budget_stamp : stamp, budget };
        refreshed.add(key);
        if (!teams[key].budget || teams[key].budget.effective_budget_usd_micros === null) clearTeamSnapshots(ctx, s.workspace_id, attr.team.id, month);
      }
      applyFigure(ctx, s, attr, teams[key], Date.now());
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
