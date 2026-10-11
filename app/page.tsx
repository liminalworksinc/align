"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BriefDrawer } from "@/components/BriefDrawer";
import { EvidenceView } from "@/components/EvidenceView";
import { GoalsView } from "@/components/GoalsView";
import { Inspector } from "@/components/Inspector";
import type { Drawer, View, ViewProps } from "@/components/props";
import { ProposalsView } from "@/components/ProposalsView";
import { ScenarioDrawer } from "@/components/ScenarioDrawer";
import { TeamLens } from "@/components/TeamLens";
import { TodayView } from "@/components/TodayView";
import { OrgView } from "@/components/OrgView";
import { WorkMap } from "@/components/WorkMap";
import { currentGoal } from "@/components/select";
import { Badge, Button } from "@/components/ui";
import { api, useAlign, type Selection } from "@/components/useAlign";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "☀" },
  { id: "goals", label: "Goals", icon: "◎" },
  { id: "team", label: "Team", icon: "⇄" },
  { id: "proposals", label: "Proposals", icon: "✉" },
  { id: "evidence", label: "Evidence", icon: "▤" },
];
const NAV_LEADERSHIP: { id: View; label: string; icon: string }[] = [
  { id: "company", label: "Company goal", icon: "◆" },
  { id: "goals", label: "Goals", icon: "◎" },
  { id: "work", label: "Work", icon: "⌁" },
  { id: "evidence", label: "Evidence", icon: "▤" },
];
const ROLES = [
  { id: "leadership", name: "CEO / Leadership", blurb: "Owns company goals" },
  { id: "product", name: "Product Director", blurb: "Owns the beta launch" },
  { id: "security", name: "Alex / Security Lead", blurb: "Owns incident triage" },
] as const;
type Role = (typeof ROLES)[number]["id"];

