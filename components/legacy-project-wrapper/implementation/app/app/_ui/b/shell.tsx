"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ThemeSettingCompact } from "../ds";
import { go, useApi, type WsSummary } from "../kit";
import { initials } from "./parts";

// LIM-2472 concept B shell: a narrow icon rail (the desk first, everything else one layer down), a breadcrumb, and one
// slot top right for the page's single primary action. Below 640px the rail folds into a Menu sheet so nothing scrolls
// sideways. Routes are the existing /app/w/<ws>/... pages; Work is the Sessions page.

const P = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const ICON: Record<string, ReactNode> = {
  desk: (
    <svg {...P}>
      <path d="M2.5 10.5 4.5 3.5h9l2 7v4h-13z" />
      <path d="M2.5 10.5h4l1 2h3l1-2h4" />
    </svg>
  ),
  goals: (
    <svg {...P}>
      <circle cx="9" cy="9" r="6.5" />
      <circle cx="9" cy="9" r="3" />
      <circle cx="9" cy="9" r="0.6" fill="currentColor" />
    </svg>
  ),
  work: (
    <svg {...P}>
      <rect x="2" y="3" width="14" height="12" rx="2" />
      <path d="m5 7 2 2-2 2M9 11h4" />
    </svg>
  ),
  alignments: (
    <svg {...P}>
      <path d="M7.5 10.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.9.9" />
      <path d="M10.5 7.5a3 3 0 0 0-4.2 0L4 9.8A3 3 0 0 0 8.2 14l.9-.9" />
    </svg>
  ),
  asks: (
    <svg {...P}>
      <path d="M3 3.5h12v8H8.5L5 14.5v-3H3z" />
    </svg>
  ),
  apps: (
    <svg {...P}>
      <path d="M6.5 2.5v3M11.5 2.5v3M4.5 5.5h9v3a4.5 4.5 0 0 1-9 0zM9 13v2.5" />
    </svg>
  ),
  people: (
    <svg {...P}>
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2.5 15a4.5 4.5 0 0 1 9 0M12 4.2a2.5 2.5 0 0 1 0 4.6M13.5 11.2A4.5 4.5 0 0 1 15.5 15" />
    </svg>
  ),
  spend: (
    <svg {...P}>
      <ellipse cx="9" cy="5" rx="5.5" ry="2.2" />
      <path d="M3.5 5v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V5M3.5 9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2" />
    </svg>
  ),
};

export const DESK_NAV = [
  { key: "desk", href: "", label: "Decision desk" },
  { key: "goals", href: "/goals", label: "Goals" },
  { key: "work", href: "/sessions", label: "Work" },
  { key: "alignments", href: "/alignments", label: "Alignments" },
  { key: "asks", href: "/asks", label: "Asks" },
  { key: "apps", href: "/apps", label: "Apps" },
  { key: "people", href: "/people", label: "People" },
  { key: "spend", href: "/spend", label: "Spend" },
] as const;

