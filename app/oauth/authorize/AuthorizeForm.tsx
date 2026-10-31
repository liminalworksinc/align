"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

// The consent form. One choice: allow this app to read one workspace, as one role, or cancel. Read-only is stated
// plainly because it is enforced: the MCP server has no tool that writes (lib/mcp/register.ts).

export interface SignedIn {
  workspace: string;
  company: string;
  team: string;
  name: string;
}

interface Role {
  id: string;
  team: string;
  blurb: string;
}

const WS_IN = /w_[a-z2-7]{12}/;

export default function AuthorizeForm(props: {
  params: Record<string, string>;
  clientName: string;
  selfNamed: boolean;
  redirectHost: string;
  provider: string;
  signedIn: SignedIn | null;
}) {
  const { params, clientName, selfNamed, redirectHost, provider } = props;
  const [signedIn, setSignedIn] = useState<SignedIn | null>(props.signedIn);
  const [useSession, setUseSession] = useState(Boolean(props.signedIn));
  const [link, setLink] = useState("");
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typed = useRef(false); // the person started on the passcode form: don't switch it away under them

  // The session cookie is SameSite=Strict, so when Claude or ChatGPT sends the person here from their own site the
  // server render can't see it. A request from this page is same-site and carries it: ask, and offer the workspace
  // this browser is signed in to instead of the passcode form. Approving still goes through /api/oauth/approve.
  useEffect(() => {
    if (props.signedIn) return;
    let live = true;
    void (async () => {
      const s = await fetch("/api/session").then((r) => (r.ok ? r.json() : null), () => null);
      if (!s?.workspace || !s.actor) return;
      const info = await fetch(`/api/workspaces/${s.workspace}/login-info`).then((r) => (r.ok ? r.json() : null), () => null);
      if (!live || !info) return;
      const team = (info.roles as Role[] | undefined)?.find((r) => r.id === s.actor)?.team || s.actor;
      setSignedIn({ workspace: s.workspace, company: info.name ?? "", team, name: s.name && s.name !== s.actor ? s.name : "" });
      if (!typed.current) setUseSession(true);
    })();
    return () => {
      live = false;
    };
  }, [props.signedIn]);

  async function lookUp(value: string) {
    typed.current = true;
    setLink(value);
    setRoles(null);
    setRole("");
    const ws = WS_IN.exec(value)?.[0];
    if (!ws) return;
    const res = await fetch(`/api/workspaces/${ws}/login-info`).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    if (!data) {
      setError("No workspace has that link. Copy it from your browser’s address bar while the workspace is open.");
      return;
    }
    setError(null);
    setCompany(data.name ?? "");
    setRoles(data.roles ?? []);
  }

  async function answer(decision: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      const body = useSession ? { params, decision, use_session: true } : { params, decision, workspace: link, role, passcode };
      // A server that stopped answering (a paused machine) must not leave the buttons disabled forever.
      const res = await fetch("/api/oauth/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.redirect === "string") {
        window.location.assign(data.redirect);
        return;
      }
      setError(data.error ?? "That didn’t work. Try again.");
    } catch {
      setError("Align didn’t answer. Reload this page and choose Allow again.");
    }
    setBusy(false);
  }

  const ready = useSession || (roles && role && passcode.trim());
  return (
    <main className="mx-auto max-w-[560px] p-6 text-[16px] text-zinc-900">
      <h1 className="mb-1 text-[24px] font-semibold">Connect {clientName} to Align</h1>
      <p className="mb-5 text-zinc-700">
        {selfNamed ? "This app named itself. " : ""}After you allow it, Align sends you back to <span className="font-mono">{redirectHost}</span>.
      </p>

      <section className="mb-5 rounded-[14px] border border-zinc-200 bg-white p-5">
        <h2 className="mb-2 text-[18px] font-semibold">What it can do</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Read the goals in one workspace, the agreed plan, decisions, and what changed.</li>
          <li>It can’t propose, approve or change anything. Those stay with the people in the workspace.</li>
          <li>What it reads is sent to {provider}.</li>
          <li>You can disconnect it any time from the workspace. Restarting the workspace disconnects every app.</li>
        </ul>
      </section>

      <section className="mb-5 rounded-[14px] border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-[18px] font-semibold">Which workspace</h2>
        {signedIn && (
          <label className="mb-3 flex items-start gap-2">
            <input type="radio" name="who" className="mt-1 size-4 accent-violet-700" checked={useSession} onChange={() => setUseSession(true)} />
            <span>
              {signedIn.company || "Your workspace"}, as {signedIn.name ? `${signedIn.name} (${signedIn.team})` : signedIn.team}. You’re signed in to it in this browser.
            </span>
          </label>
        )}
        {signedIn && (
          <label className="mb-3 flex items-start gap-2">
            <input type="radio" name="who" className="mt-1 size-4 accent-violet-700" checked={!useSession} onChange={() => setUseSession(false)} />
            <span>Another workspace or team</span>
          </label>
        )}
        {!useSession && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block font-semibold">Workspace link</span>
              <input
                className="w-full rounded-[10px] border border-zinc-300 px-3 py-2"
                placeholder="https://…/w/w_…"
                value={link}
                onChange={(e) => void lookUp(e.target.value)}
                autoComplete="off"
              />
            </label>
            {roles && (
              <fieldset>
                <legend className="mb-1 font-semibold">Connect as{company ? ` (${company})` : ""}</legend>
                {roles.map((r) => (
                  <label key={r.id} className="flex items-start gap-2">
                    <input type="radio" name="role" className="mt-1 size-4 accent-violet-700" checked={role === r.id} onChange={() => setRole(r.id)} />
                    <span>
                      {r.team || r.id}, {r.blurb}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {roles && (
              <label className="block">
                <span className="mb-1 block font-semibold">That team’s passcode</span>
                <input
                  className="w-full rounded-[10px] border border-zinc-300 px-3 py-2 font-mono"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="mb-4 rounded-[10px] border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void answer("approve")} disabled={busy || !ready}>
          Allow read-only access
        </Button>
        <Button kind="secondary" onClick={() => void answer("deny")} disabled={busy}>
          Cancel
        </Button>
      </div>
    </main>
  );
}
