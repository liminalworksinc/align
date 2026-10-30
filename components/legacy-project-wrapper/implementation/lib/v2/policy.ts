// Goal sessions authorization: the one place that decides what a signed-in person may do. Better Auth only says who
// they are. Every v2 route calls authorize(principal, action, object) and maps the decision to HTTP:
//   not visible to the caller -> 404 (never 403, so existence doesn't leak)
//   visible but not allowed   -> 403 with a code
// The rules are data (the tables below), so a test can walk role x visibility x action exhaustively.
// A workspace owner does NOT read private goals: only a goal's owner does.

export type WsRole = "owner" | "member" | "viewer";
export type PodRole = "lead" | "member";
export type Visibility = "private" | "pod" | "workspace";
export const WS_ROLES: readonly WsRole[] = ["owner", "member", "viewer"];
export const POD_ROLES: readonly PodRole[] = ["lead", "member"];
export const VISIBILITIES: readonly Visibility[] = ["private", "pod", "workspace"];

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

/** Workspace-level actions and the roles that hold them. */
export type WsAction =
  | "workspace.read"
  | "workspace.manage" // invites, pods
  | "goal.create"
  | "session.share" // share sessions, bind them, upload usage
  | "session.stop_any" // stop or resume any shared session's agent in the workspace
  | "alignment.create"
  | "spend.read";

export const WORKSPACE_ROLE_ACTIONS: Record<WsRole, readonly WsAction[]> = {
  owner: ["workspace.read", "workspace.manage", "goal.create", "session.share", "session.stop_any", "alignment.create", "spend.read"],
  member: ["workspace.read", "goal.create", "session.share", "alignment.create", "spend.read"],
  viewer: ["workspace.read", "spend.read"],
};

/** Pod-level actions (on the caller's own pods). */
export type PodAction = "pod.manage_members" | "goal.create_in_pod" | "goal.bind_pod_goal";
export const POD_ROLE_ACTIONS: Record<PodRole, readonly PodAction[]> = {
  lead: ["pod.manage_members", "goal.create_in_pod", "goal.bind_pod_goal"],
  member: ["goal.create_in_pod", "goal.bind_pod_goal"],
};

/** Who reads a goal, by visibility. The owner always does. */
export const GOAL_READERS: Record<Visibility, { wsRoles: readonly WsRole[]; podRoles: readonly PodRole[] }> = {
  private: { wsRoles: [], podRoles: [] },
  pod: { wsRoles: ["owner"], podRoles: ["lead", "member"] },
  workspace: { wsRoles: ["owner", "member", "viewer"], podRoles: [] },
};

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

const ALLOW: Decision = { ok: true };
const hidden = (): Decision => ({ ok: false, status: 404, code: "not_found", message: "Not found" });
const deny = (code: string, message: string): Decision => ({ ok: false, status: 403, code, message });

const wsCan = (p: PolicyPrincipal, a: WsAction) => !!p.wsRole && WORKSPACE_ROLE_ACTIONS[p.wsRole].includes(a);
const podCan = (p: PolicyPrincipal, podId: string | null, a: PodAction) => {
  const r = podId ? p.pods.get(podId) : undefined;
  return !!r && POD_ROLE_ACTIONS[r].includes(a);
};

export function canReadGoal(p: PolicyPrincipal, g: GoalObject): boolean {
  if (!p.wsRole) return false;
  if (g.ownerId === p.userId) return true;
  const rule = GOAL_READERS[g.visibility];
  if (rule.wsRoles.includes(p.wsRole)) return true;
  const podRole = g.podId ? p.pods.get(g.podId) : undefined;
  return !!podRole && rule.podRoles.includes(podRole);
}

/** Bindable without a session in view: own goal, a goal of a pod the caller belongs to, or one they hold an
 *  approved allocation transfer to (`hasTransfer`). */
export function canBind(p: PolicyPrincipal, g: GoalObject, hasTransfer: boolean): boolean {
  return authorize(p, "goal.bind", { kind: "bind", goal: g, hasTransfer }).ok;
}

const roleDenied = (p: PolicyPrincipal): Decision =>
  p.wsRole === "viewer" ? deny("read_only", "Viewers can look but not change anything") : deny("owner_only", "Only a workspace owner can do this");

export function authorize(p: PolicyPrincipal, action: Action, obj: PolicyObject): Decision {
  if (!p.wsRole) return hidden(); // not a member (or no device grant): the workspace and everything in it is hidden
  switch (action) {
    case "workspace.read":
    case "workspace.manage":
    case "session.share":
    case "session.stop_any":
    case "alignment.create":
    case "spend.read":
      return wsCan(p, action) ? ALLOW : roleDenied(p);

    case "goal.create": {
      if (!wsCan(p, "goal.create")) return roleDenied(p);
      if (obj.kind !== "goal_draft") return hidden();
      if (obj.podId && !podCan(p, obj.podId, "goal.create_in_pod")) return deny("not_in_pod", "Only members of that pod can add its goals");
      return ALLOW;
    }

    case "goal.read":
      if (obj.kind !== "goal") return hidden();
      return canReadGoal(p, obj) ? ALLOW : hidden();

    case "goal.edit":
      if (obj.kind !== "goal" || !canReadGoal(p, obj)) return hidden();
      if (!wsCan(p, "goal.create")) return roleDenied(p);
      return obj.ownerId === p.userId ? ALLOW : deny("not_goal_owner", "Only the goal's owner can change it");

    case "goal.bind": {
      if (obj.kind !== "bind" || !canReadGoal(p, obj.goal)) return hidden();
      if (!wsCan(p, "session.share")) return roleDenied(p);
      if (obj.goal.ownerId === p.userId) return ALLOW;
      if (podCan(p, obj.goal.podId, "goal.bind_pod_goal")) return ALLOW;
      if (obj.hasTransfer) return ALLOW;
      return deny("alignment_required", "Ask the goal's owner to approve working toward it first");
    }

    case "pod.manage_members": {
      if (obj.kind !== "pod") return hidden();
      if (wsCan(p, "workspace.manage") || podCan(p, obj.podId, "pod.manage_members")) return ALLOW;
      return p.wsRole === "viewer" ? roleDenied(p) : deny("not_pod_lead", "Only a workspace owner or the pod's lead can change its members");
    }

    case "session.manage":
      if (obj.kind !== "session") return hidden();
      return obj.ownerId === p.userId ? ALLOW : hidden();

    case "session.stop":
      if (obj.kind !== "session") return hidden();
      if (obj.ownerId === p.userId || wsCan(p, "session.stop_any")) return ALLOW;
      return hidden();

    case "alignment.read":
      if (obj.kind !== "alignment") return hidden();
      return obj.involved.includes(p.userId) ? ALLOW : hidden();
  }
}
