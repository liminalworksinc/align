"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmptyState, Panel, StatusPill } from "../../../../../_ui/ds";
import { useGoalTitles } from "../../../../../_ui/changes";
import { Diff } from "../../../../../_ui/crparts";
import { useApi } from "../../../../../_ui/kit";
import type { Me } from "../../../../../_ui/server";
import type { ChangeRequest } from "../../../../../_ui/types";
import { ACT_WORDS, actsFor, Confirm, notYours, OutcomeLine, PrimaryBtn, QuietLink, type Act, type Outcome } from "../../../../../_ui/desk/act";
import { AgentsLine, type HomeApp } from "../../../../../_ui/desk/agents";
import { LaneLegend, LaneMap } from "../../../../../_ui/desk/lanes";
import { crStatus, recordHref } from "../../../../../_ui/desk/model";
import { currentEvidence, EvidenceList, Facts, Reason, WouldChange } from "../../../../../_ui/desk/parts";
import { DeskShell } from "../../../../../_ui/desk/shell";

// LIM-2472 concept B: one change request as a decision. The role-lane state map leads (who asks, who approves, who can
// launch, where it is now, and which connectors are this person's), then what it would change beside what is approved
// now, the evidence (reported links, never verified) and what Align observed of agents. The one primary action is the
// dominant decision this person may take; a live connector picks any other. Every decision is confirmed, re-read and
// sent as the goal page would send it (desk/act.tsx). A request this person can't read is a 404 from the server, shown
// as "doesn't exist or you can't see it", never which.

export default function DecisionPage({ me, ws, goal, id }: { me: Me; ws: string; goal: string; id: string }) {
  const d = useApi<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${id}`);
  const home = useApi<{ apps: { everyone: boolean; items: HomeApp[] } | null }>(`/api/v2/workspaces/${ws}/home`);
  const titles = useGoalTitles(ws);
  const [act, setAct] = useState<Act | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const base = `/app/w/${ws}`;
  const cr = d.data;

  useEffect(() => {
    if (act) confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [act]);

  const acts = cr ? actsFor(cr) : [];
  const primary = cr && acts.length ? (
    <PrimaryBtn
      onClick={() => {
        setOutcome(null);
        setAct(acts[0]!);
      }}
    >
      {ACT_WORDS[acts[0]!]}
    </PrimaryBtn>
  ) : null;
  const apps = home.data?.apps ?? (home.error ? null : undefined);

  return (
    <DeskShell
      me={me}
      ws={ws}
      active="desk"
      crumbs={[{ label: "Decision desk", href: base }, { label: cr?.goal.title ?? "Change request" }]}
      primary={primary}
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

          {outcome && <OutcomeLine o={outcome} />}
          {act && (
            <div ref={confirmRef}>
              <Confirm
                ws={ws}
                cr={cr}
                act={act}
                meName={me.name}
                onCancel={() => setAct(null)}
                onDone={(o) => {
                  setOutcome(o);
                  setAct(null);
                  d.reload();
                  home.reload();
                }}
              />
            </div>
          )}
          {!acts.length && (
            <p className="rounded-(--radius-s) border border-dashed border-(--line-strong) px-3 py-2 text-[13px] text-(--text-2)" data-not-yours>
              Nothing here is yours to decide now. {notYours(cr, me.id)}
            </p>
          )}

          <Panel eyebrow="Who decides" title="Where this request is" actions={<LaneLegend />}>
            <LaneMap
              cr={cr}
              me={me.id}
              ws={ws}
              onAct={(a) => {
                setOutcome(null);
                setAct(a);
              }}
            />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <div className="flex min-w-0 flex-col gap-5">
              <Panel eyebrow="Compare" title={`v${cr.base_version} now, beside what this request asks for`}>
                <Diff cr={cr} titles={titles} />
                <div className="mt-3">
                  <WouldChange cr={cr} titles={titles} />
                </div>
              </Panel>
              <Panel eyebrow="Why" title="The request, in its own words">
                <Reason cr={cr} />
              </Panel>
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <Panel eyebrow="Facts" title="State, people and versions">
                <Facts cr={cr} me={me.id} />
              </Panel>
              <Panel eyebrow="Evidence" title={`Links on revision ${cr.revision}`}>
                <EvidenceList items={currentEvidence(cr)} me={me.id} />
              </Panel>
              <Panel eyebrow="Agents" title="What Align observed">
                <AgentsLine ws={ws} apps={apps} />
              </Panel>
              <div className="flex flex-wrap gap-2">
                <QuietLink href={recordHref(ws, cr)}>Decision record</QuietLink>
                <QuietLink href={`${base}/sessions`}>Work</QuietLink>
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
