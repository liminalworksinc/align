"use client";
import { useState } from "react";
import { Btn, Card, Err, SignInAgain } from "@/app/app/_ui/kit";

// The consent form. One choice: let this app read one workspace as this person, or cancel. What it can't do is stated
// plainly because it is enforced: the MCP server's only write is an agent-reported evidence link on a change request
// the person may act on (lib/mcp/register.ts). Approving needs a
// sign-in from the last 15 minutes; an older one gets the sign-in-again prompt instead of the form.

export interface Person {
  name: string;
  email: string;
  recent: boolean;
  /** Workspaces where the person is an owner or member (viewers can't connect apps). */
  workspaces: { id: string; name: string; role: "owner" | "member" }[];
}

export default function AuthorizeForm(props: {
  params: Record<string, string>;
  /** This consent request's own URL, for coming back after signing in. */
  here: string;
  clientName: string;
  selfNamed: boolean;
  redirectHost: string;
  loopback: boolean;
  provider: string;
  person: Person | null;
}) {
  const { params, here, clientName, selfNamed, redirectHost, loopback, provider, person } = props;
  const [stale, setStale] = useState(!!person && !person.recent);
  const [ws, setWs] = useState(person?.workspaces.length === 1 ? person.workspaces[0].id : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = `/app/sign-in?next=${encodeURIComponent(here)}`;

  async function answer(decision: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      // A server that stopped answering (a paused machine) must not leave the buttons disabled forever.
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(decision === "approve" ? { params, decision, workspace_id: ws } : { params, decision }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.redirect === "string") {
        window.location.assign(data.redirect);
        return;
      }
      if (res.status === 403 && data.code === "reauth_required") setStale(true);
      else setError(data.error ?? "That didn’t work. Try again.");
    } catch {
      setError("Align didn’t answer. Reload this page and choose Allow again.");
    }
    setBusy(false);
  }

  const cancel = (
    <Btn kind="secondary" onClick={() => void answer("deny")} disabled={busy}>
      Cancel
    </Btn>
  );

  return (
    <main className="mx-auto min-h-screen max-w-[600px] bg-[var(--al-bg)] p-6 text-[16px] text-zinc-800">
      <p className="font-display mb-4 text-[26px] leading-none text-zinc-900">Align</p>
      <h1 className="mb-1 text-[24px] font-semibold text-zinc-900">Connect {clientName} to Align</h1>
      <p className="mb-5 text-zinc-600">
        {selfNamed ? "This app named itself. " : ""}After you allow it, Align sends you back to <span className="font-mono">{redirectHost}</span>.
      </p>
      {loopback && (
        <p role="alert" className="mb-5 rounded-[10px] border border-amber-300 bg-amber-50 p-3 text-amber-900">
          This app sends you back to a program on this computer ({redirectHost}). Allow it only if you started it yourself just now.
        </p>
      )}

      {!person ? (
        <Card>
          <p className="mb-4">Sign in to Align to connect {clientName}.</p>
          <div className="flex flex-wrap gap-2">
            <a href={signIn} className="rounded-[10px] border border-violet-700 bg-violet-700 px-3.5 py-2 text-[15px] font-medium text-[var(--al-bg)] hover:opacity-90">
              Sign in
            </a>
            {cancel}
          </div>
          <Err>{error}</Err>
        </Card>
      ) : stale ? (
        <>
          <SignInAgain me={person} next={here}>
            Sign in again to connect an app. Connecting needs a sign-in from the last 15 minutes.
          </SignInAgain>
          <Err>{error}</Err>
          <div className="flex flex-wrap gap-2">{cancel}</div>
        </>
      ) : (
        <>
          <p className="mb-5 text-zinc-600">
            Signed in as {person.name} ({person.email}).
          </p>
          <Card title="What it can do">
            <ul className="list-disc space-y-1 pl-5 text-[15px]">
              <li>It reads goals, change requests, decision records and directives in the workspace you choose, as you and with your role.</li>
              <li>It can’t propose, approve or change goals or change requests. Those stay with the people in the workspace.</li>
              <li>It can attach evidence links to change requests you can act on, and Align labels them agent-reported.</li>
              <li>It never sees captured prompts.</li>
              <li>What it reads is sent to {provider}.</li>
              <li>You or a workspace owner can disconnect it on the workspace’s Apps tab, and it is disconnected if you leave the workspace.</li>
            </ul>
          </Card>
          <Card title="Which workspace">
            {person.workspaces.length === 0 ? (
              <p className="text-[15px]">You have no workspace where you can connect an app. Viewers can&apos;t connect apps.</p>
            ) : (
              <div className="space-y-2">
                {person.workspaces.map((w) => (
                  <label key={w.id} className="flex items-start gap-2 text-[15px]">
                    <input type="radio" name="workspace" className="mt-1 size-4 accent-violet-700" checked={ws === w.id} onChange={() => setWs(w.id)} />
                    <span>
                      {w.name} <span className="al-lbl ml-1">{w.role}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>
          <Err>{error}</Err>
          <div className="flex flex-wrap gap-2">
            {person.workspaces.length > 0 && (
              <Btn onClick={() => void answer("approve")} disabled={busy || !ws}>
                Allow access
              </Btn>
            )}
            {cancel}
          </div>
        </>
      )}
    </main>
  );
}
