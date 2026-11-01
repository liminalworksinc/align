"use client";
import { useState } from "react";
import { api, go, Btn, Card, Err, Loading, Note, Shell, SignInAgain, useAction, useApi, when } from "../../_ui/kit";
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
export default function InviteAccept({ me, token, recent }: { me: Me; token: string; recent: boolean }) {
  const p = useApi<Preview>(`/api/v2/invites/${encodeURIComponent(token)}`);
  const act = useAction();
  const [chosen, setChosen] = useState<string[]>([]);
  const here = `/app/invite/${token}`;
  if (act.reauth) {
    return (
      <Shell me={me}>
        <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Workspace invite</h1>
        <SignInAgain me={me} next={here}>
          {act.reauth} You have not joined yet.
        </SignInAgain>
      </Shell>
    );
  }
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Workspace invite</h1>
      <Card>
        {p.loading && <Loading />}
        {p.error && <Err>This invite link is not valid. It may have been used, withdrawn or expired.</Err>}
        {p.data && (
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
                {p.data.devices.length > 0 && (
                  <fieldset className="mb-4 rounded-[12px] border border-zinc-300 p-4">
                    <legend className="px-1 text-[15px] text-zinc-700">Your paired devices</legend>
                    <p className="mb-2 text-[15px] text-zinc-600">
                      Tick the devices that should reach {p.data.workspace.name} too. Each one picks it up the next time it syncs, without signing in again; its other workspaces stay as they are.
                    </p>
                    {!recent && (
                      <Note>
                        Giving a device this workspace needs a sign-in from the last 15 minutes.{" "}
                        <button type="button" className="underline" onClick={() => act.setReauth("Sign in again to give a device this workspace. This needs a sign-in from the last 15 minutes.")}>
                          Sign in again
                        </button>{" "}
                        to choose devices, or join without them.
                      </Note>
                    )}
                    {p.data.devices.map((d) => (
                      <label key={d.id} className="mb-1 flex items-center gap-2 text-[15px]">
                        <input
                          type="checkbox"
                          disabled={!recent}
                          checked={chosen.includes(d.id)}
                          onChange={(e) => setChosen((c) => (e.target.checked ? [...c, d.id] : c.filter((x) => x !== d.id)))}
                        />
                        <span>
                          {d.name} <span className="text-zinc-500">(last seen {when(d.last_seen_at)})</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <Btn
                  disabled={act.busy}
                  onClick={() =>
                    void act.run(async () => {
                      const r = await api<{ workspace_id: string }>(`/api/v2/invites/${encodeURIComponent(token)}/accept`, { body: chosen.length ? { device_ids: chosen } : {} });
                      go(`/app/w/${r.workspace_id}`);
                    })
                  }
                >
                  {chosen.length ? `Join workspace and give it to ${chosen.length === 1 ? "this device" : `these ${chosen.length} devices`}` : "Join workspace"}
                </Btn>
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
