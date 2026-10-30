"use client";
import { useState } from "react";
import { api, ApiError, Btn, Card, Err, Field, go, Input, Loading, Note, Pill, Shell, SignInAgain, useAction, useApi, when } from "../_ui/kit";
import type { Me, SignInOptions } from "../_ui/server";

interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
  createdAt: string;
}

const PROVIDERS = { google: "Google", github: "GitHub" } as const;
type Provider = keyof typeof PROVIDERS;
const LABELS: Record<string, string> = { ...PROVIDERS, credential: "Test password (this machine only)" };

/** Better Auth's link-failure codes, in words. */
function linkMessage(code: string): string {
  const c = code.toLowerCase();
  if (c.includes("already_linked") || c.includes("already linked")) return "That account is already linked to another Align account, so nothing was linked.";
  if (c.includes("email_doesn") || c.includes("email_does_not_match")) return "That account's email doesn't match yours, so nothing was linked.";
  return `Linking didn't work (${code.replace(/_/g, " ")}). Nothing was linked.`;
}

// Your account: who you are and the ways you can sign in. Linking Google or GitHub is explicit, from here only;
// Align never links accounts because their emails match.
export default function Account({ me, options, linkError }: { me: Me; options: SignInOptions; linkError: string }) {
  const list = useApi<LinkedAccount[]>("/api/v2/auth/list-accounts");
  const [error, setError] = useState<string | null>(linkError ? linkMessage(linkError) : null);
  const [busy, setBusy] = useState(false);
  const linked = new Set((list.data ?? []).map((a) => a.providerId));

  const link = async (provider: Provider) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/auth/link-social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: "/app/account", errorCallbackURL: "/app/account" }),
        credentials: "same-origin",
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok || !d.url) throw new Error(d.message || `Linking ${PROVIDERS[provider]} didn't work`);
      window.location.assign(d.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Shell me={me}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Your account</h1>
      <Card>
        <p className="text-[18px] text-zinc-900">{me.name || me.email}</p>
        <p className="text-[15px] text-zinc-500">{me.email}</p>
      </Card>
      <Card title="Ways you can sign in">
        {list.loading && <Loading />}
        <Err>{list.error}</Err>
        <ul className="divide-y divide-zinc-200">
          {options.email && (
            <li className="flex items-center gap-3 py-3">
              <span className="flex-1 text-[16px] text-zinc-900">Email code</span>
              <span className="text-[14px] text-zinc-500">A 6-digit code sent to {me.email}</span>
            </li>
          )}
          {(list.data ?? [])
            .filter((a) => a.providerId in LABELS)
            .map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <span className="flex-1 text-[16px] text-zinc-900">{LABELS[a.providerId]}</span>
                <Pill tone="green">linked</Pill>
                <span className="text-[14px] text-zinc-500">since {when(a.createdAt)}</span>
              </li>
            ))}
        </ul>
        {list.data && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(PROVIDERS) as Provider[])
              .filter((p) => options[p] && !linked.has(p))
              .map((p) => (
                <Btn key={p} kind="secondary" disabled={busy} onClick={() => void link(p)}>
                  Link {PROVIDERS[p]}
                </Btn>
              ))}
          </div>
        )}
        <Note>Linking lets that Google or GitHub account sign you in to this Align account. Align never links accounts on its own because their emails match.</Note>
        <Err>{error}</Err>
      </Card>
      <DeleteAccount me={me} />
    </Shell>
  );
}

const RECENT_MS = 15 * 60 * 1000;

/** Delete the account: type the email to confirm; needs a sign-in from the last 15 minutes (DELETE /api/v2/me). */
function DeleteAccount({ me }: { me: Me }) {
  const [typed, setTyped] = useState("");
  const [stale, setStale] = useState(() => Date.now() - Date.parse(me.signedInAt) > RECENT_MS);
  const act = useAction();
  const matches = typed.trim().toLowerCase() === me.email.toLowerCase();
  if (stale) {
    return (
      <SignInAgain me={me} next="/app/account">
        Sign in again to delete your account. Deleting it needs a sign-in from the last 15 minutes.
      </SignInAgain>
    );
  }
  return (
    <Card title="Delete your account">
      <p className="mb-3 text-[15px] text-zinc-600">
        This signs you out everywhere, unpairs your devices, disconnects your apps and removes you from every workspace. A workspace where you are the only member is deleted too. Goals, change requests and session spend that others rely on stay, shown as
        &quot;Former member&quot; with no name or email. If you are the only owner of a workspace with other members, make someone else an owner or delete it first.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            try {
              await api("/api/v2/me", { method: "DELETE", body: { email: typed.trim() } });
              go("/app/sign-in");
            } catch (err) {
              if (err instanceof ApiError && err.code === "reauth_required") setStale(true);
              throw err;
            }
          });
        }}
      >
        <Field label={`Type ${me.email} to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" aria-label="Your email, to confirm" />
        </Field>
        <Btn type="submit" kind="danger" disabled={act.busy || !matches}>
          Delete my account
        </Btn>
        <Err>{act.error}</Err>
      </form>
    </Card>
  );
}
