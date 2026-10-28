import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { newId, nowIso, sha256hex } from "./ids";
import { canBind, canReadGoal, VISIBILITIES, type GoalObject, type PolicyPrincipal, type Visibility } from "./policy";
import { goalVersionDirective } from "./directives";
import { feedShares } from "./allocation";
import { workspaceSteering } from "./steering";
import { need } from "./workspaces";
import { optStr, str, type Body } from "./validate";

// Goals and their immutable versions. A goal's current fields live on v2_goals; every version (including the
// first) is also kept in v2_goal_versions with a content hash. Visibility and pod are fixed at creation.
// The goal tree: a goal contributes to the targets of its approved alignments (its parents) and may depend on other
// goals whose output it consumes. A child records which version of each parent its owner last reviewed it against;
// a newer parent version marks the child stale until its owner confirms it or saves a new version.

export type GoalStatus = "active" | "achieved" | "dropped";
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
  status: GoalStatus;
  /** Share of the workspace's agent time (fresh tokens) this goal should get, 0 to 100, set by its owner. */
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
  visibility: Visibility;
  owner: { id: string; name: string };
  pod: { id: string; name: string } | null;
  anchors: Anchors;
  /** Goals whose output this goal consumes. */
  depends_on: string[];
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
    visibility: g.visibility,
    owner: { id: g.owner_id, name: owner?.name ?? "" },
    pod: pod ? { id: pod.id, name: pod.name } : null,
    anchors: JSON.parse(g.anchors_json),
    depends_on: JSON.parse(g.depends_on_json || "[]"),
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

/** The goals feed: the visible set with `bindable` and each goal's trailing-7-day allocation, the workspace's steering
 *  setting, and a short version hash for ETag / If-None-Match. Shares are whole percents, so the hash changes only when
 *  a share moves a full point. */
export function goalsFeed(pp: PolicyPrincipal) {
  const transfers = transferGoals(pp.wsId, pp.userId);
  const shares = feedShares(pp);
  const goals = visibleGoals(pp).map((g) => ({ ...serializeGoal(pp, g, transfers), allocation: shares.get(g.id) ?? null }));
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

// Fields added later (depends_on, target_share) join the hash only when set, so earlier versions keep their hashes.
const contentHash = (c: { title: string; measures: Measure[]; anchors: Anchors; status: GoalStatus; depends_on?: string[]; target_share?: number | null }) =>
  sha256hex(
    JSON.stringify({
      title: c.title,
      measures: c.measures,
      anchors: c.anchors,
      status: c.status,
      ...(c.depends_on?.length ? { depends_on: [...c.depends_on].sort() } : {}),
      ...(c.target_share !== undefined && c.target_share !== null ? { target_share: c.target_share } : {}),
    }),
  );

/** A target share: undefined keeps `prev`, null clears it, else a whole percent from 0 to 100. */
function targetIn(v: unknown, prev: number | null = null): number | null {
  if (v === undefined) return prev;
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) throw badRequest("target_share must be a whole percent from 0 to 100, or null");
  return v;
}

/** Sum of the targets of the workspace's active goals, every visibility, optionally leaving some goals out. */
export function targetSum(wsId: string, except: readonly string[] = []): number {
  return all<{ id: string; target_share: number | null }>("SELECT id, target_share FROM v2_goals WHERE ws_id = ? AND status = 'active' AND target_share IS NOT NULL", wsId)
    .filter((g) => !except.includes(g.id))
    .reduce((a, g) => a + (g.target_share ?? 0), 0);
}

/** Refuse a change that would put the workspace's active targets over 100. The message names only the sum. */
export function assertTargetsFit(wsId: string, changes: ReadonlyMap<string, { target: number | null; active: boolean }>) {
  const others = targetSum(wsId, [...changes.keys()]);
  const added = [...changes.values()].reduce((a, c) => a + (c.active && c.target !== null ? c.target : 0), 0);
  if (others + added > 100) throw conflict("targets_over_100", `Targets of active goals would add up to ${others + added}%; keep them at 100% or less (other goals already take ${others}%)`);
}

