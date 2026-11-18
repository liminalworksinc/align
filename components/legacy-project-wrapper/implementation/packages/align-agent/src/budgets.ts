import type { Ctx } from "./context.ts";
import { boundTo, clockOffset, loadCredentials, NetworkError, rawRequest } from "./api.ts";
import fs from "node:fs";
import { layout } from "./shared/layout.ts";
import { readJson, removeFile, writeJsonAtomic } from "./shared/fsx.ts";
import { budgetMonths, validBudgetFigure, observedCrossings, type BudgetSnapshot } from "./shared/budget-notes.ts";
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

/** Fixed terminal copy. Server messages may contain field names or arbitrary text. */
export function budgetFailure(status: number, code?: string): string {
  const messages: Record<string, string> = {
    bad_request: "Check the requested amount, reason and selected sessions, then try again.",
    budget_missing: "This team has no budget this month.",
    too_many_waiting_requests: "You already have five budget requests waiting for this team this month. Wait for a decision or withdraw one in Align.",
    not_in_team: "You must belong to this team to request more budget.",
    read_only: "Viewers cannot file budget requests.",
    rate_limited: "Too many budget requests were recorded in the last hour. Try again later.",
    not_found: "This team or request is unavailable to you.",
  };
  return messages[code ?? ""] ?? (status === 401 ? "Sign in to Align again, then try this command." : status === 403 ? "This action is unavailable to you. Check your access in Align." : "The budget request could not be completed. Try again later.");
}
export const budgetMonthLabel = (month: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));
export const budgetReadLabel = (at: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(at));

export function requestAmount(value: string | undefined): number {
  const n = value === undefined || !/^\d+(?:\.\d{1,2})?$/.test(value) ? NaN : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new Error("--amount must be a positive USD amount in whole cents, at most 1,000,000.");
  return n;
}

/** Budget reads use the current access token only: no refresh, retry or lock wait under the sync lock. */
export const BUDGET_READS_MAX = 120, BUDGET_PASS_MS = 2_000;
const WINDOW_MS = 5 * 60_000, REFUSAL_MS = 30_000;
type ObservedBudget = Pick<BudgetSnapshot, "team" | "month" | "as_of" | "effective_budget_usd_micros" | "estimated_spend_usd_micros" | "spend_bound" | "clock_offset_ms">;
type Share = { local_id: string; workspace_id: string; session_key: string; binding_epoch: string | null };
type Attribution = { workspace_id: string; session_key: string; epoch_id: string | null; month: string; at: number; team: BudgetSnapshot["team"] | null; refused?: boolean };
type TeamRead = { at: number; stamp?: string | null; budget: ObservedBudget | null; refused?: boolean };
const teamFields = (team: BudgetSnapshot["team"]) => ({ id: team.id, name: team.name });
function budgetFields(b: ObservedBudget, offset = b.clock_offset_ms ?? 0): ObservedBudget {
  return { team: teamFields(b.team), month: b.month, as_of: b.as_of, clock_offset_ms: offset,
    effective_budget_usd_micros: b.effective_budget_usd_micros, estimated_spend_usd_micros: b.estimated_spend_usd_micros,
    spend_bound: b.spend_bound };
}
const teamReads = (home: string) => Object.fromEntries(Object.entries(readJson<Record<string, TeamRead>>(path.join(home, "budgets-cache", "teams.json")) ?? {})
  .map(([key, value]) => [key, { at: value.at, ...(value.stamp !== undefined ? { stamp: value.stamp } : {}), budget: value.budget ? budgetFields(value.budget) : null, ...(value.refused ? { refused: true } : {}) }]));
function entries(dir: string): fs.Dirent[] { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }
const attributionFile = (home: string, lid: string) => path.join(home, "budget-attribution", `${lid}.json`);

