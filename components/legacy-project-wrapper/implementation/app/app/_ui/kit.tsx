"use client";
import Link from "next/link";
import { cloneElement, isValidElement, useCallback, useEffect, useId, useState, type ReactNode, type Ref } from "react";
import { ThemeSettingCompact } from "./ds";

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

/** A server message as a sentence for a "Not recorded. …" line: ending in a full stop, so a short message never runs
 *  into the next sentence (c9 sweep). Its first letter is left as the server wrote it: a refusal can open with a
 *  person's name as they wrote it ("carol already decided not yet, …"), which the card spells the same way (E2E-WEB
 *  cycle 12 C12-1). */
export function sentence(message: string): string {
  const s = message.trim();
  return /[.!?…]["”]?$/.test(s) ? s : `${s}.`;
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
    throw new ApiError(res.status, data.error ?? data.code ?? "error", data.message ?? `Something went wrong (${res.status}).`);
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

/** Concept A navigation (LIM-2472): grouped by what a person is doing, the command center first. Labels keep the
 *  existing tab names so every page's `tab` prop still marks its place. */
const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  { group: "Command", items: [{ href: "", label: "Home" }] },
  {
    group: "Plan",
    items: [
      { href: "/goals", label: "Goals" },
      { href: "/alignments", label: "Alignments" },
      { href: "/requests", label: "Requests" },
      { href: "/asks", label: "Asks" },
    ],
  },
  {
    group: "Work",
    items: [
      { href: "/sessions", label: "Sessions" },
      { href: "/apps", label: "Apps" },
      { href: "/spend", label: "Spend" },
    ],
  },
  { group: "Team", items: [{ href: "/people", label: "People" }] },
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
    <div id="passkey-prompt" className="flex flex-wrap items-center gap-3 border-b border-(--line) bg-(--bg-raised) px-6 py-2 text-[14px] text-(--text-2) max-sm:px-4">
      {/* Below 640px (sm) the prompt is one short line, so it takes less of a phone's first screen. */}
      <span className="flex-1 max-sm:hidden">Add a passkey to sign in with your fingerprint, face or device PIN instead of an email code. A passkey can&apos;t be phished.</span>
      <span className="flex-1 sm:hidden">Sign in with a passkey instead of an email code.</span>
      <Link href="/app/account#passkeys" className="inline-flex min-h-[44px] items-center font-medium text-(--accent-text) hover:underline sm:min-h-0">
        Add a passkey
      </Link>
      <button type="button" onClick={notNow} className="inline-flex min-h-[44px] items-center text-(--text-2) hover:text-(--text-1) sm:min-h-0">
        Not now
      </button>
    </div>
  );
}

const navLink = (on: boolean) =>
  `flex min-h-[36px] items-center rounded-(--radius-s) px-2.5 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-(--focus) max-lg:min-h-[44px] ${
    on ? "bg-(--accent-soft) font-medium text-(--text-1) shadow-[inset_2px_0_0_var(--accent)]" : "text-(--text-2) hover:bg-(--bg-raised) hover:text-(--text-1)"
  }`;

