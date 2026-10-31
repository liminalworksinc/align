"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

// Shared client pieces for the goal sessions web app: the API helper, a data hook, layout and form controls.

/** Full-page navigation within the app (a fresh load after sign-in, sign-out or a workspace switch). */
export function go(path: string) {
  window.location.assign(new URL(path, window.location.origin).href);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: { ...(init?.body !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; code?: string };
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") go(`/app/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiError(res.status, data.error ?? data.code ?? "error", data.message ?? `Something went wrong (${res.status})`);
  }
  return data as T;
}

export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e: Error) => live && setState((s) => ({ ...s, error: e.message, loading: false })),
    );
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Run an action, keep its error for display, reload afterwards. A 403 reauth_required (the action needs a sign-in from
 *  the last 15 minutes) is kept as `reauth` instead, with its message, so the page can show <SignInAgain>. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauth, setReauth] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "reauth_required") setReauth(e.message);
      else setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError, reauth, setReauth };
}

export interface WsSummary {
  id: string;
  name: string;
  role: "owner" | "member" | "viewer";
  teams: { id: string; name: string; role: "lead" | "member" }[];
}

const WS_TABS = [
  { href: "", label: "Home" },
  { href: "/goals", label: "Goals" },
  { href: "/people", label: "People" },
  { href: "/sessions", label: "Sessions" },
  { href: "/alignments", label: "Alignments" },
  { href: "/requests", label: "Requests" },
  { href: "/asks", label: "Asks" },
  { href: "/spend", label: "Spend" },
  { href: "/apps", label: "Apps" },
];

