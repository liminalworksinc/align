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
import { deleteMemberSessions, onMemberRemoved } from "./lifecycle";
import { cancelDeparture, noteDeparture, personName, RESTORE_DAYS } from "./retention";

// Workspaces, members, invites and teams. Teams are stored as pods (v2_pods, pod_ ids); every response, message and
// audit action says "team". The /pods routes remain as aliases of /teams.

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** The policy principal for this caller in this workspace. A device sees only the workspaces it was granted. */
export function principalIn(p: Principal, wsId: string): PolicyPrincipal {
  const userId = p.user.id;
  const granted = p.kind === "web" || p.grants.has(wsId);
  const m = granted ? get<{ role: WsRole }>(`SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, wsId, userId) : undefined;
  const pods = new Map<string, PodRole>();
  if (m) for (const r of all<{ pod_id: string; role: PodRole }>("SELECT pod_id, role FROM v2_pod_members WHERE ws_id = ? AND user_id = ?", wsId, userId)) pods.set(r.pod_id, r.role);
  return { userId, wsId, wsRole: m?.role ?? null, pods };
}

/** authorize() or throw its 403/404. */
export function need(p: PolicyPrincipal, action: Action, obj: PolicyObject = { kind: "workspace" }) {
  const d = authorize(p, action, obj);
  if (!d.ok) throw new V2Error(d.status, d.code, d.message);
}

/** The principal for a workspace route, after checking the workspace is visible (404 otherwise). */
export function enter(p: Principal, wsId: string): PolicyPrincipal {
  const pp = principalIn(p, wsId);
  need(pp, "workspace.read");
  return pp;
}

export function workspacesFor(p: Principal) {
  const rows = all<{ id: string; name: string; role: WsRole }>(
    "SELECT w.id, w.name, m.role FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id",
    p.user.id,
  ).filter((w) => p.kind === "web" || p.grants.has(w.id));
  return rows.map((w) => ({
    ...w,
    teams: all<{ id: string; name: string; role: PodRole }>(
      "SELECT p.id, p.name, pm.role FROM v2_pods p JOIN v2_pod_members pm ON pm.pod_id = p.id AND pm.user_id = ? WHERE p.ws_id = ? ORDER BY p.name",
      p.user.id,
      w.id,
    ),
  }));
}

/** A new workspace owned by the caller. When hosted it must pass the creation gate (lib/v2/creation.ts): the mode,
 *  the caps, the address, the captcha and, in `codes` mode, a creation code spent in the same transaction. `seed`,
 *  when given, fills it in that transaction too (the sample workspace). */
export async function createWorkspace(req: Request, p: WebPrincipal, name: string, code: string | null, seed?: (wsId: string, at: string) => void) {
  const userId = p.user.id;
  take(`ws-create:${userId}`, 10, 60 * 60 * 1000);
  const creator = { id: userId, email: p.user.email, emailVerified: p.emailVerified };
  await precheckCreation(req, creator, code);
  const id = newId("ws");
  const at = nowIso();
  await tx(() => {
    const redeemed = admitCreation(creator, code, id);
    run("INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)", id, name, userId, at);
    run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", id, userId, at);
    audit(id, userId, "workspace.created", id, at);
    if (redeemed) event("code_redeemed", { ws: id, user: userId, at });
    event("workspace_created", { ws: id, user: userId, props: { kind: seed ? "sample" : "blank" }, at });
    seed?.(id, at);
  });
  return { id, name, role: "owner" as const };
}

export function workspaceDetail(pp: PolicyPrincipal) {
  const ws = get<{ id: string; name: string; created_at: string }>("SELECT id, name, created_at FROM v2_workspaces WHERE id = ?", pp.wsId);
  if (!ws) throw notFound();
  const members = all<{ id: string; name: string; email: string; role: WsRole }>(
    "SELECT u.id, u.name, u.email, m.role FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? ORDER BY u.name, u.id",
    pp.wsId,
  );
  const teams = all<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ? ORDER BY name, id", pp.wsId).map((pod) => ({
    ...pod,
    my_role: pp.pods.get(pod.id) ?? null,
    members: all<{ id: string; name: string; role: PodRole }>(
      "SELECT u.id, u.name, pm.role FROM v2_pod_members pm JOIN ba_user u ON u.id = pm.user_id WHERE pm.pod_id = ? ORDER BY u.name",
      pod.id,
    ),
  }));
  return { workspace: ws, role: pp.wsRole, me: pp.userId, members, teams };
}

export async function renameWorkspace(pp: PolicyPrincipal, name: string) {
  need(pp, "workspace.manage");
  const at = nowIso();
  await tx(() => {
    run("UPDATE v2_workspaces SET name = ? WHERE id = ?", name, pp.wsId);
    audit(pp.wsId, pp.userId, "workspace.renamed", pp.wsId, at);
  });
  return { id: pp.wsId, name };
}

/** Soft delete (softDeleteWorkspace in lib/v2/core.mts, the one deletion path, shared with account deletion and
 *  `align-admin workspaces delete`): the workspace is unreachable to everyone at once (404 everywhere, devices stop
 *  syncing it, its connected AI apps are revoked). Its owners can restore it for 30 days; then the retention job
 *  purges every row (purgeWorkspace in lib/v2/core.mts). */
export async function deleteWorkspace(pp: PolicyPrincipal) {
  need(pp, "workspace.manage");
  const at = nowIso();
  await tx(() => softDeleteWorkspace(sql, pp.wsId, pp.userId, at));
}

const restoreUntil = (deletedAt: string) => new Date(Date.parse(deletedAt) + RESTORE_DAYS * DAY_MS).toISOString();

/** Deleted workspaces this person owns that can still be restored, newest first. */
export function deletedWorkspacesFor(userId: string) {
  const since = new Date(Date.now() - RESTORE_DAYS * DAY_MS).toISOString();
  return all<{ id: string; name: string; deleted_at: string }>(
    "SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.deleted_at IS NOT NULL AND w.deleted_at > ? ORDER BY w.deleted_at DESC",
    userId,
    since,
  ).map((w) => ({ ...w, restore_until: restoreUntil(w.deleted_at) }));
}

/** A deleted workspace the caller owns and can still restore, else 404 (a live workspace is 409 not_deleted). */
export function deletedWorkspaceOwnedBy(userId: string, wsId: string) {
  const w = get<{ id: string; name: string; deleted_at: string | null }>(
    "SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.id = ?",
    userId,
    wsId,
  );
  if (!w) throw notFound();
  if (!w.deleted_at) throw conflict("not_deleted", "This workspace is not deleted");
  if (Date.parse(restoreUntil(w.deleted_at)) <= Date.now()) throw notFound();
  return { id: w.id, name: w.name };
}

/** An owner restores a deleted workspace within its window: everything is as it was, except connected AI apps (revoked
 *  at deletion), and members' devices sync it again. Hosted, it counts toward the caps again, so a restore that would
 *  pass ALIGN_MAX_WORKSPACES or the restorer's ALIGN_MAX_OWNED_WORKSPACES is refused (409 workspace_cap or
 *  owned_workspace_cap). */
export async function restoreWorkspace(userId: string, wsId: string) {
  const w = deletedWorkspaceOwnedBy(userId, wsId);
  checkRestoreCaps(userId);
  const at = nowIso();
  await tx(() => {
    deletedWorkspaceOwnedBy(userId, wsId);
    checkRestoreCaps(userId);
    run("UPDATE v2_workspaces SET deleted_at = NULL WHERE id = ?", wsId);
    audit(wsId, userId, "workspace.restored", wsId, at);
  });
  return { id: w.id, name: w.name, role: "owner" as const };
}

// ---- members: role changes, removal, leaving ----

const LAST_OWNER = "A workspace needs at least one owner. Make someone else an owner first.";
const ownerCount = (wsId: string) => get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ? AND role = 'owner'", wsId)?.n ?? 0;
const memberRole = (wsId: string, userId: string) => get<{ role: WsRole }>("SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?", wsId, userId)?.role;

/** An owner changes a member's role (their own included, while another owner remains). */
export async function setMemberRole(pp: PolicyPrincipal, userId: string, role: WsRole) {
  need(pp, "workspace.manage");
  if (!memberRole(pp.wsId, userId)) throw notFound();
  const at = nowIso();
  await tx(() => {
    const current = memberRole(pp.wsId, userId);
    if (!current) throw notFound();
    if (current === role) return;
    if (current === "owner" && ownerCount(pp.wsId) <= 1) throw conflict("last_owner", LAST_OWNER);
    run("UPDATE v2_members SET role = ? WHERE ws_id = ? AND user_id = ?", role, pp.wsId, userId);
    audit(pp.wsId, pp.userId, "member.role_changed", userId, at);
  });
  return { user_id: userId, role };
}

/** An owner removes a member, or anyone (viewers included) leaves by naming themselves. Their team memberships and
 *  device grants for this workspace end (lib/v2/lifecycle.ts); their goals, sessions and history stay, under their name
 *  for 30 days and then as "Former member #n" (lib/v2/retention.ts). `deleteSessions` deletes their shared sessions in
 *  this workspace now (spend already rolled up stays). */
export async function removeMember(pp: PolicyPrincipal, userId: string, { deleteSessions = false }: { deleteSessions?: boolean } = {}) {
  const leaving = userId === pp.userId;
  if (!leaving) need(pp, "workspace.manage");
  if (!memberRole(pp.wsId, userId)) throw notFound();
  const at = nowIso();
  await tx(() => {
    const current = memberRole(pp.wsId, userId);
    if (!current) throw notFound();
    if (current === "owner" && ownerCount(pp.wsId) <= 1) throw conflict("last_owner", LAST_OWNER);
    onMemberRemoved(pp.wsId, userId);
    run("DELETE FROM v2_members WHERE ws_id = ? AND user_id = ?", pp.wsId, userId);
    noteDeparture(pp.wsId, userId, at);
    audit(pp.wsId, pp.userId, leaving ? "member.left" : "member.removed", userId, at);
    if (deleteSessions && deleteMemberSessions(pp.wsId, userId)) audit(pp.wsId, pp.userId, "member.sessions_deleted", userId, at);
  });
}

// ---- audit trail (owners only) ----

/** Audit actions written before teams were called teams are shown with the new name. */
const shownAction = (a: string) => a.replace(/^pod\./, "team.");

export function auditTrail(pp: PolicyPrincipal) {
  need(pp, "workspace.manage");
  return all<{ at: string; actor_id: string | null; actor_name: string | null; action: string; object_id: string | null }>(
    `SELECT a.at, a.actor_id, u.name AS actor_name, a.action, a.object_id FROM v2_audit a LEFT JOIN ba_user u ON u.id = a.actor_id
     WHERE a.ws_id = ? ORDER BY a.seq DESC LIMIT 200`,
    pp.wsId,
  ).map((r) => ({ at: r.at, actor: r.actor_id ? { id: r.actor_id, name: personName(r.actor_id, r.actor_name) } : null, action: shownAction(r.action), object_id: r.object_id }));
}

// ---- invites (shown as a link to copy; Align sends no email) ----

export async function createInvite(pp: PolicyPrincipal, email: string, role: WsRole, team: { id: string | null; role: PodRole | null } = { id: null, role: null }) {
  need(pp, "workspace.manage");
  if (team.role && !team.id) throw badRequest("team_role needs a team_id");
  if (team.id && !get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, team.id)) throw notFound();
  const teamId = team.id;
  const teamRole = teamId ? (team.role ?? "member") : null;
  take(`invite-create:${pp.wsId}`, 50, 60 * 60 * 1000);
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw badRequest("Enter an email address");
  if (get("SELECT 1 AS x FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? AND lower(u.email) = ?", pp.wsId, e)) {
    throw conflict("already_member", "That person is already a member");
  }
  checkMemberCap(pp.wsId, true);
  const token = secretToken(32);
  const id = newId("inv");
  const at = nowIso();
  await tx(() => {
    run(
      "INSERT INTO v2_invites (id, ws_id, token_hash, email, role, team_id, team_role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      pp.wsId,
      sha256hex(token),
      e,
      role,
      teamId,
      teamRole,
      pp.userId,
      at,
      new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    );
    audit(pp.wsId, pp.userId, "invite.created", id, at);
    event("invite_sent", { ws: pp.wsId, user: pp.userId, props: { role }, at });
  });
  return { id, email: e, role, team_id: teamId, team_role: teamRole, path: `/app/invite/${token}`, token };
}

export function listInvites(pp: PolicyPrincipal) {
  need(pp, "workspace.manage");
  return all<{ id: string; email: string; role: WsRole; team_id: string | null; team_name: string | null; team_role: PodRole | null; created_at: string; expires_at: string; accepted_at: string | null }>(
    `SELECT i.id, i.email, i.role, i.team_id, p.name AS team_name, i.team_role, i.created_at, i.expires_at, i.accepted_at
     FROM v2_invites i LEFT JOIN v2_pods p ON p.ws_id = i.ws_id AND p.id = i.team_id WHERE i.ws_id = ? ORDER BY i.created_at DESC`,
    pp.wsId,
  ).map(({ team_name, ...i }) => ({ ...i, team: i.team_id ? { id: i.team_id, name: team_name ?? "" } : null }));
}

export async function deleteInvite(pp: PolicyPrincipal, inviteId: string) {
  need(pp, "workspace.manage");
  const n = await tx(() => {
    const deleted = run("DELETE FROM v2_invites WHERE ws_id = ? AND id = ? AND accepted_at IS NULL", pp.wsId, inviteId);
    if (deleted) audit(pp.wsId, pp.userId, "invite.withdrawn", inviteId, nowIso());
    return deleted;
  });
  if (!n) throw notFound();
}

interface InviteRow {
  id: string;
  ws_id: string;
  email: string;
  role: WsRole;
  team_id: string | null;
  team_role: PodRole | null;
  expires_at: string;
  accepted_at: string | null;
}

function inviteByToken(token: string): InviteRow {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound();
  const r = get<InviteRow>("SELECT id, ws_id, email, role, team_id, team_role, expires_at, accepted_at FROM v2_invites WHERE token_hash = ?", sha256hex(token));
  if (!r || r.accepted_at || Date.parse(r.expires_at) <= Date.now()) throw notFound();
  if (!get(`SELECT 1 AS x WHERE ${LIVE_WS("?")}`, r.ws_id)) throw notFound();
  return r;
}

export function previewInvite(token: string, user: { email: string }) {
  const r = inviteByToken(token);
  const ws = get<{ name: string }>("SELECT name FROM v2_workspaces WHERE id = ?", r.ws_id);
  const team = r.team_id ? get<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?", r.ws_id, r.team_id) : undefined;
  return {
    workspace: { id: r.ws_id, name: ws?.name ?? "" },
    role: r.role,
    team: team ?? null,
    team_role: team ? r.team_role : null,
    email_matches: r.email === user.email.toLowerCase(),
    invited_email: r.email,
  };
}

export async function acceptInvite(token: string, user: { id: string; email: string }, emailVerified: boolean) {
  const r = inviteByToken(token);
  if (r.email !== user.email.toLowerCase()) throw new V2Error(403, "email_mismatch", "This invite is for a different email address");
  // When hosted, the sign-in method (Google, GitHub or an email code) must have verified the address.
  if (config().hosted && !emailVerified) throw new V2Error(403, "email_unverified", "Your sign-in provider has not verified this email address");
  const at = nowIso();
  await tx(() => {
    if (get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", r.ws_id, user.id)) throw conflict("already_member", "You are already a member");
    checkMemberCap(r.ws_id, false);
    run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", r.ws_id, user.id, r.role, at);
    cancelDeparture(r.ws_id, user.id);
    // An invite that names a team joins that team too (a team removed meanwhile is simply skipped).
    if (r.team_id && get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", r.ws_id, r.team_id)) {
      run("INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)", r.ws_id, r.team_id, user.id, r.team_role ?? "member", at);
    } else r.team_id = null;
    run("UPDATE v2_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?", at, user.id, r.id);
    audit(r.ws_id, user.id, "invite.accepted", r.id, at);
    event("invite_accepted", { ws: r.ws_id, user: user.id, props: { role: r.role }, at });
    // The workspace's second member (once, however many join or leave later).
    if ((get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ?", r.ws_id)?.n ?? 0) >= 2) event("second_member_joined", { ws: r.ws_id, user: user.id, at });
  });
  return { workspace_id: r.ws_id, role: r.role, team_id: r.team_id };
}

// ---- teams (stored as pods) ----

export async function createTeam(pp: PolicyPrincipal, name: string) {
  need(pp, "workspace.manage");
  const id = newId("pod");
  const at = nowIso();
  await tx(() => {
    run("INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)", id, pp.wsId, name, at);
    audit(pp.wsId, pp.userId, "team.created", id, at);
  });
  return { id, name };
}

function teamInWs(wsId: string, podId: string) {
  if (!get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", wsId, podId)) throw notFound();
}

export async function setTeamMember(pp: PolicyPrincipal, podId: string, userId: string, role: PodRole) {
  teamInWs(pp.wsId, podId);
  need(pp, "pod.manage_members", { kind: "pod", podId });
  // A lead adds and removes members; only a workspace owner makes someone a lead (or changes a lead's role).
  const current = get<{ role: PodRole }>("SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?", podId, userId);
  if ((role === "lead" || current?.role === "lead") && pp.wsRole !== "owner") throw forbidden("owner_only", "Only a workspace owner can make someone a team lead");
  if (!get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", pp.wsId, userId)) throw notFound();
  const at = nowIso();
  await tx(() => {
    run(
      "INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (pod_id, user_id) DO UPDATE SET role = excluded.role",
      pp.wsId,
      podId,
      userId,
      role,
      at,
    );
    audit(pp.wsId, pp.userId, "team.member_set", podId, at);
  });
  return { team_id: podId, user_id: userId, role };
}

export async function removeTeamMember(pp: PolicyPrincipal, podId: string, userId: string) {
  teamInWs(pp.wsId, podId);
  need(pp, "pod.manage_members", { kind: "pod", podId });
  const current = get<{ role: PodRole }>("SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?", podId, userId);
  if (current?.role === "lead" && pp.wsRole !== "owner" && userId !== pp.userId) throw forbidden("owner_only", "Only a workspace owner can remove a team lead");
  const n = await tx(() => {
    const deleted = run("DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = ?", pp.wsId, podId, userId);
    if (deleted) audit(pp.wsId, pp.userId, "team.member_removed", podId, nowIso());
    return deleted;
  });
  if (!n) throw notFound();
}

/** The name to show for a person id in a workspace's rows ("Former member #n" once pseudonymised). */
export function memberName(userId: string): string {
  return personName(userId, get<{ name: string }>("SELECT name FROM ba_user WHERE id = ?", userId)?.name);
}
