"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Drawer, EmptyState, EvidenceLabel, Panel, StatusPill, type EvidenceKind } from "../../_ui/ds";
import { Loading, Note, useApi, when } from "../../_ui/kit";
import type { Me } from "../../_ui/server";
import type { AnySession, ChangeRequest, MySession } from "../../_ui/types";
import FirstRun, { seenApp } from "./first-run";
import { crStatus, ReviewDrawer } from "./review-drawer";
import { appStatusWords, type EvidenceClass, type HomeNext, type HomePerson } from "@/lib/v2/home-core.mts";

// Concept A Home (LIM-2472): the command center for parallel AI work. It leads with the work: every goal the person can
// read, with the plan in force (the version, and whether its latest change is launched or only approved), what Align
// delivered for that version (the launch's receipts), and the shared sessions bound to it. A rail of next-step cards
// holds what needs this person's judgment; a change request opens in the review drawer over the Home, and closing it
// returns to the same picture. Only what Align knows is shown, each with its evidence class: a delivery receipt (Align
// delivered something and recorded it), agent reported (a session's own binding or answer), not observed (nothing).
// Nothing says what an agent is doing, whether it follows the plan, or how far along it is. A connected app's last
// connection is never a read: apps are judged by last_read_at only (LIM-2454 cc0df90c).
//
// Reads: GET …/home (queues, goals, apps), GET …/sessions (mine, and for owners everyone's), GET …/change-requests
// (each goal's latest decided change), and per launched change GET …/value (that launch's delivery counts).

interface QueueChange {
  id: string;
  goal: { id: string; title: string; version: number };
  state: string;
  requester: HomePerson;
  reason: string;
  next: HomeNext;
  waiting_on: HomePerson[];
}
interface Declined {
  id: string;
  goal: { id: string; title: string; version: number };
  rejected_by: HomePerson | null;
  rejection_reason: string | null;
  decided_at: string | null;
}
interface Ask {
  id: string;
  team: { id: string; name: string };
  goal: { id: string; title: string } | null;
  text: string;
  from_label: string | null;
  requester: HomePerson;
  next: HomeNext;
}
interface QueueAlignment {
  id: string;
  requester: HomePerson;
  target_goal: { id: string | null; title: string | null; visible: boolean } | null;
  next: HomeNext;
  waiting_on: HomePerson[];
}
interface HomeGoal {
  id: string;
  title: string;
  version: number;
  level: "company" | "team";
  team: { id: string; name: string } | null;
  owner: HomePerson;
  mine: boolean;
}
interface App {
  id: string;
  name: string;
  connected_by: HomePerson;
  approved_at: string;
  last_used_at: string | null;
  last_read_at: string | null;
  evidence_class: EvidenceClass;
}
interface HomeData {
  me: string;
  change_requests: { waiting_on_me: QueueChange[]; waiting_on_others: QueueChange[]; declined?: Declined[] } | null;
  asks: { waiting_on_me: Ask[] } | null;
  alignments: { waiting_on_me: QueueAlignment[]; waiting_on_others: QueueAlignment[] } | null;
  goals: HomeGoal[] | null;
  apps: { everyone: boolean; items: App[] } | null;
}
interface Groups {
  waiting_on_me: ChangeRequest[];
  mine: ChangeRequest[];
  others: ChangeRequest[];
}
interface Delivery {
  launched_at: string | null;
  delivery: { sessions: number; received: number; applied: number } | null;
}

const UNREAD: HomeData = { me: "", change_requests: null, asks: null, alignments: null, goals: null, apps: null };
const EV: Record<EvidenceClass, EvidenceKind> = { delivery_receipt: "receipt", agent_reported: "reported", not_observed: "unobserved" };
const HARNESS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const names = (ps: HomePerson[], me: string) => ps.map((p) => (p.id === me ? "you" : p.name)).join(", ");

