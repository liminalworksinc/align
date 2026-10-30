"use client";
import { useState } from "react";
import { api, ApiError, Btn, Card, Err, Field, Input, Note, Shell, SignInAgain, useAction, useApi, type WsSummary } from "../_ui/kit";
import type { Me } from "../_ui/server";

interface Pending {
  device_name: string;
  requested_at: string;
  age_seconds: number;
}

const ago = (s: number) => (s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} minutes ago`);

export default function DeviceApprove({ me, code: code0, recent }: { me: Me; code: string; recent: boolean }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const [code, setCode] = useState(code0);
  const [stale, setStale] = useState(!recent);
  const [pending, setPending] = useState<Pending | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const act = useAction();

  const lookup = () =>
    act.run(async () => {
      setDone(null);
      setPending(
        await api<Pending>(`/api/v2/device/requests/${encodeURIComponent(code.trim())}`).catch((e) => {
          throw new Error(e.status === 404 ? "No device is waiting for that code. Check it, or run align login again." : e.message);
        }),
      );
    });

  const decide = (approve: boolean) =>
    act.run(async () => {
      try {
        await api(approve ? "/api/v2/device/approve" : "/api/v2/device/deny", { body: approve ? { user_code: code.trim(), workspace_ids: chosen } : { user_code: code.trim() } });
      } catch (e) {
        // The sign-in aged past 15 minutes while the page was open: nothing was approved.
        if (e instanceof ApiError && e.code === "reauth_required") {
          setStale(true);
          return;
        }
        throw e;
      }
      setDone(approve ? `${pending?.device_name} is connected. You can close this page.` : "Denied. That device was not connected.");
      setPending(null);
      setCode("");
    });

  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Connect a device</h1>
      {stale ? (
        <SignInAgain me={me} next={code.trim() ? `/app/device?code=${encodeURIComponent(code.trim())}` : "/app/device"}>
          Sign in again to approve a device. Approving needs a sign-in from the last 15 minutes.
        </SignInAgain>
      ) : (
        <Card>
          <Note>Only enter a code that your own terminal just showed you. Approving gives that device access to the workspaces you tick.</Note>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup();
            }}
          >
            <Field label="Code from align login">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BCDF-GHJK" maxLength={12} autoComplete="off" required />
            </Field>
            <Btn type="submit" kind="secondary" disabled={act.busy || !code.trim()}>
              Look up
            </Btn>
          </form>
          {pending && (
            <div className="mt-5 rounded-[12px] border border-zinc-300 p-4">
              <p className="text-[17px] text-zinc-900">{pending.device_name}</p>
              <p className="mb-3 text-[14px] text-zinc-500">Asked {ago(pending.age_seconds)}</p>
              <p className="mb-2 text-[15px] text-zinc-600">Workspaces this device may use:</p>
              {list.data?.workspaces.map((w) => (
                <label key={w.id} className="mb-1 flex items-center gap-2 text-[15px]">
                  <input type="checkbox" checked={chosen.includes(w.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, w.id] : c.filter((x) => x !== w.id)))} />
                  {w.name}
                </label>
              ))}
              {list.data?.workspaces.length === 0 && <Note>You are not in any workspace yet, so there is nothing to grant.</Note>}
              <div className="mt-3 flex gap-2">
                <Btn onClick={() => void decide(true)} disabled={act.busy || chosen.length === 0}>
                  Approve
                </Btn>
                <Btn kind="danger" onClick={() => void decide(false)} disabled={act.busy}>
                  Deny
                </Btn>
              </div>
            </div>
          )}
          {done && <Note>{done}</Note>}
          <Err>{act.error}</Err>
        </Card>
      )}
    </Shell>
  );
}
