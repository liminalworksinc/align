"use client";
import { useRef, useState } from "react";
import { api, ApiError, Btn, Err, Field, Input, Note, Shell, SignInAgain, useAction, useApi, type WsSummary } from "../_ui/kit";
import { Panel } from "../_ui/ds";
import type { Me } from "../_ui/server";
import { count } from "@/lib/v2/plural.mts";

interface Pending {
  device_name: string;
  requested_at: string;
  age_seconds: number;
  /** The code this device was looked up by: Approve and Deny act on it, never on what the field holds now (E2E-WEB cycle
   *  10 C10-1). */
  code: string;
}

/** A code as the server reads it (case, spaces and dashes aside), so editing the field to the same code keeps the panel. */
const codeKey = (c: string) => c.toUpperCase().replace(/[^A-Z]/g, "");

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
  /** The code in the field now, and which Look up is the latest: an answer arriving after the field changed to another
   *  code, or after a newer Look up, is dropped, so the panel never opens for a device whose code the field no longer
   *  shows (E2E-WEB cycle 11 C11-1). */
  const field = useRef(code0);
  const lookups = useRef(0);

  const lookup = () =>
    act.run(async () => {
      setDone(null);
      // A device looked up before is not the one this code names: its panel goes, also when this code finds nothing, and
      // so do its ticks, so a workspace ticked for one device is never approved for the next (E2E-WEB cycle 9 C9-2).
      setPending(null);
      setChosen([]);
      const looked = code.trim();
      const mine = ++lookups.current;
      const current = () => mine === lookups.current && codeKey(field.current) === codeKey(looked);
      let found: Omit<Pending, "code">;
      try {
        found = await api<Omit<Pending, "code">>(`/api/v2/device/requests/${encodeURIComponent(looked)}`);
      } catch (e) {
        // A refusal for a code the field no longer holds is not about the code shown: it is dropped too.
        if (!current()) return;
        throw new Error((e as ApiError).status === 404 ? NOT_WAITING : (e as Error).message);
      }
      if (current()) setPending({ ...found, code: looked });
    });

  /** The field changed to another code: the panel and its ticks belong to the device looked up before, so they go, as
   *  a new Look up would clear them (E2E-WEB cycle 10 C10-1); a Look up still on its way for the code before is dropped
   *  when it answers (C11-1). A refusal shown is about the code before ("No device is waiting for that code"), so it
   *  goes too, also when no panel was open (E2E-WEB cycle 12 W1). */
  const edit = (next: string) => {
    const other = codeKey(next) !== codeKey(field.current);
    setCode(next);
    field.current = next;
    if (other) act.setError(null);
    if (pending && codeKey(next) !== codeKey(pending.code)) {
      setPending(null);
      setChosen([]);
      act.setError(null);
    }
  };

  const decide = (approve: boolean) =>
    act.run(async () => {
      // Only the device whose panel is shown: the code it was looked up by.
      const target = pending?.code;
      if (!target) return;
      let out: { device_name?: string; asked_as?: string; same_name?: string[] };
      try {
        out = await api(approve ? "/api/v2/device/approve" : "/api/v2/device/deny", { body: approve ? { user_code: target, workspace_ids: chosen } : { user_code: target } });
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
      setChosen([]);
      setCode("");
      field.current = "";
    });

  return (
    <Shell me={me}>
      <h1 className="mb-5 font-display text-[32px] leading-[1.1] text-(--text-1) max-sm:text-[28px]">Connect a device</h1>
      {stale ? (
        <SignInAgain me={me} next={code.trim() ? `/app/device?code=${encodeURIComponent(code.trim())}` : "/app/device"}>
          Sign in again to approve a device. Approving needs a sign-in from the last 15 minutes.
        </SignInAgain>
      ) : (
        <Panel className="mb-4">
          <Note>Only enter a code that your own terminal just showed you. Approving gives that device access to the workspaces you tick.</Note>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup();
            }}
          >
            <Field label="Code from align login">
              <Input value={code} onChange={(e) => edit(e.target.value.toUpperCase())} placeholder="BCDF-GHJK" maxLength={12} autoComplete="off" required />
            </Field>
            <Btn type="submit" kind="secondary" disabled={act.busy || !code.trim()}>
              Look up
            </Btn>
          </form>
          {pending && (
            <div className="mt-5 rounded-(--radius-m) border border-(--edge) p-4">
              <p className="overflow-hidden text-[17px] text-(--text-1) [overflow-wrap:anywhere]">{pending.device_name}</p>
              <p className="mb-3 text-[14px] text-(--text-3)">Asked {ago(pending.age_seconds)}</p>
              <p className="mb-2 text-[15px] text-(--text-2)">Workspaces this device may use:</p>
              {list.data?.workspaces.map((w) => (
                <label key={w.id} className="mb-1 flex min-h-[44px] items-center gap-2 text-[15px] text-(--text-1)">
                  <input type="checkbox" className="size-4 shrink-0 accent-(--accent-text)" checked={chosen.includes(w.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, w.id] : c.filter((x) => x !== w.id)))} />
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
          {done && (
            <Note>
              <span className="block overflow-hidden [overflow-wrap:anywhere]">{done}</span>
            </Note>
          )}
          <Err>{act.error}</Err>
        </Panel>
      )}
    </Shell>
  );
}
