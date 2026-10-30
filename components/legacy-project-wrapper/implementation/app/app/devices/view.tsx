"use client";
import { api, Btn, Card, Err, Loading, Note, Pill, Shell, useAction, useApi, when } from "../_ui/kit";
import type { Me } from "../_ui/server";

interface Device {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  workspaces: { id: string; name: string }[];
}

export default function Devices({ me }: { me: Me }) {
  const list = useApi<{ devices: Device[] }>("/api/v2/devices");
  const act = useAction();
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Your devices</h1>
      <Card>
        {list.loading && <Loading />}
        <Err>{list.error ?? act.error}</Err>
        {list.data?.devices.length === 0 && <Note>No devices yet. Run align login on your machine to connect one.</Note>}
        <ul className="divide-y divide-zinc-200">
          {list.data?.devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[16px] text-zinc-900">
                  {d.name} {d.revoked_at ? <Pill tone="red">revoked</Pill> : <Pill tone="green">active</Pill>}
                </p>
                <p className="text-[14px] text-zinc-500">
                  Connected {when(d.created_at)}
                  {d.last_seen_at ? `, last seen ${when(d.last_seen_at)}` : ""}
                  {d.workspaces.length ? `. Workspaces: ${d.workspaces.map((w) => w.name).join(", ")}` : ""}
                </p>
              </div>
              {!d.revoked_at && (
                <Btn kind="danger" disabled={act.busy} onClick={() => void act.run(() => api(`/api/v2/devices/${d.id}`, { method: "DELETE" }), list.reload)}>
                  Revoke
                </Btn>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
