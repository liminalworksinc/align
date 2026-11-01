"use client";
import { useState } from "react";
import { api, Btn, Card, Err, Loading, Note, Pill, Select, Shell, SignInAgain, useAction, useApi, when, type WsSummary } from "../_ui/kit";
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

/** A device as `align login` names it: `dv_…` and the last 6 characters of its id, so two devices of one name are told
 *  apart (E2E cycle 5). */
const tag = (id: string) => `dv_…${id.slice(-6)}`;

export default function Devices({ me }: { me: Me }) {
  const list = useApi<{ devices: Device[] }>("/api/v2/devices");
  const mine = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const act = useAction();
  const [pick, setPick] = useState<Record<string, string>>({});
  if (act.reauth) {
    return (
      <Shell me={me}>
        <SignInAgain me={me} next="/app/devices">
          {act.reauth}
        </SignInAgain>
      </Shell>
    );
  }
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Your devices</h1>
      <Card>
        {list.loading && <Loading />}
        <Err>{list.error ?? act.error}</Err>
        {list.data?.devices.length === 0 && <Note>No devices yet. Run align login on your machine to connect one.</Note>}
        <ul className="divide-y divide-zinc-200">
          {list.data?.devices.map((d) => {
            // Workspaces I am a member of that this device does not reach: one can be given to it here, as when
            // accepting an invite with the device ticked (ADR 0003 section 6).
            const missing = d.revoked_at ? [] : (mine.data?.workspaces ?? []).filter((w) => !d.workspaces.some((x) => x.id === w.id));
            const chosen = pick[d.id] ?? missing[0]?.id ?? "";
            return (
              <li key={d.id} data-device={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] text-zinc-900">
                    {d.name} {d.revoked_at ? <Pill tone="red">revoked</Pill> : <Pill tone="green">active</Pill>}
                  </p>
                  <p className="text-[14px] text-zinc-500">
                    <span className="font-mono">{tag(d.id)}</span>. Connected {when(d.created_at)}
                    {d.last_seen_at ? `, last seen ${when(d.last_seen_at)}` : ""}
                    {d.workspaces.length ? `. Workspaces: ${d.workspaces.map((w) => w.name).join(", ")}` : ""}
                  </p>
                  {missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="min-w-[12rem]">
                        <Select aria-label={`Workspace to give ${d.name}`} value={chosen} onChange={(e) => setPick((p) => ({ ...p, [d.id]: e.target.value }))}>
                          {missing.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Btn
                        kind="secondary"
                        disabled={act.busy || !chosen}
                        onClick={() => void act.run(() => api(`/api/v2/devices/${d.id}/workspaces`, { body: { workspace_id: chosen } }), list.reload)}
                      >
                        Give this device the workspace
                      </Btn>
                    </div>
                  )}
                </div>
                {!d.revoked_at && (
                  <Btn kind="danger" disabled={act.busy} onClick={() => void act.run(() => api(`/api/v2/devices/${d.id}`, { method: "DELETE" }), list.reload)}>
                    Revoke
                  </Btn>
                )}
              </li>
            );
          })}
        </ul>
        {list.data?.devices.some((d) => !d.revoked_at) && (
          <Note>A device reaches only the workspaces it was given. Giving one a workspace here needs a sign-in from the last 15 minutes; the device picks it up at its next sync.</Note>
        )}
      </Card>
    </Shell>
  );
}
