import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso, sha256hex } from "./ids";
import { canBind, canReadGoal, type GoalObject, type PolicyPrincipal, type Visibility } from "./policy";
import { goalVersionDirective } from "./directives";
import { event } from "./events";
import { limitsIn, limitsOf, type Limit } from "./goal-limits";
import { memberName, need } from "./workspaces";
import { effectiveSet } from "./approval";
import { personName } from "./retention";
import { expireOpenRequests, releaseHold } from "./requests";
import { endAlignmentsToClosedGoal } from "./alignments";
import { feedAllocation } from "./allocation";
import { workspaceSteering } from "./steering";
import { supersedeReallocations } from "./reallocations";
import { cleanName, optStr, str, type Body } from "./validate";
import { isBlankText } from "./text-core.mts";
import { DEPENDS_ON_MAX } from "./change-words.mts";

// Goals and their immutable versions. A goal's current fields live on v2_goals; every version (including the
// first) is also kept in v2_goal_versions with a content hash. Level, team and visibility are fixed at creation.
// A goal's level is company or team (default team): only workspace owners create company goals, which have no team
// and are visible to the whole workspace. Teams are stored as pods: pod_id on the row, visibility "pod" in storage;
// the wire says team, team_id and visibility "team" (no pod aliases on input).
// The goal tree: a goal contributes to the targets of its approved alignments (its parents) and may depend on other
// goals whose output it consumes. A child records which version of each parent its owner last reviewed it against;
// a newer parent version marks the child stale until its owner confirms it or saves a new version.
// A goal's target share (PORT29) is the share of the workspace's agent time it should get: versioned content like the
// rest, so it reaches agents only in a saved or launched version. Active goals' targets, every visibility counted, add
// up to 100 or less (writeGoalVersion refuses more; the refusal names only sums).

export type GoalStatus = "active" | "achieved" | "dropped";
export type GoalLevel = "company" | "team";
export const GOAL_LEVELS: readonly GoalLevel[] = ["company", "team"];
/** Visibility as people and agents see it ("team" is stored as "pod"). */
export type WireVisibility = "private" | "team" | "workspace";
export const WIRE_VISIBILITIES: readonly WireVisibility[] = ["private", "team", "workspace"];
export const toWireVisibility = (v: Visibility): WireVisibility => (v === "pod" ? "team" : v);
const fromWireVisibility = (v: WireVisibility): Visibility => (v === "team" ? "pod" : v);
export const GOAL_STATUSES: readonly GoalStatus[] = ["active", "achieved", "dropped"];

export interface Measure {
  id: string;
  text: string;
  target: string | null;
}
export interface Anchors {
  repos: string[];
  branch_patterns: string[];
  issues: string[];
}

export interface GoalRow {
  id: string;
  ws_id: string;
  owner_id: string;
  pod_id: string | null;
  visibility: Visibility;
  version: number;
  title: string;
  measures_json: string;
  anchors_json: string;
  depends_on_json: string;
  /** The goal's limits (lib/v2/goal-limits.ts), a JSON list; '[]' when it has none. */
  limits_json: string;
  status: GoalStatus;
  level: GoalLevel;
  /** Share of the workspace's agent time (fresh tokens) this goal should get, 0 to 100, or null. */
  target_share: number | null;
  created_at: string;
  updated_at: string;
}

/** The wire Goal (docs/v2/WIRE.md), without `bindable`. */
export interface GoalCore {
  id: string;
  version: number;
  title: string;
  measures: Measure[];
  status: GoalStatus;
  level: GoalLevel;
  visibility: WireVisibility;
  owner: { id: string; name: string };
  team: { id: string; name: string } | null;
  anchors: Anchors;
  /** Goals whose output this goal consumes. */
  depends_on: string[];
  /** What work toward this goal must do, must not do, or leaves out of scope (lib/v2/goal-limits.ts), at most 5. */
  limits: Limit[];
  /** Share of the workspace's agent time this goal should get (0 to 100), or null for no target. */
  target_share: number | null;
}
/** A goal this one contributes to, and whether this goal was reviewed against its current version. */
export interface ParentRef {
  id: string;
  title: string;
  version: number;
  reviewed_version: number | null;
  stale: boolean;
}
export type Goal = GoalCore & { bindable: boolean; contributes_to: ParentRef[] };

