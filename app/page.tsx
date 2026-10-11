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
import { AgentPane } from "@/components/AgentPane";
import { DecisionView } from "@/components/DecisionView";
import { OrgView } from "@/components/OrgView";
import { WorkMap } from "@/components/WorkMap";
import { activeProposal, currentGoal } from "@/components/select";
import { Badge, Button } from "@/components/ui";
import { api, useAlign, type Selection } from "@/components/useAlign";

type NavItem = { id: View; label: string; sub: string; icon: string };
const NAV: NavItem[] = [
  { id: "decision", label: "Next decision", sub: "What needs you", icon: "◆" },
  { id: "goals", label: "Goals", sub: "How they connect", icon: "◎" },
  { id: "proposals", label: "Proposals", sub: "Changes in progress", icon: "✉" },
  { id: "evidence", label: "Evidence", sub: "Decisions and proof", icon: "▤" },
];
const NAV_LEADERSHIP: NavItem[] = [
  { id: "company", label: "Company goal", sub: "Set and send", icon: "◆" },
  { id: "goals", label: "Goals", sub: "How they connect", icon: "◎" },
  { id: "work", label: "Work", sub: "Where AI agent work goes", icon: "⌁" },
  { id: "evidence", label: "Evidence", sub: "Decisions and proof", icon: "▤" },
];
const TEAM_OF: Record<string, string> = { product: "Product", security: "Security", leadership: "Leadership" };
const initials = (name: string) =>
  name
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
const ROLES = [
  { id: "leadership", name: "CEO / Leadership", blurb: "Sets the company goal" },
  { id: "product", name: "Product Director", blurb: "Owns the beta launch" },
  { id: "security", name: "Alex / Security Lead", blurb: "Owns how customer issues get handled" },
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
      <form onSubmit={submit} className="al-in w-[560px] rounded-[14px] border border-zinc-200 bg-white p-9">
        <div className="mb-1 flex items-baseline gap-2.5">
          <span className="font-display text-[34px] leading-none">Align</span>
          <span className="al-lbl text-violet-700">by Liminal</span>
        </div>
        <p className="mb-6 text-[16px] text-zinc-600">Northstar Security, a made-up company for this demo. Choose who you are; each person signs in separately.</p>
        <fieldset className="mb-4">
          <legend className="al-lbl mb-2">I am</legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <label key={r.id} className={`cursor-pointer rounded-[14px] border p-3.5 text-[16px] transition ${role === r.id ? "border-zinc-300 bg-zinc-100 outline-2 outline-offset-2 outline-violet-700" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"}`}>
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
                <div className="font-semibold leading-snug">{r.name}</div>
                <div className="text-[13px] text-zinc-500">{r.blurb}</div>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mb-4 block">
          <span className="al-lbl mb-1.5 block">Passcode</span>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full rounded-[10px] border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-[16px] text-zinc-900"
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
  const [view, setView] = useState<View>("decision");
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
        {loadError ? <span className="text-red-700">Couldn’t load the workspace: {loadError}</span> : <span className="text-zinc-500">Loading workspace…</span>}
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
  const openProposal = activeProposal(state);
  const proposalOpen = openProposal && !["RATIFIED", "REJECTED"].includes(openProposal.state);
  const decisionCount = pendingForMe + (me.actor === "product" && unresolved && !proposalOpen ? 1 : 0);
  const counts: Partial<Record<View, number>> = { decision: decisionCount, proposals: pendingForMe };
  const myGoal = me.actor === "product" || me.actor === "security" ? currentGoal(state, me.actor) : undefined;
  const kr2 = ceo?.measures.find((m) => m.id === "KR2");
  const focus = view === "decision" || view === "today";
  const alikeOk = state.brief?.alike_status === "retrieved";
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
    setView(me?.actor === "leadership" ? "company" : "decision");
  }

  return (
    <div className="grid h-screen grid-cols-[236px_minmax(0,1fr)_360px] grid-rows-[64px_minmax(0,1fr)] overflow-hidden">
      {/* Sidebar */}
      <aside className="row-span-2 flex flex-col border-r border-zinc-200 bg-[var(--al-rail)] px-3 pb-3.5">
        <div className="flex h-16 items-center gap-2.5 px-2.5">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-violet-700 font-display text-[18px] text-black">A</span>
          <span className="font-display text-[22px] leading-none">Align</span>
          <span className="border-l border-zinc-200 pl-2.5 text-[13px] text-zinc-500">by Liminal</span>
        </div>
        <nav className="mt-1.5 flex flex-col gap-1" aria-label="Main">
          {nav.map((n) => {
            const on = view === n.id;
            const count = counts[n.id] ?? 0;
            return (
              <button
                key={n.id}
                onClick={() => props.go(n.id)}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-[60px] w-full items-center gap-3.5 rounded-xl border px-3.5 text-left transition ${on ? "border-violet-700 bg-violet-50" : "border-transparent hover:bg-zinc-100"}`}
              >
                <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-lg border-[1.5px] font-mono text-[13px] ${on ? "border-violet-700 text-violet-700" : "border-zinc-500 text-zinc-700"}`}>
                  {n.icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] font-semibold leading-tight text-zinc-900">{n.label}</span>
                  <span className="truncate text-[13px] text-zinc-500">{n.sub}</span>
                </span>
                {count > 0 && (
                  <span className={`ml-auto grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[12px] font-bold ${n.id === "decision" ? "bg-violet-700 text-black" : "bg-zinc-100 text-zinc-900"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2.5 rounded-[14px] border border-zinc-200 bg-white p-3.5 text-[14px]">
          <span className="al-lbl !text-violet-700">Connected</span>
          <div className="flex items-start gap-2.5">
            <span aria-hidden className={`mt-[5px] size-2.5 shrink-0 rounded-full ${state.simulations.length ? "bg-violet-700" : "bg-zinc-400"}`} />
            <div>
              <b>Sparta</b>
              <div className="text-[13px] text-zinc-500">
                Practice tests · {state.simulations.length} run{state.simulations.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <span aria-hidden className={`mt-[5px] size-2.5 shrink-0 rounded-full ${alikeOk ? "bg-violet-700" : "bg-zinc-400"}`} />
            <div>
              <b>Alike</b>
              <div className="text-[13px] text-zinc-500">Team decision memory · {alikeOk ? "1 earlier decision" : "not available"}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="col-span-2 flex items-center gap-4 border-b border-zinc-200 px-6">
        <div className="shrink-0 whitespace-nowrap text-[15px] text-zinc-500">
          <span className="font-semibold text-zinc-900">{state.company}</span> · {state.timeframe}
        </div>
        {unresolved && lastPush && me.actor !== "leadership" ? (
          <button
            onClick={() => {
              mark("ceo_change_viewed");
              if (ceo) setSelection({ kind: "goal", id: ceo.id });
              props.go("goals");
            }}
            className="block h-9 min-w-0 truncate rounded-full border border-amber-700 bg-amber-50 px-3 font-mono text-[13px] leading-[34px] tracking-[0.04em] text-amber-700 hover:brightness-125"
          >
            ▲ New company goal from the CEO · Product and Security haven’t agreed yet
          </button>
        ) : lastPush && rel?.status === "ACCEPTED" ? (
          <Badge tone="neutral">Company goal {lastPush.version} · Product and Security agreed</Badge>
        ) : lastPush ? (
          <Badge tone="neutral">Company goal {lastPush.version} sent {new Date(lastPush.pushed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Badge>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
          {ops && (
            <Button kind={confirmReset ? "danger" : "ghost"} onClick={reset}>
              {confirmReset ? "Click again to reset" : "Start the demo over"}
            </Button>
          )}
          <span aria-hidden className="grid size-9 place-items-center rounded-full border border-violet-700 bg-violet-50 text-[13px] font-bold text-violet-700">
            {initials(me.name ?? "")}
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-zinc-900">{me.name}</div>
            <div className="text-[12.5px] text-zinc-500">{TEAM_OF[me.actor] ?? ""} · Owner</div>
          </div>
          <Button kind="ghost" onClick={signOut}>
            Sign&nbsp;out
          </Button>
        </div>
      </header>

      {/* Canvas */}
      <main className="relative overflow-y-auto p-6">
        {loadError && (
          <div role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-900 ring-1 ring-amber-300">
            ▲ Lost connection to the server ({loadError}). Showing the last update; reconnecting automatically.
          </div>
        )}
        {state.ingest_errors && state.ingest_errors.length > 0 && (
          <div role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[15px] text-amber-900 ring-1 ring-amber-300">
            ▲ Some practice-test results couldn’t be read and aren’t shown: {state.ingest_errors.join("; ")}
          </div>
        )}
        {error && (
          <div role="alert" className="al-in mb-4 rounded-[10px] border border-red-700 bg-red-50 px-4 py-2.5 text-[15px] text-zinc-900">
            {error}
          </div>
        )}
        {me.actor !== "leadership" && ceo && (
          <div className="mb-4 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-6 rounded-[14px] border border-zinc-200 bg-white px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-xl bg-violet-700 text-[22px] text-black">◎</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="al-lbl">Company goal</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-700">{state.timeframe}</span>
                  {ceo.changed && <Badge tone="amber">Changed today</Badge>}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug text-zinc-900" title={ceo.objective}>{ceo.objective}</div>
              </div>
            </div>
            <div className="flex flex-col gap-1 border-l border-zinc-200 pl-6">
              <span className="al-lbl !text-amber-700">The CEO&apos;s new requirement</span>
              <span className="line-clamp-2 text-[14px] leading-snug text-zinc-900">{kr2 ? kr2.text : "No new requirement yet"}</span>
              {kr2 && rel && <span className="text-[12.5px] text-zinc-500">Product and Security: {rel.status === "ACCEPTED" ? "agreed" : rel.status === "UNKNOWN" ? "not agreed yet" : "proposal in progress"}</span>}
            </div>
            <div className="flex flex-col gap-1 border-l border-zinc-200 pl-6">
              <span className="al-lbl !text-violet-700">Your goal{myGoal ? ` · ${myGoal.version}` : ""}</span>
              <span className="line-clamp-2 text-[14px] leading-snug text-zinc-900">{myGoal?.objective ?? "Unknown"}</span>
            </div>
          </div>
        )}
        {view === "decision" && <DecisionView {...props} />}
        {view === "today" && <DecisionView {...props} />}
        {view === "company" && <OrgView {...props} />}
        {view === "work" && <WorkMap {...props} />}
        {view === "goals" && <GoalsView {...props} />}
        {view === "team" && <TeamLens {...props} />}
        {view === "proposals" && <ProposalsView {...props} />}
        {view === "evidence" && <EvidenceView {...props} />}

        {drawer && (
          <div className="fixed inset-y-0 left-[236px] right-[360px] top-16 z-20 flex justify-end bg-[rgba(5,5,7,0.55)]" onClick={closeDrawer}>
            <div
              className={`al-in h-full overflow-y-auto border-l border-zinc-200 bg-white ${drawer === "scenario" ? "w-[min(880px,100%)]" : "w-[min(720px,100%)]"}`}
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

      {/* Right rail: the live AI-agent pane on the decision screen, the inspector everywhere else */}
      <aside className="overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-[22px]" aria-label={focus ? "Security's AI agent" : "Inspector"}>
        {focus ? <AgentPane s={state} /> : <Inspector {...props} />}
      </aside>
    </div>
  );
}
