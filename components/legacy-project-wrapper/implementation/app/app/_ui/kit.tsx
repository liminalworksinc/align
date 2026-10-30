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

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "content-type": "application/json" } : {},
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

/** Run an action, keep its error for display, reload afterwards. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

export interface WsSummary {
  id: string;
  name: string;
  role: "owner" | "member" | "viewer";
  pods: { id: string; name: string; role: "lead" | "member" }[];
}

const WS_TABS = [
  { href: "", label: "Goals" },
  { href: "/people", label: "People" },
  { href: "/sessions", label: "Sessions" },
  { href: "/alignments", label: "Alignments" },
  { href: "/spend", label: "Spend" },
];

async function signOut() {
  await fetch("/api/v2/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  go("/app/sign-in");
}

/** Page frame: top bar (workspace switcher, devices, sign out) and, inside a workspace, its tabs. */
export function Shell({ me, ws, tab, children }: { me: { name: string; email: string }; ws?: string; tab?: string; children: ReactNode }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const current = list.data?.workspaces.find((w) => w.id === ws);
  return (
    <div className="min-h-screen bg-[var(--al-bg)] text-zinc-800">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-[var(--al-rail)] px-6 py-3">
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
        <nav className="ml-auto flex items-center gap-4 text-[15px] text-zinc-600">
          <Link href="/app/devices" className="hover:text-zinc-900">
            Devices
          </Link>
          <Link href="/app/account" className="hover:text-zinc-900">
            Account
          </Link>
          <span className="text-zinc-500" title={me.email}>
            {me.name}
          </span>
          <button type="button" onClick={signOut} className="hover:text-zinc-900">
            Sign out
          </button>
        </nav>
      </header>
      {ws && (
        <nav className="flex flex-wrap gap-1 border-b border-zinc-200 px-6 pt-2" aria-label="Workspace">
          <span className="mr-4 self-center text-[15px] text-zinc-500">
            {current?.name ?? ""}
            {current && <span className="al-lbl ml-2">{current.role}</span>}
          </span>
          {WS_TABS.map((t) => (
            <Link
              key={t.href}
              href={`/app/w/${ws}${t.href}`}
              className={`rounded-t-[8px] px-3 py-2 text-[15px] ${tab === t.label ? "border border-b-0 border-zinc-200 bg-white text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      <main className="mx-auto max-w-[1100px] p-6">{children}</main>
    </div>
  );
}

/** The recent-sign-in prompt (device approval, app consent): sign out, then sign in again and come back to `next`. */
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

export function Btn({ children, onClick, kind = "primary", disabled, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  const k = {
    primary: "border-violet-700 bg-violet-700 text-[var(--al-bg)] hover:opacity-90",
    secondary: "border-zinc-300 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
    danger: "border-red-700 bg-transparent text-red-700 hover:bg-red-50",
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-[10px] border px-3.5 py-2 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${k}`}>
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
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[12px] tracking-[0.04em] ${t}`}>{children}</span>;
}

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