async function signOut() {
  await fetch("/api/v2/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  go("/app/sign-in");
}

export type Crumb = { label: string; href?: string };

export function DeskShell({ me, ws, active, crumbs, primary, children }: { me: { name: string; email: string }; ws: string; active: string; crumbs: Crumb[]; primary?: ReactNode; children: ReactNode }) {
  const list = useApi<{ workspaces: WsSummary[] }>("/api/v2/workspaces");
  const current = list.data?.workspaces.find((w) => w.id === ws);
  const [menu, setMenu] = useState(false);
  const base = `/app/w/${ws}`;

  const navItems = (compact: boolean) =>
    DESK_NAV.map((n) => {
      const on = n.key === active;
      return (
        <Link
          key={n.key}
          href={`${base}${n.href}`}
          aria-current={on ? "page" : undefined}
          title={compact ? n.label : undefined}
          data-desk-nav={n.key}
          className={
            compact
              ? `relative flex h-10 w-10 items-center justify-center rounded-(--radius-s) min-[1400px]:w-full min-[1400px]:justify-start min-[1400px]:gap-3 min-[1400px]:px-3 min-[1400px]:text-[14px] ${on ? "bg-(--accent-soft) text-(--accent-text)" : "text-(--text-3) hover:bg-(--bg-raised) hover:text-(--text-1)"}`
              : `flex min-h-[44px] items-center gap-3 rounded-(--radius-s) px-3 text-[15px] ${on ? "bg-(--accent-soft) text-(--accent-text)" : "text-(--text-2) hover:bg-(--bg-raised) hover:text-(--text-1)"}`
          }
        >
          {on && compact && <span aria-hidden="true" className="absolute -left-2 top-2 min-[1400px]:-left-3 h-6 w-0.5 rounded-full bg-(--accent-text)" />}
          {ICON[n.key]}
          <span className={compact ? "sr-only min-[1400px]:not-sr-only" : ""}>{n.label}</span>
        </Link>
      );
    });

  return (
    <div className="min-h-screen bg-(--bg-page) text-(--text-1) [--rail:60px] sm:grid sm:grid-cols-[var(--rail)_minmax(0,1fr)] min-[1400px]:[--rail:208px]">
      <aside className="sticky top-0 hidden h-screen flex-col items-center gap-1 self-start border-r border-(--line) bg-(--bg-inset) py-3 sm:flex min-[1400px]:items-stretch min-[1400px]:px-3">
        <Link href="/app" className="mb-3 flex h-10 w-10 items-center justify-center rounded-(--radius-s) font-display text-[22px] leading-none text-(--text-1)" title="All workspaces">
          A<span className="sr-only">lign, all workspaces</span>
        </Link>
        <nav aria-label="Workspace" className="flex flex-col items-center gap-1 min-[1400px]:items-stretch">
          {navItems(true)}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1 min-[1400px]:items-start">
          <Link href="/app/account" title="Account" className="flex h-10 w-10 items-center justify-center rounded-full border border-(--line-strong) bg-(--bg-raised) font-mono text-[12px] text-(--text-2) hover:text-(--text-1)">
            {initials(me.name)}
            <span className="sr-only">Account, {me.name}</span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--line) px-6 py-2.5 max-sm:px-4">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-(--radius-s) border border-(--edge) px-3 text-[14px] text-(--text-1) sm:hidden"
            aria-expanded={menu}
            aria-controls="desk-menu"
            onClick={() => setMenu((m) => !m)}
          >
            Menu
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">
              <li className="max-sm:hidden">
                <select
                  aria-label="Switch workspace"
                  className="max-w-[16rem] truncate rounded-(--radius-s) border border-transparent bg-transparent py-1 pr-1 font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-2) hover:border-(--line-strong)"
                  value={ws}
                  onChange={(e) => e.target.value && go(`/app/w/${e.target.value}`)}
                >
                  {!current && <option value={ws}>Workspace</option>}
                  {list.data?.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </li>
              {crumbs.map((c, i) => (
                <li key={i} className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className={i === 0 ? "max-sm:hidden" : ""}>
                    /
                  </span>
                  {c.href ? (
                    <Link href={c.href} className="hover:text-(--text-1)">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="min-w-0 break-words text-(--text-2)">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <div className="max-sm:hidden">
              <ThemeSettingCompact />
            </div>
            {primary}
          </div>
        </header>
        {menu && (
          <div id="desk-menu" className="border-b border-(--line) bg-(--bg-panel) px-4 py-3 sm:hidden">
            <nav aria-label="Workspace" className="flex flex-col gap-0.5">
              {navItems(false)}
            </nav>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-(--line) pt-3">
              <ThemeSettingCompact />
              <Link href="/app/account" className="inline-flex min-h-[44px] items-center text-[14px] text-(--text-2)">
                Account
              </Link>
              <Link href="/app" className="inline-flex min-h-[44px] items-center text-[14px] text-(--text-2)">
                All workspaces
              </Link>
              <button type="button" onClick={signOut} className="min-h-[44px] text-[14px] text-(--text-2)">
                Sign out
              </button>
            </div>
          </div>
        )}
        <main className="mx-auto max-w-[1280px] px-6 py-5 [overflow-wrap:anywhere] max-sm:px-4 max-sm:py-4">{children}</main>
      </div>
    </div>
  );
}
