// Caller-owned provider assembly. Behavior belongs to the qualified library.
import { all, audit, get, LIVE_WS, run, sql, tx } from "./db";
import { softDeleteWorkspace } from "./core.mts";
import { admitCreation, checkMemberCap, checkRestoreCaps, precheckCreation } from "./creation";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { authorize, type Action, type PodRole, type PolicyObject, type PolicyPrincipal, type WsRole } from "./policy";
import type { Principal, WebPrincipal } from "./http";
import { config } from "../config";
import { event } from "./events";
import { take } from "./limits";
import { addWorkspaceToDevices, liveDevicesOf } from "./devices";
import { deleteMemberSessions, onMemberRemoved } from "./lifecycle";
import { cancelDeparture, noteDeparture, personName, RESTORE_DAYS } from "./retention";
import { workspaceSteering, writeSteering } from "./steering";
import { oneLine, type Body } from "./validate";
import { create_workspaces } from "../native/.bindings/server_workspaces.js";

interface WorkspaceRuntime {
  principalIn: (p: Principal, wsId: string) => PolicyPrincipal;
  memberPrincipal: (wsId: string, userId: string) => PolicyPrincipal;
  need: (p: PolicyPrincipal, action: Action, obj?: PolicyObject) => void;
  enter: (p: Principal, wsId: string) => PolicyPrincipal;
  workspacesFor: (p: Principal) => { teams: { id: string; name: string; role: PodRole; }[]; id: string; name: string; role: WsRole; }[];
  otherWorkspacesFor: (p: Principal) => { id: string; name: string; }[];
  createWorkspace: (req: Request, p: WebPrincipal, name: string, code: string | null, seed?: (wsId: string, at: string) => void) => Promise<{ id: string; name: string; role: "owner"; }>;
  workspaceDetail: (pp: PolicyPrincipal) => { workspace: { id: string; name: string; created_at: string; steering: "off" | "on"; }; role: WsRole | null; me: string; members: { id: string; name: string; email: string; role: WsRole; }[]; teams: { my_role: PodRole | null; members: { id: string; name: string; role: PodRole; }[]; id: string; name: string; }[]; };
  updateWorkspace: (pp: PolicyPrincipal, b: Body) => Promise<{ id: string; name: string; steering: import("./steering").Steering; }>;
  deleteWorkspace: (pp: PolicyPrincipal) => Promise<void>;
  deletedWorkspacesFor: (userId: string) => { restore_until: string; id: string; name: string; deleted_at: string; }[];
  deletedWorkspaceOwnedBy: (userId: string, wsId: string) => { id: string; name: string; };
  restoreWorkspace: (userId: string, wsId: string) => Promise<{ id: string; name: string; role: "owner"; }>;
  setMemberRole: (pp: PolicyPrincipal, userId: string, role: WsRole) => Promise<{ user_id: string; role: WsRole; }>;
  removeMember: (pp: PolicyPrincipal, userId: string, { deleteSessions }?: { deleteSessions?: boolean; }) => Promise<void>;
  auditTrail: (pp: PolicyPrincipal) => { at: string; actor: { id: string; name: string; } | null; action: string; object_id: string | null; }[];
  createInvite: (pp: PolicyPrincipal, email: string, role: WsRole, team?: { id: string | null; role: PodRole | null; }) => Promise<{ id: string; email: string; role: WsRole; team_id: string | null; team_role: PodRole | null; path: string; token: string; }>;
  listInvites: (pp: PolicyPrincipal) => { team: { id: string; name: string; } | null; id: string; email: string; role: WsRole; team_id: string | null; team_role: PodRole | null; created_at: string; expires_at: string; accepted_at: string | null; }[];
  deleteInvite: (pp: PolicyPrincipal, inviteId: string) => Promise<void>;
  previewInvite: (token: string, user: { id: string; email: string; }) => { workspace: { id: string; name: string; }; role: WsRole; team: { id: string; name: string; } | null; team_role: PodRole | null; email_matches: boolean; invited_email: string; devices: { id: string; name: string; last_seen_at: string; }[]; };
  acceptInvite: (token: string, user: { id: string; email: string; }, emailVerified: boolean, deviceIds?: string[], requireRecent?: () => void) => Promise<{ workspace_id: string; role: WsRole; team_id: string | null; device_ids: string[]; }>;
  createTeam: (pp: PolicyPrincipal, name: string) => Promise<{ id: string; name: string; }>;
  setTeamMember: (pp: PolicyPrincipal, podId: string, userId: string, role: PodRole) => Promise<{ team_id: string; user_id: string; role: PodRole; }>;
  removeTeamMember: (pp: PolicyPrincipal, podId: string, userId: string) => Promise<void>;
  memberName: (userId: string) => string;
  nameTo: (userId: string, reader: string) => string;
}

let workspaceService: WorkspaceRuntime | undefined;
function runtime(): WorkspaceRuntime {
  return workspaceService ??= create_workspaces({
    all, audit, get, LIVE_WS, run, sql, tx, softDeleteWorkspace, admitCreation, checkMemberCap, checkRestoreCaps, precheckCreation, V2Error, badRequest, conflict, forbidden, notFound, newId, nowIso, secretToken, sha256hex, authorize, config, event, take, addWorkspaceToDevices, liveDevicesOf, deleteMemberSessions, onMemberRemoved, cancelDeparture, noteDeparture, personName, RESTORE_DAYS, workspaceSteering, writeSteering, oneLine, readDate: () => Date
  }) as unknown as WorkspaceRuntime;
}