export const goalObj = (g: GoalRow): GoalObject => ({ kind: "goal", ownerId: g.owner_id, visibility: g.visibility, podId: g.pod_id });

export function goalRow(wsId: string, goalId: string): GoalRow | undefined {
  return get<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ? AND id = ?", wsId, goalId);
}

/** The goal if this caller may see it, else 404 (a goal in another workspace is simply not found). */
export function visibleGoal(pp: PolicyPrincipal, goalId: string): GoalRow {
  const g = goalRow(pp.wsId, goalId);
  if (!g) throw notFound();
  need(pp, "goal.read", goalObj(g));
  return g;
}

export function goalCore(g: GoalRow): GoalCore {
  const owner = get<{ name: string }>("SELECT name FROM ba_user WHERE id = ?", g.owner_id);
  const pod = g.pod_id ? get<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE id = ?", g.pod_id) : undefined;
  return {
    id: g.id,
    version: g.version,
    title: g.title,
    measures: JSON.parse(g.measures_json),
    status: g.status,
    level: g.level ?? "team",
    visibility: toWireVisibility(g.visibility),
    owner: { id: g.owner_id, name: personName(g.owner_id, owner?.name) },
    team: pod ? { id: pod.id, name: pod.name } : null,
    anchors: JSON.parse(g.anchors_json),
    depends_on: JSON.parse(g.depends_on_json || "[]"),
    limits: limitsOf(g),
    target_share: g.target_share ?? null,
  };
}

/** Ids of the goals this goal contributes to: targets of its approved alignments. */
export function parentIds(wsId: string, goalId: string): string[] {
  return all<{ target_goal_id: string }>(
    "SELECT DISTINCT target_goal_id FROM v2_alignments WHERE ws_id = ? AND source_goal_id = ? AND state = 'approved' ORDER BY target_goal_id",
    wsId,
    goalId,
  ).map((r) => r.target_goal_id);
}

/** Record that this goal's owner reviewed it against its parents' current versions (or one parent's). */
export function reviewParents(wsId: string, goalId: string, at: string, only?: string) {
  for (const pid of only ? [only] : parentIds(wsId, goalId)) {
    const parent = goalRow(wsId, pid);
    if (!parent) continue;
    run(
      `INSERT INTO v2_goal_acks (ws_id, goal_id, parent_id, parent_version, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (goal_id, parent_id) DO UPDATE SET parent_version = excluded.parent_version, at = excluded.at`,
      wsId,
      goalId,
      pid,
      parent.version,
      at,
    );
  }
}

function parentsFor(pp: PolicyPrincipal, g: GoalRow): ParentRef[] {
  const out: ParentRef[] = [];
  for (const pid of parentIds(pp.wsId, g.id)) {
    const parent = goalRow(pp.wsId, pid);
    if (!parent || !canReadGoal(pp, goalObj(parent))) continue;
    const ack = get<{ parent_version: number }>("SELECT parent_version FROM v2_goal_acks WHERE goal_id = ? AND parent_id = ?", g.id, pid);
    const reviewed = ack?.parent_version ?? null;
    out.push({ id: parent.id, title: parent.title, version: parent.version, reviewed_version: reviewed, stale: reviewed === null || reviewed < parent.version });
  }
  return out;
}

/** The goal's owner confirms it still fits a parent's current version. */
export async function confirmParent(pp: PolicyPrincipal, goalId: string, parentId: string) {
  const g = goalRow(pp.wsId, goalId);
  if (!g) throw notFound();
  need(pp, "goal.edit", goalObj(g));
  if (!parentIds(pp.wsId, goalId).includes(parentId)) throw notFound();
  const at = nowIso();
  await tx(() => {
    reviewParents(pp.wsId, goalId, at, parentId);
    audit(pp.wsId, pp.userId, "goal.parent_reviewed", goalId, at);
  });
  return serializeGoal(pp, goalRow(pp.wsId, goalId)!);
}