async function signOut() {
  await fetch("/api/v2/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  go("/app/sign-in");
}

/** The "add a passkey" prompt under the top bar, for a person with no passkey who has not said "Not now". */
function PasskeyPrompt() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const notNow = () => {
    setOpen(false);
    void fetch("/api/v2/account/passkey-prompt", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
  };
  return (
    <div id="passkey-prompt" className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-violet-50 px-6 py-2 text-[15px] text-zinc-800 max-sm:px-4">
      {/* Below 640px (sm) the prompt is one short line, so it takes less of a phone's first screen. */}
      <span className="flex-1 max-sm:hidden">Add a passkey to sign in with your fingerprint, face or device PIN instead of an email code. A passkey can&apos;t be phished.</span>
      <span className="flex-1 sm:hidden">Sign in with a passkey instead of an email code.</span>
      <Link href="/app/account#passkeys" className="font-medium text-violet-700 hover:underline">
        Add a passkey
      </Link>
      <button type="button" onClick={notNow} className="text-zinc-600 hover:text-zinc-900">
        Not now
      </button>
    </div>
  );
}

/** Page frame: top bar (workspace switcher, devices, sign out), the passkey prompt when due and, inside a workspace,
 *  its tabs. Every bar wraps, below 640px (sm) the padding narrows, and a word longer than its line (a 120-character
 *  link label, a URL, a pasted path) breaks rather than running off the side, so every /app page fits a 390px phone
 *  without sideways scrolling (LIM-2452, PORT2-001; scripts/test-v2.mjs checks each page at 390x844). Below 640px the
 *  chrome is compact (main #44): the top bar drops the person's name (Account has it), the passkey prompt is one short
 *  line, and the tab row drops the workspace's name and role (the switcher shows the name), so a page's heading starts
 *  in the top third of a 390x844 screen. The switcher is the native select: its list is the browser's, so it never
 *  runs off a narrow window, and it lists only the person's own workspaces (GET /api/v2/workspaces). */
export function Shell({ me, ws, tab, children }: { me: { name: string; email: string; passkeyPrompt?: boolean }; ws?: string; tab?: string; children: ReactNode }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const current = list.data?.workspaces.find((w) => w.id === ws);
  return (
    <div className="min-h-screen bg-[var(--al-bg)] text-zinc-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-[var(--al-rail)] px-6 py-3 max-sm:gap-x-3 max-sm:gap-y-1 max-sm:px-4 max-sm:py-2">
        <Link href="/app" className="font-display text-[26px] leading-none">
          Align
        </Link>
        {list.data && list.data.workspaces.length > 0 && (
          <select
            aria-label="Switch workspace"
            className="rounded-[8px] border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-[15px]"
            value={ws ?? ""}
            onChange={(e) => {
              if (e.target.value) go(`/app/w/${e.target.value}`);
            }}
          >
            <option value="">Workspaces</option>
            {list.data.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <nav className="ml-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-zinc-600">
          <Link href="/app/devices" className="hover:text-zinc-900">
            Devices
          </Link>
          <Link href="/app/account" className="hover:text-zinc-900">
            Account
          </Link>
          <span className="text-zinc-500 max-sm:hidden" title={me.email}>
            {me.name}
          </span>
          <button type="button" onClick={signOut} className="hover:text-zinc-900">
            Sign out
          </button>
        </nav>
      </header>
      {me.passkeyPrompt && <PasskeyPrompt />}
      {ws && (
        <nav className="flex flex-wrap gap-1 border-b border-zinc-200 px-6 pt-2 max-sm:gap-0.5 max-sm:px-3 max-sm:pt-1" aria-label="Workspace">
          <span className="mr-4 self-center text-[15px] text-zinc-500 max-sm:hidden">
            {current?.name ?? ""}
            {current && <span className="al-lbl ml-2">{current.role}</span>}
          </span>
          {WS_TABS.map((t) => (
            <Link
              key={t.href}
              href={`/app/w/${ws}${t.href}`}
              className={`rounded-t-[8px] px-3 py-2 text-[15px] max-sm:px-2.5 ${tab === t.label ? "border border-b-0 border-zinc-200 bg-white text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="mx-auto max-w-[1100px] p-6 [overflow-wrap:anywhere] max-sm:p-4">{children}</main>
    </div>
  );
}

/** The recent-sign-in prompt (device approval, app consent, and any action answered 403 reauth_required): sign out,
 *  then sign in again and come back to `next`. */
export function SignInAgain({ me, next, children }: { me: { email: string }; next: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const again = async () => {
    setBusy(true);
    await fetch("/api/v2/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
    go(`/app/sign-in?${new URLSearchParams({ next, email: me.email })}`);
  };
  return (
    <Card>
      <p className="mb-3 text-[16px] text-zinc-800">{children}</p>
      <Btn onClick={() => void again()} disabled={busy}>
        Sign in again
      </Btn>
    </Card>
  );
}

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-5 rounded-[14px] border border-zinc-200 bg-white p-5">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {title && <h2 className="text-[18px] font-semibold text-zinc-900">{title}</h2>}
          {actions && <div className="ml-auto flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** An action button. A long label wraps between words instead of running past its container (max-w-full), at any
 *  width. Below 640px every button is at least 44px tall, a phone's tap target: the root font is 15px, so rem-based
 *  heights (min-h-11 is 41.25px here) fall short, and the height is in px (main #44). */
export function Btn({ children, onClick, kind = "primary", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const k = {
    primary: "border-violet-700 bg-violet-700 text-[var(--al-bg)] hover:opacity-90",
    secondary: "border-zinc-300 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
    danger: "border-red-700 bg-transparent text-red-700 hover:bg-red-50",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`max-w-full rounded-[10px] border px-3.5 py-2 text-[15px] font-medium transition [overflow-wrap:normal] disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px] ${k}`}>
      {children}
    </button>
  );
}

const fieldClass = "w-full rounded-[10px] border border-zinc-300 bg-zinc-50 px-3 py-2 text-[15px] text-zinc-900";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[14px] text-zinc-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={fieldClass} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={fieldClass} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={fieldClass} />;
}

export function Err({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="my-2 text-[15px] font-medium text-red-700">
      {children}
    </p>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="my-2 rounded-[10px] bg-zinc-100 px-3 py-2 text-[14px] text-zinc-600">{children}</p>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "violet" | "amber" | "red" | "green" }) {
  const t = { neutral: "text-zinc-600 border-zinc-300", violet: "text-violet-700 border-violet-700", amber: "text-amber-700 border-amber-700", red: "text-red-700 border-red-700", green: "text-emerald-700 border-emerald-700" }[tone];
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 font-mono text-[12px] tracking-[0.04em] [overflow-wrap:anywhere] ${t}`}>{children}</span>;
}

/** The footer of the sign-in and request-access cards: the public privacy policy and trust page (PRESEED-008). */
export function TrustLinks() {
  return (
    <p className="mt-5 text-[13px] text-zinc-500">
      <Link href="/privacy" className="underline">
        Privacy
      </Link>
      {" · "}
      <Link href="/trust" className="underline">
        Trust and security
      </Link>
    </p>
  );
}

/** A table on a phone (below 640px): each row becomes a block and each cell a line with its column name (the cell's
 *  data-label) on the left, so the table never scrolls sideways (LIM-2452's phone layout, PORT2-001). `whole` is a
 *  cell shown as its own line with no label (a row's name, its buttons). */
export const PHONE_TABLE = {
  table: "max-sm:block",
  head: "max-sm:sr-only",
  body: "max-sm:block",
  row: "max-sm:block max-sm:py-2",
  cell: "max-sm:flex max-sm:justify-between max-sm:gap-3 max-sm:py-0.5 max-sm:pr-0 max-sm:text-right max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:text-[13px] max-sm:before:font-normal max-sm:before:text-zinc-500 max-sm:before:content-[attr(data-label)]",
  whole: "max-sm:block max-sm:py-0.5 max-sm:pr-0 max-sm:text-left",
};

export const Loading = () => <p className="text-[15px] text-zinc-500">Loading…</p>;

export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "");

export function usd(micros: number) {
  return `$${(micros / 1e6).toFixed(micros > 0 && micros < 10_000 ? 4 : 2)}`;
}

export function num(n: number) {
  return n.toLocaleString();
}

/** Lines or commas to a list. */
export const listOf = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