function Login({ onDone }: { onDone: () => void }) {
  const [role, setRole] = useState<Role>("product");
  const [passcode, setPasscode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/session", { body: { role, passcode } });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form onSubmit={submit} className="w-[560px] rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <div className="mb-1 text-[28px] font-bold tracking-tight">Align</div>
        <p className="mb-6 text-[16px] text-zinc-600">Northstar Security. Sign in as the owner of your goals.</p>
        <fieldset className="mb-4">
          <legend className="mb-2 text-[14px] font-semibold text-zinc-700">I am</legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <label key={r.id} className={`cursor-pointer rounded-lg p-3 text-[16px] ring-1 ${role === r.id ? "bg-violet-50 ring-violet-500" : "ring-zinc-300"}`}>
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
                <div className="font-semibold leading-snug">{r.name}</div>
                <div className="text-[13px] text-zinc-500">{r.blurb}</div>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mb-4 block">
          <span className="mb-1 block text-[14px] font-semibold text-zinc-700">Passcode</span>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-[16px] ring-1 ring-zinc-300"
            autoFocus
          />
        </label>
        {err && <p className="mb-3 text-[15px] font-medium text-red-700">{err}</p>}
        <Button type="submit" disabled={busy || !passcode}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}

export default function Page() {
  const { state, me, error, setError, loadError, loadMe, act, mark, refresh } = useAlign();
  const [view, setView] = useState<View>("goals");
  const landed = useRef(false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  // The attached tested plan survives a reload, so a refreshed tab never sends an UNTESTED proposal by accident.
  const [attached, setAttachedState] = useState<ViewProps["attached"]>(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(window.sessionStorage.getItem("align.attached") ?? "null");
    } catch {
      return null;
    }
  });
  const setAttached = useCallback((a: ViewProps["attached"]) => {
    setAttachedState(a);
    if (a) window.sessionStorage.setItem("align.attached", JSON.stringify(a));
    else window.sessionStorage.removeItem("align.attached");
  }, []);
  const [confirmReset, setConfirmReset] = useState(false);

  const closeDrawer = useCallback(() => setDrawer(null), []);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error, setError]);

  useEffect(() => {
    if (me?.actor && !landed.current) {
      landed.current = true;
      if (me.actor === "leadership") setView("company");
    }
  }, [me]);

  if (!me) return <main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>;
  if (!me.actor) return <Login onDone={() => { loadMe(); refresh(); }} />;
  if (!state)
    return (
      <main className="p-10 text-[16px]">
        {loadError ? <span className="text-red-700">Could not load state: {loadError}</span> : <span className="text-zinc-500">Loading workspace…</span>}
      </main>
    );

  const props: ViewProps = {
    s: state,
    me,
    selection,
    select: setSelection,
    go: (v) => {
      setDrawer(null);
      setView(v);
    },
    openDrawer: setDrawer,
    act,
    mark,
    attached,
    setAttached,
  };
  const pendingForMe = state.proposals.filter((p) =>
    me.actor === "security" ? ["PENDING_SECURITY", "ACKNOWLEDGED_BY_PRODUCT"].includes(p.state) : p.state === "COUNTERED",
  ).length;
  const rel = state.relations.find((r) => r.id === "r-product-security");
  const unresolved = rel?.status === "UNKNOWN";
  const lastPush = state.pushes?.at(-1);
  const ceo = currentGoal(state, "ceo");
  const nav = me.actor === "leadership" ? NAV_LEADERSHIP : NAV;
  const ops = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ops");

  async function signOut() {
    await api("/api/session", { method: "DELETE" });
    loadMe();
  }
  async function reset() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    await act("/api/reset", { confirm: "reset" });
    setSelection(null);
    setAttached(null);
    setView("goals");
  }

  return (
    <div className="grid h-screen grid-cols-[232px_minmax(0,1fr)_360px] grid-rows-[64px_minmax(0,1fr)] overflow-hidden">
      {/* Sidebar */}
      <aside className="row-span-2 flex flex-col border-r border-zinc-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-5">
          <span className="text-[22px] font-bold tracking-tight">Align</span>
        </div>
        <nav className="flex flex-col gap-1 p-3" aria-label="Main">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => props.go(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-[16px] font-medium ${view === n.id ? "bg-violet-50 text-violet-800" : "text-zinc-700 hover:bg-zinc-100"}`}
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="w-5 text-center">{n.icon}</span>
                {n.label}
              </span>
              {n.id === "proposals" && pendingForMe > 0 && <Badge tone="amber">{pendingForMe}</Badge>}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-200 p-4 text-[14px] text-zinc-600">
          <div className="font-semibold text-zinc-900">{me.name}</div>
          <div className="mb-3">Session {me.sid}</div>
          <div className="flex flex-wrap gap-2">
            <Button kind="secondary" onClick={signOut}>Sign&nbsp;out</Button>
            {ops && <Button kind={confirmReset ? "danger" : "ghost"} onClick={reset}>{confirmReset ? "Confirm reset" : "Reset workspace"}</Button>}
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="col-span-2 flex items-center gap-4 border-b border-zinc-200 bg-white px-6">
        <div className="text-[15px] text-zinc-600">
          <span className="font-semibold text-zinc-900">{state.company}</span> · {state.timeframe}
        </div>
        {unresolved && lastPush && me.actor !== "leadership" ? (
          <button
            onClick={() => {
              mark("ceo_change_viewed");
              if (ceo) setSelection({ kind: "goal", id: ceo.id });
              props.go("goals");
            }}
            className="rounded-lg bg-amber-50 px-3 py-1.5 text-[15px] font-semibold text-amber-900 ring-1 ring-amber-300"
          >
            ▲ Company goal {lastPush.version} pushed by CEO / Leadership at {new Date(lastPush.pushed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · 1 dependency unconfirmed
          </button>
        ) : lastPush && rel?.status === "ACCEPTED" ? (
          <Badge tone="neutral">Company goal {lastPush.version} · dependency agreed by owners</Badge>
        ) : lastPush ? (
          <Badge tone="neutral">Company goal {lastPush.version} pushed {new Date(lastPush.pushed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-3 text-[14px] text-zinc-600">
          Signed in as
          <Badge tone="violet" icon={false}>{me.name}</Badge>
        </div>
      </header>

      {/* Canvas */}
      <main className="relative overflow-y-auto p-6">
        {loadError && (
          <div role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-900 ring-1 ring-amber-300">
            ▲ Connection to the Align server lost ({loadError}). Showing the last data received; retrying every 1.5 s.
          </div>
        )}
        {state.ingest_errors && state.ingest_errors.length > 0 && (
          <div role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[15px] text-amber-900 ring-1 ring-amber-300">
            ▲ Some Sparta evidence could not be read and was not ingested: {state.ingest_errors.join("; ")}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[15px] font-medium text-red-800 ring-1 ring-red-300">
            {error}
          </div>
        )}
        {view === "today" && <TodayView {...props} />}
        {view === "company" && <OrgView {...props} />}
        {view === "work" && <WorkMap {...props} />}
        {view === "goals" && <GoalsView {...props} />}
        {view === "team" && <TeamLens {...props} />}
        {view === "proposals" && <ProposalsView {...props} />}
        {view === "evidence" && <EvidenceView {...props} />}

        {drawer && (
          <div className="fixed inset-y-0 left-[232px] right-[360px] top-16 z-20 flex justify-end bg-zinc-900/20" onClick={closeDrawer}>
            <div
              className={`h-full overflow-y-auto bg-white shadow-xl ring-1 ring-zinc-200 ${drawer === "scenario" ? "w-[min(880px,100%)]" : "w-[min(720px,100%)]"}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              {drawer === "brief" && <BriefDrawer {...props} onClose={closeDrawer} />}
              {drawer === "scenario" && <ScenarioDrawer {...props} onClose={closeDrawer} />}
            </div>
          </div>
        )}
      </main>

      {/* Persistent inspector */}
      <aside className="overflow-y-auto border-l border-zinc-200 bg-white p-5" aria-label="Inspector">
        <Inspector {...props} />
      </aside>
    </div>
  );
}
