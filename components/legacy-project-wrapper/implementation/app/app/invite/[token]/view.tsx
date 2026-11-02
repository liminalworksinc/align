"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError, go, Btn, Card, Err, Loading, Note, Shell, signInAgain, useAction, useApi, when } from "../../_ui/kit";
import type { Me } from "../../_ui/server";

interface Preview {
  workspace: { id: string; name: string };
  role: string;
  team: { id: string; name: string } | null;
  team_role: string | null;
  email_matches: boolean;
  invited_email: string;
  /** My paired devices that are not revoked (only when the invite is mine). */
  devices: { id: string; name: string; last_seen_at: string }[];
}

// The owner decision of 2026-11-01: someone joining (or rejoining after being removed) picks which of their paired
// devices get this workspace. Nothing is ticked for them; ticking needs a recent sign-in, like any device grant.
// "Sign in again" goes straight to the sign-in page and back here, and a 403 reauth_required on Join says so in place,
// unticking the devices, so Join (without them) stays on the page (Y2). A refusal says what happened: a ticked device
// signed out meanwhile (the list is read again), the invite gone, or already joined in another tab (Y1). Once the invite
// is known to be gone the page shows only that (C6-5); joined in another tab, it says the devices ticked here were not
// given the workspace and where to give it to them (Z6).
const GONE = "This invite can't be used any more: it was withdrawn, it expired, or it was already used. You have not joined. Ask a workspace owner for a new invite if you should be in it.";

export default function InviteAccept({ me, token, recent }: { me: Me; token: string; recent: boolean }) {
  const previewPath = `/api/v2/invites/${encodeURIComponent(token)}`;
  const p = useApi<Preview>(previewPath);
  const act = useAction();
  const [chosen, setChosen] = useState<string[]>([]);
  /** Joined in another tab: how many devices were ticked here (none of them was given the workspace). */
  const [joined, setJoined] = useState<{ ticked: number } | null>(null);
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const here = `/app/invite/${token}`;
  // Devices can be ticked only with a sign-in the server still takes as recent.
  const fresh = recent && !act.reauth;
  const again = () => {
    setLeaving(true);
    void signInAgain(here, me.email);
  };
  const join = () =>
    void act.run(async () => {
      try {
        const r = await api<{ workspace_id: string }>(`${previewPath}/accept`, { body: chosen.length ? { device_ids: chosen } : {} });
        go(`/app/w/${r.workspace_id}`);
      } catch (e) {
        if (e instanceof ApiError && e.code === "reauth_required") setChosen([]);
        if (e instanceof ApiError && e.code === "already_member") {
          setJoined({ ticked: chosen.length });
          setChosen([]);
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          // The invite is still there, so a ticked device was the refusal (signed out meanwhile): list them again.
          const still = await api<Preview>(previewPath).catch(() => null);
          setChosen([]);
          if (still && chosen.length) {
            p.reload();
            throw new Error(`${e.message} Your devices are listed again: choose again, or join without them.`);
          }
          // The invite itself is gone: only that is shown, with no invite text and no Join (C6-5).
          setGone(true);
          return;
        }
        throw e;
      }
    });
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Workspace invite</h1>
      <Card>
        {p.loading && <Loading />}
        {gone && <Err>{GONE}</Err>}
        {p.error && !gone && <Err>This invite link is not valid. It may have been used, withdrawn or expired.</Err>}
        {p.data && !gone && (
          <>
            <p className="mb-3 text-[16px] text-zinc-700">
              {p.data.email_matches ? "You are" : `${p.data.invited_email} is`} invited to <strong className="text-zinc-900">{p.data.workspace.name}</strong> as {p.data.role}
              {p.data.team ? (
                <>
                  {" "}
                  and to the team <strong className="text-zinc-900">{p.data.team.name}</strong> as {p.data.team_role ?? "member"}.
                </>
              ) : (
                "."
              )}
            </p>
            {p.data.email_matches ? (
              <>
                {p.data.devices.length > 0 && !joined && (
                  <fieldset className="mb-4 rounded-[12px] border border-zinc-300 p-4">
                    <legend className="px-1 text-[15px] text-zinc-700">Your paired devices</legend>
                    <p className="mb-2 text-[15px] text-zinc-600">
                      Tick the devices that should reach {p.data.workspace.name} too. Each one picks it up the next time it syncs, without signing in again; its other workspaces stay as they are.
                    </p>
                    {!fresh && (
                      <Note>
                        {act.reauth ? `${act.reauth} You have not joined yet.` : "Giving a device this workspace needs a sign-in from the last 15 minutes."}{" "}
                        <button type="button" className="underline disabled:opacity-50" disabled={leaving} onClick={again} data-sign-in-again>
                          Sign in again
                        </button>{" "}
                        to choose devices, or join without them.
                      </Note>
                    )}
                    {p.data.devices.map((d) => (
                      <label key={d.id} className="mb-1 flex items-center gap-2 text-[15px]">
                        <input
                          type="checkbox"
                          disabled={!fresh}
                          checked={chosen.includes(d.id)}
                          onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.id] : c.filter((x) => x !== d.id)))}
                        />
                        <span className="min-w-0 overflow-hidden [overflow-wrap:anywhere]">
                          {d.name} <span className="text-zinc-500">(last seen {when(d.last_seen_at)})</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {joined ? (
                  <Note>
                    You already joined {p.data.workspace.name}, in another tab or window.{" "}
                    {joined.ticked > 0 && (
                      <span data-devices-not-given>
                        {joined.ticked === 1 ? "The device you ticked was" : `The ${joined.ticked} devices you ticked were`} not given {p.data.workspace.name}: give it to{" "}
                        {joined.ticked === 1 ? "that device" : "them"} on your{" "}
                        <Link href="/app/devices" className="underline">
                          Devices page
                        </Link>
                        .{" "}
                      </span>
                    )}
                    <Link href={`/app/w/${p.data.workspace.id}`} className="underline">
                      Open {p.data.workspace.name}
                    </Link>
                  </Note>
                ) : (
                  <Btn disabled={act.busy || leaving} onClick={join}>
                    {chosen.length ? `Join workspace and give it to ${chosen.length === 1 ? "this device" : `these ${chosen.length} devices`}` : "Join workspace"}
                  </Btn>
                )}
              </>
            ) : (
              <>
                <Note>
                  This invite is for {p.data.invited_email}. You are signed in as {me.email}. Sign in with the invited address to join.
                </Note>
                {/* Not a dead end (U11): sign out, then the sign-in page opens with the invited address filled in and comes back here. */}
                <Btn
                  disabled={act.busy}
                  onClick={() =>
                    void act.run(async () => {
                      await fetch("/api/v2/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
                      go(`/app/sign-in?${new URLSearchParams({ next: `/app/invite/${token}`, email: p.data!.invited_email })}`);
                    })
                  }
                >
                  Sign out and use {p.data.invited_email}
                </Btn>
              </>
            )}
          </>
        )}
        <Err>{act.error}</Err>
      </Card>
    </Shell>
  );
}