/** Unknown additive fields are ignored. An absent field preserves older-server behavior. */
export function receiveBudgetStamps(ctx: Ctx, value: unknown): void {
  if (!Array.isArray(value)) { ctx.budgetStamps = undefined; return; }
  const months = budgetMonths(Date.now(), clockOffset(ctx.home));
  ctx.budgetStamps = new Map(value.flatMap((v) => v && typeof v.ws === "string" && /^ws_[A-Za-z0-9_-]+$/.test(v.ws) &&
    typeof v.team === "string" && /^pod_[A-Za-z0-9_-]+$/.test(v.team) && months.includes(v.month) && typeof v.stamp === "string" && /^[a-f0-9]{64}$/.test(v.stamp) ?
    [[`${v.ws}:${v.team}:${v.month}`, v.stamp] as [string, string]] : []));
}

/** Both terminal reads and sync accept only current, correctly attributed, allowlisted figures. */
function validatedBudget(value: unknown, team: string, month: string, now: number, offset: number): ObservedBudget | null {
  if (!value || typeof value !== "object") return null;
  const b = value as ObservedBudget;
  const numberOrNull = (n: unknown) => n === null || typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (b.team?.id !== team || typeof b.team.name !== "string" || b.month !== month ||
    !validBudgetFigure({ ...b, clock_offset_ms: offset }, now) ||
    !numberOrNull(b.effective_budget_usd_micros) || !numberOrNull(b.estimated_spend_usd_micros) ||
    !["exact", "lower", "unknown"].includes(b.spend_bound)) return null;
  return budgetFields(b, offset);
}
function applyFigure(ctx: Ctx, s: Share, attr: Attribution, read: TeamRead, now: number): void {
  const file = layout.budgetCache(ctx.home, s.local_id), b = read.budget;
  const live = ctx.db.prepare("SELECT state, workspace_id, session_key, binding_epoch FROM shares WHERE local_id=?").get(s.local_id) as Share & { state: string } | undefined;
  if (!live || live.state !== "shared" || live.workspace_id !== s.workspace_id || live.session_key !== s.session_key ||
    live.binding_epoch !== s.binding_epoch || !s.binding_epoch || !boundTo(ctx, loadCredentials(ctx.home))) { removeFile(file); return; }
  if (!b || b.effective_budget_usd_micros === null) { removeFile(file); return; }
  const cached = readJson<BudgetSnapshot>(file);
  const snapshot: BudgetSnapshot = { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch,
    fetched_at: new Date(read.at).toISOString(), attribution_at: new Date(attr.at).toISOString(), as_of: b.as_of, clock_offset_ms: b.clock_offset_ms ?? 0,
    month: b.month, team: b.team, effective_budget_usd_micros: b.effective_budget_usd_micros,
    estimated_spend_usd_micros: b.estimated_spend_usd_micros, spend_bound: b.spend_bound };
  snapshot.crossings = observedCrossings(snapshot, cached?.effective_budget_usd_micros === snapshot.effective_budget_usd_micros ? cached : null, now);
  writeJsonAtomic(file, snapshot);
}

/** Accepted amounts invalidate older figures, including sessions outside the rotating attribution batch. */
function clearTeamSnapshots(ctx: Ctx, workspace: string, team: string, month: string, effective: number | null = null): void {
  const dir = path.join(ctx.home, "budgets-cache");
  for (const entry of entries(dir)) {
    if (!entry.isFile() || entry.name === "teams.json" || entry.name === "cursor.json") continue;
    const file = path.join(dir, entry.name), cached = readJson<BudgetSnapshot>(file);
    if (cached?.workspace_id === workspace && cached.month === month && cached.team?.id === team &&
      (effective === null || cached.effective_budget_usd_micros !== effective)) removeFile(file);
  }
}

