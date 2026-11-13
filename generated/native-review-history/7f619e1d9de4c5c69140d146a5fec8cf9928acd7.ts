// Caller-owned goal types and explicit resource bindings.
import { all, audit, get, run, tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso, sha256hex } from "./ids";
import { canBind, canReadGoal, type GoalObject, type PolicyPrincipal, type Visibility } from "./policy";
import { goalVersionDirective } from "./directives";
import { event } from "./events";
import { limitsIn, limitsOf, type Limit } from "./goal-limits";
import { need } from "./workspaces";
import { personName } from "./retention";
import { expireOpenRequests, releaseHold } from "./requests";
import { endAlignmentsToClosedGoal } from "./alignments";
import { feedAllocation } from "./allocation";
import { workspaceSteering } from "./steering";
import { supersedeReallocations } from "./reallocations";
import { cleanName, optStr, str, type Body } from "./validate";
import { isBlankText } from "./text-core.mts";
import { DEPENDS_ON_MAX } from "./change-words.mts";
import { create_goals } from "../native/.bindings/server_goals.js";
import type { FeedAllocation } from "./allocation";
import type { Steering } from "./steering";

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

/** Visibility as people and agents see it ("team" is stored as "pod"). */
export type WireVisibility = "private" | "team" | "workspace";

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
    owner: {
        id: string;
        name: string;
    };
    team: {
        id: string;
        name: string;
    } | null;
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

export type Goal = GoalCore & {
    bindable: boolean;
    contributes_to: ParentRef[];
};

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

