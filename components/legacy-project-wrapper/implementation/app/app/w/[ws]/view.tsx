"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Drawer, EmptyState, Panel, ReviewActions, ReviewBody } from "../../_ui/ds";
import { useGoalTitles } from "../../_ui/changes";
import { useApi } from "../../_ui/kit";
import type { Me } from "../../_ui/server";
import type { ChangeRequest } from "../../_ui/types";
import { actsFor, notYours, QuietLink, type Act } from "../../_ui/b/act";
import { AgentsLine, type HomeApp } from "../../_ui/b/agents";
import { Desk } from "../../_ui/b/desk";
import { decisionHref, recordHref } from "../../_ui/b/model";
import { Facts } from "../../_ui/b/parts";
import { WhoDecides } from "../../_ui/b/who-decides";
import { DeskShell } from "../../_ui/b/shell";
import { NeedsList } from "../../_ui/home/needs-list";
import FirstRun, { seenApp } from "./first-run";

// LIM-2472 concept B Home, on the founder's direction of Nov 5 (LIM-2472 9b5b870f): "Needs you", one ranked list of what
// needs a human with its evidence (_ui/home/needs-list.tsx), then the decision desk of every change request
// (_ui/b/desk.tsx). Both open a request as `?review=<goal>.<id>[&choice=<choice>]`; this page reads that from the URL and
// shows the request in a drawer, read by id, so a link opens it complete and it stays open while the lists move behind
// it. The side column has the only agent facts Align has: which connected apps read the goals (GET …/home apps).

interface HomeData {
  goals: { id: string }[] | null;
  apps: { everyone: boolean; items: HomeApp[] } | null;
  asks: { waiting_on_me: unknown[] } | null;
  alignments: { waiting_on_me: unknown[]; waiting_on_others: unknown[] } | null;
}

const CHOICES: readonly Act[] = ["approve_and_launch", "approve", "launch", "not_yet", "accept_if", "counter", "reject", "accept_counter", "acknowledge", "rebase", "withdraw"];

export default function Home({ me, ws }: { me: Me; ws: string }) {
  const home = useApi<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [token, setToken] = useState(0);
  const [need, setNeed] = useState<{ n: number | null; partial: boolean }>({ n: null, partial: false });
  const base = `/app/w/${ws}`;
  // ?review=<goal>.<id>: the request to show; &choice= opens ReviewActions on that choice.
  const review = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(params.get("review") ?? "");
  const choiceParam = params.get("choice") as Act | null;
  const choice = choiceParam && CHOICES.includes(choiceParam) ? choiceParam : undefined;
  const apps = home.data?.apps ?? (home.error ? null : undefined);
  const noAppSeen = !!home.data?.apps && !home.data.apps.items.some(seenApp);
  const noGoals = home.data?.goals?.length === 0;
  const close = () => router.replace(pathname, { scroll: false });

  return (
    <DeskShell me={me} ws={ws} active="desk" crumbs={[{ label: "Home" }]}>
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-3">
            {/* The count is the Needs-you rows only, from the list itself; unknown while it reads. */}
            <h1 tabIndex={-1} data-need-count={need.n ?? ""} data-need-partial={need.partial ? "1" : "0"} className="text-[24px] font-semibold tracking-[-0.01em] text-(--text-1) focus:outline-none">
              {need.n === null
                ? "Home"
                : need.partial
                  ? need.n > 0
                    ? `At least ${need.n} thing${need.n === 1 ? "" : "s"} need${need.n === 1 ? "s" : ""} you`
                    : "Some of this could not be read"
                  : need.n === 0
                    ? "Nothing needs you"
                    : `${need.n} thing${need.n === 1 ? "" : "s"} need${need.n === 1 ? "s" : ""} you`}
            </h1>
            <NeedsList key={token} ws={ws} me={me.id} heading={false} onCount={(n, partial) => setNeed({ n, partial })} selected={review ? `cr:${review[2]}` : null} />
          </div>
          <section aria-labelledby="desk-h" className="flex min-w-0 flex-col gap-2">
            <h2 id="desk-h" className="text-[18px] font-semibold text-(--text-1)">
              Decision desk
            </h2>
            <Desk
              ws={ws}
              me={me.id}
              selectedId={review?.[2] ?? null}
              reloadToken={token}
              empty={
                <div className="flex flex-col gap-4" data-desk-empty>
                  <EmptyState
                    title="No decisions yet"
                    body={
                      noGoals
                        ? "A decision starts when someone asks to change a goal. This workspace has no goals you can see yet. Create one, then anyone can propose a change to it and you decide here."
                        : "Nobody has asked to change a goal you can see. When someone does, it lands here with who decides and what they may do."
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
              }
            />
          </section>
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

      {review && (
        <DecisionDrawer
          key={review[2]}
          ws={ws}
          me={me}
          id={review[2]!}
          goal={review[1]!}
          act={choice}
          onPick={(a) => router.replace(`${pathname}?review=${review![1]}.${review![2]}&choice=${a}`, { scroll: false })}
          apps={apps}
          onClose={close}
          onDone={() => {
            setToken((t) => t + 1);
            home.reload();
          }}
        />
      )}
    </DeskShell>
  );
}

function DecisionDrawer({ ws, me, id, goal, act, apps, onClose, onDone, onPick }: { ws: string; me: Me; id: string; goal: string; act: Act | undefined; apps: { everyone: boolean; items: HomeApp[] } | null | undefined; onClose: () => void; onDone: () => void; onPick: (a: Act) => void }) {
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
              key={`${cr.id}:${act ?? ""}`}
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
          {/* Desktop only; a step the person may take opens it in the action bar above (&choice=). */}
          <WhoDecides
            cr={cr}
            me={me.id}
            onAct={(a) => {
              onPick(a);
              document.querySelector("[data-drawer] [data-action-bar]")?.scrollIntoView({ block: "nearest" });
            }}
          />
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
