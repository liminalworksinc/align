"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import { useState } from "react";
import { Btn, Card, Err, SignInAgain } from "@/app/app/_ui/kit";

// The consent form. One choice: let this app read one workspace as this person, or cancel. Read-only is stated
// plainly because it is enforced: without the changes:evidence scope the MCP server lists no tool that writes
// (lib/mcp/register.ts). When the app asked for changes:evidence, one more line says it may attach agent-reported
// evidence links, and the button says "Allow access" instead of "Allow read-only access". Approving needs a
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
  /** The app asked for changes:evidence (adding evidence links), not only goals:read. */
  evidence: boolean;
}) {
  const { params, here, clientName, selfNamed, redirectHost, loopback, provider, person, evidence } = props;
  // Someone with no workspace to connect (a viewer everywhere) is told so at once, never asked to sign in again first (U7).
  const [stale, setStale] = useState(!!person && !person.recent && person.workspaces.length > 0);
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
    <main className="mx-auto min-h-screen max-w-[600px] bg-(--bg-page) p-6 text-[16px] text-(--text-1) max-sm:p-4">
      <p className="font-display mb-4 text-[26px] leading-none text-(--text-1)">Align</p>
      <h1 className={`${PAGE_H1} mb-1`}>Connect {clientName} to Align</h1>
      <p className="mb-5 text-(--text-2)">
        {selfNamed ? "This app named itself. " : ""}After you allow it, Align sends you back to <span className="font-mono">{redirectHost}</span>.
      </p>
      {loopback && (
        <p role="alert" className="mb-5 rounded-(--radius-s) border border-(--st-retry)/50 bg-(--st-retry-soft) p-3 text-(--text-1)">
          This app sends you back to a program on this computer ({redirectHost}). Allow it only if you started it yourself just now.
        </p>
      )}

      {!person ? (
        <Card>
          <p className="mb-4">Sign in to Align to connect {clientName}.</p>
          <div className="flex flex-wrap gap-2">
            <a href={signIn} className="inline-flex min-h-[40px] items-center rounded-(--radius-s) border border-(--accent) bg-(--accent) px-3.5 py-2 text-[15px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) max-sm:min-h-[44px]">
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
          <p className="mb-5 text-(--text-2)">
            Signed in as {person.name} ({person.email}).
          </p>
          <Card title="What it can do">
            <ul className="list-disc space-y-1 pl-5 text-[15px]">
              <li>It reads goals and their limits, change requests, decision records, directives, asks between teams and agent activity counts in the workspace you choose, as you and with your role.</li>
              <li>It can’t propose, approve or change anything. Those stay with the people in the workspace.</li>
              {evidence && <li>It may also attach links to change requests you can act on, as evidence. Align labels them agent-reported.</li>}
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
                  <label key={w.id} className="flex min-h-[44px] items-start gap-2 rounded-(--radius-s) py-2 text-[15px]">
                    <input type="radio" name="workspace" className="mt-1 size-4 shrink-0 accent-(--accent-text)" checked={ws === w.id} onChange={() => setWs(w.id)} />
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
                {evidence ? "Allow access" : "Allow read-only access"}
              </Btn>
            )}
            {cancel}
          </div>
        </>
      )}
    </main>
  );
}
