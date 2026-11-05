"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { EmptyState, Panel, ReviewActions, ReviewBody, StatusPill } from "../../../../../_ui/ds";
import { useGoalTitles } from "../../../../../_ui/changes";
import { useApi } from "../../../../../_ui/kit";
import type { Me } from "../../../../../_ui/server";
import type { ChangeRequest } from "../../../../../_ui/types";
import { actsFor, notYours, QuietLink, type Act } from "../../../../../_ui/b/act";
import { AgentsLine, type HomeApp } from "../../../../../_ui/b/agents";
import { LaneLegend, LaneMap } from "../../../../../_ui/b/lanes";
import { crStatus } from "../../../../../_ui/b/model";
import { Facts } from "../../../../../_ui/b/parts";
import { DeskShell } from "../../../../../_ui/b/shell";

// LIM-2472 concept B: one change request as a decision. The role-lane state map leads (who asks, who approves, who can
// launch, where it is now, and which connectors are this person's); the shared ReviewActions is the action bar and the
// only code that sends a decision and holds the page's one filled pink button. A live connector opens ReviewActions on
// that choice (initialChoice); ReviewActions tells the map which choice is being confirmed (onChoice). ReviewActions is keyed
// by the request id and a counter that changes only on such a press, never on a reload, so a decision's done or refused
// notice survives the re-read. The shared ReviewBody carries the reason, the compare, evidence and the snapshot. A
// request this person can't read is the server's 404, shown as "doesn't exist or you can't see it", never which.

export default function DecisionPage({ me, ws, goal, id }: { me: Me; ws: string; goal: string; id: string }) {
  const d = useApi<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${id}`);
  const home = useApi<{ apps: { everyone: boolean; items: HomeApp[] } | null }>(`/api/v2/workspaces/${ws}/home`);
  const titles = useGoalTitles(ws);
  const [opened, setOpened] = useState<{ act: Act | undefined; n: number }>({ act: undefined, n: 0 });
  const [picked, setPicked] = useState<Act | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const base = `/app/w/${ws}`;
  const cr = d.data;

  const open = (a: Act) => {
    setOpened((o) => ({ act: a, n: o.n + 1 }));
    requestAnimationFrame(() => bar.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const acts = cr ? actsFor(cr) : [];
  const apps = home.data?.apps ?? (home.error ? null : undefined);

  return (
    <DeskShell
      me={me}
      ws={ws}
      active="desk"
      crumbs={[{ label: "Decision desk", href: base }, { label: cr?.goal.title ?? "Change request" }]}
    >
      {!cr && d.loading && <p className="text-[14px] text-(--text-2)">Reading the change request…</p>}
      {!cr && d.error && (
        <EmptyState
          title="This change request doesn't exist or you can't see it"
          body="It may be on a goal you can't read, or the link is wrong."
          action={<QuietLink href={base}>Back to the decision desk</QuietLink>}
        />
      )}
      {cr && (
        <div className="flex flex-col gap-5" data-decision={cr.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-(--text-3)">
                {cr.requester.id === me.id ? "Your" : `${cr.requester.name}'s`} change request · revision {cr.revision}
              </p>
              <h1 tabIndex={-1} className="text-[24px] font-semibold tracking-[-0.01em] text-(--text-1) focus:outline-none">
                {cr.goal.title}
              </h1>
            </div>
            <StatusPill kind={crStatus(cr).kind} label={crStatus(cr).label} />
          </div>

          <div ref={bar} className="scroll-mt-4 rounded-(--radius-m) border border-(--line-strong) bg-(--bg-panel) p-4" data-action-bar>
            {!acts.length && (
              <p className="mb-2 text-[13px] text-(--text-2)" data-not-yours>
                Nothing here is yours to decide now. {notYours(cr, me.id)}
              </p>
            )}
            <ReviewActions
              key={`${cr.id}:${opened.n}`}
              ws={ws}
              cr={cr}
              me={me.id}
              compact
              initialChoice={opened.act}
              onChoice={setPicked}
              onDone={() => {
                d.reload();
                home.reload();
              }}
            />
          </div>

          <Panel eyebrow="Who decides" title="Where this request is" actions={<LaneLegend />}>
            <LaneMap cr={cr} me={me.id} onAct={open} picked={picked} />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <Panel eyebrow="Review" title="The request, its change and its evidence">
              <ReviewBody ws={ws} cr={cr} me={me.id} titleOf={(gid) => titles.get(gid) ?? "a goal"} onDone={d.reload} />
            </Panel>
            <div className="flex min-w-0 flex-col gap-5">
              <Panel eyebrow="Facts" title="State, people and versions">
                <Facts cr={cr} me={me.id} />
              </Panel>
              <Panel eyebrow="Agents" title="What Align observed">
                <AgentsLine ws={ws} apps={apps} />
              </Panel>
              <div className="flex flex-wrap gap-2">
                <QuietLink href={`${base}/record?cr=${cr.id}`}>Decision record</QuietLink>
                <QuietLink href={`${base}/work?goal=${cr.goal.id}`}>Work and evidence</QuietLink>
                <QuietLink href={`${base}/dependencies`}>Goal dependencies</QuietLink>
                <Link href={base} className="inline-flex min-h-[36px] items-center px-2 text-[13px] text-(--text-2) hover:text-(--text-1) max-sm:min-h-[44px]">
                  Back to the desk
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </DeskShell>
  );
}
