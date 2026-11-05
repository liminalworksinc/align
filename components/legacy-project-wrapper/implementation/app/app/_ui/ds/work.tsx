"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChangeRequest, Evidence, Goal, MySession } from "../types";
import { EmptyState } from "./empty-state";
import { EvidenceLabel } from "./evidence-label";
import { Panel } from "./panel";
import { useRead } from "./read";
import { StatusPill } from "./status-pill";

// Work and evidence drill-down (LIM-2472 workstream S, item 2): one goal at a time, as three connected panels: the
// goals, the sessions people shared toward the selected one, and what Align holds about it (evidence on its change
// requests, connected apps' goal reads). Exactly what Align knows, each with its evidence class:
//  - GET …/goals: the goals the reader can read (current version, owner, status);
//  - GET …/goals/<goal>/activity: sessions shared toward it in the last 14 days, from the align CLI: Agent reported;
//  - GET …/sessions: the reader's own sessions and which goal each is working toward now;
//  - GET …/goals/<goal>/change-requests: evidence links on each revision, self-reported or agent reported, never
//    verified;
//  - GET …/apps: when each connected app last read the goals (last_read_at): a Receipt. Align doesn't record which goal
//    an app read or which version it holds, so the panel says that instead of implying it.
// Body only: A's and B's shells wrap it (/app/w/<ws>/work?goal=<id>).

const HARNESS = { "claude-code": "Claude Code", codex: "Codex" } as const;
const at = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
/** "12 min ago", "3 h ago", else the date: how long since something was reported, never "now". */
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "under a minute ago" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : at(iso);
};
const LINK = "text-(--accent-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

interface Activity {
  window_days: number;
  sessions: number;
  active_now: number;
  by_harness: { "claude-code": number; codex: number };
  last_activity_at: string | null;
  evidence_class: "delivery_receipt" | "agent_reported" | "not_observed";
  detail: { files: string[]; files_hidden: number; mine: { session_key: string; harness: "claude-code" | "codex"; state: string; last_activity_at: string | null }[] } | null;
}

interface App {
  id: string;
  name: string;
  user: { id: string; name: string };
  last_used_at: string | null;
  last_read_at: string | null;
}

