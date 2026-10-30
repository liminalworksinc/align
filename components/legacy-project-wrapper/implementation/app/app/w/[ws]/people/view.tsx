"use client";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, Shell, useAction, useApi, when } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import type { WsDetail } from "../../../_ui/types";

interface Invite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

function PodMembers({ ws, pod, members, canManage, onDone }: { ws: string; pod: WsDetail["pods"][number]; members: WsDetail["members"]; canManage: boolean; onDone: () => void }) {
  const [user, setUser] = useState("");
  const [role, setRole] = useState<"lead" | "member">("member");
  const act = useAction();
  const outside = members.filter((m) => !pod.members.some((x) => x.id === m.id));
  return (
    <div className="mb-4 rounded-[12px] border border-zinc-200 p-4">
      <p className="mb-2 text-[16px] text-zinc-900">
        {pod.name} {pod.my_role && <Pill tone="violet">you: {pod.my_role}</Pill>}
      </p>
      {pod.members.length === 0 && <p className="text-[14px] text-zinc-500">No members yet.</p>}
      <ul className="mb-2 text-[15px]">
        {pod.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 py-1">
            {m.name} <Pill>{m.role}</Pill>
            {canManage && (
              <button type="button" className="ml-auto text-[14px] text-red-700" onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/pods/${pod.id}/members/${m.id}`, { method: "DELETE" }), onDone)}>
                Remove
              </button>
            )}
          </li>
        ))}
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
            <Select aria-label="Pod role" value={role} onChange={(e) => setRole(e.target.value as "lead" | "member")}>
              <option value="member">Member</option>
              <option value="lead">Lead</option>
            </Select>
          </div>
          <Btn kind="secondary" disabled={!user || act.busy} onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/pods/${pod.id}/members`, { body: { user_id: user, role } }), onDone)}>
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
  const [role, setRole] = useState<"member" | "viewer" | "owner">("member");
  const [link, setLink] = useState<string | null>(null);
  const [podName, setPodName] = useState("");
  const act = useAction();

  return (
    <Shell me={me} ws={ws} tab="People">
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">People</h1>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          <Card title="Members">
            <ul className="divide-y divide-zinc-200">
              {d.data.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-[15px]">
                  <span className="text-zinc-900">{m.name}</span>
                  <span className="text-zinc-500">{m.email}</span>
                  <Pill>{m.role}</Pill>
                  {m.id === me.id && <span className="text-zinc-500">(you)</span>}
                </li>
              ))}
            </ul>
          </Card>
          {owner && (
            <Card title="Invite someone">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(async () => {
                    const r = await api<{ path: string }>(`/api/v2/workspaces/${ws}/invites`, { body: { email, role } });
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
                    <Select value={role} onChange={(e) => setRole(e.target.value as "member" | "viewer" | "owner")}>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer (read only)</option>
                      <option value="owner">Owner</option>
                    </Select>
                  </Field>
                </div>
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
                      {i.email} <Pill>{i.role}</Pill> {i.accepted_at ? `joined ${when(i.accepted_at)}` : `expires ${when(i.expires_at)}`}
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
          <Card title="Pods">
            {d.data.pods.length === 0 && <Note>No pods yet.{owner ? " Pods group people; members can bind their sessions to the pod's goals." : ""}</Note>}
            {d.data.pods.map((p) => (
              <PodMembers key={p.id} ws={ws} pod={p} members={d.data!.members} canManage={owner || p.my_role === "lead"} onDone={d.reload} />
            ))}
            {owner && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act.run(() => api(`/api/v2/workspaces/${ws}/pods`, { body: { name: podName } }), () => {
                    setPodName("");
                    d.reload();
                  });
                }}
              >
                <div className="min-w-[240px] flex-1">
                  <Field label="New pod">
                    <Input value={podName} onChange={(e) => setPodName(e.target.value)} maxLength={100} required />
                  </Field>
                </div>
                <div className="mb-3">
                  <Btn type="submit" kind="secondary" disabled={act.busy || !podName.trim()}>
                    Create pod
                  </Btn>
                </div>
              </form>
            )}
          </Card>
          <Err>{act.error}</Err>
        </>
      )}
    </Shell>
  );
}