/** The approved alignment that transfers this session's allocation to this goal, if any. */
export function transferFor(wsId: string, sessionKey: string, goalId: string): string | null {
  return (
    get<{ id: string }>(
      `SELECT a.id FROM v2_alignments a
       JOIN v2_alignment_revisions r ON r.alignment_id = a.id AND r.revision = a.revision
       JOIN v2_alignment_sessions s ON s.alignment_id = a.id AND s.revision = a.revision
       WHERE a.ws_id = ? AND a.state = 'approved' AND r.choice = 'work_toward' AND a.target_goal_id = ? AND s.session_key = ?
       ORDER BY a.updated_at DESC LIMIT 1`,
      wsId,
      goalId,
      sessionKey,
    )?.id ?? null
  );
}

/** General binding choices only. An alignment authorizes its specific sessions, not this person globally. */
export function bindableFor(pp: PolicyPrincipal, g: GoalRow): boolean {
  return g.status === "active" && canBind(pp, goalObj(g), false);
}

export function serializeGoal(pp: PolicyPrincipal, g: GoalRow): Goal {
  const core = goalCore(g);
  const visibleDeps = core.depends_on.filter((id) => {
    const d = goalRow(pp.wsId, id);
    return !!d && canReadGoal(pp, goalObj(d));
  });
  return { ...core, depends_on: visibleDeps, bindable: bindableFor(pp, g), contributes_to: parentsFor(pp, g) };
}

/** Every goal this caller may see (own private + pod + workspace), oldest first. */
export function visibleGoals(pp: PolicyPrincipal): GoalRow[] {
  return all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ? ORDER BY created_at, id", pp.wsId).filter((g) => canReadGoal(pp, goalObj(g)));
}

/** The goals feed: the visible set with `bindable` and each active goal's trailing-7-day allocation (whole percents,
 *  lib/v2/allocation.ts), the workspace's steering switch, and a short version hash of both for ETag / If-None-Match.
 *  Shares are whole percents, so usage moves the hash only when a share moves a full point. */
export function goalsFeed(pp: PolicyPrincipal) {
  const shares = feedAllocation(pp);
  const goals = visibleGoals(pp).map((g) => ({ ...serializeGoal(pp, g), allocation: shares.get(g.id) ?? null }));
  const steering = workspaceSteering(pp.wsId);
  const version = sha256hex(JSON.stringify({ goals, steering })).slice(0, 16);
  return { version, goals, steering };
}

// ---- input ----

function measuresIn(v: unknown, prev: Measure[] = []): Measure[] {
  if (v === undefined) return prev;
  if (!Array.isArray(v)) throw badRequest("measures must be a list");
  if (v.length > 10) throw badRequest("measures: at most 10");
  const out: Measure[] = [];
  for (const m of v) {
    if (!m || typeof m !== "object" || Array.isArray(m)) throw badRequest("each measure must be an object with text");
    const b = m as Body;
    const text = str(b, "text", 300);
    const target = optStr(b, "target", 100);
    const keep = typeof b.id === "string" && prev.some((p) => p.id === b.id) && !out.some((o) => o.id === b.id);
    out.push({ id: keep ? (b.id as string) : newId("m"), text, target });
  }
  return out;
}

function anchorsIn(v: unknown, prev: Anchors = { repos: [], branch_patterns: [], issues: [] }): Anchors {
  if (v === undefined) return prev;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest("anchors must be an object");
  const b = v as Body;
  const list = (k: keyof Anchors) => {
    const x = b[k];
    if (x === undefined) return prev[k];
    if (!Array.isArray(x)) throw badRequest(`anchors.${k} must be a list`);
    if (x.length > 20) throw badRequest(`anchors.${k}: at most 20`);
    const out: string[] = [];
    for (const s of x) {
      if (typeof s !== "string") throw badRequest(`anchors.${k} must be a list of strings`);
      // One line each, cleaned as a name is (control and invisible characters: E2E-WEB cycle 14 C14-1); an item with
      // nothing a person can read left is dropped, as an empty one is.
      const t = cleanName(s).trim();
      if (t.length > 200) throw badRequest(`anchors.${k} items are too long (max 200 characters)`);
      if (!isBlankText(t) && !out.includes(t)) out.push(t);
    }
    return out;
  };
  return { repos: list("repos"), branch_patterns: list("branch_patterns"), issues: list("issues") };
}