interface GoalRuntime {
  GOAL_LEVELS: readonly GoalLevel[];
  WIRE_VISIBILITIES: readonly WireVisibility[];
  toWireVisibility: (v: Visibility) => WireVisibility;
  GOAL_STATUSES: readonly GoalStatus[];
  goalObj: (g: GoalRow) => GoalObject;
  goalRow: (wsId: string, goalId: string) => GoalRow | undefined;
  visibleGoal: (pp: PolicyPrincipal, goalId: string) => GoalRow;
  goalCore: (g: GoalRow) => GoalCore;
  parentIds: (wsId: string, goalId: string) => string[];
  reviewParents: (wsId: string, goalId: string, at: string, only?: string) => void;
  confirmParent: (pp: PolicyPrincipal, goalId: string, parentId: string) => Promise<Goal>;
  transferGoals: (wsId: string, userId: string) => Set<string>;
  transferFor: (wsId: string, sessionKey: string, goalId: string) => string | null;
  bindableFor: (pp: PolicyPrincipal, g: GoalRow, transfers?: Set<string>) => boolean;
  serializeGoal: (pp: PolicyPrincipal, g: GoalRow, transfers?: Set<string>) => Goal;
  visibleGoals: (pp: PolicyPrincipal) => GoalRow[];
  goalsFeed: (pp: PolicyPrincipal) => { version: string; goals: { allocation: FeedAllocation | null; id: string; version: number; title: string; measures: Measure[]; status: GoalStatus; level: GoalLevel; visibility: WireVisibility; owner: { id: string; name: string; }; team: { id: string; name: string; } | null; anchors: Anchors; depends_on: string[]; limits: Limit[]; target_share: number | null; bindable: boolean; contributes_to: ParentRef[]; }[]; steering: Steering; };
  unreadableGoals: (pp: PolicyPrincipal, ids: string[]) => string[];
  dependencyCycle: (wsId: string, goalId: string, deps: string[]) => boolean;
  goalsDependingOn: (wsId: string, goalId: string) => Set<string>;
  DEPENDENCY_CYCLE: "That would make these goals depend on each other in a loop.";
  assertNoDependencyCycle: (wsId: string, goalId: string, deps: string[]) => void;
  sameContent: (a: GoalContent, b: GoalContent) => boolean;
  contentOf: (r: { title: string; measures_json: string; anchors_json: string; status: string; depends_on_json: string; limits_json: string; target_share?: number | null; }) => GoalContent;
  versionContentOf: (wsId: string, goalId: string, version: number) => GoalContent | undefined;
  nextContent: (pp: PolicyPrincipal, goalId: string, prev: GoalContent, b: Body, keepDepsFrom?: string[], loopOk?: boolean) => GoalContent;
  targetIn: (v: unknown, prev?: number | null) => number | null;
  assertTargetsFit: (wsId: string, next: ReadonlyMap<string, number | null>) => void;
  insertGoal: (pp: PolicyPrincipal, f: { title: string; level: GoalLevel; podId: string | null; visibility: Visibility; measures: Measure[]; anchors: Anchors; dependsOn: string[]; limits?: Limit[]; targetShare?: number | null; }, at: string) => string;
  createGoal: (pp: PolicyPrincipal, b: Body) => Promise<Goal>;
  writeGoalVersion: (g: GoalRow, content: GoalContent, actorId: string, at: string, authorId?: string) => GoalRow;
  newGoalVersion: (pp: PolicyPrincipal, goalId: string, b: Body) => Promise<Goal>;
  goalDetail: (pp: PolicyPrincipal, goalId: string) => { goal: Goal; hidden_depends_on: number; versions: { created_by: undefined; version: number; title: string; status: string; target_share: number | null; content_hash: string; created_at: string; }[]; contributions: ({ goal: { id: string; title: string; }; } | { goal: null; })[]; can_edit: boolean; can_propose: boolean; };
}
const goalService = create_goals({
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  forbidden: (...args: Parameters<typeof forbidden>) => forbidden(...args),
  notFound: (...args: Parameters<typeof notFound>) => notFound(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  sha256hex: (...args: Parameters<typeof sha256hex>) => sha256hex(...args),
  canBind: (...args: Parameters<typeof canBind>) => canBind(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  goalVersionDirective: (...args: Parameters<typeof goalVersionDirective>) => goalVersionDirective(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  limitsIn: (...args: Parameters<typeof limitsIn>) => limitsIn(...args),
  limitsOf: (...args: Parameters<typeof limitsOf>) => limitsOf(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
  personName: (...args: Parameters<typeof personName>) => personName(...args),
  expireOpenRequests: (...args: Parameters<typeof expireOpenRequests>) => expireOpenRequests(...args),
  releaseHold: (...args: Parameters<typeof releaseHold>) => releaseHold(...args),
  endAlignmentsToClosedGoal: (...args: Parameters<typeof endAlignmentsToClosedGoal>) => endAlignmentsToClosedGoal(...args),
  feedAllocation: (...args: Parameters<typeof feedAllocation>) => feedAllocation(...args),
  workspaceSteering: (...args: Parameters<typeof workspaceSteering>) => workspaceSteering(...args),
  supersedeReallocations: (...args: Parameters<typeof supersedeReallocations>) => supersedeReallocations(...args),
  cleanName: (...args: Parameters<typeof cleanName>) => cleanName(...args),
  optStr: (...args: Parameters<typeof optStr>) => optStr(...args),
  str: (...args: Parameters<typeof str>) => str(...args),
  isBlankText: (...args: Parameters<typeof isBlankText>) => isBlankText(...args),
  DEPENDS_ON_MAX,
}) as unknown as GoalRuntime;

export const GOAL_LEVELS = goalService.GOAL_LEVELS;
export const WIRE_VISIBILITIES = goalService.WIRE_VISIBILITIES;
export const toWireVisibility = (v: Visibility): WireVisibility => (0, goalService.toWireVisibility)(v);
export const GOAL_STATUSES = goalService.GOAL_STATUSES;
export const goalObj = (g: GoalRow): GoalObject => (0, goalService.goalObj)(g);
export function goalRow(wsId: string, goalId: string): GoalRow | undefined {
    return (0, goalService.goalRow)(wsId, goalId);
}
/** The goal if this caller may see it, else 404 (a goal in another workspace is simply not found). */
export function visibleGoal(pp: PolicyPrincipal, goalId: string): GoalRow {
    return (0, goalService.visibleGoal)(pp, goalId);
}
export function goalCore(g: GoalRow): GoalCore {
    return (0, goalService.goalCore)(g);
}
/** Ids of the goals this goal contributes to: targets of its approved alignments. */
export function parentIds(wsId: string, goalId: string): string[] {
    return (0, goalService.parentIds)(wsId, goalId);
}
/** Record that this goal's owner reviewed it against its parents' current versions (or one parent's). */
export function reviewParents(wsId: string, goalId: string, at: string, only?: string): void {
    return (0, goalService.reviewParents)(wsId, goalId, at, only);
}
/** The goal's owner confirms it still fits a parent's current version. */
export async function confirmParent(pp: PolicyPrincipal, goalId: string, parentId: string): Promise<Goal> {
    return (0, goalService.confirmParent)(pp, goalId, parentId);
}
/** Goals this user holds an approved allocation transfer to: an approved work_toward alignment whose current
 *  revision lists one of their sessions. */
export function transferGoals(wsId: string, userId: string): Set<string> {
    return (0, goalService.transferGoals)(wsId, userId);
}
/** The approved alignment that transfers this session's allocation to this goal, if any. */
export function transferFor(wsId: string, sessionKey: string, goalId: string): string | null {
    return (0, goalService.transferFor)(wsId, sessionKey, goalId);
}
export function bindableFor(pp: PolicyPrincipal, g: GoalRow, transfers = transferGoals(pp.wsId, pp.userId)): boolean {
    return (0, goalService.bindableFor)(pp, g, transfers);
}
export function serializeGoal(pp: PolicyPrincipal, g: GoalRow, transfers?: Set<string>): Goal {
    return (0, goalService.serializeGoal)(pp, g, transfers);
}
/** Every goal this caller may see (own private + pod + workspace), oldest first. */
export function visibleGoals(pp: PolicyPrincipal): GoalRow[] {
    return (0, goalService.visibleGoals)(pp);
}
/** The goals feed: the visible set with `bindable` and each active goal's trailing-7-day allocation (whole percents,
 *  lib/v2/allocation.ts), the workspace's steering switch, and a short version hash of both for ETag / If-None-Match.
 *  Shares are whole percents, so usage moves the hash only when a share moves a full point. */
export function goalsFeed(pp: PolicyPrincipal): { version: string; goals: { allocation: FeedAllocation | null; id: string; version: number; title: string; measures: Measure[]; status: GoalStatus; level: GoalLevel; visibility: WireVisibility; owner: { id: string; name: string; }; team: { id: string; name: string; } | null; anchors: Anchors;
/** Goals whose output this goal consumes. */
depends_on: string[];
/** What work toward this goal must do, must not do, or leaves out of scope (lib/v2/goal-limits.ts), at most 5. */
limits: Limit[];
/** Share of the workspace's agent time this goal should get (0 to 100), or null for no target. */
target_share: number | null; bindable: boolean; contributes_to: ParentRef[]; }[]; steering: Steering; } {
    return (0, goalService.goalsFeed)(pp);
}
/** The ids in `ids` naming goals this caller can't read (they exist; the caller is never shown them). */
export function unreadableGoals(pp: PolicyPrincipal, ids: string[]): string[] {
    return (0, goalService.unreadableGoals)(pp, ids);
}
/** Would `goalId` depending on `deps` close a loop? Follows every goal's depends_on in the workspace, readable or not. */
export function dependencyCycle(wsId: string, goalId: string, deps: string[]): boolean {
    return (0, goalService.dependencyCycle)(wsId, goalId, deps);
}
/** The goals that already depend on `goalId`, directly or through others (every goal's depends_on, readable or not):
 *  adding any of them as a dependency of `goalId` would close a loop (C3-3). */
export function goalsDependingOn(wsId: string, goalId: string): Set<string> {
    return (0, goalService.goalsDependingOn)(wsId, goalId);
}
export const DEPENDENCY_CYCLE = goalService.DEPENDENCY_CYCLE;
/** 409 cycle when these dependencies would make the goal depend on itself. Exported for change requests. */
export function assertNoDependencyCycle(wsId: string, goalId: string, deps: string[]): void {
    return (0, goalService.assertNoDependencyCycle)(wsId, goalId, deps);
}
export const sameContent = (a: GoalContent, b: GoalContent): boolean => (0, goalService.sameContent)(a, b);
/** A goal's (or one stored version's) content. */
export function contentOf(r: {
    title: string;
    measures_json: string;
    anchors_json: string;
    status: string;
    depends_on_json: string;
    limits_json: string;
    target_share?: number | null;
}): GoalContent {
    return (0, goalService.contentOf)(r);
}
/** The content of one stored version of a goal. */
export function versionContentOf(wsId: string, goalId: string, version: number): GoalContent | undefined {
    return (0, goalService.versionContentOf)(wsId, goalId, version);
}
/** Validate a version body against `prev` (the same rules for a new version and a change request): the fields sent
 *  replace prev's, then 409 cycle when depends_on would loop and 409 no_change when nothing changed. A depends_on sent
 *  keeps the dependencies in `keepDepsFrom` (by default prev's) that the caller can't read. `loopOk` skips the cycle
 *  check, for a change request rebased with its own changes (C6-2): it adds nothing, and is never approved while it loops. */
export function nextContent(pp: PolicyPrincipal, goalId: string, prev: GoalContent, b: Body, keepDepsFrom: string[] = prev.depends_on, loopOk = false): GoalContent {
    return (0, goalService.nextContent)(pp, goalId, prev, b, keepDepsFrom, loopOk);
}
/** A target share from a body: undefined keeps `prev`, null clears it, else a whole percent from 0 to 100 (400). */
export function targetIn(v: unknown, prev: number | null = null): number | null {
    return (0, goalService.targetIn)(v, prev);
}
/** 409 targets_over_100 when the workspace's active goals' targets, with `next` replacing some goals' targets (each of
 *  them active), would add up to more than 100. Every visibility counts; the message names only the sums. */
export function assertTargetsFit(wsId: string, next: ReadonlyMap<string, number | null>): void {
    return (0, goalService.assertTargetsFit)(wsId, next);
}
/** Insert a new goal at version 1 (inside the caller's tx). Used by createGoal and the sample workspace. */
export function insertGoal(pp: PolicyPrincipal, f: {
    title: string;
    level: GoalLevel;
    podId: string | null;
    visibility: Visibility;
    measures: Measure[];
    anchors: Anchors;
    dependsOn: string[];
    limits?: Limit[];
    targetShare?: number | null;
}, at: string): string {
    return (0, goalService.insertGoal)(pp, f, at);
}
export async function createGoal(pp: PolicyPrincipal, b: Body): Promise<Goal> {
    return (0, goalService.createGoal)(pp, b);
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
    return (0, goalService.writeGoalVersion)(g, content, actorId, at, authorId);
}
/** A new immutable version from the goal's owner (title, measures, anchors, depends_on, limits and/or status). */
export async function newGoalVersion(pp: PolicyPrincipal, goalId: string, b: Body): Promise<Goal> {
    return (0, goalService.newGoalVersion)(pp, goalId, b);
}
export function goalDetail(pp: PolicyPrincipal, goalId: string): { goal: Goal;
/** How many of the goal's dependencies the reader can't see (never which): a new version keeps them. */
hidden_depends_on: number; versions: { created_by: undefined; version: number; title: string; status: string; target_share: number | null; content_hash: string; created_at: string; }[]; contributions: ({ goal: { id: string; title: string; }; } | { goal: null; })[]; can_edit: boolean;
/** Whether the reader may propose a change (lib/v2/changes.ts's rule: not the owner, not a viewer, an active goal),
 *  so the page shows Propose a change from the server's answer instead of working it out (the checklist's §A). */
can_propose: boolean; } {
    return (0, goalService.goalDetail)(pp, goalId);
}
