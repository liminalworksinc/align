// Typed consumer contract for the independently qualified authorization library.
import {
  authorize as nativeAuthorize,
  can_bind as nativeCanBind,
  can_read_goal as nativeCanReadGoal,
  data as nativeData,
} from "../native/.bindings/policy.js";

export type WsRole = "owner" | "member" | "viewer";

export type PodRole = "lead" | "member";

export type Visibility = "private" | "pod" | "workspace";

export interface PolicyPrincipal {
  userId: string;
  wsId: string;
  /** null: not a member of this workspace (or a device without a grant for it). */
  wsRole: WsRole | null;
  /** The caller's pods in this workspace. */
  pods: ReadonlyMap<string, PodRole>;
}

export interface GoalObject {
  kind: "goal";
  ownerId: string;
  visibility: Visibility;
  podId: string | null;
}

export type PolicyObject =
  | { kind: "workspace" }
  | GoalObject
  | { kind: "goal_draft"; podId: string | null }
  | { kind: "bind"; goal: GoalObject; hasTransfer: boolean }
  | { kind: "pod"; podId: string }
  | { kind: "session"; ownerId: string }
  | { kind: "alignment"; involved: readonly string[] };

export type WsAction =
  | "workspace.read"
  | "workspace.manage" // invites, teams, member roles and removal, rename, delete, the audit trail
  | "goal.create"
  | "session.share" // share sessions, bind them, upload usage
  | "session.stop_any" // stop or resume any shared session's agent in the workspace
  | "alignment.create"
  | "spend.read";

export type PodAction = "pod.manage_members" | "goal.create_in_pod" | "goal.bind_pod_goal";

export type Action =
  | WsAction
  | "goal.read"
  | "goal.edit"
  | "goal.bind"
  | "pod.manage_members"
  | "session.manage" // the session's own owner: re-share, epochs, usage, stop sharing, delete
  | "session.stop" // stop/resume its agent: the owner, or a workspace owner
  | "alignment.read";

export type Decision = { ok: true } | { ok: false; status: 403 | 404; code: string; message: string };

export const {WS_ROLES, POD_ROLES, VISIBILITIES, WORKSPACE_ROLE_ACTIONS, POD_ROLE_ACTIONS, GOAL_READERS} = nativeData() as {
  WS_ROLES: readonly WsRole[];
  POD_ROLES: readonly PodRole[];
  VISIBILITIES: readonly Visibility[];
  WORKSPACE_ROLE_ACTIONS: Record<WsRole, readonly WsAction[]>;
  POD_ROLE_ACTIONS: Record<PodRole, readonly PodAction[]>;
  GOAL_READERS: Record<Visibility, {wsRoles: readonly WsRole[]; podRoles: readonly PodRole[]}>;
};

export const authorize = nativeAuthorize as (principal: PolicyPrincipal, action: Action, object: PolicyObject) => Decision;
export const canReadGoal = nativeCanReadGoal as (principal: PolicyPrincipal, goal: GoalObject) => boolean;
export const canBind = nativeCanBind as (principal: PolicyPrincipal, goal: GoalObject, hasTransfer: boolean) => boolean;