/** The ids in `ids` naming goals this caller can't read (they exist; the caller is never shown them). */
export function unreadableGoals(pp: PolicyPrincipal, ids: string[]): string[] {
  return ids.filter((id) => {
    const d = goalRow(pp.wsId, id);
    return !!d && !canReadGoal(pp, goalObj(d));
  });
}

/** More dependencies than a goal may have, in words a person can act on, never the field's name (E2E-WEB cycle 13 W4):
 *  the forms stop at the limit before this, so only an API client or a list changed meanwhile reaches it. `kept` counts
 *  the goals the sender can't see, which stay on the list and count too. */
function tooManyDependencies(kept: number): string {
  const also = kept ? `, and ${kept === 1 ? "1 goal you can't see stays" : `${kept} goals you can't see stay`} on its list` : "";
  return `A goal can depend on at most ${DEPENDS_ON_MAX} other goals${also}; choose fewer.`;
}

/** A depends_on list from a body. Every goal sent must be one the caller can read (404 otherwise). The dependencies in
 *  `keepFrom` (by default `prev`) the caller can't read are kept: they never saw them, so a list without them is not a
 *  request to drop them (a goal form only lists what its reader can see). A counter keeps them from the request it
 *  counters, not the goal (C2 N2). At most 5 in all. */
function dependsIn(pp: PolicyPrincipal, v: unknown, self: string | null, prev: string[] = [], keepFrom: string[] = prev): string[] {
  if (v === undefined) return prev;
  if (!Array.isArray(v)) throw badRequest("depends_on must be a list of goal ids");
  if (v.length > DEPENDS_ON_MAX) throw badRequest(tooManyDependencies(0), "too_many_dependencies");
  const out: string[] = [];
  for (const id of v) {
    if (typeof id !== "string" || id === self) throw badRequest("depends_on must list other goals");
    const d = goalRow(pp.wsId, id);
    if (!d || !canReadGoal(pp, goalObj(d))) throw notFound();
    if (!out.includes(id)) out.push(id);
  }
  const kept = unreadableGoals(pp, keepFrom).filter((id) => !out.includes(id));
  if (out.length + kept.length > DEPENDS_ON_MAX) throw badRequest(tooManyDependencies(kept.length), "too_many_dependencies");
  return [...out, ...kept];
}

/** Would `goalId` depending on `deps` close a loop? Follows every goal's depends_on in the workspace, readable or not. */
export function dependencyCycle(wsId: string, goalId: string, deps: string[]): boolean {
  const edges = new Map(all<{ id: string; depends_on_json: string }>("SELECT id, depends_on_json FROM v2_goals WHERE ws_id = ?", wsId).map((r) => [r.id, JSON.parse(r.depends_on_json || "[]") as string[]]));
  edges.set(goalId, deps);
  const seen = new Set<string>();
  const stack = [...deps];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === goalId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(edges.get(id) ?? []));
  }
  return false;
}

/** The goals that already depend on `goalId`, directly or through others (every goal's depends_on, readable or not):
 *  adding any of them as a dependency of `goalId` would close a loop (C3-3). */
export function goalsDependingOn(wsId: string, goalId: string): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const r of all<{ id: string; depends_on_json: string }>("SELECT id, depends_on_json FROM v2_goals WHERE ws_id = ?", wsId))
    for (const dep of JSON.parse(r.depends_on_json || "[]") as string[]) dependents.set(dep, [...(dependents.get(dep) ?? []), r.id]);
  const out = new Set<string>();
  const stack = [...(dependents.get(goalId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id) || id === goalId) continue;
    out.add(id);
    stack.push(...(dependents.get(id) ?? []));
  }
  return out;
}

export const DEPENDENCY_CYCLE = "That would make these goals depend on each other in a loop.";

/** 409 cycle when these dependencies would make the goal depend on itself. Exported for change requests. */
export function assertNoDependencyCycle(wsId: string, goalId: string, deps: string[]) {
  if (dependencyCycle(wsId, goalId, deps)) throw conflict("cycle", DEPENDENCY_CYCLE);
}