const EV = { delivery_receipt: "receipt", agent_reported: "reported", not_observed: "unobserved" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-(--text-2)">{label}</dt>
      <dd className="min-w-0 text-(--text-1) [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function SessionsPanel({ ws, goal }: { ws: string; goal: Goal }) {
  const a = useRead<Activity>(`/api/v2/workspaces/${ws}/goals/${goal.id}/activity`);
  const s = useRead<{ mine: MySession[] }>(`/api/v2/workspaces/${ws}/sessions`);
  const mine = (s.data?.mine ?? []).filter((x) => x.current_epoch?.goal?.id === goal.id || x.governing_goal?.id === goal.id);
  const d = a.data;
  return (
    <Panel eyebrow="Sessions" title="Shared toward this goal" actions={<Link href={`/app/w/${ws}/sessions`} className={`${LINK} text-[14px]`}>Sessions</Link>}>
      {a.loading && <p className="text-[14px] text-(--text-2)">Loading…</p>}
      {a.status !== 0 && <p className="text-[14px] text-(--text-2)">{a.message}</p>}
      {d && (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-(--text-2)">
            <EvidenceLabel kind={EV[d.evidence_class]} size="s" detail="align CLI" />
            Last {d.window_days} days, from bindings and usage times, never from what agents wrote.
          </p>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
            <Row label="Sessions">
              <span className="font-mono tabular-nums">{d.sessions}</span>
              {d.sessions > 0 && (
                <span className="text-(--text-2)">
                  {" "}
                  (
                  {(Object.keys(HARNESS) as (keyof typeof HARNESS)[])
                    .filter((h) => d.by_harness[h] > 0)
                    .map((h) => `${d.by_harness[h]} ${HARNESS[h]}`)
                    .join(", ")}
                  )
                </span>
              )}
            </Row>
            <Row label="Last reported activity">{d.last_activity_at ? <span title={at(d.last_activity_at)}>{ago(d.last_activity_at)}</span> : "None reported"}</Row>
            <Row label="Sessions that reported activity in the last 90 minutes">
              <span className="font-mono tabular-nums">{d.active_now}</span>
            </Row>
          </dl>
          {d.detail && d.detail.files.length > 0 && (
            <div>
              <p className="text-[13px] text-(--text-3)">Files these sessions reported working on</p>
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[12.5px] text-(--text-1)">
                {d.detail.files.map((f) => (
                  <li key={f} className="[overflow-wrap:anywhere]">
                    {f}
                  </li>
                ))}
              </ul>
              {d.detail.files_hidden > 0 && <p className="text-[13px] text-(--text-3)">and {d.detail.files_hidden} more whose paths aren&apos;t shared</p>}
            </div>
          )}
          {d.sessions === 0 && <EmptyState title="No shared sessions on this goal" body={`Nobody shared a session toward it in the last ${d.window_days} days, so Align has nothing to report here.`} />}
        </div>
      )}
      {mine.length > 0 && (
        <div className="mt-4 border-t border-(--line) pt-3">
          <p className="mb-2 text-[13px] font-medium text-(--text-2)">Your sessions on it now</p>
          <ul className="flex flex-col gap-2">
            {mine.map((x) => (
              <li key={x.session_key} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-(--radius-s) border border-(--line) bg-(--bg-raised) px-3 py-2 text-[14px]">
                <span className="font-medium text-(--text-1)">{HARNESS[x.harness as keyof typeof HARNESS] ?? x.harness}</span>
                {x.repo_alias && <span className="font-mono text-[12.5px] text-(--text-2)">{x.repo_alias}</span>}
                <span className="text-(--text-3)">· {x.state === "shared" ? "shared" : x.state}</span>
                {x.agent_stopped && <span className="text-(--st-declined)">· stop requested</span>}
                <span className="text-[13px] text-(--text-3)">since {at(x.started_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function EvidencePanel({ ws, goal }: { ws: string; goal: Goal }) {
  const crs = useRead<{ change_requests: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests`);
  const items = useMemo(() => {
    const out: { cr: ChangeRequest; e: Evidence }[] = [];
    for (const cr of crs.data?.change_requests ?? []) for (const r of cr.revisions) for (const e of r.evidence) out.push({ cr, e });
    return out.sort((x, y) => y.e.added_at.localeCompare(x.e.added_at));
  }, [crs.data]);
  const list = crs.data?.change_requests ?? [];
  return (
    <Panel eyebrow="Evidence" title="On this goal's changes" actions={<Link href={`/app/w/${ws}/record?goal=${goal.id}`} className={`${LINK} text-[14px]`}>Record</Link>}>
      {crs.loading && <p className="text-[14px] text-(--text-2)">Loading…</p>}
      {crs.status !== 0 && <p className="text-[14px] text-(--text-2)">{crs.message}</p>}
      {crs.data && list.length === 0 && <EmptyState title="No change requests on this goal" body="Evidence is attached to a change request's revision, so there is none to show." />}
      {list.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {list.slice(0, 5).map((cr) => (
            <li key={cr.id} className="flex flex-wrap items-center gap-2 text-[14px]">
              <StatusPill kind={cr.state === "approved" ? (cr.launch === "launched" ? "launched" : "approved") : cr.state === "rejected" ? "declined" : cr.state === "countered" ? "countered" : cr.state === "pending" ? "pending" : "draft"} label={cr.state === "approved" && cr.launch !== "launched" ? "Approved, not launched" : cr.state === "withdrawn" ? "Withdrawn" : cr.state === "superseded" ? "Superseded" : undefined} size="s" />
              <Link href={`/app/w/${ws}/record?cr=${cr.id}`} className={LINK}>
                {cr.requester.name}&apos;s change, revision {cr.revision}
              </Link>
              <span className="text-[13px] text-(--text-3)">
                {cr.evidence_count} evidence {cr.evidence_count === 1 ? "link" : "links"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-(--line) pt-3">
          {items.map(({ cr, e }) => (
            <li key={e.id} className="flex flex-col gap-1 text-[14px]">
              <span className="flex flex-wrap items-center gap-2">
                {e.reported_as === "agent-reported" ? <EvidenceLabel kind="reported" size="s" detail="connected app via MCP" /> : <span className="rounded-(--radius-s) border border-(--edge) px-1.5 text-[12px] leading-5 text-(--text-2)">Self-reported</span>}
                <a href={e.url} target="_blank" rel="noreferrer noopener" className={`${LINK} [overflow-wrap:anywhere]`}>
                  {e.label || e.url}
                </a>
              </span>
              <span className="text-[13px] text-(--text-3)">
                {e.kind.replace("_", " ")} · revision {e.revision} of {cr.requester.name}&apos;s change · added by {e.added_by.name}, {at(e.added_at)}
              </span>
            </li>
          ))}
          <li className="text-[13px] text-(--text-3)">Align doesn&apos;t verify evidence links: each is as its author gave it.</li>
        </ul>
      )}
    </Panel>
  );
}

function AppsPanel({ ws }: { ws: string }) {
  const apps = useRead<{ apps: App[] }>(`/api/v2/workspaces/${ws}/apps`);
  const list = apps.data?.apps ?? [];
  return (
    <Panel eyebrow="Connected apps" title="Goal reads Align recorded" actions={<Link href={`/app/w/${ws}/apps`} className={`${LINK} text-[14px]`}>Apps</Link>}>
      {apps.loading && <p className="text-[14px] text-(--text-2)">Loading…</p>}
      {apps.status !== 0 && <p className="text-[14px] text-(--text-2)">{apps.message}</p>}
      {apps.data && list.length === 0 && <EmptyState title="No AI apps connected" body="Nothing has read this workspace's goals through an app." action={<Link href={`/app/w/${ws}/apps`} className={LINK}>Connect one</Link>} />}
      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-s) border border-(--line) bg-(--bg-raised) px-3 py-2 text-[14px]">
              <span className="min-w-0">
                <span className="font-medium text-(--text-1)">{a.name}</span> <span className="text-(--text-3)">· {a.user.name}</span>
              </span>
              {a.last_read_at ? <EvidenceLabel kind="receipt" size="s" detail={`read the goals ${at(a.last_read_at)}`} /> : <EvidenceLabel kind="unobserved" size="s" detail="no goal read yet" />}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[13px] text-(--text-3)">Align records when an app read the workspace&apos;s goals, not which goal it read or which version it holds.</p>
    </Panel>
  );
}

export function WorkPanels({ ws, goalId }: { ws: string; goalId?: string }) {
  const feed = useRead<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const goals = useMemo(() => (feed.data?.goals ?? []).filter((g) => g.status === "active").concat((feed.data?.goals ?? []).filter((g) => g.status !== "active")), [feed.data]);
  const [picked, setPicked] = useState<string | undefined>(goalId);
  const goal = goals.find((g) => g.id === picked) ?? goals[0];

  const choose = (id: string) => {
    setPicked(id);
    // Keep the choice in the address, so the page can be shared and Back works within it.
    const u = new URL(window.location.href);
    u.searchParams.set("goal", id);
    window.history.replaceState(null, "", u);
  };

  return (
    <div data-surface="work" className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,1fr)]">
      <Panel eyebrow="Goals" title="Choose a goal" padded={false} className="lg:row-span-2">
        {feed.loading && <p className="p-4 text-[14px] text-(--text-2)">Loading…</p>}
        {feed.status !== 0 && <p className="p-4 text-[14px] text-(--text-2)">{feed.message}</p>}
        {feed.data && goals.length === 0 && (
          <div className="p-4">
            <EmptyState title="No goals you can read" body="Goals you own, your team's and the workspace's appear here." />
          </div>
        )}
        <ul role="listbox" aria-label="Goals" className="flex flex-col p-1.5">
          {goals.map((g) => {
            const on = g.id === goal?.id;
            return (
              <li key={g.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => choose(g.id)}
                  className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-(--radius-s) border-l-2 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus) ${
                    on ? "border-(--accent) bg-(--accent-soft)" : "border-transparent hover:bg-(--bg-raised)"
                  }`}
                >
                  <span className="text-[14px] font-medium text-(--text-1) [overflow-wrap:anywhere]">{g.title}</span>
                  <span className="text-[12.5px] text-(--text-3)">
                    v{g.version} · {g.owner.name}
                    {g.status !== "active" ? ` · ${g.status}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
      {goal && (
        <>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel eyebrow={goal.level === "company" ? "Company goal" : (goal.team?.name ?? "Goal")} title={goal.title} actions={<Link href={`/app/w/${ws}/goals/${goal.id}`} className={`${LINK} text-[14px]`}>Open goal</Link>}>
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
                <Row label="Current version">v{goal.version}</Row>
                <Row label="Owner">{goal.owner.name}</Row>
                <Row label="Version Align sent to agents">
                  <span className="text-(--text-2)">Not recorded per goal yet</span>
                </Row>
              </dl>
            </Panel>
            <SessionsPanel key={`s-${goal.id}`} ws={ws} goal={goal} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-3">
            <EvidencePanel key={`e-${goal.id}`} ws={ws} goal={goal} />
            <AppsPanel ws={ws} />
          </div>
        </>
      )}
    </div>
  );
}
