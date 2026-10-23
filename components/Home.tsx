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
import { agreementStatus } from "@/components/launch";
import { accepted, activeProposal, currentGoal } from "@/components/select";
import { Badge, Button } from "@/components/ui";
import { api, SESSION_ENDED, useAlign, type Selection } from "@/components/useAlign";
import { ROLE_SWITCH, companyMeasureId, conflictMeasureId, decisionMeasureId, dependencyId, labelsFor, type Labels } from "@/lib/labels";

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
// Custom scenarios show only the decision path in Build A; these views stay Northstar-only.
const CUSTOM_HIDDEN: View[] = ["goals", "evidence", "work"];
const CUSTOM_BLURB: Record<Role, string> = {
  leadership: "sets the company goal",
  product: "asks for the change",
  security: "owns the goal being changed",
};
// Two-letter avatar from the team name: first letters of two words, else first letter plus next consonant
// ("Data Platform" → DP, "Product" → PR, "Leadership" → LD), so roles never share initials by job title.
const teamInitials = (team: string) => {
  const w = team.split(/[\s/]+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  const c = w[0]?.slice(1).match(/[b-df-hj-np-tv-z]/i)?.[0] ?? w[0]?.[1] ?? "";
  return ((w[0]?.[0] ?? "") + c).toUpperCase();
};
// "<Team> lead", except when the team name already says it (a leadership team, or a name ending in "Lead").
// Custom shell: below 1100px the page scrolls as a whole and the Inspector rail stacks under the main column, so
// independent testers on 900–1024px laptops never scroll sideways. The header wraps at every width.
const CUSTOM_SHELL =
  "grid min-h-screen grid-cols-[236px_minmax(0,1fr)] grid-rows-[auto_auto_auto] min-[1100px]:h-screen min-[1100px]:grid-cols-[236px_minmax(0,1fr)_360px] min-[1100px]:grid-rows-[auto_minmax(0,1fr)] min-[1100px]:overflow-hidden";
const CUSTOM_SIDEBAR =
  "sticky top-0 row-span-3 flex h-screen flex-col self-start border-r border-zinc-200 bg-[var(--al-rail)] px-3 pb-3.5 min-[1100px]:static min-[1100px]:row-span-2 min-[1100px]:h-auto min-[1100px]:self-stretch";
const CUSTOM_HEADER = "flex min-h-16 min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 px-6 py-2.5 min-[1100px]:col-span-2";
const CUSTOM_MAIN = "@container relative min-w-0 p-6 text-[16px] min-[1100px]:overflow-y-auto";
const CUSTOM_RAIL = "min-w-0 border-t border-zinc-200 bg-zinc-50 p-[22px] min-[1100px]:overflow-y-auto min-[1100px]:border-t-0 min-[1100px]:border-l";
// The company-goal strip stacks its three parts when the main column is narrow.
const CUSTOM_STRIP =
  "mb-4 grid grid-cols-1 items-center gap-4 rounded-[14px] border border-zinc-200 bg-white px-5 py-3.5 @[60rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] @[60rem]:gap-6";
const CUSTOM_STRIP_CELL = "flex min-w-0 flex-col gap-1 border-t border-zinc-200 pt-3 @[60rem]:border-t-0 @[60rem]:border-l @[60rem]:pl-6 @[60rem]:pt-0";
// api() falls back to "HTTP <status>" when a response carries no sentence; custom screens never show that.
const plainError = (e: string) => (/^HTTP \d+$/.test(e) ? "Something went wrong. Please try again." : e);

/** What /api/workspaces/<id>/login-info returns: company and team names only, never person names. */
interface LoginInfo {
  name: string;
  roles: { id: Role; team: string; blurb: string }[];
}
const WS_ID = /^w_[a-z2-7]{12}$/;

/** The header's Switch team menu (custom scenarios): the other teams, one click each. */
function SwitchTeam({ L, current, onPick }: { L: Labels; current: string; onPick: (r: Role) => void }) {
  const [open, setOpen] = useState(false);
  const others = ROLES.map((r) => r.id).filter((r) => r !== current);
  return (
    <div className="relative">
      <Button kind="secondary" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        Switch team ▾
      </Button>
      {open && (
        <div role="menu" aria-label="Switch team" className="absolute right-0 top-full z-20 mt-1 flex min-w-[220px] flex-col rounded-[10px] border border-zinc-300 bg-white p-1 shadow-lg">
          {others.map((r) => (
            <button
              key={r}
              role="menuitem"
              className="rounded-[8px] px-3 py-2 text-left text-[15px] text-zinc-900 hover:bg-zinc-100"
              onClick={() => {
                setOpen(false);
                onPick(r);
              }}
            >
              {L.role[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Login({ onDone, L, workspace, ended, elsewhere, initialRole }: { onDone: () => void; L?: Labels; workspace?: string; ended?: boolean; elsewhere?: string | null; initialRole?: Role }) {
  if (workspace) return <WorkspaceLogin workspace={workspace} onDone={onDone} ended={ended} elsewhere={elsewhere} initialRole={initialRole} />;
  return <NorthstarLogin onDone={onDone} L={L} elsewhere={elsewhere} initialRole={initialRole} />;
}

/** Shown on a sign-in screen when this browser holds a session for a different custom workspace, or (on a /w page
 *  only, since "/" is the demo itself) for the Northstar demo. */
function Elsewhere({ id }: { id: string | null | undefined }) {
  if (id === "northstar")
    return (
      <p className="mb-4 rounded-[10px] bg-zinc-100 px-3 py-2.5 text-[15px] text-zinc-700">
        This browser is signed in to the Align demo. Signing in here signs it out of the demo. A browser holds one session at a time.
      </p>
    );
  if (!id || !WS_ID.test(id)) return null;
  return (
    <p className="mb-4 rounded-[10px] bg-zinc-100 px-3 py-2.5 text-[15px] text-zinc-700">
      This browser is signed in to another workspace.{" "}
      <a href={`/w/${id}`} className="font-semibold text-violet-700 underline">
        Open that workspace
      </a>
      . A browser holds one workspace session at a time.
    </p>
  );
}

function WorkspaceLogin({ workspace, onDone, ended, elsewhere, initialRole }: { workspace: string; onDone: () => void; ended?: boolean; elsewhere?: string | null; initialRole?: Role }) {
  const [info, setInfo] = useState<LoginInfo | null>(null);
  const [missing, setMissing] = useState<"gone" | "unreachable" | null>(null);
  const [attempt, setAttempt] = useState(0); // Try again re-runs the login-info fetch
  const [role, setRole] = useState<Role>(initialRole ?? "product"); // Switch team preselects the team chosen
  const [passcode, setPasscode] = useState("");
  const [err, setErr] = useState<string | null>(ended ? SESSION_ENDED : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<LoginInfo>(`/api/workspaces/${encodeURIComponent(workspace)}/login-info`)
      .then((i) => {
        setMissing(null);
        setInfo(i);
      })
      // Only a 404 means the workspace is gone; anything else (server down, a read error) can be retried.
      .catch((e) => setMissing((e as { status?: number }).status === 404 ? "gone" : "unreachable"));
  }, [workspace, attempt]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/api/session", { body: { role, passcode, workspace } });
      onDone();
    } catch (x) {
      setErr(plainError((x as Error).message));
    } finally {
      setBusy(false);
    }
  }
  if (missing)
    return (
      <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <div className="al-in w-full max-w-[560px] rounded-[14px] border border-zinc-200 bg-white p-6 text-[16px] text-zinc-700 sm:p-9">
          {missing === "gone" ? (
            <p>This workspace no longer exists.</p>
          ) : (
            <>
              <p className="mb-4">Couldn’t reach this workspace. Check that Align is running, then try again.</p>
              <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            </>
          )}
        </div>
      </main>
    );
  if (!info) return <main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>;
  return (
    <main className="flex min-h-screen items-center justify-center p-4 sm:p-8">
      <form onSubmit={submit} className="al-in w-full max-w-[560px] rounded-[14px] border border-zinc-200 bg-white p-6 sm:p-9">
        <div className="mb-1 flex items-baseline gap-2.5">
          <span className="font-display text-[34px] leading-none">Align</span>
          <span className="al-lbl text-violet-700">by Liminal</span>
        </div>
        <p className="mb-2 text-[16px] text-zinc-600">{info.name}. Choose your team; each person signs in separately with their own passcode.</p>
        <p className="mb-6 text-[14px] text-zinc-500">{ROLE_SWITCH}</p>
        <Elsewhere id={elsewhere} />
        <fieldset className="mb-4">
          <legend className="al-lbl mb-2">I am on</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {info.roles.map((r) => (
              <label key={r.id} className={`cursor-pointer rounded-[14px] border p-3.5 text-[16px] transition ${role === r.id ? "border-zinc-300 bg-zinc-100 outline-2 outline-offset-2 outline-violet-700" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"}`}>
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
                <div className="font-semibold leading-snug">{r.team}</div>
                <div className="text-[16px] text-zinc-500">{r.blurb}</div>
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

function NorthstarLogin({ onDone, L, elsewhere, initialRole }: { onDone: () => void; L?: Labels; elsewhere?: string | null; initialRole?: Role }) {
  const [role, setRole] = useState<Role>(initialRole ?? "product");
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
      setErr(L && !L.northstar ? plainError((x as Error).message) : (x as Error).message);
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
        {L && !L.northstar ? (
          <>
            <p className="mb-2 text-[16px] text-zinc-600">{L.company}. Choose who you are; each person signs in separately.</p>
            <p className="mb-6 text-[14px] text-zinc-500">{ROLE_SWITCH}</p>
          </>
        ) : (
          <p className="mb-6 text-[16px] text-zinc-600">Northstar Security, a made-up company for this demo. Choose who you are; each person signs in separately.</p>
        )}
        <Elsewhere id={elsewhere} />
        <fieldset className="mb-4">
          <legend className="al-lbl mb-2">I am</legend>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <label key={r.id} className={`cursor-pointer rounded-[14px] border p-3.5 text-[16px] transition ${role === r.id ? "border-zinc-300 bg-zinc-100 outline-2 outline-offset-2 outline-violet-700" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"}`}>
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
                {L && !L.northstar ? (
                  <>
                    <div className="font-semibold leading-snug">{L.person[r.id]}</div>
                    <div className="text-[16px] text-zinc-500">
                      {L.role[r.id]} · {CUSTOM_BLURB[r.id]}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold leading-snug">{r.name}</div>
                    <div className="text-[13px] text-zinc-500">{r.blurb}</div>
                  </>
                )}
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

/** The app. `workspace` is the /w/<id> slug for a custom workspace; omitted for Northstar at /. */
export default function Home({ workspace }: { workspace?: string }) {
  const { state, me, error, setError, loadError, meError, loadMe, act, mark, refresh, ended, elsewhere } = useAlign(workspace);
  const [nextRole, setNextRole] = useState<Role | null>(null); // the team chosen in Switch team, until it signs in
  const [view, setView] = useState<View>("decision");
  const landed = useRef<string | null>(null); // the role the landing view was set for; null when signed out
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
    // Landing view once per sign-in, so a tester who signs out and back in as another role in the same window
    // lands on that role's view. Guarded by the ref, so it can't cascade.
    const actor = me?.actor ?? null;
    if (actor === landed.current) return;
    landed.current = actor;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (actor) setView(actor === "leadership" ? "company" : "decision");
  }, [me]);

  if (!me)
    return meError ? (
      <main className="p-10 text-[16px]">
        <p role="alert" className="mb-4 text-red-700">
          Couldn’t reach Align: {meError}
        </p>
        <Button onClick={() => void loadMe()}>Try again</Button>
      </main>
    ) : (
      <main className="p-10 text-[16px] text-zinc-500">Loading Align…</main>
    );
  // The signed-out view has no simulations (B1-6); the sign-in screen reads only the labels.
  if (!me.actor)
    return (
      <Login
        L={state ? labelsFor({ simulations: [], ...state }) : undefined}
        workspace={workspace}
        ended={ended}
        elsewhere={elsewhere}
        initialRole={nextRole ?? undefined}
        onDone={() => {
          setNextRole(null);
          loadMe();
          refresh();
        }}
      />
    );
  // Until the state poll catches up with the sign-in, the last state is the signed-out view (or another role's).
  if (!state || state.me === null || state.me !== me.actor)
    return (
      <main className="p-10 text-[16px]">
        {meError || loadError ? (
          <>
            <p role="alert" className="mb-4 text-red-700">Couldn’t load the workspace: {meError ?? loadError}</p>
            <Button onClick={() => { loadMe(); refresh(); }}>Try again</Button>
          </>
        ) : (
          <span className="text-zinc-500">Loading workspace…</span>
        )}
      </main>
    );

  const L = labelsFor(state);
  const custom = !L.northstar;
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
  const rel = state.relations.find((r) => r.id === dependencyId(state));
  const unresolved = rel?.status === "UNKNOWN";
  const lastPush = state.pushes?.at(-1);
  const ceo = currentGoal(state, "ceo");
  const nav = (me.actor === "leadership" ? NAV_LEADERSHIP : NAV)
    .filter((n) => !custom || !CUSTOM_HIDDEN.includes(n.id))
    .map((n) => (custom && n.id === "company" ? { ...n, sub: "Shared with both teams" } : n));
  const openProposal = activeProposal(state);
  const proposalOpen = openProposal && !["RATIFIED", "REJECTED"].includes(openProposal.state);
  const decisionCount = pendingForMe + (me.actor === "product" && unresolved && !proposalOpen ? 1 : 0);
  const counts: Partial<Record<View, number>> = { decision: decisionCount, proposals: pendingForMe };
  const myGoal = me.actor === "product" || me.actor === "security" ? currentGoal(state, me.actor) : undefined;
  const kr2 = ceo?.measures.find((m) => m.id === companyMeasureId(state));
  // Custom: the goal's current target. An approval swaps the owner's measure, not its objective.
  const lastAcc = state.acceptances.at(-1);
  const myTarget = custom && myGoal
    ? (lastAcc?.new_goal_id === myGoal.id ? myGoal.measures.find((m) => m.id === decisionMeasureId(state, lastAcc)) : undefined) ??
      myGoal.measures.find((m) => m.id === conflictMeasureId(state)) ??
      myGoal.measures[0]
    : undefined;
  // Custom scenarios have no live agent, so the rail always shows the Inspector.
  const focus = !custom && (view === "decision" || view === "today");
  const alikeOk = state.brief?.alike_status === "retrieved";
  const ops = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ops");

  async function signOut() {
    await api("/api/session", { method: "DELETE" });
    loadMe();
  }
  // Switch team (founder ruling, LIM-2437 bd53f6f6): sign this team out and open the chosen team's sign-in. Its
  // passcode is still required, so one person can't act as the owner without it, and nothing carries over.
  async function switchTo(role: Role) {
    setNextRole(role);
    await signOut();
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
    <div className={custom ? CUSTOM_SHELL : "grid h-screen grid-cols-[236px_minmax(0,1fr)_360px] grid-rows-[64px_minmax(0,1fr)] overflow-hidden"}>
      {/* Sidebar */}
      <aside className={custom ? CUSTOM_SIDEBAR : "row-span-2 flex flex-col border-r border-zinc-200 bg-[var(--al-rail)] px-3 pb-3.5"}>
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
                  <span className={custom ? "text-[13px] leading-snug text-zinc-500" : "truncate text-[13px] text-zinc-500"}>{n.sub}</span>
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
        {!custom && (
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
        )}
      </aside>

      {/* Top bar */}
      <header className={custom ? CUSTOM_HEADER : "col-span-2 flex items-center gap-4 border-b border-zinc-200 px-6"}>
        <div className="shrink-0 whitespace-nowrap text-[15px] text-zinc-500">
          <span className="font-semibold text-zinc-900">{state.company}</span> · {state.timeframe}
        </div>
        {custom && (
          <span className="rounded-full border border-violet-700 bg-violet-50 px-3 py-1 text-[16px] font-semibold text-violet-700">
            Acting as {L.role[me.actor]}
          </span>
        )}
        {custom ? (
          rel?.status === "ACCEPTED" ? (
            <Badge tone="neutral">
              {L.team.product} and {L.team.security}: {agreementStatus(accepted(state)).toLowerCase()}
            </Badge>
          ) : unresolved && me.actor !== "leadership" ? (
            <span className="rounded-2xl border border-amber-700 bg-amber-50 px-3 py-1.5 font-mono text-[14px] leading-snug tracking-[0.04em] text-amber-700">
              ▲ New company goal · {L.team.product} and {L.team.security} haven’t agreed yet
            </span>
          ) : null
        ) : unresolved && lastPush && me.actor !== "leadership" ? (
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
        <div className={custom ? "ml-auto flex min-w-0 items-center gap-3" : "ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap"}>
          {ops && !custom && (
            <Button kind={confirmReset ? "danger" : "ghost"} onClick={reset}>
              {confirmReset ? "Click again to reset" : "Start the demo over"}
            </Button>
          )}
          {workspace && me.actor === "leadership" && (
            <Button kind={confirmReset ? "danger" : "ghost"} onClick={reset}>
              {confirmReset ? "Click again to restart this scenario" : "Restart this scenario"}
            </Button>
          )}
          {ops && custom && !workspace && me.actor === "leadership" && (
            <Button kind={confirmReset ? "danger" : "ghost"} onClick={reset}>
              {confirmReset ? "Click again to go back to the Northstar demo" : "Back to the Northstar demo"}
            </Button>
          )}
          <span aria-hidden className="grid size-9 place-items-center rounded-full border border-violet-700 bg-violet-50 text-[13px] font-bold text-violet-700">
            {custom ? teamInitials(L.role[me.actor]) : initials(me.name ?? "")}
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-zinc-900">{custom ? L.person[me.actor] : me.name}</div>
            {custom ? (
              <div className="text-[12.5px] text-zinc-500">
                {L.role[me.actor]} · {CUSTOM_BLURB[me.actor]}
              </div>
            ) : (
              <div className="text-[12.5px] text-zinc-500">{TEAM_OF[me.actor] ?? ""} · Owner</div>
            )}
          </div>
          {custom && <SwitchTeam L={L} current={me.actor} onPick={(r) => void switchTo(r)} />}
          <Button kind="ghost" onClick={signOut}>
            Sign&nbsp;out
          </Button>
        </div>
      </header>

      {/* Canvas */}
      <main className={custom ? CUSTOM_MAIN : "relative overflow-y-auto p-6"}>
        {loadError && (
          <div role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-900 ring-1 ring-amber-300">
            ▲ Lost connection to the server ({loadError}). Showing the last update; reconnecting automatically.
          </div>
        )}
        {L.sandbox && state.ingest_errors && state.ingest_errors.length > 0 && (
          <div role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[15px] text-amber-900 ring-1 ring-amber-300">
            ▲ Some practice-test results couldn’t be read and aren’t shown: {state.ingest_errors.join("; ")}
          </div>
        )}
        {error && (
          <div role="alert" className="al-in mb-4 rounded-[10px] border border-red-700 bg-red-50 px-4 py-2.5 text-[15px] text-zinc-900">
            {custom ? plainError(error) : error}
          </div>
        )}
        {me.actor !== "leadership" && ceo && (
          <div className={custom ? CUSTOM_STRIP : "mb-4 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-6 rounded-[14px] border border-zinc-200 bg-white px-5 py-3.5"}>
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-xl bg-violet-700 text-[22px] text-black">◎</span>
              <div className="min-w-0">
                <div className={custom ? "flex flex-wrap items-center gap-2.5" : "flex items-center gap-2.5"}>
                  <span className="al-lbl">Company goal</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-700">{state.timeframe}</span>
                  {ceo.changed && <Badge tone="amber">Changed today</Badge>}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug text-zinc-900" title={ceo.objective}>{ceo.objective}</div>
              </div>
            </div>
            <div className={custom ? CUSTOM_STRIP_CELL : "flex flex-col gap-1 border-l border-zinc-200 pl-6"}>
              {custom ? (
                <span className="al-lbl !text-amber-700">The new company requirement</span>
              ) : (
                <span className="al-lbl !text-amber-700">The CEO&apos;s new requirement</span>
              )}
              <span className="line-clamp-2 text-[14px] leading-snug text-zinc-900">{kr2 ? kr2.text : "No new requirement yet"}</span>
              {kr2 && rel && (custom ? (
                <span className="text-[14px] text-zinc-500">
                  {L.team.product} and {L.team.security}:{" "}
                  {rel.status === "ACCEPTED" ? agreementStatus(accepted(state)).toLowerCase() : rel.status === "UNKNOWN" ? "not agreed yet" : "proposal in progress"}
                </span>
              ) : <span className="text-[12.5px] text-zinc-500">Product and Security: {rel.status === "ACCEPTED" ? "agreed" : rel.status === "UNKNOWN" ? "not agreed yet" : "proposal in progress"}</span>)}
            </div>
            <div className={custom ? CUSTOM_STRIP_CELL : "flex flex-col gap-1 border-l border-zinc-200 pl-6"}>
              <span className="al-lbl !text-violet-700">Your goal{myGoal ? ` · ${myGoal.version}` : ""}</span>
              <span className="line-clamp-2 text-[14px] leading-snug text-zinc-900">{myGoal?.objective ?? "Unknown"}</span>
              {custom && myTarget && <span className="line-clamp-2 text-[14px] leading-snug text-zinc-700">Target: {myTarget.text}</span>}
            </div>
          </div>
        )}
        {view === "decision" && <DecisionView {...props} />}
        {view === "today" && <DecisionView {...props} />}
        {view === "company" && <OrgView {...props} />}
        {view === "work" && !custom && <WorkMap {...props} />}
        {view === "goals" && !custom && <GoalsView {...props} />}
        {view === "team" && <TeamLens {...props} />}
        {view === "proposals" && <ProposalsView {...props} />}
        {view === "evidence" && !custom && <EvidenceView {...props} />}

        {drawer && !custom && (
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
      <aside className={custom ? CUSTOM_RAIL : "overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-[22px]"} aria-label={focus ? "Security's AI agent" : "Inspector"}>
        {focus ? <AgentPane s={state} /> : <Inspector {...props} />}
      </aside>
    </div>
  );
}