/** The versioned content of a goal: what a new version, or a change request, can change (anchors only by its owner). */
export interface GoalContent {
  title: string;
  measures: Measure[];
  anchors: Anchors;
  status: GoalStatus;
  depends_on: string[];
  limits: Limit[];
  /** 0 to 100, or null: no target. */
  target_share: number | null;
}

// depends_on and limits join the hash only when non-empty, and target_share only when set, so the hash of every
// version written before they existed is unchanged.
const contentHash = (c: GoalContent) =>
  sha256hex(
    JSON.stringify({
      title: c.title,
      measures: c.measures,
      anchors: c.anchors,
      status: c.status,
      ...(c.depends_on?.length ? { depends_on: [...c.depends_on].sort() } : {}),
      ...(c.limits?.length ? { limits: c.limits } : {}),
      ...(c.target_share !== null && c.target_share !== undefined ? { target_share: c.target_share } : {}),
    }),
  );
export const sameContent = (a: GoalContent, b: GoalContent) => contentHash(a) === contentHash(b);

/** A goal's (or one stored version's) content. */
export function contentOf(r: { title: string; measures_json: string; anchors_json: string; status: string; depends_on_json: string; limits_json: string; target_share?: number | null }): GoalContent {
  return {
    title: r.title,
    measures: JSON.parse(r.measures_json),
    anchors: JSON.parse(r.anchors_json),
    status: r.status as GoalStatus,
    depends_on: JSON.parse(r.depends_on_json || "[]"),
    limits: limitsOf(r),
    target_share: r.target_share ?? null,
  };
}

/** The content of one stored version of a goal. */
export function versionContentOf(wsId: string, goalId: string, version: number): GoalContent | undefined {
  const r = get<{ title: string; measures_json: string; anchors_json: string; status: string; depends_on_json: string; limits_json: string; target_share: number | null }>(
    "SELECT title, measures_json, anchors_json, status, depends_on_json, limits_json, target_share FROM v2_goal_versions WHERE ws_id = ? AND goal_id = ? AND version = ?",
    wsId,
    goalId,
    version,
  );
  return r ? contentOf(r) : undefined;
}

/** Validate a version body against `prev` (the same rules for a new version and a change request): the fields sent
 *  replace prev's, then 409 cycle when depends_on would loop and 409 no_change when nothing changed. A depends_on sent
 *  keeps the dependencies in `keepDepsFrom` (by default prev's) that the caller can't read. `loopOk` skips the cycle
 *  check, for a change request rebased with its own changes (C6-2): it adds nothing, and is never approved while it loops. */
export function nextContent(pp: PolicyPrincipal, goalId: string, prev: GoalContent, b: Body, keepDepsFrom: string[] = prev.depends_on, loopOk = false): GoalContent {
  const status = (b.status ?? prev.status) as GoalStatus;
  if (!GOAL_STATUSES.includes(status)) throw badRequest("status must be active, achieved or dropped");
  const next: GoalContent = {
    title: b.title === undefined ? prev.title : str(b, "title", 300),
    measures: measuresIn(b.measures, prev.measures),
    anchors: anchorsIn(b.anchors, prev.anchors),
    status,
    depends_on: dependsIn(pp, b.depends_on, goalId, prev.depends_on, keepDepsFrom),
    limits: limitsIn(b.limits, prev.limits),
    target_share: targetIn(b.target_share, prev.target_share),
  };
  if (!loopOk) assertNoDependencyCycle(pp.wsId, goalId, next.depends_on);
  if (sameContent(next, prev)) throw conflict("no_change", "Nothing changed, so no new version was saved.");
  return next;
}

/** A target share from a body: undefined keeps `prev`, null clears it, else a whole percent from 0 to 100 (400). */
export function targetIn(v: unknown, prev: number | null = null): number | null {
  if (v === undefined) return prev;
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) throw badRequest("target_share must be a whole percent from 0 to 100, or null");
  return v;
}

/** 409 targets_over_100 when the workspace's active goals' targets, with `next` replacing some goals' targets (each of
 *  them active), would add up to more than 100. Every visibility counts; the message names only the sums. */
