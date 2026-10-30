import { all, audit, get, run, tx } from "./db";
import { V2Error, badRequest, conflict, notFound } from "./errors";
import { newId, nowIso, secretToken, sha256hex } from "./ids";
import { authorize, type Action, type PodRole, type PolicyObject, type PolicyPrincipal, type WsRole } from "./policy";
import type { Principal } from "./http";
import { config } from "../config";
import { take } from "./limits";

// Workspaces, members, invites and pods.

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

/** The policy principal for this caller in this workspace. A device sees only the workspaces it was granted. */
export function principalIn(p: Principal, wsId: string): PolicyPrincipal {
  const userId = p.user.id;
  const granted = p.kind === "web" || p.grants.has(wsId);
  const m = granted ? get<{ role: WsRole }>("SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?", wsId, userId) : undefined;
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
    "SELECT w.id, w.name, m.role FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? ORDER BY w.name, w.id",
    p.user.id,
  ).filter((w) => p.kind === "web" || p.grants.has(w.id));
  return rows.map((w) => ({
    ...w,
    pods: all<{ id: string; name: string; role: PodRole }>(
      "SELECT p.id, p.name, pm.role FROM v2_pods p JOIN v2_pod_members pm ON pm.pod_id = p.id AND pm.user_id = ? WHERE p.ws_id = ? ORDER BY p.name",
      p.user.id,
      w.id,
    ),
  }));
}

export async function createWorkspace(userId: string, name: string) {
  take(`ws-create:${userId}`, 10, 60 * 60 * 1000);
  const owned = get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_members WHERE user_id = ? AND role = 'owner'", userId)?.n ?? 0;
  if (owned >= 50) throw conflict("too_many_workspaces", "You own the maximum number of workspaces");
  const id = newId("ws");
  const at = nowIso();
  await tx(() => {
    run("INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)", id, name, userId, at);
    run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)", id, userId, at);
    audit(id, userId, "workspace.created", id, at);
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
  const pods = all<{ id: string; name: string }>("SELECT id, name FROM v2_pods WHERE ws_id = ? ORDER BY name, id", pp.wsId).map((pod) => ({
    ...pod,
    my_role: pp.pods.get(pod.id) ?? null,
    members: all<{ id: string; name: string; role: PodRole }>(
      "SELECT u.id, u.name, pm.role FROM v2_pod_members pm JOIN ba_user u ON u.id = pm.user_id WHERE pm.pod_id = ? ORDER BY u.name",
      pod.id,
    ),
  }));
  return { workspace: ws, role: pp.wsRole, me: pp.userId, members, pods };
}

// ---- invites (shown as a link to copy; Align sends no email) ----

export async function createInvite(pp: PolicyPrincipal, email: string, role: WsRole) {
  need(pp, "workspace.manage");
  take(`invite-create:${pp.wsId}`, 50, 60 * 60 * 1000);
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw badRequest("Enter an email address");
  if (get("SELECT 1 AS x FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? AND lower(u.email) = ?", pp.wsId, e)) {
    throw conflict("already_member", "That person is already a member");
  }
  const token = secretToken(32);
  const id = newId("inv");
  const at = nowIso();
  await tx(() => {
    run(
      "INSERT INTO v2_invites (id, ws_id, token_hash, email, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      pp.wsId,
      sha256hex(token),
      e,
      role,
      pp.userId,
      at,
      new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    );
    audit(pp.wsId, pp.userId, "invite.created", id, at);
  });
  return { id, email: e, role, path: `/app/invite/${token}`, token };
}

export function listInvites(pp: PolicyPrincipal) {
  need(pp, "workspace.manage");
  return all("SELECT id, email, role, created_at, expires_at, accepted_at FROM v2_invites WHERE ws_id = ? ORDER BY created_at DESC", pp.wsId);
}

export async function deleteInvite(pp: PolicyPrincipal, inviteId: string) {
  need(pp, "workspace.manage");
  const n = await tx(() => run("DELETE FROM v2_invites WHERE ws_id = ? AND id = ? AND accepted_at IS NULL", pp.wsId, inviteId));
  if (!n) throw notFound();
}

interface InviteRow {
  id: string;
  ws_id: string;
  email: string;
  role: WsRole;
  expires_at: string;
  accepted_at: string | null;
}

function inviteByToken(token: string): InviteRow {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound();
  const r = get<InviteRow>("SELECT id, ws_id, email, role, expires_at, accepted_at FROM v2_invites WHERE token_hash = ?", sha256hex(token));
  if (!r || r.accepted_at || Date.parse(r.expires_at) <= Date.now()) throw notFound();
  return r;
}

export function previewInvite(token: string, user: { email: string }) {
  const r = inviteByToken(token);
  const ws = get<{ name: string }>("SELECT name FROM v2_workspaces WHERE id = ?", r.ws_id);
  return { workspace: { id: r.ws_id, name: ws?.name ?? "" }, role: r.role, email_matches: r.email === user.email.toLowerCase(), invited_email: r.email };
}

export async function acceptInvite(token: string, user: { id: string; email: string }, emailVerified: boolean) {
  const r = inviteByToken(token);
  if (r.email !== user.email.toLowerCase()) throw new V2Error(403, "email_mismatch", "This invite is for a different email address");
  // Hosted sign-in is Google or GitHub only, and the provider must have verified the address.
  if (config().hosted && !emailVerified) throw new V2Error(403, "email_unverified", "Your sign-in provider has not verified this email address");
  const at = nowIso();
  await tx(() => {
    if (get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", r.ws_id, user.id)) throw conflict("already_member", "You are already a member");
    run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", r.ws_id, user.id, r.role, at);
    run("UPDATE v2_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?", at, user.id, r.id);
    audit(r.ws_id, user.id, "invite.accepted", r.id, at);
  });
  return { workspace_id: r.ws_id, role: r.role };
}

// ---- pods ----

export async function createPod(pp: PolicyPrincipal, name: string) {
  need(pp, "workspace.manage");
  const id = newId("pod");
  const at = nowIso();
  await tx(() => {
    run("INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)", id, pp.wsId, name, at);
    audit(pp.wsId, pp.userId, "pod.created", id, at);
  });
  return { id, name };
}

function podInWs(wsId: string, podId: string) {
  if (!get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", wsId, podId)) throw notFound();
}

export async function setPodMember(pp: PolicyPrincipal, podId: string, userId: string, role: PodRole) {
  podInWs(pp.wsId, podId);
  need(pp, "pod.manage_members", { kind: "pod", podId });
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
    audit(pp.wsId, pp.userId, "pod.member_set", podId, at);
  });
  return { pod_id: podId, user_id: userId, role };
}

export async function removePodMember(pp: PolicyPrincipal, podId: string, userId: string) {
  podInWs(pp.wsId, podId);
  need(pp, "pod.manage_members", { kind: "pod", podId });
  const n = await tx(() => run("DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = ?", pp.wsId, podId, userId));
  if (!n) throw notFound();
}

export function memberName(userId: string): string {
  return get<{ name: string }>("SELECT name FROM ba_user WHERE id = ?", userId)?.name ?? "Someone";
}
