"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, Drawer, EmptyState, Panel, ReviewActions, ReviewBody, Segmented, StatusPill, type Column } from "../../_ui/ds";
import { useGoalTitles } from "../../_ui/changes";
import { useApi } from "../../_ui/kit";
import type { Me } from "../../_ui/server";
import type { ChangeRequest } from "../../_ui/types";
import { ActBtn, actsFor, DOMINANT, notYours, QuietBtn, QuietLink, type Act } from "../../_ui/b/act";
import { AgentsLine, type HomeApp } from "../../_ui/b/agents";
import { ago, crStatus, decisionHref, nameList, oneLine, PHASE_WORDS, phaseOf, recordHref, versions, waitsOn, type Phase } from "../../_ui/b/model";
import { Facts } from "../../_ui/b/parts";
import { DeskShell } from "../../_ui/b/shell";
import FirstRun, { seenApp } from "./first-run";

// LIM-2472 concept B: the workspace Home is a decision desk. One table of the change requests this person can read
// (GET …/change-requests: every view with its state, launch, `can` flags and waiting_on_me), filtered client-side into
// Waiting on me / Waiting on others / Decided, searchable, and inspected in a drawer without leaving the page. Each row's
// actions are only those the server's `can` flags give this person; anything else says who can. Work and agents sit one
// layer down: the drawer links to the decision page (the lane map), the record on the goal page and Work. The side
// column has the only agent facts Align has: which connected apps read the goals (GET …/home apps), as evidence classes.

interface Groups {
  waiting_on_me: ChangeRequest[];
  mine: ChangeRequest[];
  others: ChangeRequest[];
}
interface HomeData {
  goals: { id: string }[] | null;
  apps: { everyone: boolean; items: HomeApp[] } | null;
  asks: { waiting_on_me: unknown[] } | null;
  alignments: { waiting_on_me: unknown[]; waiting_on_others: unknown[] } | null;
}

type Filter = Phase | "all";

