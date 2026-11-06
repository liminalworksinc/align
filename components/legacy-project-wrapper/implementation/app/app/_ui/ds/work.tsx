"use client";
import Link from "next/link";
import type { ChangeRequest, Evidence, Goal, MySession } from "../types";
import { DecisionPanel, NoDecisionPanel } from "./decision-panel";
import { EmptyState } from "./empty-state";
import { hasEvidence, NOT_LOADED, sentToLine, type Delivery } from "./evidence-facts.mts";
import { EvidenceLabel } from "./evidence-label";
import { EvidenceSummary, useDelivery } from "./evidence-summary";
import { Panel } from "./panel";
import { useRead } from "./read";
import { StatusPill } from "./status-pill";

// Work (LIM-2472; round 2, founder ruling eaa5cf92: evidence serves a decision). Opened from a decision or a goal, never
// browsed as a feed: /work?goal=<g>&cr=<id> puts the decision at the top, then its evidence, what Align sent, the
// sessions on the goal and connected apps' goal reads; /work?goal=<g> takes the goal's open request (else its latest
// decided one); bare /work is a plain index of goals. Exactly what Align knows, each with its evidence class:
//  - GET …/goals: the goals the reader can read (current version, owner, status, agent time share);
//  - GET …/goals/<goal>/change-requests: the decision, and the evidence links on its current revision, self-reported or
//    agent reported, never verified;
//  - GET …/goals/<goal>/activity: sessions shared toward it in the last 14 days, from the align CLI: Agent reported;
//  - GET …/sessions: the reader's own sessions and which goal each is working toward now;
//  - GET …/change-requests/<id>/value: per app, when Align sent the launched version (a Receipt);
//  - GET …/apps: when each connected app last read the goals (last_read_at): a Receipt. Align doesn't record which goal
//    an app read or which version it holds, so the panel says that instead of implying it.
// Body only: the shell wraps it.

