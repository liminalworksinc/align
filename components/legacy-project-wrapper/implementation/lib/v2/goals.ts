import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso, sha256hex } from "./ids";
import { canBind, canReadGoal, type GoalObject, type PolicyPrincipal, type Visibility } from "./policy";
import { goalVersionDirective } from "./directives";
import { event } from "./events";
import { limitsIn, limitsOf, type Limit } from "./goal-limits";
import { need } from "./workspaces";
import { personName } from "./retention";
import { releaseHold } from "./requests";
import { optStr, str, type Body } from "./validate";

// Goals and their immutable versions. A goal's current fields live on v2_goals; every version (including the
// first) is also kept in v2_goal_versions with a content hash. Level, team and visibility are fixed at creation.
// A goal's level is company or team (default team): only workspace owners create company goals, which have no team
// and are visible to the whole workspace. Teams are stored as pods: pod_id on the row, visibility "pod" in storage;
// the wire says team, team_id and visibility "team" (no pod aliases on input).
// The goal tree: a goal contributes to the targets of its approved alignments (its parents) and may depend on other
// goals whose output it consumes. A child records which version of each parent its owner last reviewed it against;
// a newer parent version marks the child stale until its owner confirms it or saves a new version.

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

/** Goals this user holds an approved allocation transfer to: an approved work_toward alignment whose current
 *  revision lists one of their sessions. */
export function transferGoals(wsId: string, userId: string): Set<string> {
  return new Set(
    all<{ target_goal_id: string }>(
      `SELECT DISTINCT a.target_goal_id FROM v2_alignments a
       JOIN v2_alignment_revisions r ON r.alignment_id = a.id AND r.revision = a.revision
       JOIN v2_alignment_sessions s ON s.alignment_id = a.id AND s.revision = a.revision
       JOIN v2_sessions x ON x.ws_id = s.ws_id AND x.session_key = s.session_key
       WHERE a.ws_id = ? AND a.state = 'approved' AND r.choice = 'work_toward' AND x.user_id = ?`,
      wsId,
      userId,
    ).map((r) => r.target_goal_id),
  );
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

export function bindableFor(pp: PolicyPrincipal, g: GoalRow, transfers = transferGoals(pp.wsId, pp.userId)): boolean {
  return g.status === "active" && canBind(pp, goalObj(g), transfers.has(g.id));
}

export function serializeGoal(pp: PolicyPrincipal, g: GoalRow, transfers?: Set<string>): Goal {
  const core = goalCore(g);
  const visibleDeps = core.depends_on.filter((id) => {
    const d = goalRow(pp.wsId, id);
    return !!d && canReadGoal(pp, goalObj(d));
  });
  return { ...core, depends_on: visibleDeps, bindable: bindableFor(pp, g, transfers), contributes_to: parentsFor(pp, g) };
}

/** Every goal this caller may see (own private + pod + workspace), oldest first. */
export function visibleGoals(pp: PolicyPrincipal): GoalRow[] {
  return all<GoalRow>("SELECT * FROM v2_goals WHERE ws_id = ? ORDER BY created_at, id", pp.wsId).filter((g) => canReadGoal(pp, goalObj(g)));
}

/** The goals feed: the visible set with `bindable`, and a short version hash for ETag / If-None-Match. */
export function goalsFeed(pp: PolicyPrincipal) {
  const transfers = transferGoals(pp.wsId, pp.userId);
  const goals = visibleGoals(pp).map((g) => serializeGoal(pp, g, transfers));
  const version = sha256hex(JSON.stringify(goals)).slice(0, 16);
  return { version, goals };
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
      const t = s.trim();
      if (t.length > 200) throw badRequest(`anchors.${k} items are too long (max 200 characters)`);
      if (t && !out.includes(t)) out.push(t);
    }
    return out;
  };
  return { repos: list("repos"), branch_patterns: list("branch_patterns"), issues: list("issues") };
}

