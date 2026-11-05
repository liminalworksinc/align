"use client";
import { useEffect, useState } from "react";
import { api, Btn, Err, Field, Input, Loading, Note, Pill, Shell, SignInAgain, go, useAction, useApi, when } from "../_ui/kit";
import { Panel } from "../_ui/ds";
import { ThemeSetting } from "../_ui/ds/theme";
import { addPasskey, usePasskeyPlace } from "../_ui/passkey";
import type { Me, SignInOptions } from "../_ui/server";
import { isBlankText } from "@/lib/v2/text-core.mts";

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

// LIM-2472 (stream R): token-only styling in both themes. Each row is a name over its detail, and the rows wrap, so a
// long email never squeezes a label to one letter per line at 320 (defect 5).
const H1 = "mb-5 font-display text-[32px] leading-[1.1] text-(--text-1) max-sm:text-[28px]";
const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0";
const ROW_NAME = "min-w-0 flex-1 basis-[12rem] text-[15px] font-medium text-(--text-1)";
const TEXT_BTN = "rounded-(--radius-s) px-2 text-[14px] font-medium";

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
    <li className={ROW}>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void onRename(name).then((ok) => ok && setEditing(false));
          }}
        >
          <span className="min-w-[160px] flex-1">
            <Input aria-label="Passkey name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </span>
          <Btn type="submit" kind="secondary" disabled={busy || isBlankText(name)}>
            Save
          </Btn>
        </form>
      ) : (
        <span className={ROW_NAME}>{p.name || "Unnamed passkey"}</span>
      )}
      <span className="text-[14px] text-(--text-3)">
        added {when(p.created_at)} · {p.last_used_at ? `last used ${when(p.last_used_at)}` : "not used yet"}
      </span>
      {!editing && (
        <button type="button" className={`${TEXT_BTN} text-(--text-2) hover:bg-(--bg-raised) hover:text-(--text-1)`} onClick={() => setEditing(true)}>
          Rename
        </button>
      )}
      <button type="button" className={`${TEXT_BTN} text-(--st-declined) hover:bg-(--st-declined-soft)`} disabled={busy} onClick={onDelete}>
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
  // A name of only spaces or invisible characters is no name (E2E-WEB cycle 14 C14-2). Once the passkey is added the
  // list is reloaded whatever its naming did, so a failed rename leaves its row below to rename (C14-3).
  const add = () =>
    act.run(async () => {
      const e = await addPasskey(isBlankText(name) ? "" : name.trim());
      if (e?.code === "rename_failed") list.reload();
      if (e?.code === "reauth_required") return onReauth(e.message);
      if (e) throw new Error(/cancel|abort|NotAllowed/i.test(e.code + e.message) ? "Adding a passkey was cancelled. Nothing was added." : e.message);
      setName("");
    }, list.reload);
  return (
    <Panel title="Passkeys">
      <span id="passkeys" className="block scroll-mt-4" />
      {list.loading && <Loading />}
      <Err>{list.error}</Err>
      {list.data && list.data.passkeys.length === 0 && <p className="text-[15px] text-(--text-2)">No passkeys yet.</p>}
      <ul className="divide-y divide-(--line)">
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
          <div className="min-w-[200px] flex-1">
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
          Passkeys work only at <a className="text-(--accent-text) underline" href={`${options.passkeyOrigin}/app/account`}>{options.passkeyOrigin}</a>
          {options.local ? ", because a passkey needs a domain name and this address is a number. Open Align there and sign in to add or use one." : "."}
        </Note>
      ) : null}
      <Note>A passkey signs you in with your fingerprint, face or device PIN. Adding or deleting one needs a sign-in from the last 15 minutes.</Note>
      <Err>{act.error}</Err>
    </Panel>
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
    <Panel title="Sign out everywhere">
      <p className="mb-3 text-[15px] text-(--text-2)">Ends your Align sign-in on every browser, this one included. Use it if you lost a device or signed in somewhere you shouldn&apos;t have.</p>
      <label className="mb-1 flex min-h-[44px] items-center gap-2 text-[15px] text-(--text-1)">
        <input type="checkbox" className="size-4 shrink-0 accent-(--accent)" name="devices" checked={devices} onChange={(e) => setDevices(e.target.checked)} />
        <span className="min-w-0">
          Also unpair all my devices (each <code className="font-mono text-[13px]">align</code> CLI has to run <code className="font-mono text-[13px]">align login</code> again)
        </span>
      </label>
      <label className="mb-3 flex min-h-[44px] items-center gap-2 text-[15px] text-(--text-1)">
        <input type="checkbox" className="size-4 shrink-0 accent-(--accent)" name="apps" checked={apps} onChange={(e) => setApps(e.target.checked)} />
        <span className="min-w-0">Also disconnect all my AI apps, in every workspace</span>
      </label>
      <Btn kind="danger" disabled={act.busy} onClick={signOutAll}>
        Sign out everywhere
      </Btn>
      <Note>This needs a sign-in from the last 15 minutes.</Note>
      <Err>{act.error}</Err>
    </Panel>
  );
}

