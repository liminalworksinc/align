// Goal sessions authorization: the one place that decides what a signed-in person may do. Better Auth only says who
// they are. Every v2 route calls authorize(principal, action, object) and maps the decision to HTTP:
//   not visible to the caller -> 404 (never 403, so existence doesn't leak)
//   visible but not allowed   -> 403 with a code
// The rules are data (the tables below), so a test can walk role x visibility x action exhaustively.
// A workspace owner does NOT read private goals: only a goal's owner does.
// Teams are stored as pods (pod_id, visibility value "pod"); everything a person or agent sees says "team".

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
  level?: "company" | "team";
}

export type PolicyObject =
  | { kind: "workspace" }
  | GoalObject
  | { kind: "goal_draft"; podId: string | null }
  | { kind: "bind"; goal: GoalObject; hasTransfer: boolean }
  | { kind: "pod"; podId: string }
  | { kind: "budget_request"; podId: string; requesterId: string; secondLook: boolean; firstDeciderId: string | null }
  | { kind: "session"; ownerId: string }
  | { kind: "alignment"; involved: readonly string[] };

/** Workspace-level actions and the roles that hold them. */
export type WsAction =
  | "workspace.read"
  | "workspace.manage" // invites, teams, member roles and removal, rename, delete, the audit trail
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
  | "goal.record_reading"
  | "goal.record_command_reading"
  | "goal.bind"
  | "pod.manage_members"
  | "session.manage" // the session's own owner: re-share, epochs, usage, stop sharing, delete
  | "session.stop" // stop/resume its agent: the owner, or a workspace owner
  | "alignment.read"
  | "team_budget.manage"
  | "budget_request.create"
  | "budget_request.read"
  | "budget_request.decide"
  | "budget_request.withdraw"
  | "budget_request.second_look";

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
  p.wsRole === "viewer" ? deny("read_only", "Viewers can look but not change anything.") : deny("owner_only", "Only a workspace owner can do this.");

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
      if (obj.podId && !podCan(p, obj.podId, "goal.create_in_pod")) return deny("not_in_team", "Only members of that team can add its goals.");
      return ALLOW;
    }

    case "goal.read":
      if (obj.kind !== "goal") return hidden();
      return canReadGoal(p, obj) ? ALLOW : hidden();

    case "goal.edit":
      if (obj.kind !== "goal" || !canReadGoal(p, obj)) return hidden();
      if (!wsCan(p, "goal.create")) return roleDenied(p);
      return obj.ownerId === p.userId ? ALLOW : deny("not_goal_owner", "Only the goal's owner can change it.");

    case "goal.record_command_reading":
      if (obj.kind !== "goal" || !canReadGoal(p, obj) || p.wsRole === "viewer") return hidden();
      return ALLOW;

    case "goal.record_reading":
      if (obj.kind !== "goal" || !canReadGoal(p, obj)) return hidden();
      if (p.wsRole === "viewer") return roleDenied(p);
      if (obj.ownerId === p.userId || (obj.podId && p.pods.has(obj.podId)) || (obj.level === "company" && p.wsRole === "owner")) return ALLOW;
      return deny("not_a_recorder", "Only the goal owner, its team, or a workspace owner on a company goal can add a reading.");

    case "goal.bind": {
      if (obj.kind !== "bind" || !canReadGoal(p, obj.goal)) return hidden();
      if (!wsCan(p, "session.share")) return roleDenied(p);
      if (obj.goal.ownerId === p.userId) return ALLOW;
      if (podCan(p, obj.goal.podId, "goal.bind_pod_goal")) return ALLOW;
      if (obj.hasTransfer) return ALLOW;
      return deny("alignment_required", "Ask the goal's owner to approve working toward it first.");
    }

    case "pod.manage_members": {
      if (obj.kind !== "pod") return hidden();
      // A viewer changes nothing, whatever team role is stored for them: the workspace role is checked first.
      if (p.wsRole === "viewer") return roleDenied(p);
      if (wsCan(p, "workspace.manage") || podCan(p, obj.podId, "pod.manage_members")) return ALLOW;
      return deny("not_team_lead", "Only a workspace owner or the team's lead can change its members.");
    }

    case "session.manage":
      if (obj.kind !== "session") return hidden();
      return obj.ownerId === p.userId ? ALLOW : hidden();

    case "session.stop":
      if (obj.kind !== "session") return hidden();
      if (obj.ownerId === p.userId || wsCan(p, "session.stop_any")) return ALLOW;
      return hidden();

    case "team_budget.manage":
    case "budget_request.create": {
      if (obj.kind !== "pod") return hidden();
      if (p.wsRole === "viewer") return roleDenied(p);
      if (action === "budget_request.create") return p.pods.has(obj.podId) ? ALLOW : deny("not_in_team", "Only members of this team can ask for more.");
      return p.wsRole === "owner" || p.pods.get(obj.podId) === "lead" ? ALLOW : deny("not_team_lead", "Only a team lead or workspace owner can change its team budget.");
    }
    case "budget_request.read":
    case "budget_request.decide":
    case "budget_request.withdraw":
    case "budget_request.second_look": {
      if (obj.kind !== "budget_request") return hidden();
      if (obj.requesterId !== p.userId && p.wsRole !== "owner" && !p.pods.has(obj.podId)) return hidden();
      if (action === "budget_request.read") return ALLOW;
      if (action === "budget_request.withdraw" && obj.requesterId === p.userId) return ALLOW;
      if (p.wsRole === "viewer") return roleDenied(p);
      if (action === "budget_request.withdraw" || action === "budget_request.second_look") return obj.requesterId === p.userId ? ALLOW : deny("not_requester", "Only the requester can do this.");
      const eligible = obj.secondLook ? p.wsRole === "owner" && p.userId !== obj.firstDeciderId : p.wsRole === "owner" || p.pods.get(obj.podId) === "lead";
      return eligible && p.userId !== obj.requesterId ? ALLOW : deny("not_an_approver", "Only an eligible team lead or workspace owner other than the requester can decide this request.");
    }

    case "alignment.read":
      if (obj.kind !== "alignment") return hidden();
      return obj.involved.includes(p.userId) ? ALLOW : hidden();
  }
}