/** The workspace switcher: the native select, so its list never runs off a narrow window. */
function WsSwitch({ ws, list }: { ws?: string; list: WsSummary[] }) {
  return (
    <select
      aria-label="Switch workspace"
      className="min-h-[36px] w-full min-w-0 rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-2 text-[14px] text-(--text-1) max-lg:min-h-[44px]"
      value={ws ?? ""}
      onChange={(e) => {
        if (e.target.value) go(`/app/w/${e.target.value}`);
      }}
    >
      <option value="">All workspaces</option>
      {list.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  );
}

function NavBody({ ws, tab, list, me, current }: { ws?: string; tab?: string; list: WsSummary[] | null; me: { name: string; email: string }; current?: WsSummary }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {list && list.length > 0 && (
        <div className="flex flex-col gap-1">
          <WsSwitch ws={ws} list={list} />
          {current && <p className="px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">You are {current.role === "owner" ? "an owner" : `a ${current.role}`}</p>}
        </div>
      )}
      {ws && (
        <nav aria-label="Workspace" className="flex flex-col gap-3">
          {NAV.map((g) => (
            <div key={g.group} className="flex flex-col gap-0.5">
              <p className="px-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">{g.group}</p>
              {g.items.map((t) => (
                <Link key={t.href} href={`/app/w/${ws}${t.href}`} aria-current={tab === t.label ? "page" : undefined} className={navLink(tab === t.label)}>
                  {t.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-(--line) pt-3">
        <Link href="/app/devices" aria-current={tab === "Devices" ? "page" : undefined} className={navLink(tab === "Devices")}>
          Devices
        </Link>
        <Link href="/app/account" aria-current={tab === "Account" ? "page" : undefined} className={navLink(tab === "Account")}>
          Account
        </Link>
        <button type="button" onClick={signOut} className={`${navLink(false)} w-full text-left`}>
          Sign out
        </button>
        <p className="truncate px-2.5 pt-1 text-[13px] text-(--text-3)" title={me.email}>
          {me.name}
        </p>
        <div className="px-1 pt-2">
          <ThemeSettingCompact />
        </div>
      </div>
    </div>
  );
}

/** Page frame (LIM-2472 concept A): a dense left rail at 1024px and up (workspace switcher, grouped navigation,
 *  devices, account, appearance); below that a top bar with a Menu button that opens the same navigation as a sheet.
 *  Every bar wraps and a word longer than its line breaks, so no /app page scrolls sideways at 390 or 320. */
export function Shell({ me, ws, tab, children }: { me: { name: string; email: string; passkeyPrompt?: boolean }; ws?: string; tab?: string; children: ReactNode }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const current = list.data?.workspaces.find((w) => w.id === ws);
  const [menu, setMenu] = useState(false);
  return (
    <div className="min-h-screen bg-(--bg-page) text-(--text-1) lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-(--line) bg-(--bg-inset) px-3 py-4 lg:flex">
        <Link href="/app" className="px-2 font-display text-[26px] leading-none text-(--text-1)">
          Align
        </Link>
        <NavBody ws={ws} tab={tab} list={list.data?.workspaces ?? null} me={me} current={current} />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-(--line) bg-(--bg-inset) px-4 py-2 lg:hidden">
          <Link href="/app" className="font-display text-[24px] leading-none text-(--text-1)">
            Align
          </Link>
          <span className="min-w-0 flex-1 truncate text-[14px] text-(--text-2)">{current?.name ?? ""}</span>
          <button
            type="button"
            aria-expanded={menu}
            aria-controls="ca-menu"
            onClick={() => setMenu((m) => !m)}
            className="inline-flex min-h-[44px] items-center rounded-(--radius-s) border border-(--line-strong) px-3 text-[14px] text-(--text-1)"
          >
            {menu ? "Close" : "Menu"}
          </button>
        </header>
        {menu && (
          <div id="ca-menu" className="flex flex-col border-b border-(--line) bg-(--bg-inset) px-3 py-3 lg:hidden">
            <NavBody ws={ws} tab={tab} list={list.data?.workspaces ?? null} me={me} current={current} />
          </div>
        )}
        {me.passkeyPrompt && <PasskeyPrompt />}
        <main className="mx-auto max-w-[1280px] px-6 py-5 [overflow-wrap:anywhere] max-sm:px-4 max-sm:py-4">{children}</main>
      </div>
    </div>
  );
}

/** Sign out, then open the sign-in page with `email` filled in, coming back to `next` afterwards. */
export async function signInAgain(next: string, email: string) {
  await fetch("/api/v2/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  go(`/app/sign-in?${new URLSearchParams({ next, email })}`);
}

/** The recent-sign-in prompt (device approval, app consent, and any action answered 403 reauth_required): sign out,
 *  then sign in again and come back to `next`. */
export function SignInAgain({ me, next, children }: { me: { email: string }; next: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const again = async () => {
    setBusy(true);
    await signInAgain(next, me.email);
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
export function Btn({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
  ref,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  /** For a page that moves focus to the button (the change request's "Review this decision"). */
  ref?: Ref<HTMLButtonElement>;
}) {
  const k = {
    primary: "border-violet-700 bg-violet-700 text-[var(--al-bg)] hover:opacity-90",
    secondary: "border-zinc-300 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
    danger: "border-red-700 bg-transparent text-red-700 hover:bg-red-50",
  }[kind];
  return (
    <button ref={ref} type={type} onClick={onClick} disabled={disabled} className={`max-w-full rounded-[10px] border px-3.5 py-2 text-[15px] font-medium transition [overflow-wrap:normal] disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-[44px] ${k}`}>
      {children}
    </button>
  );
}

const fieldClass = "w-full rounded-[10px] border border-zinc-300 bg-zinc-50 px-3 py-2 text-[15px] text-zinc-900";

/** A labelled control. The label still wraps the control (a click on it focuses the control), but the control's
 *  accessible name is the label's text alone (aria-labelledby) and the hint is its description: a <select> named by a
 *  wrapping label would otherwise be read with every one of its options ("Role Member Viewer Owner"). */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  const control =
    isValidElement<{ "aria-label"?: string; "aria-labelledby"?: string; "aria-describedby"?: string }>(children) && !children.props["aria-label"] && !children.props["aria-labelledby"]
      ? cloneElement(children, { "aria-labelledby": `${id}-l`, ...(hint ? { "aria-describedby": `${id}-h` } : {}) })
      : children;
  return (
    <label className="mb-3 block">
      <span id={`${id}-l`} className="mb-1 block text-[14px] text-zinc-600">
        {label}
      </span>
      {control}
      {hint && (
        <span id={`${id}-h`} className="mt-1 block text-[13px] text-zinc-500">
          {hint}
        </span>
      )}
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

/** Estimated list cost, by the rule the MCP text uses too (Z5). */
export { usd } from "@/lib/v2/money.mts";

export function num(n: number) {
  return n.toLocaleString();
}

/** Lines or commas to a list. */
export const listOf = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