/** The review drawer's place in the URL (?review=<goal>.<id>), so Back, a reload and a shared link reopen it. */
function useReview(): [{ goal: string; id: string } | null, (r: { goal: string; id: string } | null) => void] {
  const [r, setR] = useState<{ goal: string; id: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get("review");
      const [goal, id] = (v ?? "").split(".");
      setR(goal && id ? { goal, id } : null);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const set = useCallback((next: { goal: string; id: string } | null) => {
    const u = new URL(window.location.href);
    if (next) u.searchParams.set("review", `${next.goal}.${next.id}`);
    else u.searchParams.delete("review");
    window.history[next ? "pushState" : "replaceState"](null, "", u);
    setR(next);
  }, []);
  return [r, set];
}

const primaryBtn =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) bg-(--accent) px-3.5 text-[14px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:min-h-[44px]";
const quietLink = "inline-flex min-h-[40px] items-center text-[14px] font-medium text-(--accent-text) hover:underline max-sm:min-h-[44px]";

/** A next-step card: what it is, its state, the one thing to read, what it needs, and one action. */
function NextCard({ status, kicker, title, quote, need, action, testId }: { status: ReactNode; kicker: string; title: ReactNode; quote?: string; need: string; action: ReactNode; testId: string }) {
  return (
    <li className="flex flex-col gap-2 rounded-(--radius-m) border border-(--line-strong) bg-(--bg-raised) p-3.5" data-home-item={testId}>
      <div className="flex flex-wrap items-center gap-2">
        {status}
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">{kicker}</span>
      </div>
      <p className="text-[15px] leading-snug text-(--text-1)">{title}</p>
      {quote && <p className="line-clamp-2 text-[13px] text-(--text-2)">&ldquo;{quote}&rdquo;</p>}
      <p className="text-[13px] text-(--text-2)">{need}</p>
      <div className="flex flex-wrap items-center gap-3">{action}</div>
    </li>
  );
}

/** What Align delivered for a goal's launched version: the launch's own counts (GET …/value). */
function Delivered({ ws, cr }: { ws: string; cr: ChangeRequest }) {
  const v = useApi<Delivery>(`/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/value`);
  if (!v.data) return v.error ? <EvidenceLabel kind="unobserved" size="s" detail="delivery unknown" /> : null;
  const d = v.data.delivery;
  if (!d || d.sessions === 0) return <EvidenceLabel kind="unobserved" size="s" detail={`v${cr.version} reached no bound session`} />;
  if (d.received === 0) return <EvidenceLabel kind="unobserved" size="s" detail={`v${cr.version} sent to ${d.sessions}, no receipt yet`} />;
  return <EvidenceLabel kind="receipt" size="s" detail={`v${cr.version} received by ${d.received} of ${d.sessions}`} />;
}

/** One shared session row: what Align holds about it and the evidence class of each claim. */
function SessionRow({ s, me }: { s: MySession; me: Me }) {
  const stopped = s.stop_status && s.stop_status.receipts.length > 0;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 max-sm:grid-cols-1" data-home-session={s.session_key.slice(-6)}>
      <div className="min-w-0">
        <p className="truncate text-[14px] text-(--text-1)">{s.title ?? s.repo_alias ?? "Untitled session"}</p>
        <p className="truncate font-mono text-[12px] text-(--text-3)">
          {HARNESS[s.harness] ?? s.harness} · {s.repo_alias ?? "repo hidden"} · {me.name.split(" ")[0]} · started {ago(s.started_at)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {s.state === "suspended" && <StatusPill kind="held" size="s" label="Sharing paused" />}
        {s.stop_status ? (
          <EvidenceLabel kind={stopped ? "receipt" : "unobserved"} size="s" detail={`${s.stop_status.kind} ${stopped ? "received" : "sent, no receipt"}`} />
        ) : (
          <EvidenceLabel kind="reported" size="s" detail="bound by its agent" />
        )}
      </div>
    </li>
  );
}

function GoalGroup({ ws, g, me, latest, sessions, onReview }: { ws: string; g: HomeGoal; me: Me; latest: ChangeRequest | null; sessions: MySession[]; onReview: (cr: ChangeRequest) => void }) {
  const st = latest ? crStatus(latest) : null;
  return (
    <li className="overflow-hidden rounded-(--radius-m) border border-(--line) bg-(--bg-panel)" data-home-goal={g.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-(--line) px-4 py-3">
        <div className="min-w-0 flex-1 basis-60">
          <Link href={`/app/w/${ws}/goals/${g.id}`} className="text-[15px] font-semibold text-(--text-1) hover:underline">
            {g.title}
          </Link>
          <p className="font-mono text-[12px] text-(--text-3)">
            {g.level === "company" ? "Company" : (g.team?.name ?? "Team")} · {g.owner.id === me.id ? "yours" : g.owner.name} · v{g.version} in force
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {latest && st && (
            <button type="button" onClick={() => onReview(latest)} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)" aria-label={`Review the latest change on ${g.title}`}>
              <StatusPill kind={st.kind} size="s" label={st.kind === "launched" ? `v${latest.version} launched` : st.kind === "approved" ? `v${latest.version} approved, not launched` : st.label} />
            </button>
          )}
          {latest?.launch === "launched" && <Delivered ws={ws} cr={latest} />}
        </div>
      </div>
      {sessions.length ? (
        <ul className="divide-y divide-(--line)">{sessions.map((s) => <SessionRow key={s.session_key} s={s} me={me} />)}</ul>
      ) : (
        <p className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px] text-(--text-2)">
          <EvidenceLabel kind="unobserved" size="s" /> None of your shared sessions is bound to this goal.
        </p>
      )}
    </li>
  );
}