export function cacheBudgetRead(ctx: Ctx, workspace: string, team: string, value: unknown, now = Date.now()): void {
  if (value === null) { cacheTeamBudget(ctx, workspace, team, null, now); return; }
  const month = new Date(now + clockOffset(ctx.home)).toISOString().slice(0, 7), b = validatedBudget(value, team, month, now, clockOffset(ctx.home));
  if (!b) return;
  const stamp = (value as { budget_stamp?: unknown }).budget_stamp;
  const read: TeamRead = { at: now, budget: b, ...(typeof stamp === "string" || stamp === null ? { stamp } : {}) };
  const file = path.join(ctx.home, "budgets-cache", "teams.json");
  const teams = teamReads(ctx.home);
  teams[`${workspace}:${team}:${month}`] = read;
  writeJsonAtomic(file, teams);
  clearTeamSnapshots(ctx, workspace, team, month, b.effective_budget_usd_micros);
  const shared = ctx.db.prepare("SELECT local_id, workspace_id, session_key, binding_epoch FROM shares WHERE state='shared' AND workspace_id=?").all(workspace) as Share[];
  for (const s of shared) {
    const attr = readJson<Attribution>(attributionFile(ctx.home, s.local_id));
    if (attr && attr.workspace_id === workspace && attr.session_key === s.session_key && attr.epoch_id === s.binding_epoch &&
      attr.month === month && !attr.refused && attr.team?.id === team && attr.at <= now && now - attr.at < WINDOW_MS) applyFigure(ctx, s, attr, read, now);
  }
}

/** A terminal read has already succeeded. Cache only its team, never wait for sync or refresh credentials. */
export async function cacheTerminalBudget(ctx: Ctx, workspace: string, team: string, value: unknown, cwd: string): Promise<void> {
  const lock = path.join(ctx.home, "sync.lock");
  try { fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 }); } catch { return; }
  try {
    const now = Date.now(), month = new Date(now + clockOffset(ctx.home)).toISOString().slice(0, 7), c = loadCredentials(ctx.home);
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
    const confirmed: Attribution = { workspace_id: workspace, session_key: s.session_key, epoch_id: s.binding_epoch, month, at: Date.now(), team: teamFields(r.json.team) };
    writeJsonAtomic(af, confirmed);
    applyFigure(ctx, s, confirmed, { at: now, budget: b }, Date.now());
  } catch { /* Local cache, database or credential failures cannot fail a successful server read. */ }
  finally { removeFile(lock); }
}

/** Explicit confirmed removal; the terminal uses the guarded successful-read path. */
export function cacheTeamBudget(ctx: Ctx, workspace: string, team: string, response: ObservedBudget | null, now = Date.now()): void {
  if (response) { cacheBudgetRead(ctx, workspace, team, response, now); return; }
  const month = new Date(now + clockOffset(ctx.home)).toISOString().slice(0, 7);
  const file = path.join(ctx.home, "budgets-cache", "teams.json"), teams = teamReads(ctx.home);
  teams[`${workspace}:${team}:${month}`] = { at: now, budget: null };
  writeJsonAtomic(file, teams);
  clearTeamSnapshots(ctx, workspace, team, month);
}

