"use client";
import { useCallback, useState } from "react";
import { Drawer, EmptyState } from "../../_ui/ds";
import GoalLines from "../../_ui/home/goal-lines";
import { NeedsList } from "../../_ui/home/needs-list";
import Since from "../../_ui/home/since";
import { Loading, Shell, useApi } from "../../_ui/kit";
import type { Me } from "../../_ui/server";
import type { AnySession, ChangeRequest, MySession } from "../../_ui/types";
import FirstRun, { seenApp } from "./first-run";
import { ReviewDrawer, useReview } from "./review-drawer";
import type { EvidenceClass, HomePerson } from "@/lib/v2/home-core.mts";

// Home (LIM-2472 direction, 2026-11-05), in this order: Needs you (NeedsList: the one ranked list, with its filters and
// search), Since you last looked (_ui/home/since.tsx), Goals, one line per goal (_ui/home/goal-lines.tsx). Sessions live on
// Work and apps on Apps. A change request opens in the review drawer over the Home (?review=<goal>.<id>), and closing it
// returns to the same picture.
//
// Reads: GET …/home (goals, apps), GET …/sessions (whether the person has connected anything), GET …/change-requests.
// NeedsList, Since and GoalLines make their own further reads.

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
  goals: HomeGoal[] | null;
  apps: { everyone: boolean; items: App[] } | null;
}
interface Groups {
  waiting_on_me: ChangeRequest[];
  mine: ChangeRequest[];
  others: ChangeRequest[];
}
const UNREAD: HomeData = { goals: null, apps: null };
const primaryBtn =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) bg-(--accent) px-3.5 text-[14px] font-medium text-(--text-on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:min-h-[44px]";
const outlineBtn =
  "inline-flex min-h-[40px] items-center justify-center rounded-(--radius-s) border border-(--line-strong) px-3.5 text-[14px] font-medium text-(--text-1) hover:bg-(--bg-raised) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus) max-sm:min-h-[44px]";

export default function Home({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const s = useApi<{ mine: MySession[]; all: AnySession[] | null }>(`/api/v2/workspaces/${ws}/sessions`);
  const c = useApi<Groups>(`/api/v2/workspaces/${ws}/change-requests`);
  const [review, setReview] = useReview();
  const [connect, setConnect] = useState(false);
  // NeedsList holds its own reads: a new key reads them again after a decision in the drawer.
  const [needsKey, setNeedsKey] = useState(0);
  // The Needs-you count, from NeedsList's own rows; null until its reads finish, or when one failed and it found nothing.
  const [needCount, setNeedCount] = useState<number | null>(null);
  const h = d.data ?? (d.error ? UNREAD : null);
  const reloadAll = useCallback(() => {
    d.reload();
    s.reload();
    c.reload();
    setNeedsKey((k) => k + 1);
  }, [d, s, c]);

  const allCrs = c.data ? [...c.data.waiting_on_me, ...c.data.mine, ...c.data.others] : [];
  const mine = s.data?.mine.filter((x) => x.state !== "stopped") ?? [];
  const mineKeys = new Set(mine.map((x) => x.session_key));
  const teammates = s.data?.all?.filter((x) => !mineKeys.has(x.session_key)) ?? null;

  const apps = h?.apps ?? null;
  /** The person has connected nothing here. Only an owner sees everyone's apps and sessions, so only for an owner does
   *  "no agent is sharing work here" hold for the whole workspace; anyone else is told what their role can't see. */
  const nothingOfMine = !!apps && !apps.items.some(seenApp) && s.data !== null && mine.length === 0 && !teammates?.length;
  const ownerView = !!apps?.everyone;
  const noAgents = nothingOfMine && ownerView;
  return (
    <Shell me={me} ws={ws} tab="Home">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 tabIndex={-1} className="min-w-0 text-[24px] font-semibold leading-tight text-(--text-1)" data-home-count={needCount ?? "reading"}>
            {needCount === null ? "Needs you" : needCount === 0 ? "Nothing needs you" : `${needCount} ${needCount === 1 ? "thing needs" : "things need"} you`}
          </h1>
          {/* First run's action: with an app connected the header has none. With nothing connected at all, the note below
              carries it, so it appears once. */}
          {apps?.items.length === 0 && !nothingOfMine && (
            <button
              type="button"
              onClick={() => setConnect(true)}
              className="inline-flex min-h-[40px] items-center rounded-(--radius-s) border border-(--line-strong) px-3 text-[14px] text-(--text-1) hover:bg-(--bg-raised) max-sm:min-h-[44px]"
              data-connect-open
            >
              Connect an agent
            </button>
          )}
        </header>

        <NeedsList key={needsKey} ws={ws} me={me.id} selected={review ? `cr:${review.id}` : null} onCount={setNeedCount} />

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
        {nothingOfMine && !ownerView && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-m) border border-dashed border-(--line-strong) px-4 py-3" data-home-role-note>
            <p className="min-w-0 flex-1 basis-64 text-[14px] text-(--text-2)">
              You haven&apos;t connected an agent here. Other people&apos;s sessions and apps are shown to workspace owners only, so this Home shows the plan and what Align released, not their agents.
            </p>
            <button type="button" className={outlineBtn} onClick={() => setConnect(true)} data-connect-empty>
              Connect your agent
            </button>
          </div>
        )}

        {!h ? (
          <Loading />
        ) : (
          <>
            <Since ws={ws} me={me.id} changes={c.data ? allCrs : null} goals={h.goals} apps={h.apps?.items ?? null} onReview={(goal, id) => setReview({ goal, id })} />
            <GoalLines ws={ws} me={me.id} goals={h.goals} changes={c.data ? allCrs : null} onReview={(goal, id) => setReview({ goal, id })} />
          </>
        )}

        {/* The drawers break words only where needed, so a short label ("Close", "Esc") never splits at 320. */}
        <div className="[overflow-wrap:break-word]">
          {review && <ReviewDrawer key={`${review.id}:${review.choice ?? ""}`} ws={ws} goal={review.goal} id={review.id} me={me.id} choice={review.choice} onClose={() => setReview(null)} onChanged={reloadAll} />}
          <Drawer open={connect} onClose={() => setConnect(false)} title="Connect an agent" eyebrow="Get started">
            <FirstRun ws={ws} onSeen={reloadAll} always />
          </Drawer>
        </div>
      </div>
    </Shell>
  );
}