export async function createGoal(pp: PolicyPrincipal, b: Body): Promise<Goal> {
  const visibility = (b.visibility ?? "workspace") as Visibility;
  if (!VISIBILITIES.includes(visibility)) throw badRequest("visibility must be private, pod or workspace");
  const podId = optStr(b, "pod_id", 64);
  if (podId && !get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, podId)) throw notFound();
  if (visibility === "pod" && !podId) throw badRequest("A pod goal needs a pod");
  need(pp, "goal.create", { kind: "goal_draft", podId });
  const title = str(b, "title", 300);
  const measures = measuresIn(b.measures ?? []);
  const anchors = anchorsIn(b.anchors ?? {});
  const dependsOn = dependsIn(pp, b.depends_on ?? [], null);
  const target = targetIn(b.target_share);
  const at = nowIso();
  const id = newId("g");
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?", pp.wsId)?.n ?? 0;
  if (count >= 1000) throw conflict("too_many_goals", "This workspace has the maximum number of goals");
  await tx(() => {
    if (target !== null) assertTargetsFit(pp.wsId, new Map([[id, { target, active: true }]]));
    run(
      `INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, version, title, measures_json, anchors_json, depends_on_json, status, target_share, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      id,
      pp.wsId,
      pp.userId,
      podId,
      visibility,
      title,
      JSON.stringify(measures),
      JSON.stringify(anchors),
      JSON.stringify(dependsOn),
      target,
      at,
      at,
    );
    run(
      "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, status, target_share, content_hash, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, 'active', ?, ?, ?, ?)",
      pp.wsId,
      id,
      title,
      JSON.stringify(measures),
      JSON.stringify(anchors),
      JSON.stringify(dependsOn),
      target,
      contentHash({ title, measures, anchors, status: "active", depends_on: dependsOn, target_share: target }),
      pp.userId,
      at,
    );
    audit(pp.wsId, pp.userId, "goal.created", id, at);
  });
  return serializeGoal(pp, goalRow(pp.wsId, id)!);
}

/** A new immutable version (title, measures, anchors, status and/or target share). Its goal_version directive rows
 *  are written in the same transaction, for every session bound to or governed by this goal. */
export async function newGoalVersion(pp: PolicyPrincipal, goalId: string, b: Body): Promise<Goal> {
  const g = goalRow(pp.wsId, goalId);
  if (!g) throw notFound();
  need(pp, "goal.edit", goalObj(g));
  if (b.version !== undefined && b.version !== g.version) throw conflict("stale_version", `This goal is at version ${g.version}; reload and try again`);
  const title = b.title === undefined ? g.title : str(b, "title", 300);
  const measures = measuresIn(b.measures, JSON.parse(g.measures_json));
  const anchors = anchorsIn(b.anchors, JSON.parse(g.anchors_json));
  const status = (b.status ?? g.status) as GoalStatus;
  if (!GOAL_STATUSES.includes(status)) throw badRequest("status must be active, achieved or dropped");
  const prevDeps: string[] = JSON.parse(g.depends_on_json || "[]");
  const dependsOn = dependsIn(pp, b.depends_on, g.id, prevDeps);
  const target = targetIn(b.target_share, g.target_share ?? null);
  const at = nowIso();
  await tx(() => {
    if (target !== null && status === "active") assertTargetsFit(pp.wsId, new Map([[goalId, { target, active: true }]]));
    writeVersion(pp.wsId, g, { title, measures, anchors, status, depends_on: dependsOn, target_share: target }, pp.userId, at);
  });
  return serializeGoal(pp, goalRow(pp.wsId, goalId)!);
}

interface VersionFields {
  title: string;
  measures: Measure[];
  anchors: Anchors;
  status: GoalStatus;
  depends_on: string[];
  target_share: number | null;
}

/** Write the next version of `g` (inside a tx): refuses no-op and stale writes, audits, marks the owner's review of
 *  its parents, and writes the goal_version directive. Used by goal edits and by approved reallocations. */
export function writeVersion(wsId: string, g: GoalRow, f: VersionFields, actorId: string, at: string): void {
  const prev = { title: g.title, measures: JSON.parse(g.measures_json), anchors: JSON.parse(g.anchors_json), status: g.status, depends_on: JSON.parse(g.depends_on_json || "[]"), target_share: g.target_share ?? null };
  const hash = contentHash(f);
  if (hash === contentHash(prev)) throw conflict("no_change", "Nothing changed");
  const v = g.version + 1;
  const n = run(
    "UPDATE v2_goals SET version = ?, title = ?, measures_json = ?, anchors_json = ?, depends_on_json = ?, status = ?, target_share = ?, updated_at = ? WHERE ws_id = ? AND id = ? AND version = ?",
    v,
    f.title,
    JSON.stringify(f.measures),
    JSON.stringify(f.anchors),
    JSON.stringify(f.depends_on),
    f.status,
    f.target_share,
    at,
    wsId,
    g.id,
    g.version,
  );
  if (!n) throw conflict("stale_version", "This goal changed meanwhile; reload and try again");
  run(
    "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, status, target_share, content_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    wsId,
    g.id,
    v,
    f.title,
    JSON.stringify(f.measures),
    JSON.stringify(f.anchors),
    JSON.stringify(f.depends_on),
    f.status,
    f.target_share,
    hash,
    actorId,
    at,
  );
  audit(wsId, actorId, "goal.versioned", g.id, at);
  reviewParents(wsId, g.id, at); // saving a version is a review against the parents as they are now
  goalVersionDirective(wsId, goalRow(wsId, g.id)!);
}

/** The fields of `g` as they are, for a version that changes only some of them. */
export function versionFieldsOf(g: GoalRow): VersionFields {
  return { title: g.title, measures: JSON.parse(g.measures_json), anchors: JSON.parse(g.anchors_json), status: g.status, depends_on: JSON.parse(g.depends_on_json || "[]"), target_share: g.target_share ?? null };
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
    versions: versions.map((v) => ({ ...v, created_by: undefined })),
    contributions,
    can_edit: g.owner_id === pp.userId && pp.wsRole !== "viewer",
  };
}