const HARNESS = { "claude-code": "Claude Code", codex: "Codex" } as const;
const at = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
/** "12 min ago", "3 h ago", else the date: how long since something was reported, never "now". */
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "under a minute ago" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : at(iso);
};
const LINK = "max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-(--accent-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

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
          <dl className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
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
            <Row label="Reported activity, last 90 min">
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
          <p className="mb-2 text-[13px] font-medium text-(--text-2)">Your sessions bound to it</p>
          <ul className="flex flex-col gap-2">
            {mine.map((x) => (
              <li key={x.session_key} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-(--radius-s) border border-(--line) bg-(--bg-raised) px-3 py-2 text-[14px]">
                <span className="font-medium text-(--text-1)">{HARNESS[x.harness as keyof typeof HARNESS] ?? x.harness}</span>
                {x.repo_alias && <span className="font-mono text-[12.5px] text-(--text-2)">{x.repo_alias}</span>}
                <span className="text-(--text-3)">· {x.state === "shared" ? "shared" : x.state}</span>
                {x.agent_stopped && <span className="text-(--st-declined)">· stop requested</span>}
                {(x.current_epoch as { goal_version_at_start?: number | null } | null)?.goal_version_at_start ? (
                  <span className="text-[13px] text-(--text-2)">bound when the goal was at v{(x.current_epoch as { goal_version_at_start?: number }).goal_version_at_start}</span>
                ) : null}
                <span className="text-[13px] text-(--text-3)">since {at(x.started_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** The decision's own evidence: every fact on it (EvidenceSummary full) and the links on its current revision. */
function DecisionEvidence({ ws, cr, me, value }: { ws: string; cr: ChangeRequest; me: string; value: Delivery | null | undefined }) {
  const links = cr.revisions.find((r) => r.revision === cr.revision)?.evidence ?? [];
  return (
    <Panel eyebrow="Its evidence" title={`On revision ${cr.revision}`}>
      <div className="flex flex-col gap-3">
        {cr.launch === "launched" && value === undefined ? <p className="text-[13px] text-(--text-3)">Reading evidence…</p> : <EvidenceSummary ws={ws} cr={cr} variant="full" value={cr.launch === "launched" ? value : null} sayUnread={false} />}
        {!hasEvidence(cr) && <p className="text-[14px] text-(--text-2)">No evidence attached.</p>}
        {links.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-(--line) pt-3">
            {links.map((e: Evidence) => (
              <li key={e.id} className="flex flex-col gap-1 text-[14px]">
                <span className="flex flex-wrap items-center gap-2">
                  <EvidenceLabel kind={e.reported_as === "agent-reported" ? "reported" : "self"} size="s" />
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className={`${LINK} [overflow-wrap:anywhere]`}>
                    {e.label || e.url}
                  </a>
                </span>
                <span className="text-[13px] text-(--text-3)">
                  {e.kind.replace("_", " ")} · added by {e.added_by.id === me ? "you" : e.added_by.name}, {at(e.added_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/** The newest launched change request on the goal: the only kind for which Align records what it sent each app. */
function useLaunched(ws: string, goal: Goal) {
  const crs = useRead<{ change_requests: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests?state=approved`);
  const cr = (crs.data?.change_requests ?? []).filter((c) => c.launch === "launched" && c.version).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
  // GET …/value: once launched, the connected apps a goal read sent this version to, each with when Align first sent it
  // (lib/v2/value.ts apps.items[].sent_at): a delivery receipt per app. A workspace owner sees every app, anyone else their own.
  const value = useRead<{ apps: { everyone: boolean; items: { id: string; name: string; connected_by: { id: string; name: string }; sent_at: string }[] } | null }>(
    cr ? `/api/v2/workspaces/${ws}/goals/${goal.id}/change-requests/${cr.id}/value` : null,
  );
  // A failed read says nothing about what was launched or sent: neither is the same as a read that found none.
  return { cr, sent: value.data?.apps ?? null, loading: crs.loading || (!!cr && value.loading), crsLoading: crs.loading, sentLoading: !!cr && value.loading, launchUnread: crs.status !== 0 && !cr, sentUnread: !!cr && value.status !== 0 };
}


function LaunchRows({ ws, goal }: { ws: string; goal: Goal }) {
  const { cr, sent, crsLoading, sentLoading, launchUnread, sentUnread } = useLaunched(ws, goal);
  if (crsLoading) return null;
  if (launchUnread)
    return (
      <Row label="Launched">
        <span className="text-(--text-2)">{NOT_LOADED}</span>
      </Row>
    );
  if (!cr)
    return (
      <Row label="Launched">
        <span className="text-(--text-2)">Nothing launched through a change request yet</span>
      </Row>
    );
  return (
    <>
      <Row label="Launched">
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill kind="launched" label={`Launched v${cr.version}`} size="s" />
          <span className="text-(--text-2)">{at(cr.launch_decided_at)}</span>
        </span>
      </Row>
      <Row label="Align sent it to">
        {/* While its read is in flight: "Reading…", never "No app yet" (which would be a fact the read hasn't given). */}
        <span className={sentUnread || !sent?.items.length ? "text-(--text-2)" : undefined}>{sentToLine({ loading: sentLoading, failed: sentUnread, apps: sent }) ?? "Reading…"}</span>
      </Row>
    </>
  );
}

function AppsPanel({ ws, goal }: { ws: string; goal: Goal }) {
  const apps = useRead<{ apps: App[] }>(`/api/v2/workspaces/${ws}/apps`);
  const list = apps.data?.apps ?? [];
  // The apps read is everyone's for a workspace owner and the reader's own for anyone else, without saying which: the
  // role decides how an empty list is worded. Until the role is known (read failed or still out), the sentence names no
  // role and offers nothing: an offer needs a role the server would allow.
  const role = useRead<{ role: "owner" | "member" | "viewer" }>(`/api/v2/workspaces/${ws}`);
  const known = role.status === 0 ? role.data?.role : undefined;
  const everyone = known === "owner";
  const { cr, sent, loading, launchUnread, sentUnread } = useLaunched(ws, goal);
  const sentTo = new Map((sent?.items ?? []).map((i) => [i.id, i]));
  return (
    <Panel eyebrow="Connected apps" title="Goal reads Align recorded" actions={<Link href={`/app/w/${ws}/apps`} className={`${LINK} text-[14px]`}>Apps</Link>}>
      {apps.loading && <p className="text-[14px] text-(--text-2)">Loading…</p>}
      {apps.status !== 0 && <p className="text-[14px] text-(--text-2)">{apps.message}</p>}
      {apps.data && list.length === 0 &&
        (everyone ? (
          <EmptyState title="No AI apps connected" body="Nothing has read this workspace's goals through an app." action={<Link href={`/app/w/${ws}/apps`} className={LINK}>Connect one</Link>} />
        ) : known ? (
          // A viewer can't connect an app, so nothing is offered; a member can, on the Apps tab.
          <EmptyState
            title="None of your AI apps is connected"
            body="You see your own apps here; workspace owners see everyone's."
            action={known === "member" ? <Link href={`/app/w/${ws}/apps`} className={LINK}>Connect one</Link> : undefined}
          />
        ) : (
          <EmptyState title="No AI app you can see is connected." body="Workspace owners see everyone's apps; others see their own." />
        ))}
      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-s) border border-(--line) bg-(--bg-raised) px-3 py-2 text-[14px]">
              <span className="min-w-0">
                <span className="font-medium text-(--text-1)">{a.name}</span> <span className="text-(--text-3)">· {a.user.name}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {cr && sentTo.has(a.id) && <EvidenceLabel kind="receipt" size="s" detail={`Align sent it v${cr.version} ${at(sentTo.get(a.id)!.sent_at)}`} />}
                {a.last_read_at ? <EvidenceLabel kind="receipt" size="s" detail={`read the goals ${at(a.last_read_at)}`} /> : <EvidenceLabel kind="unobserved" size="s" detail="no goal read yet" />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!loading && (
        <p className="mt-3 text-[13px] text-(--text-3)">
          {launchUnread || sentUnread
            ? NOT_LOADED
            : cr && apps.data && !list.length
            ? `Launched v${cr.version} reaches an app when it reads the goals; ${everyone ? "none is connected" : known ? "none of yours is connected" : "none you can see is connected"}.`
            : cr
            ? `"Align sent it v${cr.version}" is a delivery receipt: a goal read served this goal's launched version to that app. Align can't see what the app does with it.`
            : "Nothing is launched on this goal yet, so Align has sent no version of it to an app. Goal reads are recorded for the workspace, not per goal."}
        </p>
      )}
    </Panel>
  );
}

/** Requests that are still open: undecided, or approved and not launched. */
const isOpen = (c: ChangeRequest) => c.state === "pending" || c.state === "countered" || (c.state === "approved" && c.launch !== "launched");
const newest = (a: ChangeRequest, b: ChangeRequest) => b.updated_at.localeCompare(a.updated_at);

/** No goal named: a plain index. Work is opened from a decision or a goal, never browsed as a feed. */
function WorkIndex({ ws }: { ws: string }) {
  const feed = useRead<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const goals = (feed.data?.goals ?? []).filter((g) => g.status === "active").concat((feed.data?.goals ?? []).filter((g) => g.status !== "active"));
  return (
    <div data-surface="work" data-work-mode="index" className="flex min-w-0 flex-col gap-3">
      <p className="max-w-prose text-[14px] text-(--text-2)">Work is opened from a decision or a goal. Choose a goal to see the decision on it and what Align knows about the work behind it.</p>
      <Panel eyebrow="Goals" title={feed.data ? `${goals.length} ${goals.length === 1 ? "goal" : "goals"} you can read` : "Goals"} padded={false}>
        {feed.loading && <p className="p-4 text-[14px] text-(--text-2)">Loading…</p>}
        {feed.status !== 0 && <p className="p-4 text-[14px] text-(--text-2)">{feed.message}</p>}
        {feed.data && goals.length === 0 && (
          <div className="p-4">
            <EmptyState title="No goals you can read" body="Goals you own, your team's and the workspace's appear here." />
          </div>
        )}
        <ul aria-label="Goals" className="flex flex-col">
          {goals.map((g) => (
            <li key={g.id} className="border-b border-(--line) last:border-b-0">
              <Link href={`/app/w/${ws}/work?goal=${g.id}`} className="flex min-h-[44px] flex-col gap-1 px-4 py-2.5 hover:bg-(--bg-raised) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--focus)">
                <span className="text-[14px] font-medium text-(--text-1) [overflow-wrap:anywhere]">{g.title}</span>
                <span className="text-[12.5px] text-(--text-3)">
                  v{g.version} · {g.owner.name}
                  {g.status !== "active" ? ` · ${g.status}` : ""}
                </span>
                <EvidenceSummary ws={ws} goal={g} quiet />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/**
 * Work for one goal, entered from a decision (LIM-2472 round 2, founder ruling eaa5cf92: evidence serves a decision).
 * Top: the decision it belongs to (`crId`; else the goal's open request; else its latest decided one; else none). Then,
 * in this order: its evidence, what Align sent, sessions on the goal, goal reads by connected apps. No goal picker.
 * Without `goalId`, the plain index.
 */
export function WorkPanels({ ws, goalId, crId, me = "" }: { ws: string; goalId?: string; crId?: string; me?: string }) {
  const feed = useRead<{ goals: Goal[] }>(goalId ? `/api/v2/workspaces/${ws}/goals` : null);
  const crs = useRead<{ change_requests: ChangeRequest[] }>(goalId ? `/api/v2/workspaces/${ws}/goals/${goalId}/change-requests` : null);
  const goal = feed.data?.goals.find((g) => g.id === goalId);
  const list = crs.data?.change_requests ?? [];
  const named = crId ? list.find((c) => c.id === crId) : undefined;
  const open = list.filter(isOpen).sort(newest)[0];
  const latest = [...list].sort(newest)[0];
  const decision = named ?? (crId ? undefined : (open ?? latest));
  // Read once for the decision's delivery statement and its evidence summary.
  const delivery = useDelivery(ws, decision);
  if (!goalId) return <WorkIndex ws={ws} />;

  if (feed.loading || crs.loading) return <p className="text-[14px] text-(--text-2)">Loading…</p>;
  if (feed.data && !goal)
    return (
      <EmptyState
        title="No such goal in this workspace"
        body="Align has no goal with this address here that you can read. It may be in another workspace, or a goal you can't see."
        action={
          <Link href={`/app/w/${ws}/work`} className={LINK}>
            All goals
          </Link>
        }
      />
    );
  if (!goal) return <p className="text-[14px] text-(--text-2)">{feed.message || crs.message}</p>;

  return (
    <div data-surface="work" data-work-mode={decision ? "decision" : "goal"} className="flex min-w-0 flex-col gap-4">
      {decision ? <DecisionPanel ws={ws} cr={decision} me={me} latest={!named} delivery={delivery.value} /> : crs.status === 0 ? <NoDecisionPanel ws={ws} goalId={goal.id} missing={!!crId} /> : <p className="text-[14px] text-(--text-2)">{crs.message}</p>}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {decision && <DecisionEvidence ws={ws} cr={decision} me={me} value={delivery.value} />}
          <Panel eyebrow="What Align sent" title={goal.title} actions={<Link href={`/app/w/${ws}/goals/${goal.id}`} className={`${LINK} text-[14px]`}>Open goal</Link>}>
            <dl className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
              <Row label="Current version">v{goal.version}</Row>
              <Row label="Owner">{goal.owner.name}</Row>
              <LaunchRows ws={ws} goal={goal} />
              {goal.allocation && (
                <>
                  <Row label="Agent time">
                    {/* No reported time is an absence, not an agent's report: said in words, with no Agent reported label. */}
                    {goal.allocation.share_7d > 0 ? <span className="tabular-nums">{goal.allocation.share_7d}% of reported agent time, 7 days</span> : <span className="text-(--text-2)">None reported in the last 7 days</span>}
                    {goal.allocation.target_share !== null && <span className="text-(--text-2)"> (target {goal.allocation.target_share}%)</span>}
                    {goal.allocation.held && <span className="text-(--st-pending)"> · held</span>}
                  </Row>
                  {goal.allocation.share_7d > 0 && (
                    // The label under the row at full width, so the narrow value column never wraps it.
                    <dd className="col-span-2 -mt-0.5">
                      <EvidenceLabel kind="reported" size="s" detail="align CLI usage" />
                    </dd>
                  )}
                </>
              )}
            </dl>
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SessionsPanel key={`s-${goal.id}`} ws={ws} goal={goal} />
          <AppsPanel key={`a-${goal.id}`} ws={ws} goal={goal} />
        </div>
      </div>
      <Link href={`/app/w/${ws}/work`} className={`${LINK} self-start text-[14px]`}>
        All goals
      </Link>
    </div>
  );
}