export default function Home({ me, ws }: { me: Me; ws: string }) {
  const feed = useApi<Groups>(`/api/v2/workspaces/${ws}/change-requests`);
  const home = useApi<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [q, setQ] = useState("");
  // The open request is held by id (and goal), never by its filtered row: a decision that moves it out of the current
  // view must leave the drawer open with the request as it now stands and its notice.
  const [opened, setOpened] = useState<{ id: string; goal: string; act: Act | undefined; n: number } | null>(null);
  const base = `/app/w/${ws}`;

  const rows = useMemo(() => (feed.data ? [...feed.data.waiting_on_me, ...feed.data.mine, ...feed.data.others] : []), [feed.data]);
  const counts = useMemo(() => {
    const c: Record<Phase, number> = { on_me: 0, on_others: 0, decided: 0 };
    for (const r of rows) c[phaseOf(r)]++;
    return c;
  }, [rows]);
  // Until the person picks a filter: their own queue when anything waits on them, else everything.
  const f: Filter = filter ?? (counts.on_me ? "on_me" : "all");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (f !== "all" && phaseOf(r) !== f) return false;
      if (!needle) return true;
      return [r.goal.title, r.requester.name, r.reason, ...r.approvers.map((p) => p.name), crStatus(r).label].join(" ").toLowerCase().includes(needle);
    });
  }, [rows, f, q]);

  const apps = home.data?.apps ?? (home.error ? null : undefined);
  const noAppSeen = !!home.data?.apps && !home.data.apps.items.some(seenApp);

  const openRow = (r: ChangeRequest, a?: Act) => setOpened((o) => ({ id: r.id, goal: r.goal.id, act: a, n: (o?.n ?? 0) + 1 }));
  const close = () => setOpened(null);
  const reloadAll = () => {
    feed.reload();
    home.reload();
  };

  const columns: Column<ChangeRequest>[] = [
    {
      key: "request",
      header: "Request",
      width: "26%",
      sortValue: (r) => r.goal.title.toLowerCase(),
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5" data-row={r.id}>
          <span className="text-[14px] font-medium text-(--text-1)">{r.goal.title}</span>
          <span className="text-[12px] font-normal text-(--text-3)">
            {oneLine(r)} · {r.requester.id === me.id ? "your request" : `${r.requester.name}'s request`}
          </span>
        </span>
      ),
    },
    { key: "state", header: "State", sortValue: (r) => crStatus(r).label, width: "210px", render: (r) => <span className="sm:whitespace-nowrap"><StatusPill kind={crStatus(r).kind} label={crStatus(r).label} size="s" /></span> },
    {
      key: "waiting",
      header: "Waits on",
      render: (r) => {
        const w = waitsOn(r);
        return <span className="text-[13px] text-(--text-2) sm:whitespace-nowrap">{w ? nameList(w.people, me.id) : "Decided"}</span>;
      },
    },
    {
      key: "versions",
      header: "Versions",
      render: (r) => {
        const v = versions(r);
        return (
          <span className="flex flex-col font-mono text-[12px] text-(--text-2) sm:whitespace-nowrap">
            <span>Launched {v.launched}</span>
            <span className="text-(--text-3)">Approved {v.approved}</span>
          </span>
        );
      },
    },
    { key: "evidence", header: "Links", align: "end", width: "96px", sortValue: (r) => r.evidence_count, render: (r) => <span className="font-mono text-[12px] text-(--text-2)">{r.evidence_count}</span> },
    { key: "age", header: "Updated", align: "end", width: "116px", sortValue: (r) => r.updated_at, render: (r) => <span className="font-mono text-[12px] text-(--text-3) sm:whitespace-nowrap">{ago(r.updated_at)} ago</span> },
  ];

  // One filled pink in the table: the first shown row whose first choice moves a request forward.
  const filledId = shown.find((r) => actsFor(r).length && DOMINANT.includes(actsFor(r)[0]!))?.id ?? null;
  const rowActions = (r: ChangeRequest) => {
    const acts = actsFor(r);
    if (!acts.length) {
      return <span className="text-[12px] text-(--text-3)">{phaseOf(r) === "decided" ? "No action" : "Not yours"}</span>;
    }
    return (
      <span className="inline-flex flex-wrap justify-end gap-1.5 whitespace-nowrap max-sm:justify-start sm:min-w-[220px] sm:flex-nowrap">
        <ActBtn a={acts[0]!} cr={r} filled={r.id === filledId} onClick={() => openRow(r, acts[0]!)} />
        {acts.length > 1 && <QuietBtn onClick={() => openRow(r)}>More</QuietBtn>}
      </span>
    );
  };

  const filters: { value: Filter; label: string }[] = [
    { value: "on_me", label: `${PHASE_WORDS.on_me} ${counts.on_me}` },
    { value: "on_others", label: `${PHASE_WORDS.on_others} ${counts.on_others}` },
    { value: "decided", label: `${PHASE_WORDS.decided} ${counts.decided}` },
    { value: "all", label: `All ${rows.length}` },
  ];

  const loading = feed.loading && !feed.data;
  const noRequests = !!feed.data && rows.length === 0;
  const noGoals = home.data?.goals?.length === 0;

  return (
    <DeskShell me={me} ws={ws} active="desk" crumbs={[{ label: "Decision desk" }]}>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 tabIndex={-1} className="text-[24px] font-semibold tracking-[-0.01em] text-(--text-1) focus:outline-none">
                Decision desk
              </h1>
              <p className="text-[14px] text-(--text-2)" data-desk-summary>
                {loading
                  ? "Reading the change requests…"
                  : feed.error
                    ? "Align couldn't read the change requests just now, so what is waiting is unknown."
                    : counts.on_me
                      ? `${counts.on_me} decision${counts.on_me === 1 ? "" : "s"} waiting on you. ${counts.on_others} waiting on others.`
                      : `Nothing is waiting on you. ${counts.on_others} waiting on others.`}
              </p>
            </div>
          </div>

          {feed.error && (
            <EmptyState
              title="Change requests unknown"
              body="Align couldn't read the change requests just now. Nothing here means nothing is waiting; it means the read failed."
              action={<QuietBtn onClick={feed.reload}>Try again</QuietBtn>}
            />
          )}

          {noRequests && (
            <div className="flex flex-col gap-4" data-desk-empty>
              <EmptyState
                title="No decisions yet"
                body={
                  noGoals ? (
                    <>
                      A decision starts when someone asks to change a goal. This workspace has no goals you can see yet. Create one, then anyone can propose a change to it and you decide here.
                    </>
                  ) : (
                    <>Nobody has asked to change a goal you can see. When someone does, it lands here with who decides and what they may do.</>
                  )
                }
                action={
                  <span className="flex flex-wrap gap-2">
                    <QuietLink href={`${base}/goals`}>{noGoals ? "Create a goal" : "Open the goals"}</QuietLink>
                    <QuietLink href={`${base}/apps`}>Connect an agent</QuietLink>
                  </span>
                }
              />
              {noAppSeen && <FirstRun ws={ws} onSeen={home.reload} />}
            </div>
          )}

          {!!rows.length && (
            <>
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <Segmented label="Show" hideLabel size="s" options={filters} value={f} onChange={setFilter} />
                <label className="ml-auto flex min-w-[220px] flex-1 flex-col gap-1 sm:max-w-[320px]">
                  <span className="sr-only">Search decisions</span>
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search goal, person, reason"
                    className="min-h-[36px] rounded-(--radius-s) border border-(--edge) bg-(--bg-inset) px-3 text-[14px] text-(--text-1) placeholder:text-(--text-3) max-sm:min-h-[44px]"
                  />
                </label>
              </div>
              <div className="rounded-(--radius-m) border border-(--line) bg-(--bg-panel) max-sm:border-0 max-sm:bg-transparent">
                <DataTable
                  caption={`Change requests: ${filters.find((x) => x.value === f)?.label ?? ""}`}
                  columns={columns}
                  rows={shown}
                  rowKey={(r) => r.id}
                  onRowOpen={(r) => openRow(r)}
                  selectedKey={opened?.id ?? null}
                  rowActions={rowActions}
                  initialSort={{ key: "age", dir: "desc" }}
                  empty={
                    <div className="p-4">
                      <EmptyState
                        title={q ? "No decisions match" : f === "on_me" ? "Nothing is waiting on you" : f === "on_others" ? "Nothing is waiting on others" : "No decided requests"}
                        body={q ? `Nothing in this view mentions "${q}".` : "Pick another view above."}
                      />
                    </div>
                  }
                />
              </div>
            </>
          )}
        </div>

        <aside className="grid min-w-0 content-start gap-4 lg:grid-cols-2 2xl:grid-cols-1">
          <Panel eyebrow="Agents" title="Connected AI apps">
            <AgentsLine ws={ws} apps={apps} scope="workspace" />
          </Panel>
          {home.data && (home.data.asks?.waiting_on_me.length || home.data.alignments?.waiting_on_me.length) ? (
            <Panel eyebrow="Also waiting on you" title="Outside change requests">
              <ul className="flex flex-col gap-2 text-[14px]">
                {!!home.data.alignments?.waiting_on_me.length && (
                  <li>
                    <Link href={`${base}/alignments`} className="text-(--accent-text) underline-offset-4 hover:underline">
                      {home.data.alignments.waiting_on_me.length} alignment request{home.data.alignments.waiting_on_me.length === 1 ? "" : "s"}
                    </Link>
                  </li>
                )}
                {!!home.data.asks?.waiting_on_me.length && (
                  <li>
                    <Link href={`${base}/asks`} className="text-(--accent-text) underline-offset-4 hover:underline">
                      {home.data.asks.waiting_on_me.length} ask{home.data.asks.waiting_on_me.length === 1 ? "" : "s"} for your team
                    </Link>
                  </li>
                )}
              </ul>
            </Panel>
          ) : null}
          <Panel eyebrow="How to read this" tone="inset">
            <ul className="flex flex-col gap-1.5 text-[13px] text-(--text-2)">
              <li>Approval is not launch. Align serves an approved change only once someone who can launch it does.</li>
              <li>Evidence links are what people or agents report. Align doesn&apos;t check them.</li>
              <li>Only the actions you may take are buttons. The rest say who can.</li>
            </ul>
          </Panel>
        </aside>
      </div>

      {opened && <DecisionDrawer key={opened.id} ws={ws} me={me} id={opened.id} goal={opened.goal} act={opened.act} n={opened.n} apps={apps} onClose={close} onDone={reloadAll} />}
    </DeskShell>
  );
}