export async function refreshSessionBudgets(ctx: Ctx, clock: () => number = Date.now): Promise<void> {
  const now = clock(), deadline = now + BUDGET_PASS_MS, month = new Date(now + clockOffset(ctx.home)).toISOString().slice(0, 7);
  const fresh = (at: number, refused = false) => Number.isFinite(at) && at <= now && now - at < (refused ? REFUSAL_MS : WINDOW_MS);
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
    try {
      for (const marker of fs.readdirSync(path.join(markerRoot, dir.name))) {
        if (!budgetMonths(now, clockOffset(ctx.home)).some((m) => marker.startsWith(m + "-"))) removeFile(path.join(markerRoot, dir.name, marker));
      }
      if (!fs.readdirSync(path.join(markerRoot, dir.name)).length) fs.rmdirSync(path.join(markerRoot, dir.name));
    } catch { /* each directory is best effort, including concurrent creation */ }
  }
  const cursorFile = path.join(ctx.home, "budgets-cache", "cursor.json");
  if (!shared.length) { removeFile(cursorFile); removeFile(path.join(ctx.home, "budgets-cache", "teams.json")); return; }
  const cursor = readJson<{ local_id: string }>(cursorFile)?.local_id ?? "";
  let start = shared.findIndex((s) => s.local_id > cursor);
  if (start < 0) start = 0;
  const shares = [...shared.slice(start), ...shared.slice(0, start)].slice(0, 100);
  const teamsFile = path.join(ctx.home, "budgets-cache", "teams.json");
  const teams = Object.fromEntries(Object.entries(teamReads(ctx.home)).filter(([k, v]) => k.endsWith(`:${month}`) && fresh(v.at, v.refused)));
  let reads = 0, last: string | null = null;
  const refreshed = new Set<string>(), rejected = new Set<string>();
  const read = async (route: string) => {
    const remaining = deadline - clock(), c = loadCredentials(ctx.home);
    if (remaining <= 0 || reads >= BUDGET_READS_MAX || !c || c.signed_out || !c.access_token || Date.parse(c.access_expires_at ?? "") <= clock() || !boundTo(ctx, c)) return undefined;
    reads++;
    return rawRequest(c.server_url, "GET", route, { headers: { authorization: `Bearer ${c.access_token}` }, timeoutMs: Math.max(1, Math.min(1000, remaining)) });
  };
  for (const s of shares) {
    if (reads >= BUDGET_READS_MAX || clock() >= deadline) break;
    last = s.local_id;
    const file = layout.budgetCache(ctx.home, s.local_id), af = attributionFile(ctx.home, s.local_id);
    try {
      let attr = readJson<Attribution>(af);
      if (!attr || attr.workspace_id !== s.workspace_id || attr.session_key !== s.session_key || attr.epoch_id !== s.binding_epoch || attr.month !== month || !fresh(attr.at, attr.refused)) {
        const r = await read(`/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/sessions/${encodeURIComponent(s.session_key)}/budget?attribution=1`);
        if (!r) break;
        if (r.status === 200 && r.jsonParsed === false) continue;
        if (r.status === 200 && r.json && (r.json.month !== month || r.json.epoch_id !== s.binding_epoch)) continue;
        const b = r.status === 200 && r.json?.epoch_id === s.binding_epoch && r.json?.month === month ? r.json : null;
        if (r.status !== 200 && r.status !== 404) {
          writeJsonAtomic(af, { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch, month, at: now, team: attr?.team ? teamFields(attr.team) : null, refused: true });
          continue;
        }
        attr = { workspace_id: s.workspace_id, session_key: s.session_key, epoch_id: s.binding_epoch, month, at: now, team: b?.team ? teamFields(b.team) : null };
        writeJsonAtomic(af, attr);
      }
      if (attr.refused) continue;
      if (!attr.team) { removeFile(file); continue; }
      const key = `${s.workspace_id}:${attr.team.id}:${month}`;
      if (rejected.has(key) || teams[key]?.refused) continue;
      const stamp = ctx.budgetStamps?.get(key) ?? null;
      if (!refreshed.has(key) && (!teams[key] || ctx.budgetStamps && (teams[key].stamp ?? null) !== stamp)) {
        const r = await read(`/api/v2/workspaces/${encodeURIComponent(s.workspace_id)}/teams/${encodeURIComponent(attr.team.id)}/budget?month=${month}`);
        if (!r) { last = shares[shares.indexOf(s) - 1]?.local_id ?? cursor; break; }
        if (r.status === 200 && r.jsonParsed === false) { rejected.add(key); continue; }
        if (r.status !== 200 && r.status !== 404) { teams[key] = { at: now, budget: null, refused: true }; continue; }
        const budget = r.status === 200 && r.json !== null ? validatedBudget(r.json, attr.team.id, month, clock(), clockOffset(ctx.home)) : null;
        if (r.status === 200 && r.json !== null && !budget) { rejected.add(key); continue; }
        teams[key] = { at: now, stamp: typeof r.json?.budget_stamp === "string" ? r.json.budget_stamp : stamp, budget };
        refreshed.add(key);
        clearTeamSnapshots(ctx, s.workspace_id, attr.team.id, month, budget?.effective_budget_usd_micros ?? null);
      }
      if (teams[key].refused) continue;
      applyFigure(ctx, s, attr, teams[key], clock());
    } catch (e) { if (!(e instanceof NetworkError)) ctx.log("budget: refresh failed; keeping the previous observation"); }
  }
  const current = loadCredentials(ctx.home);
  if (!current || current.signed_out || !boundTo(ctx, current)) {
    for (const dir of ["budgets-cache", "budget-attribution"]) fs.rmSync(path.join(ctx.home, dir), { recursive: true, force: true });
    return;
  }
  writeJsonAtomic(teamsFile, teams);
  if (last) writeJsonAtomic(cursorFile, { local_id: last });
}