export function assertTargetsFit(wsId: string, next: ReadonlyMap<string, number | null>) {
  let others = 0;
  for (const r of all<{ id: string; target_share: number }>("SELECT id, target_share FROM v2_goals WHERE ws_id = ? AND status = 'active' AND target_share IS NOT NULL", wsId)) {
    if (!next.has(r.id)) others += r.target_share;
  }
  const total = others + [...next.values()].reduce<number>((a, t) => a + (t ?? 0), 0);
  if (total > 100) throw conflict("targets_over_100", `Targets of active goals would add up to ${total}%; keep them at 100% or less (other goals already take ${others}%).`);
}

/** Insert a new goal at version 1 (inside the caller's tx). Used by createGoal and the sample workspace. */
export function insertGoal(
  pp: PolicyPrincipal,
  f: { title: string; level: GoalLevel; podId: string | null; visibility: Visibility; measures: Measure[]; anchors: Anchors; dependsOn: string[]; limits?: Limit[]; targetShare?: number | null },
  at: string,
): string {
  const id = newId("g");
  const limits = f.limits ?? [];
  const target = f.targetShare ?? null;
  if (target !== null) assertTargetsFit(pp.wsId, new Map([[id, target]]));
  run(
    `INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, level, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    id,
    pp.wsId,
    pp.userId,
    f.podId,
    f.visibility,
    f.level,
    f.title,
    JSON.stringify(f.measures),
    JSON.stringify(f.anchors),
    JSON.stringify(f.dependsOn),
    JSON.stringify(limits),
    target,
    at,
    at,
  );
  run(
    "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, content_hash, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
    pp.wsId,
    id,
    f.title,
    JSON.stringify(f.measures),
    JSON.stringify(f.anchors),
    JSON.stringify(f.dependsOn),
    JSON.stringify(limits),
    target,
    contentHash({ title: f.title, measures: f.measures, anchors: f.anchors, status: "active", depends_on: f.dependsOn, limits, target_share: target }),
    pp.userId,
    at,
  );
  audit(pp.wsId, pp.userId, "goal.created", id, at);
  return id;
}

export async function createGoal(pp: PolicyPrincipal, b: Body): Promise<Goal> {
  const level = (b.level ?? "team") as GoalLevel;
  if (!GOAL_LEVELS.includes(level)) throw badRequest("level must be company or team");
  const wire = (b.visibility ?? "workspace") as WireVisibility;
  if (!WIRE_VISIBILITIES.includes(wire)) throw badRequest("visibility must be private, team or workspace");
  const visibility = fromWireVisibility(wire);
  const podId = optStr(b, "team_id", 64);
  if (level === "company") {
    if (podId) throw badRequest("A company goal has no team");
    if (visibility !== "workspace") throw badRequest("A company goal is visible to the whole workspace");
  }
  if (podId && !get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, podId)) throw notFound();
  if (visibility === "pod" && !podId) throw badRequest("A team goal needs a team");
  need(pp, "goal.create", { kind: "goal_draft", podId });
  if (level === "company" && pp.wsRole !== "owner") throw forbidden("owner_only", "Only a workspace owner can create a company goal.");
  const title = str(b, "title", 300);
  const measures = measuresIn(b.measures ?? []);
  const anchors = anchorsIn(b.anchors ?? {});
  const dependsOn = dependsIn(pp, b.depends_on ?? [], null);
  const limits = limitsIn(b.limits ?? [], []);
  const targetShare = targetIn(b.target_share);
  const at = nowIso();
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?", pp.wsId)?.n ?? 0;
  if (count >= 1000) throw conflict("too_many_goals", "This workspace has the maximum number of goals.");
  const id = await tx(() => {
    // Recheck capacity after acquiring the writer lock, including queued creates.
    const currentCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?", pp.wsId)?.n ?? 0;
    if (currentCount >= 1000) throw conflict("too_many_goals", "This workspace has the maximum number of goals.");
    const created = insertGoal(pp, { title, level, podId, visibility, measures, anchors, dependsOn, limits, targetShare }, at);
    // Here, not in insertGoal: the sample workspace's seeded limit is nobody's first.
    if (limits.length) event("first_limit", { ws: pp.wsId, user: pp.userId, at });
    return created;
  });
  return serializeGoal(pp, goalRow(pp.wsId, id)!);
}

/** Write the goal's next version (inside the caller's tx), by `actorId` and authored by `authorId` (the actor, unless
 *  a launch publishes what an approver confirmed). The one path every new version takes, whether the owner saves it
 *  or someone launches an approved change request: version row with its content hash, audit goal.versioned by the
 *  actor, review against the parents as they are now, one goal_version directive for every session bound to or
 *  governed by the goal, every other approved change request still waiting for launch is superseded before launch,
 *  and, when the goal becomes achieved or dropped, every open change request on it is superseded, the requests to its
 *  agents (and switch_goal requests toward it) still waiting for an answer expire, a hold on it is released, and every
 *  approved work_toward alignment toward it ends its sessions' binding (lib/v2/alignments.ts).
 *  Every open or approved-unlaunched reallocation that names the goal is superseded (lib/v2/reallocations.ts). An
 *  active goal whose target is set or raised, or that becomes active with one, must keep the workspace's targets at
 *  100 or less (409 targets_over_100). 409 stale_version if the goal moved since `g` was read. */
export function writeGoalVersion(g: GoalRow, content: GoalContent, actorId: string, at: string, authorId = actorId): GoalRow {
  // Content approved before targets existed (a change request's approved_json) carries none: no target.
  const c: GoalContent = { ...content, target_share: content.target_share ?? null };
  if (c.depends_on.length) assertNoDependencyCycle(g.ws_id, g.id, c.depends_on); // again, inside the transaction
  const prevTarget = g.target_share ?? null;
  if (c.status === "active" && c.target_share !== null && (g.status !== "active" || prevTarget === null || c.target_share > prevTarget)) {
    assertTargetsFit(g.ws_id, new Map([[g.id, c.target_share]]));
  }
  const v = g.version + 1;
  const n = run(
    "UPDATE v2_goals SET version = ?, title = ?, measures_json = ?, anchors_json = ?, depends_on_json = ?, limits_json = ?, target_share = ?, status = ?, updated_at = ? WHERE ws_id = ? AND id = ? AND version = ?",
    v,
    c.title,
    JSON.stringify(c.measures),
    JSON.stringify(c.anchors),
    JSON.stringify(c.depends_on),
    JSON.stringify(c.limits),
    c.target_share,
    c.status,
    at,
    g.ws_id,
    g.id,
    g.version,
  );
  if (!n) throw conflict("stale_version", "This goal changed while you were editing. Reload to start from its latest version.");
  run(
    "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, content_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    g.ws_id,
    g.id,
    v,
    c.title,
    JSON.stringify(c.measures),
    JSON.stringify(c.anchors),
    JSON.stringify(c.depends_on),
    JSON.stringify(c.limits),
    c.target_share,
    c.status,
    contentHash(c),
    authorId,
    at,
  );
  audit(g.ws_id, actorId, "goal.versioned", g.id, at);
  // The workspace's first version that carries a limit, whether its owner saved it or a launch published it.
  if (c.limits.length) event("first_limit", { ws: g.ws_id, user: authorId, at });
  reviewParents(g.ws_id, g.id, at); // saving a version is a review against the parents as they are now
  const next = goalRow(g.ws_id, g.id)!;
  goalVersionDirective(g.ws_id, next);
  supersedeUnlaunched(g.ws_id, g.id, actorId, at); // the goal outran them: they never reach agents
  supersedeReallocations(g.ws_id, g.id, actorId, at); // likewise for target changes that name it
  if (c.status === "achieved" || c.status === "dropped") {
    supersedeOpenRequests(g.ws_id, g.id, actorId, at);
    expireOpenRequests(g.ws_id, g.id, actorId, at); // nobody can act on a request toward a goal that is done
    releaseHold(g.ws_id, g.id, actorId, at); // a goal that is done holds no agents
    endAlignmentsToClosedGoal(g.ws_id, g.id, actorId, at); // and governs no session through an alignment
  }
  return next;
}

/** A goal that is achieved or dropped takes no more change requests: every pending or countered one on it is
 *  superseded (lib/v2/changes.ts reads the result), audited with the person whose action changed the status. */
function supersedeOpenRequests(wsId: string, goalId: string, actorId: string, at: string) {
  const open = all<{ id: string }>("SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND state IN ('pending','countered')", wsId, goalId);
  for (const r of open) {
    run("UPDATE v2_change_requests SET state = 'superseded', updated_at = ? WHERE id = ?", at, r.id);
    audit(wsId, actorId, "change_request.superseded", r.id, at);
  }
}

/** Approved change requests on this goal still waiting for launch (launch pending or not yet) are superseded before
 *  launch when the goal gets a newer version (LAUNCH-001): the approval stays on the record, nothing reaches agents, and
 *  the requester can propose again. A request being launched is marked launched before its version is written. */
function supersedeUnlaunched(wsId: string, goalId: string, actorId: string, at: string) {
  const waiting = all<{ id: string }>("SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND state = 'approved' AND launch IN ('pending','not_yet')", wsId, goalId);
  for (const r of waiting) {
    run("UPDATE v2_change_requests SET state = 'superseded', launch = 'superseded', updated_at = ? WHERE id = ?", at, r.id);
    audit(wsId, actorId, "change_request.superseded", r.id, at);
  }
}

/** A new immutable version from the goal's owner (title, measures, anchors, depends_on, limits and/or status). */
export async function newGoalVersion(pp: PolicyPrincipal, goalId: string, b: Body): Promise<Goal> {
  const g = goalRow(pp.wsId, goalId);
  if (!g) throw notFound();
  need(pp, "goal.edit", goalObj(g));
  if (b.version !== undefined && b.version !== g.version) throw conflict("stale_version", `This goal changed while you were editing. Reload to start from version ${g.version}.`);
  const next = nextContent(pp, g.id, contentOf(g), b);
  await tx(() => writeGoalVersion(g, next, pp.userId, nowIso()));
  return serializeGoal(pp, goalRow(pp.wsId, goalId)!);
}

export function goalDetail(pp: PolicyPrincipal, goalId: string) {
  const g = visibleGoal(pp, goalId);
  const versions = all<{ version: number; title: string; status: string; target_share: number | null; content_hash: string; created_at: string; created_by: string }>(
    "SELECT version, title, status, target_share, content_hash, created_at, created_by FROM v2_goal_versions WHERE goal_id = ? ORDER BY version DESC",
    g.id,
  );
  // Goals recorded as contributing to this one (approved contribution effects whose source the caller may see).
  const contributions = all<{ source_goal_id: string | null; alignment_id: string }>(
    "SELECT source_goal_id, id AS alignment_id FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved'",
    pp.wsId,
    g.id,
  )
    .map((c) => {
      const s = c.source_goal_id ? goalRow(pp.wsId, c.source_goal_id) : undefined;
      return s && canReadGoal(pp, goalObj(s)) ? { goal: { id: s.id, title: s.title } } : { goal: null };
    })
    .filter((c) => c.goal);
  return {
    goal: serializeGoal(pp, g),
    /** How many of the goal's dependencies the reader can't see (never which): a new version keeps them. */
    hidden_depends_on: unreadableGoals(pp, JSON.parse(g.depends_on_json || "[]") as string[]).length,
    versions: versions.map((v) => ({ ...v, created_by: undefined })),
    contributions,
    can_edit: g.owner_id === pp.userId && pp.wsRole !== "viewer",
    /** Whether the reader may propose a change (lib/v2/changes.ts's rule: not the owner, not a viewer, an active goal),
     *  so the page shows Propose a change from the server's answer instead of working it out (the checklist's §A). */
    can_propose: g.owner_id !== pp.userId && pp.wsRole !== "viewer" && g.status === "active",
    /** Who would decide a change request from the reader on this goal, as it stands now: the server's own effective
     *  set (approval set, requester rule, workspace-owner fallback; lib/v2/approval.ts), so the propose drawer names the
     *  people and never works them out itself. Empty when the reader can't propose, and when nobody is eligible yet. */
    deciders: g.owner_id !== pp.userId && pp.wsRole !== "viewer" && g.status === "active" ? effectiveSet(g, pp.userId).map((id) => ({ id, name: memberName(id) })) : [],
  };
}