export function principalIn(p: Principal, wsId: string): PolicyPrincipal {
  return (0, runtime().principalIn)(p, wsId);
}

export function memberPrincipal(wsId: string, userId: string): PolicyPrincipal {
  return (0, runtime().memberPrincipal)(wsId, userId);
}

export function need(p: PolicyPrincipal, action: Action, obj: PolicyObject = { kind: "workspace" }): void {
  return (0, runtime().need)(p, action, obj);
}

export function enter(p: Principal, wsId: string): PolicyPrincipal {
  return (0, runtime().enter)(p, wsId);
}

export function workspacesFor(p: Principal): { teams: { id: string; name: string; role: PodRole; }[]; id: string; name: string; role: WsRole; }[] {
  return (0, runtime().workspacesFor)(p);
}

export function otherWorkspacesFor(p: Principal): { id: string; name: string; }[] {
  return (0, runtime().otherWorkspacesFor)(p);
}

export async function createWorkspace(req: Request, p: WebPrincipal, name: string, code: string | null, seed?: (wsId: string, at: string) => void): Promise<{ id: string; name: string; role: "owner"; }> {
  return (0, runtime().createWorkspace)(req, p, name, code, seed);
}

export function workspaceDetail(pp: PolicyPrincipal): { workspace: { id: string; name: string; created_at: string; steering: "off" | "on"; }; role: WsRole | null; me: string; members: { id: string; name: string; email: string; role: WsRole; }[]; teams: { my_role: PodRole | null; members: { id: string; name: string; role: PodRole; }[]; id: string; name: string; }[]; } {
  return (0, runtime().workspaceDetail)(pp);
}

export async function updateWorkspace(pp: PolicyPrincipal, b: Body): Promise<{ id: string; name: string; steering: import("./steering").Steering; }> {
  return (0, runtime().updateWorkspace)(pp, b);
}

export async function deleteWorkspace(pp: PolicyPrincipal): Promise<void> {
  return (0, runtime().deleteWorkspace)(pp);
}

export function deletedWorkspacesFor(userId: string): { restore_until: string; id: string; name: string; deleted_at: string; }[] {
  return (0, runtime().deletedWorkspacesFor)(userId);
}

export function deletedWorkspaceOwnedBy(userId: string, wsId: string): { id: string; name: string; } {
  return (0, runtime().deletedWorkspaceOwnedBy)(userId, wsId);
}

export async function restoreWorkspace(userId: string, wsId: string): Promise<{ id: string; name: string; role: "owner"; }> {
  return (0, runtime().restoreWorkspace)(userId, wsId);
}

export async function setMemberRole(pp: PolicyPrincipal, userId: string, role: WsRole): Promise<{ user_id: string; role: WsRole; }> {
  return (0, runtime().setMemberRole)(pp, userId, role);
}

export async function removeMember(pp: PolicyPrincipal, userId: string, { deleteSessions = false }: { deleteSessions?: boolean } = {}): Promise<void> {
  return (0, runtime().removeMember)(pp, userId, { deleteSessions });
}

export function auditTrail(pp: PolicyPrincipal): { at: string; actor: { id: string; name: string; } | null; action: string; object_id: string | null; }[] {
  return (0, runtime().auditTrail)(pp);
}

export async function createInvite(pp: PolicyPrincipal, email: string, role: WsRole, team: { id: string | null; role: PodRole | null } = { id: null, role: null }): Promise<{ id: string; email: string; role: WsRole; team_id: string | null; team_role: PodRole | null; path: string; token: string; }> {
  return (0, runtime().createInvite)(pp, email, role, team);
}

export function listInvites(pp: PolicyPrincipal): { team: { id: string; name: string; } | null; id: string; email: string; role: WsRole; team_id: string | null; team_role: PodRole | null; created_at: string; expires_at: string; accepted_at: string | null; }[] {
  return (0, runtime().listInvites)(pp);
}

export async function deleteInvite(pp: PolicyPrincipal, inviteId: string): Promise<void> {
  return (0, runtime().deleteInvite)(pp, inviteId);
}

export function previewInvite(token: string, user: { id: string; email: string }): { workspace: { id: string; name: string; }; role: WsRole; team: { id: string; name: string; } | null; team_role: PodRole | null; email_matches: boolean; invited_email: string; devices: { id: string; name: string; last_seen_at: string; }[]; } {
  return (0, runtime().previewInvite)(token, user);
}

export async function acceptInvite(token: string, user: { id: string; email: string }, emailVerified: boolean, deviceIds: string[] = [], requireRecent: () => void = () => undefined): Promise<{ workspace_id: string; role: WsRole; team_id: string | null; device_ids: string[]; }> {
  return (0, runtime().acceptInvite)(token, user, emailVerified, deviceIds, requireRecent);
}

export async function createTeam(pp: PolicyPrincipal, name: string): Promise<{ id: string; name: string; }> {
  return (0, runtime().createTeam)(pp, name);
}

export async function setTeamMember(pp: PolicyPrincipal, podId: string, userId: string, role: PodRole): Promise<{ team_id: string; user_id: string; role: PodRole; }> {
  return (0, runtime().setTeamMember)(pp, podId, userId, role);
}

export async function removeTeamMember(pp: PolicyPrincipal, podId: string, userId: string): Promise<void> {
  return (0, runtime().removeTeamMember)(pp, podId, userId);
}

export function memberName(userId: string): string {
  return (0, runtime().memberName)(userId);
}

export function nameTo(userId: string, reader: string): string {
  return (0, runtime().nameTo)(userId, reader);
}
