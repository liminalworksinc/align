"use client";
import { api, go, Btn, Card, Err, Loading, Note, Shell, useAction, useApi } from "../../_ui/kit";
import type { Me } from "../../_ui/server";

interface Preview {
  workspace: { id: string; name: string };
  role: string;
  team: { id: string; name: string } | null;
  team_role: string | null;
  email_matches: boolean;
  invited_email: string;
}

export default function InviteAccept({ me, token }: { me: Me; token: string }) {
  const p = useApi<Preview>(`/api/v2/invites/${encodeURIComponent(token)}`);
  const act = useAction();
  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Workspace invite</h1>
      <Card>
        {p.loading && <Loading />}
        {p.error && <Err>This invite link is not valid. It may have been used, withdrawn or expired.</Err>}
        {p.data && (
          <>
            <p className="mb-3 text-[16px] text-zinc-700">
              You are invited to <strong className="text-zinc-900">{p.data.workspace.name}</strong> as {p.data.role}
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
              <Btn
                disabled={act.busy}
                onClick={() =>
                  void act.run(async () => {
                    const r = await api<{ workspace_id: string }>(`/api/v2/invites/${encodeURIComponent(token)}/accept`, { body: {} });
                    go(`/app/w/${r.workspace_id}`);
                  })
                }
              >
                Join workspace
              </Btn>
            ) : (
              <Note>
                This invite is for {p.data.invited_email}. You are signed in as {me.email}. Sign in with the invited address to join.
              </Note>
            )}
          </>
        )}
        <Err>{act.error}</Err>
      </Card>
    </Shell>
  );
}