export default function Home({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const s = useApi<{ mine: MySession[]; all: AnySession[] | null }>(`/api/v2/workspaces/${ws}/sessions`);
  const c = useApi<Groups>(`/api/v2/workspaces/${ws}/change-requests`);
  const [review, setReview] = useReview();
  const [connect, setConnect] = useState(false);
  const h = d.data ?? (d.error ? UNREAD : null);
  const base = `/app/w/${ws}`;
  const reloadAll = useCallback(() => {
    d.reload();
    s.reload();
    c.reload();
  }, [d, s, c]);

  const allCrs = c.data ? [...c.data.waiting_on_me, ...c.data.mine, ...c.data.others] : [];
  /** Each goal's latest decided change, or an open one when nothing has been decided: what its plan pill says. */
  const latestFor = (goal: string) => {
    const on = allCrs.filter((x) => x.goal.id === goal && x.state === "approved").sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
    return on[0] ?? null;
  };
  const crById = new Map(allCrs.map((x) => [x.id, x]));
  const mine = s.data?.mine.filter((x) => x.state !== "stopped") ?? [];
  const byGoal = (goal: string) => mine.filter((x) => (x.current_epoch?.goal?.id ?? x.governing_goal?.id) === goal);
  const goalIds = new Set(h?.goals?.map((g) => g.id) ?? []);
  const unbound = mine.filter((x) => !goalIds.has(x.current_epoch?.goal?.id ?? x.governing_goal?.id ?? ""));
  const mineKeys = new Set(mine.map((x) => x.session_key));
  const teammates = s.data?.all?.filter((x) => !mineKeys.has(x.session_key)) ?? null;

  const onMe = h && h.change_requests && h.asks && h.alignments ? h.change_requests.waiting_on_me.length + h.asks.waiting_on_me.length + h.alignments.waiting_on_me.length : null;
  const apps = h?.apps ?? null;
  const readers = apps?.items.filter((a) => a.last_read_at).length ?? 0;
  const noAgents = !!apps && !apps.items.some(seenApp) && s.data !== null && mine.length === 0 && !teammates?.length;
  const open = (goal: string, id: string) => setReview({ goal, id });

  const changeCard = (q: QueueChange, onMine: boolean) => {
    const full = crById.get(q.id);
    const st = full ? crStatus(full) : { kind: q.next === "launch" ? ("approved" as const) : ("pending" as const) };
    const launch = q.next === "launch";
    return (
      <NextCard
        key={q.id}
        testId={`change_request:${q.id}`}
        status={<StatusPill kind={st.kind} size="s" label={launch ? "Approved, not launched" : st.label} />}
        kicker={launch ? "Launch" : "Change request"}
        title={
          <>
            {q.requester.id === me.id ? "Your request" : `${q.requester.name}'s request`} on <b className="font-semibold">{q.goal.title}</b>
          </>
        }
        quote={q.reason}
        need={
          onMine
            ? launch
              ? `Agents stay on v${q.goal.version} until you launch it.`
              : q.next === "decide"
                ? "Approve and launch, approve only, suggest a change or decline."
                : q.next === "rebase"
                  ? `Update your request to v${q.goal.version} before anyone can approve it.`
                  : q.next === "accept_counter"
                    ? "An approver suggested a change: accept it or withdraw."
                    : "Approving it now would make a dependency loop: suggest a change or decline."
            : `Waiting on ${names(q.waiting_on, me.id) || "nobody yet"}.`
        }
        action={
          <button type="button" className={onMine ? primaryBtn : quietLink} onClick={() => open(q.goal.id, q.id)} data-review-open={q.id}>
            {onMine ? (launch ? "Review and launch" : "Review") : "View"}
          </button>
        }
      />
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">Command center</p>
          <h1 tabIndex={-1} className="text-[24px] font-semibold leading-tight text-(--text-1) focus:outline-none">
            The work, and what needs you
          </h1>
          {h && (
            <p className="mt-1 text-[14px] text-(--text-2)" data-home-summary>
              {onMe === null ? "What waits on you is unknown: Align couldn't read all of it." : onMe ? `${onMe} need${onMe === 1 ? "s" : ""} your judgment.` : "Nothing needs your judgment."}{" "}
              {s.data ? `${mine.length} of your shared session${mine.length === 1 ? "" : "s"}` : "Your sessions are unknown"}
              {h.goals ? ` across ${h.goals.length} goal${h.goals.length === 1 ? "" : "s"}.` : "."}{" "}
              {apps ? `${readers} of ${apps.items.length} connected app${apps.items.length === 1 ? "" : "s"} read the goals.` : ""}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setConnect(true)} className="inline-flex min-h-[40px] items-center rounded-(--radius-s) border border-(--line-strong) px-3 text-[14px] text-(--text-1) hover:bg-(--bg-raised) max-sm:min-h-[44px]" data-connect-open>
          Connect an agent
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-(--radius-m) border border-(--line) bg-(--bg-inset) px-4 py-2.5 text-[13px] text-(--text-2)" data-three-states>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)">Read it as</span>
        <span className="flex items-center gap-2">
          <StatusPill kind="pending" size="s" /> waiting on a decision
        </span>
        <span className="flex items-center gap-2">
          <StatusPill kind="launched" size="s" /> agents were sent this version
        </span>
        <span className="flex items-center gap-2">
          <EvidenceLabel kind="unobserved" size="s" /> Align has no record
        </span>
      </div>

      {!h ? (
        <Loading />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-5 lg:order-2" aria-label="Needs your judgment">
            <Panel eyebrow="Next steps" title={onMe === null ? "Needs you: unknown" : `Needs you · ${onMe}`} padded={false}>
              <div className="flex flex-col gap-2 p-3">
                {!h.change_requests && <Note>Align couldn&apos;t read change requests just now.</Note>}
                {onMe === 0 && <p className="px-1 py-2 text-[14px] text-(--text-2)">Nothing needs your judgment right now.</p>}
                <ul className="flex flex-col gap-2" id="waiting">
                  {h.change_requests?.waiting_on_me.map((q) => changeCard(q, true))}
                  {h.asks?.waiting_on_me.map((a) => (
                    <NextCard
                      key={a.id}
                      testId={`ask:${a.id}`}
                      status={<StatusPill kind="pending" size="s" />}
                      kicker="Ask"
                      title={
                        <>
                          {a.from_label ?? a.requester.name} asked <b className="font-semibold">{a.team.name}</b>
                        </>
                      }
                      quote={a.text}
                      need={a.next === "accept" ? "Accept it or decline it for your team." : "Mark it done once it is."}
                      action={
                        <Link href={`${base}/asks`} className={primaryBtn}>
                          Open in Asks
                        </Link>
                      }
                    />
                  ))}
                  {h.alignments?.waiting_on_me.map((a) => (
                    <NextCard
                      key={a.id}
                      testId={`alignment:${a.id}`}
                      status={<StatusPill kind={a.next === "accept_counter" ? "countered" : "pending"} size="s" />}
                      kicker="Alignment"
                      title={
                        <>
                          {a.requester.id === me.id ? "You ask" : `${a.requester.name} asks`} to work toward <b className="font-semibold">{a.target_goal?.visible && a.target_goal.title ? a.target_goal.title : "a goal you can't see"}</b>
                        </>
                      }
                      need="Approve it, suggest a change or decline it."
                      action={
                        <Link href={`${base}/alignments`} className={primaryBtn}>
                          Open in Alignments
                        </Link>
                      }
                    />
                  ))}
                </ul>
              </div>
            </Panel>
            {!!(h.change_requests?.waiting_on_others.length || h.alignments?.waiting_on_others.length) && (
              <Panel eyebrow="Waiting on others" title="You are part of these" padded={false}>
                <ul className="flex flex-col gap-2 p-3" id="others">
                  {h.change_requests?.waiting_on_others.map((q) => changeCard(q, false))}
                  {h.alignments?.waiting_on_others.map((a) => (
                    <li key={a.id} className="px-1 text-[13px] text-(--text-2)" data-home-item={`alignment:${a.id}`}>
                      Alignment with {a.target_goal?.visible && a.target_goal.title ? a.target_goal.title : "a goal you can't see"}: waiting on {names(a.waiting_on, me.id) || "nobody yet"}.
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {!!h.change_requests?.declined?.length && (
              <Panel eyebrow="Declined" title="Your declined requests" padded={false}>
                <ul className="flex flex-col gap-2 p-3">
                  {h.change_requests.declined.map((x) => (
                    <li key={x.id} className="flex flex-col gap-1 px-1 text-[13px] text-(--text-2)" data-home-item={`declined:${x.id}`}>
                      <StatusPill kind="declined" size="s" />
                      <span>
                        {x.rejected_by ? (x.rejected_by.id === me.id ? "You" : x.rejected_by.name) : "An approver"} declined your request on <b className="font-semibold text-(--text-1)">{x.goal.title}</b>
                        {x.rejection_reason ? `: “${x.rejection_reason}”` : "."} The goal stays at v{x.goal.version}.
                      </span>
                      <button type="button" className={quietLink} onClick={() => open(x.goal.id, x.id)}>
                        View the decision
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </aside>

          <section className="flex min-w-0 flex-col gap-4 lg:order-1" aria-label="The work">
            {noAgents && (
              <EmptyState
                title="No agent is sharing work here yet"
                body="Align shows the work once an agent connects: which goal each session is bound to, which version Align sent it, and whether a receipt came back. Connect one agent to see your first goal read in about a minute."
                action={
                  <button type="button" className={primaryBtn} onClick={() => setConnect(true)} data-connect-empty>
                    Connect an agent
                  </button>
                }
              />
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[16px] font-semibold text-(--text-1)">Work by goal</h2>
              <Link href={`${base}/sessions`} className="text-[13px] text-(--accent-text) hover:underline">
                All sessions
              </Link>
            </div>
            {!h.goals ? (
              <Note>Align couldn&apos;t read the goals just now, so the work by goal is unknown.</Note>
            ) : h.goals.length === 0 ? (
              <EmptyState
                title="No active goals you can see"
                body="Agents read approved goals. Create the first one, then connect an agent to it."
                action={
                  <Link href={`${base}/goals`} className={primaryBtn}>
                    Create a goal
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {h.goals.map((g) => (
                  <GoalGroup key={g.id} ws={ws} g={g} me={me} latest={latestFor(g.id)} sessions={byGoal(g.id)} onReview={(cr) => open(cr.goal.id, cr.id)} />
                ))}
              </ul>
            )}

            {unbound.length > 0 && (
              <Panel eyebrow="No goal" title="Your sessions not bound to a goal" padded={false}>
                <ul className="divide-y divide-(--line)">{unbound.map((x) => <SessionRow key={x.session_key} s={x} me={me} />)}</ul>
              </Panel>
            )}

            {teammates && teammates.length > 0 && (
              <Panel eyebrow="Teammates" title="Other people's shared sessions" padded={false}>
                <ul className="divide-y divide-(--line)">
                  {teammates.map((x) => (
                    <li key={x.session_key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" data-home-session={x.session_key.slice(-6)}>
                      <span className="min-w-0 font-mono text-[12px] text-(--text-2)">
                        {HARNESS[x.harness] ?? x.harness} · {x.repo_alias ?? "repo hidden"} · {x.owner.name} · started {ago(x.started_at)}
                      </span>
                      <EvidenceLabel kind="unobserved" size="s" detail="goal not shown to owners yet" />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel
              eyebrow="Connected apps"
              title="When each app last read the goals"
              padded={false}
              actions={
                <Link href={`${base}/apps`} className="text-[13px] text-(--accent-text) hover:underline">
                  Manage apps
                </Link>
              }
            >
              {!apps ? (
                <p className="px-4 py-3 text-[14px] text-(--text-2)">Align couldn&apos;t read the connected apps just now, so whether any read the goals is unknown.</p>
              ) : apps.items.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[14px] text-(--text-2)" data-home-app="none">
                  <EvidenceLabel kind="unobserved" size="s" />
                  {apps.everyone ? "No AI app is connected to this workspace" : "You have not connected an AI app here"}, so Align has seen no goal reads.
                  <button type="button" className={quietLink} onClick={() => setConnect(true)}>
                    Connect one
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-(--line)">
                  {apps.items.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" data-home-app={a.id}>
                      <span className="min-w-0">
                        <span className="text-[14px] font-medium text-(--text-1)">{a.name}</span>{" "}
                        <span className="text-[12px] text-(--text-3)">connected by {a.connected_by.id === me.id ? "you" : a.connected_by.name}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-(--text-2)">{appStatusWords(a, when)}</span>
                        <EvidenceLabel kind={EV[a.evidence_class]} size="s" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <p className="text-[12px] text-(--text-3)">
              Receipt: Align delivered it and recorded that. Agent reported: the agent&apos;s own word, never checked. Not observed: Align has nothing. Align does not see what an agent does with a goal.
            </p>
          </section>
        </div>
      )}

      {review && <ReviewDrawer ws={ws} goal={review.goal} id={review.id} me={me.id} onClose={() => setReview(null)} onChanged={reloadAll} />}
      <Drawer open={connect} onClose={() => setConnect(false)} title="Connect an agent" eyebrow="Get started">
        <FirstRun ws={ws} onSeen={reloadAll} />
      </Drawer>
    </div>
  );
}
