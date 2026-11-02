"use client";
import { useState } from "react";
import { api, ApiError, Btn, Card, Err, Field, Input, Note, Shell, SignInAgain, useAction, useApi, type WsSummary } from "../_ui/kit";
import type { Me } from "../_ui/server";
import { count } from "@/lib/v2/plural.mts";

interface Pending {
  device_name: string;
  requested_at: string;
  age_seconds: number;
}

/** “a”, “a” and “b”, “a”, “b” and “c”. */
const quoted = (names: string[]) => {
  const q = names.map((n) => `“${n}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}` : q[0];
};

/** What an approval says (W4): the device's name as it is stored, decided at approval. When one of the person's devices
 *  already had the name it asked for, it is "<name> (n)", and the page says why, naming the person's devices of that
 *  name (`same_name`): a new align login on one of those machines keeps that machine's name instead (its token poll
 *  names the device it replaces), so the page never promises a name the device does not get (C8-3). With none of them
 *  live, another pairing approved a moment ago holds the name. */
function connectedLine(asked: string, name: string, same: string[]): string {
  if (name === asked) return `${name} is connected. You can close this page.`;
  const lead = `${asked} is connected as “${name}”`;
  if (!same.length) return `${lead}: another device you approved a moment ago has the name “${asked}”. You can close this page.`;
  if (same.length === 1) return `${lead}: you already have a device named ${quoted(same)}. If this is a new align login on that same machine, it keeps that device's name instead. You can close this page.`;
  return `${lead}: you already have devices named ${quoted(same)}. If this is a new align login on one of those machines, it keeps that machine's name instead. You can close this page.`;
}

/** The refusal for a code nobody is waiting on any more (approved or denied in another tab, or expired). */
const NOT_WAITING = "No device is waiting for that code. Check it, or run align login again.";

/** How long ago the device asked, with the count-and-noun helper (C6-4: never "1 minutes ago"). */
const ago = (s: number) => `${s < 60 ? count(s, "second") : count(Math.round(s / 60), "minute")} ago`;

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
      // A device looked up before is not the one this code names: its panel goes, also when this code finds nothing.
      setPending(null);
      setPending(
        await api<Pending>(`/api/v2/device/requests/${encodeURIComponent(code.trim())}`).catch((e) => {
          throw new Error(e.status === 404 ? NOT_WAITING : e.message);
        }),
      );
    });

  const decide = (approve: boolean) =>
    act.run(async () => {
      let out: { device_name?: string; asked_as?: string; same_name?: string[] };
      try {
        out = await api(approve ? "/api/v2/device/approve" : "/api/v2/device/deny", { body: approve ? { user_code: code.trim(), workspace_ids: chosen } : { user_code: code.trim() } });
      } catch (e) {
        // The sign-in aged past 15 minutes while the page was open: nothing was approved.
        if (e instanceof ApiError && e.code === "reauth_required") {
          setStale(true);
          return;
        }
        // Nobody is waiting on the code any more (approved or denied in another tab, or expired): the device's panel
        // closes, as after an approval, and only the refusal stays (E2E-WEB cycle 8 W1).
        if (e instanceof ApiError && e.status === 404 && e.message === NOT_WAITING) {
          setPending(null);
          setChosen([]);
          throw e;
        }
        // A ticked workspace that is no longer theirs (deleted or left in another tab): the list is read again and the
        // ticks it no longer offers are cleared; the server's message says what happened.
        if (e instanceof ApiError && e.status === 404) {
          const now = await api<{ workspaces: WsSummary[] }>("/api/v2/workspaces").catch(() => null);
          list.reload();
          if (now) setChosen((c) => c.filter((id) => now.workspaces.some((w) => w.id === id)));
        }
        throw e;
      }
      const asked = out.asked_as ?? pending?.device_name ?? "The device";
      setDone(approve ? connectedLine(asked, out.device_name ?? asked, Array.isArray(out.same_name) ? out.same_name : []) : "Denied. That device was not connected.");
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