function dependsIn(pp: PolicyPrincipal, v: unknown, self: string | null, prev: string[] = []): string[] {
  if (v === undefined) return prev;
  if (!Array.isArray(v)) throw badRequest("depends_on must be a list of goal ids");
  if (v.length > 5) throw badRequest("depends_on: at most 5");
  const out: string[] = [];
  for (const id of v) {
    if (typeof id !== "string" || id === self) throw badRequest("depends_on must list other goals");
    const d = goalRow(pp.wsId, id);
    if (!d || !canReadGoal(pp, goalObj(d))) throw notFound();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Would `goalId` depending on `deps` close a loop? Follows every goal's depends_on in the workspace, readable or not. */
function dependencyCycle(wsId: string, goalId: string, deps: string[]): boolean {
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
}

// depends_on and limits join the hash only when non-empty, so the hash of every version written before they existed
// is unchanged.
const contentHash = (c: GoalContent) =>
  sha256hex(
    JSON.stringify({
      title: c.title,
      measures: c.measures,
      anchors: c.anchors,
      status: c.status,
      ...(c.depends_on?.length ? { depends_on: [...c.depends_on].sort() } : {}),
      ...(c.limits?.length ? { limits: c.limits } : {}),
    }),
  );
export const sameContent = (a: GoalContent, b: GoalContent) => contentHash(a) === contentHash(b);

/** A goal's (or one stored version's) content. */
export function contentOf(r: { title: string; measures_json: string; anchors_json: string; status: string; depends_on_json: string; limits_json: string }): GoalContent {
  return {
    title: r.title,
    measures: JSON.parse(r.measures_json),
    anchors: JSON.parse(r.anchors_json),
    status: r.status as GoalStatus,
    depends_on: JSON.parse(r.depends_on_json || "[]"),
    limits: limitsOf(r),
  };
}

/** The content of one stored version of a goal. */
export function versionContentOf(wsId: string, goalId: string, version: number): GoalContent | undefined {
  const r = get<{ title: string; measures_json: string; anchors_json: string; status: string; depends_on_json: string; limits_json: string }>(
    "SELECT title, measures_json, anchors_json, status, depends_on_json, limits_json FROM v2_goal_versions WHERE ws_id = ? AND goal_id = ? AND version = ?",
    wsId,
    goalId,
    version,
  );
  return r ? contentOf(r) : undefined;
}

/** Validate a version body against `prev` (the same rules for a new version and a change request): the fields sent
 *  replace prev's, then 409 cycle when depends_on would loop and 409 no_change when nothing changed. */
export function nextContent(pp: PolicyPrincipal, goalId: string, prev: GoalContent, b: Body): GoalContent {
  const status = (b.status ?? prev.status) as GoalStatus;
  if (!GOAL_STATUSES.includes(status)) throw badRequest("status must be active, achieved or dropped");
  const next: GoalContent = {
    title: b.title === undefined ? prev.title : str(b, "title", 300),
    measures: measuresIn(b.measures, prev.measures),
    anchors: anchorsIn(b.anchors, prev.anchors),
    status,
    depends_on: dependsIn(pp, b.depends_on, goalId, prev.depends_on),
    limits: limitsIn(b.limits, prev.limits),
  };
  assertNoDependencyCycle(pp.wsId, goalId, next.depends_on);
  if (sameContent(next, prev)) throw conflict("no_change", "Nothing changed");
  return next;
}

/** Insert a new goal at version 1 (inside the caller's tx). Used by createGoal and the sample workspace. */
export function insertGoal(
  pp: PolicyPrincipal,
  f: { title: string; level: GoalLevel; podId: string | null; visibility: Visibility; measures: Measure[]; anchors: Anchors; dependsOn: string[]; limits?: Limit[] },
  at: string,
): string {
  const id = newId("g");
  const limits = f.limits ?? [];
  run(
    `INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, level, version, title, measures_json, anchors_json, depends_on_json, limits_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active', ?, ?)`,
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
    at,
    at,
  );
  run(
    "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, status, content_hash, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
    pp.wsId,
    id,
    f.title,
    JSON.stringify(f.measures),
    JSON.stringify(f.anchors),
    JSON.stringify(f.dependsOn),
    JSON.stringify(limits),
    contentHash({ title: f.title, measures: f.measures, anchors: f.anchors, status: "active", depends_on: f.dependsOn, limits }),
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
  if (level === "company" && pp.wsRole !== "owner") throw forbidden("owner_only", "Only a workspace owner can create a company goal");
  const title = str(b, "title", 300);
  const measures = measuresIn(b.measures ?? []);
  const anchors = anchorsIn(b.anchors ?? {});
  const dependsOn = dependsIn(pp, b.depends_on ?? [], null);
  const limits = limitsIn(b.limits ?? [], []);
  const at = nowIso();
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?", pp.wsId)?.n ?? 0;
  if (count >= 1000) throw conflict("too_many_goals", "This workspace has the maximum number of goals");
  const id = await tx(() => {
    const created = insertGoal(pp, { title, level, podId, visibility, measures, anchors, dependsOn, limits }, at);
    // Here, not in insertGoal: the sample workspace's seeded limit is nobody's first.
    if (limits.length) event("first_limit", { ws: pp.wsId, user: pp.userId, at });
    return created;
  });
  return serializeGoal(pp, goalRow(pp.wsId, id)!);
}

/** Write the goal's next version, authored by `actorId` (inside the caller's tx). The one path every new version
 *  takes, whether the owner saves it or an approver approves a change request: version row with its content hash,
 *  audit goal.versioned, review against the parents as they are now, one goal_version directive for every session
 *  bound to or governed by the goal, and, when the goal becomes achieved or dropped, every open change request on
 *  it is superseded and a hold on it is released. 409 stale_version if the goal moved since `g` was read. */
export function writeGoalVersion(g: GoalRow, c: GoalContent, actorId: string, at: string): GoalRow {
  if (c.depends_on.length) assertNoDependencyCycle(g.ws_id, g.id, c.depends_on); // again, inside the transaction
  const v = g.version + 1;
  const n = run(
    "UPDATE v2_goals SET version = ?, title = ?, measures_json = ?, anchors_json = ?, depends_on_json = ?, limits_json = ?, status = ?, updated_at = ? WHERE ws_id = ? AND id = ? AND version = ?",
    v,
    c.title,
    JSON.stringify(c.measures),
    JSON.stringify(c.anchors),
    JSON.stringify(c.depends_on),
    JSON.stringify(c.limits),
    c.status,
    at,
    g.ws_id,
    g.id,
    g.version,
  );
  if (!n) throw conflict("stale_version", "This goal changed meanwhile; reload and try again");
  run(
    "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, status, content_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    g.ws_id,
    g.id,
    v,
    c.title,
    JSON.stringify(c.measures),
    JSON.stringify(c.anchors),
    JSON.stringify(c.depends_on),
    JSON.stringify(c.limits),
    c.status,
    contentHash(c),
    actorId,
    at,
  );
  audit(g.ws_id, actorId, "goal.versioned", g.id, at);
  // The workspace's first version that carries a limit, whether its owner saved it or an approver approved it.
  if (c.limits.length) event("first_limit", { ws: g.ws_id, user: actorId, at });
  reviewParents(g.ws_id, g.id, at); // saving a version is a review against the parents as they are now
  const next = goalRow(g.ws_id, g.id)!;
  goalVersionDirective(g.ws_id, next);
  if (c.status === "achieved" || c.status === "dropped") {
    supersedeOpenRequests(g.ws_id, g.id, actorId, at);
    releaseHold(g.ws_id, g.id, actorId, at); // a goal that is done holds no agents
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

/** A new immutable version from the goal's owner (title, measures, anchors, depends_on, limits and/or status). */
export async function newGoalVersion(pp: PolicyPrincipal, goalId: string, b: Body): Promise<Goal> {
  const g = goalRow(pp.wsId, goalId);
  if (!g) throw notFound();
  need(pp, "goal.edit", goalObj(g));
  if (b.version !== undefined && b.version !== g.version) throw conflict("stale_version", `This goal is at version ${g.version}; reload and try again`);
  const next = nextContent(pp, g.id, contentOf(g), b);
  await tx(() => writeGoalVersion(g, next, pp.userId, nowIso()));
  return serializeGoal(pp, goalRow(pp.wsId, goalId)!);
}

export function goalDetail(pp: PolicyPrincipal, goalId: string) {
  const g = visibleGoal(pp, goalId);
  const versions = all<{ version: number; title: string; status: string; content_hash: string; created_at: string; created_by: string }>(
    "SELECT version, title, status, content_hash, created_at, created_by FROM v2_goal_versions WHERE goal_id = ? ORDER BY version DESC",
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
    versions: versions.map((v) => ({ ...v, created_by: undefined })),
    contributions,
    can_edit: g.owner_id === pp.userId && pp.wsRole !== "viewer",
  };
}
