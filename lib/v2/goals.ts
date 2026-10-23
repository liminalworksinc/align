import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { newId, nowIso, sha256hex } from "./ids";
import { canBind, canReadGoal, VISIBILITIES, type GoalObject, type PolicyPrincipal, type Visibility } from "./policy";
import { goalVersionDirective } from "./directives";
import { need } from "./workspaces";
import { optStr, str, type Body } from "./validate";

// Goals and their immutable versions. A goal's current fields live on v2_goals; every version (including the
// first) is also kept in v2_goal_versions with a content hash. Visibility and pod are fixed at creation.

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
  status: GoalStatus;
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
}
export type Goal = GoalCore & { bindable: boolean };

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
  };
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
  return { ...goalCore(g), bindable: bindableFor(pp, g, transfers) };
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

const contentHash = (c: { title: string; measures: Measure[]; anchors: Anchors; status: GoalStatus }) =>
  sha256hex(JSON.stringify({ title: c.title, measures: c.measures, anchors: c.anchors, status: c.status }));

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
  const at = nowIso();
  const id = newId("g");
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?", pp.wsId)?.n ?? 0;
  if (count >= 1000) throw conflict("too_many_goals", "This workspace has the maximum number of goals");
  await tx(() => {
    run(
      `INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'active', ?, ?)`,
      id,
      pp.wsId,
      pp.userId,
      podId,
      visibility,
      title,
      JSON.stringify(measures),
      JSON.stringify(anchors),
      at,
      at,
    );
    run(
      "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, status, content_hash, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, 'active', ?, ?, ?)",
      pp.wsId,
      id,
      title,
      JSON.stringify(measures),
      JSON.stringify(anchors),
      contentHash({ title, measures, anchors, status: "active" }),
      pp.userId,
      at,
    );
    audit(pp.wsId, pp.userId, "goal.created", id, at);
  });
  return serializeGoal(pp, goalRow(pp.wsId, id)!);
}

/** A new immutable version (title, measures, anchors and/or status). Its goal_version directive rows are written
 *  in the same transaction, for every session bound to or governed by this goal. */
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
  const hash = contentHash({ title, measures, anchors, status });
  if (hash === contentHash({ title: g.title, measures: JSON.parse(g.measures_json), anchors: JSON.parse(g.anchors_json), status: g.status })) {
    throw conflict("no_change", "Nothing changed");
  }
  const at = nowIso();
  const v = g.version + 1;
  await tx(() => {
    const n = run(
      "UPDATE v2_goals SET version = ?, title = ?, measures_json = ?, anchors_json = ?, status = ?, updated_at = ? WHERE ws_id = ? AND id = ? AND version = ?",
      v,
      title,
      JSON.stringify(measures),
      JSON.stringify(anchors),
      status,
      at,
      pp.wsId,
      goalId,
      g.version,
    );
    if (!n) throw conflict("stale_version", "This goal changed meanwhile; reload and try again");
    run(
      "INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, status, content_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      pp.wsId,
      goalId,
      v,
      title,
      JSON.stringify(measures),
      JSON.stringify(anchors),
      status,
      hash,
      pp.userId,
      at,
    );
    audit(pp.wsId, pp.userId, "goal.versioned", goalId, at);
    goalVersionDirective(pp.wsId, goalRow(pp.wsId, goalId)!);
  });
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