// Your account: who you are, the ways you can sign in, passkeys, signing out everywhere and deleting the account.
// Linking Google or GitHub is explicit, from here only; Align never links accounts because their emails match. Adding a
// passkey, deleting one, linking, signing out everywhere and deleting the account need a recent sign-in: a 403
// reauth_required shows Sign in again, which returns here.
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
      <h1 className={H1}>Your account</h1>
      {reauth && (
        <SignInAgain me={me} next="/app/account">
          {reauth}
        </SignInAgain>
      )}
      <div className="flex flex-col gap-4">
      <Panel>
        <p className="text-[18px] font-semibold text-(--text-1)">{me.name || me.email}</p>
        <p className="text-[15px] text-(--text-2)">{me.email}</p>
      </Panel>
      <Panel title="Appearance">
        <ThemeSetting hideLabel />
      </Panel>
      <Panel title="Ways you can sign in">
        {list.loading && <Loading />}
        <Err>{list.error}</Err>
        <ul className="divide-y divide-(--line)">
          {options.email && (
            <li className={ROW}>
              <span className={ROW_NAME}>Email code</span>
              <span className="min-w-0 text-[14px] text-(--text-2)">A 6-digit code sent to {me.email}</span>
            </li>
          )}
          {(list.data ?? [])
            .filter((a) => a.providerId in LABELS)
            .map((a) => (
              <li key={a.id} className={ROW}>
                <span className={ROW_NAME}>{LABELS[a.providerId]}</span>
                <Pill tone="green">linked</Pill>
                <span className="text-[14px] text-(--text-2)">since {when(a.createdAt)}</span>
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
      </Panel>
      <Passkeys options={options} onReauth={setReauth} />
      <SignOutEverywhere onReauth={setReauth} />
      <DeleteAccount me={me} />
      </div>
    </Shell>
  );
}

const RECENT_MS = 15 * 60 * 1000;

/** Delete the account: type the email to confirm; needs a sign-in from the last 15 minutes (DELETE /api/v2/me). With
 *  an older sign-in (at load, or answered 403 reauth_required) the card is Sign in again instead. */
function DeleteAccount({ me }: { me: Me }) {
  const [typed, setTyped] = useState("");
  const [stale] = useState(() => Date.now() - Date.parse(me.signedInAt) > RECENT_MS);
  const act = useAction();
  const matches = typed.trim().toLowerCase() === me.email.toLowerCase();
  if (stale || act.reauth) {
    return (
      <SignInAgain me={me} next="/app/account">
        {act.reauth ?? "Sign in again to delete your account. This needs a sign-in from the last 15 minutes."}
      </SignInAgain>
    );
  }
  return (
    <Panel title="Delete your account">
      <p className="mb-3 text-[15px] text-(--text-2)">
        This signs you out everywhere, unpairs your devices, disconnects your apps and removes you from every workspace. A workspace where you are the only member is deleted too. Goals, change requests and session spend that others rely on stay, shown as
        &quot;Former member&quot; with no name or email. If you are the only owner of a workspace with other members, make someone else an owner or delete it first.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act.run(async () => {
            await api("/api/v2/me", { method: "DELETE", body: { email: typed.trim() } });
            go("/app/sign-in");
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
    </Panel>
  );
}
