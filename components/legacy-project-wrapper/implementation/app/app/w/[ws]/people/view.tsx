"use client";
import { useState } from "react";
import { api, go, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, SignInAgain, useAction, useApi, when } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import type { WsDetail } from "../../../_ui/types";

type WsRole = "owner" | "member" | "viewer";
type TeamRole = "lead" | "member";

interface Invite {
  id: string;
  email: string;
  role: string;
  team: { id: string; name: string } | null;
  team_role: TeamRole | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

const ROLE_LABEL: Record<WsRole, string> = { owner: "Owner", member: "Member", viewer: "Viewer" };

/** One team: its members and, for a workspace owner or the team's lead, the controls they may use. Only a workspace
 *  owner makes someone a lead, changes a lead's role or removes another lead. */
function TeamMembers({ ws, team, members, owner, me, onDone }: { ws: string; team: WsDetail["teams"][number]; members: WsDetail["members"]; owner: boolean; me: string; onDone: () => void }) {
  const [user, setUser] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const act = useAction();
  const lead = team.my_role === "lead";
  const canManage = owner || lead;
  const outside = members.filter((m) => !team.members.some((x) => x.id === m.id));
  const base = `/api/v2/workspaces/${ws}/teams/${team.id}/members`;
  return (
    <div className="mb-4 rounded-[12px] border border-zinc-200 p-4">
      <p className="mb-2 text-[16px] text-zinc-900">
        {team.name} {team.my_role && <Pill tone="violet">you: {team.my_role}</Pill>}
      </p>
      {team.members.length === 0 && <p className="text-[14px] text-zinc-500">No members yet.</p>}
      <ul className="mb-2 text-[15px]">
        {team.members.map((m) => {
          const controls = owner || (lead && m.role !== "lead");
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2 py-1">
              {m.name}
              {owner ? (
                <span className="w-[120px]">
                  <Select aria-label={`Team role for ${m.name}`} value={m.role} onChange={(e) => void act.run(() => api(base, { body: { user_id: m.id, role: e.target.value } }), onDone)}>
                    <option value="member">Member</option>
                    <option value="lead">Lead</option>
                  </Select>
                </span>
              ) : (
                <Pill>{m.role}</Pill>
              )}
              {(controls || (lead && m.id === me)) && (
                <button type="button" className="ml-auto text-[14px] text-red-700" onClick={() => void act.run(() => api(`${base}/${m.id}`, { method: "DELETE" }), onDone)}>
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && outside.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Select aria-label="Person" value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">Add someone</option>
              {outside.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[140px]">
            <Select aria-label="Team role" value={owner ? role : "member"} onChange={(e) => setRole(e.target.value as TeamRole)}>
              <option value="member">Member</option>
              {owner && <option value="lead">Lead</option>}
            </Select>
          </div>
          <Btn kind="secondary" disabled={!user || act.busy} onClick={() => void act.run(() => api(base, { body: { user_id: user, role: owner ? role : "member" } }), () => {
                  setUser("");
                  onDone();
                })}>
            Add
          </Btn>
        </div>
      )}
      <Err>{act.error}</Err>
    </div>
  );
}

export default function People({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const owner = d.data?.role === "owner";
  const invites = useApi<{ invites: Invite[] }>(owner ? `/api/v2/workspaces/${ws}/invites` : null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WsRole>("member");
  const [inviteTeam, setInviteTeam] = useState("");
  const [inviteTeamRole, setInviteTeamRole] = useState<TeamRole>("member");
  const [link, setLink] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [dropSessions, setDropSessions] = useState(false);
  const act = useAction();
  // Deleting the workspace has its own action, so its "Sign in again" shows next to the card, at the foot of the page.
  const del = useAction();
  const wsName = d.data?.workspace.name ?? "this workspace";
  const teamsOf = (userId: string) => d.data?.teams.filter((t) => t.members.some((m) => m.id === userId)) ?? [];

  return (
    <Shell me={me} ws={ws} tab="People">
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">People</h1>
      {/* Role changes, removing someone (the remove panel stays open) and owner invites need a sign-in from the last 15
          minutes. */}
      {act.reauth && (
        <SignInAgain me={me} next={`/app/w/${ws}/people`}>
          {act.reauth}
        </SignInAgain>
      )}
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          <Card
            title="Members"
            actions={
              <Btn
                kind="danger"
                disabled={act.busy}
                onClick={() => {
                  if (window.confirm(`Leave ${wsName}? You lose access to it. Your goals, sessions and history stay.`)) {
                    void act.run(() => api(`/api/v2/workspaces/${ws}/members/${me.id}`, { method: "DELETE" }), () => go("/app"));
                  }
                }}
              >
                Leave workspace
              </Btn>
            }
          >
            <ul className="divide-y divide-zinc-200">
              {d.data.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-[15px]">
                  <span className="text-zinc-900">{m.name}</span>
                  <span className="text-zinc-500">{m.email}</span>
                  {owner ? (
                    <span className="w-[130px]">
                      <Select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => void act.run(() => api(`/api/v2/workspaces/${ws}/members/${m.id}`, { body: { role: e.target.value } }), d.reload)}>
                        {(Object.keys(ROLE_LABEL) as WsRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </span>
                  ) : (
                    <Pill>{m.role}</Pill>
                  )}
                  {teamsOf(m.id).map((t) => (
                    <Pill key={t.id} tone="violet">
                      {t.name}
                    </Pill>
                  ))}
                  {m.id === me.id && <span className="text-zinc-500">(you)</span>}
                  {owner && m.id !== me.id && removing !== m.id && (
                    <button
                      type="button"
                      className="ml-auto text-[14px] text-red-700"
                      onClick={() => {
                        setRemoving(m.id);
                        setDropSessions(false);
                      }}
                    >
                      Remove
                    </button>
                  )}
                  {removing === m.id && (
                    <div className="mt-2 w-full rounded-[10px] border border-red-200 bg-red-50 p-3" role="group" aria-label={`Remove ${m.name}`}>
                      <p className="mb-2 text-[15px] text-zinc-800">
                        Remove {m.name} from {wsName}? Their team places, device access and connected apps for this workspace end. Their goals, sessions and history stay, under their name for 30 days and then as &quot;Former member&quot;.
                      </p>
                      <label className="mb-3 flex items-center gap-2 text-[15px] text-zinc-800">
                        <input type="checkbox" checked={dropSessions} onChange={(e) => setDropSessions(e.target.checked)} />
                        Also delete their shared sessions in this workspace now
                      </label>
                      <div className="flex gap-2">
                        <Btn
                          kind="danger"
                          disabled={act.busy}
                          onClick={() =>
                            void act.run(() => api(`/api/v2/workspaces/${ws}/members/${m.id}${dropSessions ? "?delete_sessions=1" : ""}`, { method: "DELETE" }), () => {
                              setRemoving(null);
                              d.reload();
                            })
                          }
                        >
                          Remove {m.name}
                        </Btn>
                        <Btn kind="secondary" onClick={() => setRemoving(null)}>
                          Cancel
                        </Btn>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Err>{act.error}</Err>
          </Card>
          {owner && (
            <Card title="Invite someone">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(async () => {
                    const body = { email, role, team_id: inviteTeam || null, team_role: inviteTeam ? inviteTeamRole : null };
                    const r = await api<{ path: string }>(`/api/v2/workspaces/${ws}/invites`, { body });
                    setLink(`${window.location.origin}${r.path}`);
                    setEmail("");
                    invites.reload();
                  });
                }}
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                  <Field label="Email">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </Field>
                  <Field label="Role">
                    <Select value={role} onChange={(e) => setRole(e.target.value as WsRole)}>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer (read only)</option>
                      <option value="owner">Owner</option>
                    </Select>
                  </Field>
                </div>
                {d.data.teams.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <Field label="Team (optional)">
                      <Select value={inviteTeam} onChange={(e) => setInviteTeam(e.target.value)}>
                        <option value="">No team</option>
                        {d.data.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Team role">
                      <Select value={inviteTeamRole} disabled={!inviteTeam} onChange={(e) => setInviteTeamRole(e.target.value as TeamRole)}>
                        <option value="member">Member</option>
                        <option value="lead">Lead</option>
                      </Select>
                    </Field>
                  </div>
                )}
                <Btn type="submit" disabled={act.busy}>
                  Create invite link
                </Btn>
              </form>
              {link && (
                <Note>
                  Send this link to them yourself. It works once, for that email address, for 7 days: <code className="break-all font-mono text-zinc-900">{link}</code>
                </Note>
              )}
              {invites.data && invites.data.invites.length > 0 && (
                <ul className="mt-3 text-[14px] text-zinc-600">
                  {invites.data.invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 py-1">
                      {i.email} <Pill>{i.role}</Pill>
                      {i.team && (
                        <Pill tone="violet">
                          {i.team.name}
                          {i.team_role === "lead" ? " (lead)" : ""}
                        </Pill>
                      )}{" "}
                      {i.accepted_at ? `joined ${when(i.accepted_at)}` : `expires ${when(i.expires_at)}`}
                      {!i.accepted_at && (
                        <button type="button" className="ml-auto text-red-700" onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/invites/${i.id}`, { method: "DELETE" }), invites.reload)}>
                          Withdraw
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card title="Teams">
            {d.data.teams.length === 0 && <Note>No teams yet.{owner ? " Teams group people; members can bind their sessions to the team's goals." : ""}</Note>}
            {d.data.teams.map((t) => (
              <TeamMembers key={t.id} ws={ws} team={t} members={d.data!.members} owner={owner} me={me.id} onDone={d.reload} />
            ))}
            {owner && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(() => api(`/api/v2/workspaces/${ws}/teams`, { body: { name: teamName } }), () => {
                    setTeamName("");
                    d.reload();
                  });
                }}
              >
                <div className="min-w-[240px] flex-1">
                  <Field label="New team">
                    <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={100} required />
                  </Field>
                </div>
                <div className="mb-3">
                  <Btn type="submit" kind="secondary" disabled={act.busy || !teamName.trim()}>
                    Create team
                  </Btn>
                </div>
              </form>
            )}
          </Card>
          {owner && del.reauth && (
            <SignInAgain me={me} next={`/app/w/${ws}/people`}>
              {del.reauth}
            </SignInAgain>
          )}
          {owner && (
            <Card title="Delete this workspace">
              <p className="mb-3 text-[15px] text-zinc-600">
                Deleting {wsName} closes it for everyone at once: members lose access, devices stop syncing it and connected apps are disconnected. Owners can restore it from Your workspaces for 30 days; after that everything in it is erased.
              </p>
              <Btn
                kind="danger"
                disabled={del.busy}
                onClick={() => {
                  if (window.confirm(`Delete ${wsName}? Everyone loses access now. Owners can restore it for 30 days, then it is erased.`)) {
                    void del.run(() => api(`/api/v2/workspaces/${ws}`, { method: "DELETE" }), () => go("/app"));
                  }
                }}
              >
                Delete workspace
              </Btn>
              <Err>{del.error}</Err>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}
