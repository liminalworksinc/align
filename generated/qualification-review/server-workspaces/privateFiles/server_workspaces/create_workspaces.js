'use strict';
// Private reference-only facade. Source authority and native qualification remain separate.
function create_workspaces(resources){
const {all,audit,get,LIVE_WS,run,sql,tx,softDeleteWorkspace,admitCreation,checkMemberCap,checkRestoreCaps,precheckCreation,V2Error,badRequest,conflict,forbidden,notFound,newId,nowIso,secretToken,sha256hex,authorize,config,event,take,addWorkspaceToDevices,liveDevicesOf,deleteMemberSessions,onMemberRemoved,cancelDeparture,noteDeparture,personName,RESTORE_DAYS,workspaceSteering,writeSteering,oneLine,readDate}=resources;
// Workspaces, members, invites and teams. Teams are stored as pods (v2_pods, pod_ ids); every response, message and
// audit action says "team". The /pods routes remain as aliases of /teams.
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
/** The policy principal for this caller in this workspace. A device sees only the workspaces it was granted. */
function principalIn(p, wsId) {
    const granted = p.kind === "web" || p.grants.has(wsId);
    return granted ? memberPrincipal(wsId, p.user.id) : { userId: p.user.id, wsId, wsRole: null, pods: new Map() };
}
/** The policy principal of a person in a workspace, as on the web (no device grant involved): what they may do there
 *  now. Used to check what another person may do (lib/v2/requests.ts: whether a session's owner may bind a goal). */
function memberPrincipal(wsId, userId) {
    const m = get(`SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, wsId, userId);
    const pods = new Map();
    if (m)
        for (const r of all("SELECT pod_id, role FROM v2_pod_members WHERE ws_id = ? AND user_id = ?", wsId, userId))
            pods.set(r.pod_id, r.role);
    return { userId, wsId, wsRole: m?.role ?? null, pods };
}
/** authorize() or throw its 403/404. */
function need(p, action, obj = { kind: "workspace" }) {
    const d = authorize(p, action, obj);
    if (!d.ok)
        throw new V2Error(d.status, d.code, d.message);
}
/** The principal for a workspace route, after checking the workspace is visible (404 otherwise). */
function enter(p, wsId) {
    const pp = principalIn(p, wsId);
    need(pp, "workspace.read");
    return pp;
}
function workspacesFor(p) {
    const rows = all("SELECT w.id, w.name, m.role FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id", p.user.id).filter((w) => p.kind === "web" || p.grants.has(w.id));
    return rows.map((w) => ({
        ...w,
        teams: all("SELECT p.id, p.name, pm.role FROM v2_pods p JOIN v2_pod_members pm ON pm.pod_id = p.id AND pm.user_id = ? WHERE p.ws_id = ? ORDER BY p.name", p.user.id, w.id),
    }));
}
/** For a device: the workspaces its person is a member of that this device was not given (names they already see), so
 *  the CLI can point to the Devices page grant instead of saying "unknown workspace" (E2E-AGENT cycle 6). */
function otherWorkspacesFor(p) {
    if (p.kind !== "device")
        return [];
    return all("SELECT w.id, w.name FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id", p.user.id).filter((w) => !p.grants.has(w.id));
}
/** A new workspace owned by the caller. When hosted it must pass the creation gate (lib/v2/creation.ts): the mode,
 *  the caps, the address, the captcha and, in `codes` mode, a creation code spent in the same transaction. `seed`,
 *  when given, fills it in that transaction too (the sample workspace). */
async function createWorkspace(req, p, name, code, seed) {
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
        if (redeemed)
            event("code_redeemed", { ws: id, user: userId, at });
        event("workspace_created", { ws: id, user: userId, props: { kind: seed ? "sample" : "blank" }, at });
        seed?.(id, at);
    });
    return { id, name, role: "owner" };
}
function workspaceDetail(pp) {
    const ws = get("SELECT id, name, created_at, steering FROM v2_workspaces WHERE id = ?", pp.wsId);
    if (!ws)
        throw notFound();
    const members = all("SELECT u.id, u.name, u.email, m.role FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? ORDER BY u.name, u.id", pp.wsId);
    const teams = all("SELECT id, name FROM v2_pods WHERE ws_id = ? ORDER BY name, id", pp.wsId).map((pod) => ({
        ...pod,
        my_role: pp.pods.get(pod.id) ?? null,
        members: all("SELECT u.id, u.name, pm.role FROM v2_pod_members pm JOIN ba_user u ON u.id = pm.user_id WHERE pm.pod_id = ? ORDER BY u.name", pod.id),
    }));
    return { workspace: ws, role: pp.wsRole, me: pp.userId, members, teams };
}
/** PATCH { name?, steering? } (owners): rename the workspace and/or turn steering on or off (lib/v2/steering.ts).
 *  At least one of them; both in one transaction. */
async function updateWorkspace(pp, b) {
    need(pp, "workspace.manage");
    if (b.name === undefined && b.steering === undefined)
        throw badRequest("Send name or steering");
    // A one-line name, cleaned as a device name is: one of only invisible characters or marks is blank (E2E-WEB cycle 13 W8).
    const name = b.name === undefined ? undefined : oneLine(b, "name", 100);
    const at = nowIso();
    const steering = await tx(() => {
        if (name !== undefined) {
            run("UPDATE v2_workspaces SET name = ? WHERE id = ?", name, pp.wsId);
            audit(pp.wsId, pp.userId, "workspace.renamed", pp.wsId, at);
        }
        return b.steering === undefined ? workspaceSteering(pp.wsId) : writeSteering(pp, b.steering, at);
    });
    return { id: pp.wsId, name: get("SELECT name FROM v2_workspaces WHERE id = ?", pp.wsId).name, steering };
}
/** Soft delete (softDeleteWorkspace in lib/v2/core.mts, the one deletion path, shared with account deletion and
 *  `align-admin workspaces delete`): the workspace is unreachable to everyone at once (404 everywhere, devices stop
 *  syncing it, its connected AI apps are revoked). Its owners can restore it for 30 days; then the retention job
 *  purges every row (purgeWorkspace in lib/v2/core.mts). */
async function deleteWorkspace(pp) {
    need(pp, "workspace.manage");
    const at = nowIso();
    await tx(() => softDeleteWorkspace(sql, pp.wsId, pp.userId, at));
}
const restoreUntil = (deletedAt) => new (readDate())(readDate().parse(deletedAt) + RESTORE_DAYS * DAY_MS).toISOString();
/** Deleted workspaces this person owns that can still be restored, newest first. */
function deletedWorkspacesFor(userId) {
    const since = new (readDate())(readDate().now() - RESTORE_DAYS * DAY_MS).toISOString();
    return all("SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.deleted_at IS NOT NULL AND w.deleted_at > ? ORDER BY w.deleted_at DESC", userId, since).map((w) => ({ ...w, restore_until: restoreUntil(w.deleted_at) }));
}
/** A deleted workspace the caller owns and can still restore, else 404 (a live workspace is 409 not_deleted). */
function deletedWorkspaceOwnedBy(userId, wsId) {
    const w = get("SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.id = ?", userId, wsId);
    if (!w)
        throw notFound();
    if (!w.deleted_at)
        throw conflict("not_deleted", "This workspace is not deleted, so there is nothing to restore.");
    if (readDate().parse(restoreUntil(w.deleted_at)) <= readDate().now())
        throw notFound();
    return { id: w.id, name: w.name };
}
/** An owner restores a deleted workspace within its window: everything is as it was, except connected AI apps (revoked
 *  at deletion), and members' devices sync it again. Hosted, it counts toward the caps again, so a restore that would
 *  pass ALIGN_MAX_WORKSPACES or the restorer's ALIGN_MAX_OWNED_WORKSPACES is refused (409 workspace_cap or
 *  owned_workspace_cap). */
async function restoreWorkspace(userId, wsId) {
    const w = deletedWorkspaceOwnedBy(userId, wsId);
    checkRestoreCaps(userId);
    const at = nowIso();
    await tx(() => {
        deletedWorkspaceOwnedBy(userId, wsId);
        checkRestoreCaps(userId);
        run("UPDATE v2_workspaces SET deleted_at = NULL WHERE id = ?", wsId);
        audit(wsId, userId, "workspace.restored", wsId, at);
    });
    return { id: w.id, name: w.name, role: "owner" };
}
// ---- members: role changes, removal, leaving ----
const LAST_OWNER = "A workspace needs at least one owner. Make someone else an owner first.";
const ownerCount = (wsId) => get("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ? AND role = 'owner'", wsId)?.n ?? 0;
const memberRole = (wsId, userId) => get("SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?", wsId, userId)?.role;
/** An owner changes a member's role (their own included, while another owner remains). */
async function setMemberRole(pp, userId, role) {
    need(pp, "workspace.manage");
    if (!memberRole(pp.wsId, userId))
        throw notFound();
    const at = nowIso();
    await tx(() => {
        const current = memberRole(pp.wsId, userId);
        if (!current)
            throw notFound();
        if (current === role)
            return;
        if (current === "owner" && ownerCount(pp.wsId) <= 1)
            throw conflict("last_owner", LAST_OWNER);
        run("UPDATE v2_members SET role = ? WHERE ws_id = ? AND user_id = ?", role, pp.wsId, userId);
        audit(pp.wsId, pp.userId, "member.role_changed", userId, at);
    });
    return { user_id: userId, role };
}
/** An owner removes a member, or anyone (viewers included) leaves by naming themselves. Their team memberships and
 *  device grants for this workspace end (lib/v2/lifecycle.ts); their goals, sessions and history stay, under their name
 *  for 30 days and then as "Former member #n" (lib/v2/retention.ts). `deleteSessions` deletes their shared sessions in
 *  this workspace now (spend already rolled up stays). */
async function removeMember(pp, userId, { deleteSessions = false } = {}) {
    const leaving = userId === pp.userId;
    if (!leaving)
        need(pp, "workspace.manage");
    if (!memberRole(pp.wsId, userId))
        throw notFound();
    const at = nowIso();
    await tx(() => {
        const current = memberRole(pp.wsId, userId);
        if (!current)
            throw notFound();
        if (current === "owner" && ownerCount(pp.wsId) <= 1)
            throw conflict("last_owner", LAST_OWNER);
        onMemberRemoved(pp.wsId, userId);
        run("DELETE FROM v2_members WHERE ws_id = ? AND user_id = ?", pp.wsId, userId);
        noteDeparture(pp.wsId, userId, at);
        audit(pp.wsId, pp.userId, leaving ? "member.left" : "member.removed", userId, at);
        if (deleteSessions && deleteMemberSessions(pp.wsId, userId))
            audit(pp.wsId, pp.userId, "member.sessions_deleted", userId, at);
    });
}
// ---- audit trail (owners only) ----
/** Audit actions written before teams were called teams are shown with the new name. */
const shownAction = (a) => a.replace(/^pod\./, "team.");
function auditTrail(pp) {
    need(pp, "workspace.manage");
    return all(`SELECT a.at, a.actor_id, u.name AS actor_name, a.action, a.object_id FROM v2_audit a LEFT JOIN ba_user u ON u.id = a.actor_id
     WHERE a.ws_id = ? ORDER BY a.seq DESC LIMIT 200`, pp.wsId).map((r) => ({ at: r.at, actor: r.actor_id ? { id: r.actor_id, name: personName(r.actor_id, r.actor_name) } : null, action: shownAction(r.action), object_id: r.object_id }));
}
// ---- invites (shown as a link to copy; Align sends no email) ----
async function createInvite(pp, email, role, team = { id: null, role: null }) {
    need(pp, "workspace.manage");
    if (team.role && !team.id)
        throw badRequest("team_role needs a team_id");
    if (team.id && !get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, team.id))
        throw notFound();
    const teamId = team.id;
    const teamRole = teamId ? (team.role ?? "member") : null;
    if (role === "viewer" && teamRole === "lead")
        throw forbidden("viewer_lead", "A viewer can't lead a team. Invite them as a member of it, or with another workspace role.");
    take(`invite-create:${pp.wsId}`, 50, 60 * 60 * 1000);
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        throw badRequest("Enter an email address");
    if (get("SELECT 1 AS x FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? AND lower(u.email) = ?", pp.wsId, e)) {
        throw conflict("already_member", "That person is already a member.");
    }
    checkMemberCap(pp.wsId, true);
    const token = secretToken(32);
    const id = newId("inv");
    const at = nowIso();
    await tx(() => {
        checkMemberCap(pp.wsId, true);
        run("INSERT INTO v2_invites (id, ws_id, token_hash, email, role, team_id, team_role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, pp.wsId, sha256hex(token), e, role, teamId, teamRole, pp.userId, at, new (readDate())(readDate().now() + INVITE_TTL_MS).toISOString());
        audit(pp.wsId, pp.userId, "invite.created", id, at);
        event("invite_sent", { ws: pp.wsId, user: pp.userId, props: { role }, at });
    });
    return { id, email: e, role, team_id: teamId, team_role: teamRole, path: `/app/invite/${token}`, token };
}
function listInvites(pp) {
    need(pp, "workspace.manage");
    return all(`SELECT i.id, i.email, i.role, i.team_id, p.name AS team_name, i.team_role, i.created_at, i.expires_at, i.accepted_at
     FROM v2_invites i LEFT JOIN v2_pods p ON p.ws_id = i.ws_id AND p.id = i.team_id WHERE i.ws_id = ? ORDER BY i.created_at DESC`, pp.wsId).map(({ team_name, ...i }) => ({ ...i, team: i.team_id ? { id: i.team_id, name: team_name ?? "" } : null }));
}
async function deleteInvite(pp, inviteId) {
    need(pp, "workspace.manage");
    const n = await tx(() => {
        const deleted = run("DELETE FROM v2_invites WHERE ws_id = ? AND id = ? AND accepted_at IS NULL", pp.wsId, inviteId);
        if (deleted)
            audit(pp.wsId, pp.userId, "invite.withdrawn", inviteId, nowIso());
        return deleted;
    });
    if (!n)
        throw notFound();
}
function inviteByToken(token) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw notFound();
    const r = get("SELECT id, ws_id, email, role, team_id, team_role, expires_at, accepted_at FROM v2_invites WHERE token_hash = ?", sha256hex(token));
    if (!r || r.accepted_at || readDate().parse(r.expires_at) <= readDate().now())
        throw notFound();
    if (!get(`SELECT 1 AS x WHERE ${LIVE_WS("?")}`, r.ws_id))
        throw notFound();
    return r;
}
/** The preview also lists, for the invited person only, their paired devices that are not revoked (`devices`: id,
 *  name, last seen), so the accept page can offer to give some of them this workspace (owner decision 2026-11-01). */
function previewInvite(token, user) {
    const r = inviteByToken(token);
    const matches = r.email === user.email.toLowerCase();
    const ws = get("SELECT name FROM v2_workspaces WHERE id = ?", r.ws_id);
    const team = r.team_id ? get("SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?", r.ws_id, r.team_id) : undefined;
    return {
        workspace: { id: r.ws_id, name: ws?.name ?? "" },
        role: r.role,
        team: team ?? null,
        team_role: team ? r.team_role : null,
        email_matches: matches,
        invited_email: r.email,
        devices: matches ? liveDevicesOf(user.id).map((d) => ({ id: d.id, name: d.name, last_seen_at: d.last_seen_at ?? d.created_at })) : [],
    };
}
/** 409 already_member (with workspace_id) when this person already accepted this invite and is still a member: a second
 *  tab's Join says so, instead of a bare 404 (Y1). Anyone else, and an invite they accepted before being removed, gets
 *  the invite's usual 404. */
function alreadyJoinedWith(token, userId) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        return;
    const used = get("SELECT ws_id FROM v2_invites WHERE token_hash = ? AND accepted_at IS NOT NULL AND accepted_by = ?", sha256hex(token), userId);
    if (used && get(`SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND ${LIVE_WS("ws_id")}`, used.ws_id, userId)) {
        throw new V2Error(409, "already_member", "You already joined this workspace with this invite, in another tab or window.", { workspace_id: used.ws_id });
    }
}
/**
 * Join by invite. `deviceIds` are paired devices of the person's own (not revoked) that get this workspace too, in the
 * same transaction: a re-invited person's devices lost it when they were removed, and a pairing grants only the
 * workspaces chosen then (owner decision 2026-11-01). Giving a device a workspace is a device grant, so it needs a
 * recent sign-in (`requireRecent` throws 403 reauth_required); another person's, a revoked or an unknown device is 404,
 * and nothing is joined.
 */
async function acceptInvite(token, user, emailVerified, deviceIds = [], requireRecent = () => undefined) {
    alreadyJoinedWith(token, user.id);
    const r = inviteByToken(token);
    if (r.email !== user.email.toLowerCase())
        throw new V2Error(403, "email_mismatch", "This invite is for a different email address");
    // When hosted, the sign-in method (Google, GitHub or an email code) must have verified the address.
    if (config().hosted && !emailVerified)
        throw new V2Error(403, "email_unverified", "Your sign-in provider has not verified this email address");
    if (deviceIds.length)
        requireRecent();
    const at = nowIso();
    let devices = [];
    await tx(() => {
        if (get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", r.ws_id, user.id))
            throw conflict("already_member", "You are already a member.");
        checkMemberCap(r.ws_id, false);
        run("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", r.ws_id, user.id, r.role, at);
        cancelDeparture(r.ws_id, user.id);
        // An invite that names a team joins that team too (a team removed meanwhile is simply skipped).
        if (r.team_id && get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", r.ws_id, r.team_id)) {
            run("INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)", r.ws_id, r.team_id, user.id, r.team_role ?? "member", at);
        }
        else
            r.team_id = null;
        run("UPDATE v2_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?", at, user.id, r.id);
        audit(r.ws_id, user.id, "invite.accepted", r.id, at);
        devices = addWorkspaceToDevices(user.id, r.ws_id, deviceIds, at);
        event("invite_accepted", { ws: r.ws_id, user: user.id, props: { role: r.role }, at });
        // The workspace's second member (once, however many join or leave later).
        if ((get("SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ?", r.ws_id)?.n ?? 0) >= 2)
            event("second_member_joined", { ws: r.ws_id, user: user.id, at });
    });
    return { workspace_id: r.ws_id, role: r.role, team_id: r.team_id, device_ids: devices };
}
// ---- teams (stored as pods) ----
async function createTeam(pp, name) {
    need(pp, "workspace.manage");
    const id = newId("pod");
    const at = nowIso();
    await tx(() => {
        run("INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)", id, pp.wsId, name, at);
        audit(pp.wsId, pp.userId, "team.created", id, at);
    });
    return { id, name };
}
function teamInWs(wsId, podId) {
    if (!get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", wsId, podId))
        throw notFound();
}
async function setTeamMember(pp, podId, userId, role) {
    teamInWs(pp.wsId, podId);
    need(pp, "pod.manage_members", { kind: "pod", podId });
    // A lead adds and removes members; only a workspace owner makes someone a lead (or changes a lead's role).
    const current = get("SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?", podId, userId);
    if ((role === "lead" || current?.role === "lead") && pp.wsRole !== "owner")
        throw forbidden("owner_only", "Only a workspace owner can make someone a team lead.");
    const member = get("SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?", pp.wsId, userId);
    if (!member)
        throw notFound();
    // A viewer can't change anything, so leading a team would give them nothing; the policy refuses them regardless.
    if (role === "lead" && member.role === "viewer")
        throw forbidden("viewer_lead", "A viewer can't lead a team. Change their workspace role first, or add them as a member.");
    const at = nowIso();
    await tx(() => {
        run("INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (pod_id, user_id) DO UPDATE SET role = excluded.role", pp.wsId, podId, userId, role, at);
        audit(pp.wsId, pp.userId, "team.member_set", podId, at);
    });
    return { team_id: podId, user_id: userId, role };
}
async function removeTeamMember(pp, podId, userId) {
    teamInWs(pp.wsId, podId);
    need(pp, "pod.manage_members", { kind: "pod", podId });
    const current = get("SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?", podId, userId);
    if (current?.role === "lead" && pp.wsRole !== "owner" && userId !== pp.userId)
        throw forbidden("owner_only", "Only a workspace owner can remove a team lead.");
    const n = await tx(() => {
        const deleted = run("DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = ?", pp.wsId, podId, userId);
        if (deleted)
            audit(pp.wsId, pp.userId, "team.member_removed", podId, nowIso());
        return deleted;
    });
    if (!n)
        throw notFound();
}
/** The name to show for a person id in a workspace's rows ("Former member #n" once pseudonymised). */
function memberName(userId) {
    return personName(userId, get("SELECT name FROM ba_user WHERE id = ?", userId)?.name);
}
/** A person as a message to `reader` names them: "you" when they are the reader, so nobody hears their own name in a
 *  refusal or a record ("This request was countered by you", never "… by dave" to dave; c9 W3), else memberName. A
 *  sentence that opens with the person words it for "you" itself ("You declined this request, …"). */
function nameTo(userId, reader) {
    return userId === reader ? "you" : memberName(userId);
}

return {principalIn,memberPrincipal,need,enter,workspacesFor,otherWorkspacesFor,createWorkspace,workspaceDetail,updateWorkspace,deleteWorkspace,deletedWorkspacesFor,deletedWorkspaceOwnedBy,restoreWorkspace,setMemberRole,removeMember,auditTrail,createInvite,listInvites,deleteInvite,previewInvite,acceptInvite,createTeam,setTeamMember,removeTeamMember,memberName,nameTo};
}
module.exports={create_workspaces};
