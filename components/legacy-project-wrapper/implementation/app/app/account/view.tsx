"use client";
import { useEffect, useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Shell, SignInAgain, go, useAction, useApi, when } from "../_ui/kit";
import { addPasskey, usePasskeyPlace } from "../_ui/passkey";
import type { Me, SignInOptions } from "../_ui/server";

interface Passkey {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

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

/** One passkey row: its name (renamable), when it was added and last used, and Delete. */
function PasskeyItem({ p, busy, onRename, onDelete }: { p: Passkey; busy: boolean; onRename: (name: string) => Promise<boolean>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name ?? "");
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {editing ? (
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onRename(name).then((ok) => ok && setEditing(false));
          }}
        >
          <span className="flex-1">
            <Input aria-label="Passkey name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </span>
          <Btn type="submit" kind="secondary" disabled={busy || !name.trim()}>
            Save
          </Btn>
        </form>
      ) : (
        <span className="flex-1 text-[16px] text-zinc-900">{p.name || "Unnamed passkey"}</span>
      )}
      <span className="text-[14px] text-zinc-500">
        added {when(p.created_at)} · {p.last_used_at ? `last used ${when(p.last_used_at)}` : "not used yet"}
      </span>
      {!editing && (
        <button type="button" className="text-[14px] text-zinc-600 hover:text-zinc-900" onClick={() => setEditing(true)}>
          Rename
        </button>
      )}
      <button type="button" className="text-[14px] text-red-700" disabled={busy} onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}

/** Passkeys: list, add (a recent sign-in), rename, delete (a recent sign-in). Only on the relying party's host. */
function Passkeys({ options, onReauth }: { options: SignInOptions; onReauth: (message: string) => void }) {
  const list = useApi<{ passkeys: Passkey[] }>("/api/v2/account/passkeys");
  const act = useAction();
  const [name, setName] = useState("");
  const place = usePasskeyPlace(options.passkeyHost);
  useEffect(() => {
    if (act.reauth) onReauth(act.reauth);
  }, [act.reauth, onReauth]);
  const add = () =>
    act.run(async () => {
      const e = await addPasskey(name.trim());
      if (e?.code === "reauth_required") return onReauth(e.message);
      if (e) throw new Error(/cancel|abort|NotAllowed/i.test(e.code + e.message) ? "Adding a passkey was cancelled. Nothing was added." : e.message);
      setName("");
    }, list.reload);
  return (
    <Card title="Passkeys">
      <span id="passkeys" />
      {list.loading && <Loading />}
      <Err>{list.error}</Err>
      {list.data && list.data.passkeys.length === 0 && <p className="text-[15px] text-zinc-500">No passkeys yet.</p>}
      <ul className="divide-y divide-zinc-200">
        {(list.data?.passkeys ?? []).map((p) => (
          <PasskeyItem
            key={p.id}
            p={p}
            busy={act.busy}
            onRename={(n) => act.run(() => api(`/api/v2/account/passkeys/${p.id}`, { method: "PATCH", body: { name: n } }), list.reload)}
            onDelete={() => {
              if (window.confirm(`Delete the passkey "${p.name || "Unnamed passkey"}"? It will no longer sign you in to Align.`)) {
                void act.run(() => api(`/api/v2/account/passkeys/${p.id}`, { method: "DELETE" }), list.reload);
              }
            }}
          />
        ))}
      </ul>
      {place === "here" ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="min-w-[220px] flex-1">
            <Field label="Name (optional)" hint="For example, the device or password manager that keeps it">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </Field>
          </div>
          <div className="mb-3">
            <Btn type="submit" disabled={act.busy}>
              Add a passkey
            </Btn>
          </div>
        </form>
      ) : place === "unsupported" ? (
        <Note>This browser can&apos;t use passkeys.</Note>
      ) : place === "elsewhere" ? (
        <Note>
          Passkeys work only at <a className="text-violet-700 underline" href={`${options.passkeyOrigin}/app/account`}>{options.passkeyOrigin}</a>
          {options.local ? ", because a passkey needs a domain name and this address is a number. Open Align there and sign in to add or use one." : "."}
        </Note>
      ) : null}
      <Note>A passkey signs you in with your fingerprint, face or device PIN. Adding or deleting one needs a sign-in from the last 15 minutes.</Note>
      <Err>{act.error}</Err>
    </Card>
  );
}

/** Sign out everywhere: every web session ends; optionally every device is unpaired and every AI app disconnected. */
function SignOutEverywhere({ onReauth }: { onReauth: (message: string) => void }) {
  const [devices, setDevices] = useState(false);
  const [apps, setApps] = useState(false);
  const act = useAction();
  useEffect(() => {
    if (act.reauth) onReauth(act.reauth);
  }, [act.reauth, onReauth]);
  const signOutAll = () => {
    const also = [devices && "unpair all your devices", apps && "disconnect all your AI apps"].filter(Boolean).join(" and ");
    if (!window.confirm(`Sign out of Align on every browser, this one included${also ? `, and ${also}` : ""}?`)) return;
    void act.run(() => api("/api/v2/account/sign-out-everywhere", { body: { devices, apps } }), () => go("/app/sign-in"));
  };
  return (
    <Card title="Sign out everywhere">
      <p className="mb-3 text-[15px] text-zinc-600">Ends your Align sign-in on every browser, this one included. Use it if you lost a device or signed in somewhere you shouldn&apos;t have.</p>
      <label className="mb-1 flex items-center gap-2 text-[15px]">
        <input type="checkbox" name="devices" checked={devices} onChange={(e) => setDevices(e.target.checked)} />
        Also unpair all my devices (each <code>align</code> CLI has to run <code>align login</code> again)
      </label>
      <label className="mb-3 flex items-center gap-2 text-[15px]">
        <input type="checkbox" name="apps" checked={apps} onChange={(e) => setApps(e.target.checked)} />
        Also disconnect all my AI apps, in every workspace
      </label>
      <Btn kind="danger" disabled={act.busy} onClick={signOutAll}>
        Sign out everywhere
      </Btn>
      <Note>This needs a sign-in from the last 15 minutes.</Note>
      <Err>{act.error}</Err>
    </Card>
  );
}

// Your account: who you are, the ways you can sign in, passkeys, and signing out everywhere. Linking Google or GitHub
// is explicit, from here only; Align never links accounts because their emails match. Adding a passkey, deleting one,
// linking and signing out everywhere need a recent sign-in: a 403 reauth_required shows Sign in again, which returns
// here.
export default function Account({ me, options, linkError }: { me: Me; options: SignInOptions; linkError: string }) {
  const list = useApi<LinkedAccount[]>("/api/v2/auth/list-accounts");
  const [error, setError] = useState<string | null>(linkError ? linkMessage(linkError) : null);
  const [busy, setBusy] = useState(false);
  const [reauth, setReauth] = useState<string | null>(null);
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
      const d = (await res.json().catch(() => ({}))) as { url?: string; message?: string; code?: string };
      if (res.status === 403 && d.code === "reauth_required") {
        setReauth(d.message || "Sign in again to link an account.");
        setBusy(false);
        return;
      }
      if (!res.ok || !d.url) throw new Error(d.message || `Linking ${PROVIDERS[provider]} didn't work`);
      window.location.assign(d.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Shell me={{ ...me, passkeyPrompt: false }}>
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Your account</h1>
      {reauth && (
        <SignInAgain me={me} next="/app/account">
          {reauth}
        </SignInAgain>
      )}
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
      <Passkeys options={options} onReauth={setReauth} />
      <SignOutEverywhere onReauth={setReauth} />
    </Shell>
  );
}