/** One request in the drawer, read by id so it stays as the person left it while the table behind it moves. The shared
 *  ReviewActions does the deciding; it is re-keyed only when the desk opens it on a choice (a row's button), never on a
 *  reload, so its done or refused notice stays. */
function DecisionDrawer({ ws, me, id, goal, act, n, apps, onClose, onDone }: { ws: string; me: Me; id: string; goal: string; act: Act | undefined; n: number; apps: { everyone: boolean; items: HomeApp[] } | null | undefined; onClose: () => void; onDone: () => void }) {
  const d = useApi<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${id}`);
  const titles = useGoalTitles(ws);
  const cr = d.data;
  const base = `/app/w/${ws}`;
  return (
    <Drawer
      open
      onClose={onClose}
      width="l"
      eyebrow={cr ? `${cr.requester.id === me.id ? "Your" : `${cr.requester.name}'s`} change request` : "Change request"}
      title={cr?.goal.title ?? "Reading…"}
      footer={
        <>
          <QuietLink href={recordHref(ws, { id })}>Decision record</QuietLink>
          <QuietLink href={`${base}/work?goal=${goal}`}>Work and evidence</QuietLink>
          <Link href={decisionHref(ws, { id, goal: { id: goal } })} className="inline-flex min-h-[36px] items-center rounded-(--radius-s) border border-(--accent-text) px-3 text-[13px] font-medium text-(--accent-text) hover:bg-(--accent-soft) max-sm:min-h-[44px]">
            Open the lane map
          </Link>
        </>
      }
    >
      {!cr && d.error && <p className="text-[14px] text-(--text-2)">This change request doesn&apos;t exist or you can&apos;t see it.</p>}
      {cr && (
        <div className="flex flex-col gap-5" data-drawer={cr.id}>
          <Facts cr={cr} me={me.id} />
          <div className="rounded-(--radius-m) border border-(--line-strong) bg-(--bg-panel) p-3" data-action-bar>
            {!actsFor(cr).length && (
              <p className="mb-2 text-[13px] text-(--text-2)" data-not-yours>
                {notYours(cr, me.id)}
              </p>
            )}
            <ReviewActions
              key={`${cr.id}:${n}`}
              ws={ws}
              cr={cr}
              me={me.id}
              compact
              initialChoice={act}
              onDone={() => {
                d.reload();
                onDone();
              }}
            />
          </div>
          <ReviewBody ws={ws} cr={cr} me={me.id} titleOf={(gid) => titles.get(gid) ?? "a goal"} onDone={() => { d.reload(); onDone(); }} />
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">What Align observed of agents</p>
            <AgentsLine ws={ws} apps={apps} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
