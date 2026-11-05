"use client";
import { PAGE_H1 } from "@/app/app/_ui/page-title";
import { useCallback, useState } from "react";
import GoalLines from "../../_ui/home/goal-lines";
import { NeedsList } from "../../_ui/home/needs-list";
import Since from "../../_ui/home/since";
import { useRead } from "../../_ui/ds/read";
import { Loading, Shell, useApi } from "../../_ui/kit";
import { NotInWorkspace } from "../../_ui/missing";
import type { CreationOptions, Me } from "../../_ui/server";
import type { ChangeRequest, Goal } from "../../_ui/types";
import FirstRun from "./first-run";
import { ReviewDrawer, useReview } from "./review-drawer";
import type { EvidenceClass, HomePerson } from "@/lib/v2/home-core.mts";

// Home (LIM-2472 direction, 2026-11-05), in this order: Needs you (NeedsList: the one ranked list, with its filters and
// search), Since you last looked (_ui/home/since.tsx), Goals, one line per goal (_ui/home/goal-lines.tsx). Sessions live on
// Work and apps on Apps. A change request opens in the review drawer over the Home (?review=<goal>.<id>), and closing it
// returns to the same picture.
//
// Reads: GET …/home (goals, apps), GET …/change-requests, GET …/goals (the goal lines' feed). NeedsList, Since, FirstRun and
// the goal lines' shared value cache (_ui/home/value-cache.ts) make their own further reads.

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
/** The page's heading, from NeedsList: its Needs-you count (null while reading, or when nothing is readable); `partial`
 *  when some source couldn't be read, so the count is a lower bound and zero is never claimed. */
function needsHeading(n: number | null, partial: boolean) {
  if (n === null) return "Needs you";
  if (partial) return n === 0 ? "Some of this could not be read" : `At least ${n} ${n === 1 ? "thing needs" : "things need"} you`;
  if (n === 0) return "Nothing needs you";
  return `${n} ${n === 1 ? "thing needs" : "things need"} you`;
}

export default function Home({ me, ws, creation }: { me: Me; ws: string; creation?: CreationOptions }) {
  const d = useRead<HomeData>(`/api/v2/workspaces/${ws}/home`);
  const c = useApi<Groups>(`/api/v2/workspaces/${ws}/change-requests`);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [review, setReview] = useReview();
  // Stable: the Drawer re-takes focus whenever onClose changes, which would pull it off a notice that just took it.
  const closeReview = useCallback(() => setReview(null), [setReview]);
  // NeedsList holds its own reads: a new key reads them again after a decision in the drawer.
  const [needsKey, setNeedsKey] = useState(0);
  const [count, setCount] = useState<{ n: number | null; partial: boolean }>({ n: null, partial: false });
  const onCount = useCallback((n: number | null, partial: boolean) => setCount({ n, partial }), []);
  const h = d.data ?? (d.status ? UNREAD : null);
  // Read only for the empty state, the one place Home needs the role.
  const list = useRead<{ workspaces: { id: string; role: "owner" | "member" | "viewer" }[] }>(h?.goals?.length === 0 ? "/api/v2/workspaces" : null);
  const role = list.data?.workspaces.find((w) => w.id === ws)?.role ?? null;
  // Stable (the reloads are): FirstRun's polling restarts whenever onSeen changes.
  const { reload: reloadHome } = d;
  const { reload: reloadChanges } = c;
  const reloadAll = useCallback(() => {
    reloadHome();
    reloadChanges();
    setNeedsKey((k) => k + 1);
  }, [reloadHome, reloadChanges]);

  const allCrs = c.data ? [...c.data.waiting_on_me, ...c.data.mine, ...c.data.others] : [];
  // A workspace with no goals: the page says so, and the empty state (FirstRun) leads. The list stays mounted for its
  // count but is hidden while nothing needs the person; Since and Goals have nothing to compare or list.
  const noGoals = !!h && h.goals !== null && h.goals.length === 0;
  const quietList = noGoals && count.n === 0 && !count.partial;
  // The page checks membership before Home mounts; this is the person removed while Home is open (every read is a 404).
  if (d.status === 404) return <NotInWorkspace me={me} />;

  return (
    <Shell me={me} ws={ws} tab="Home">
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 tabIndex={-1} className={`${PAGE_H1} min-w-0`} data-home-count={count.n ?? "reading"}>
            {noGoals && (count.n === 0 || count.n === null) && !count.partial ? "No goals here yet" : needsHeading(count.n, count.partial)}
          </h1>
        </header>

        {/* Goals unread is not goals absent: with the goals read failed, first run (and its empty-workspace state) waits. */}
        {h && h.goals !== null && <FirstRun ws={ws} onSeen={reloadAll} me={me.id} hasGoals={h.goals.length > 0} creation={creation} />}

        <div className={quietList ? "hidden" : "contents"}>
        <NeedsList key={needsKey} ws={ws} me={me.id} selected={review ? `cr:${review.id}` : null} heading={false} onCount={onCount} />
        </div>

        {!h ? (
          <Loading />
        ) : noGoals ? null : (
          <>
            <Since ws={ws} me={me.id} changes={c.data ? allCrs : null} goals={h.goals} apps={h.apps?.items ?? null} onReview={(goal, id) => setReview({ goal, id })} />
            <GoalLines ws={ws} goals={h.goals} changes={c.data ? allCrs : null} feed={feed.data?.goals ?? null} canCreate={role === "owner" || role === "member"} onReview={(goal, id) => setReview({ goal, id })} />
          </>
        )}

        {/* The drawers break words only where needed, so a short label ("Close", "Esc") never splits at 320. */}
        <div className="[overflow-wrap:break-word]">
          {review && <ReviewDrawer key={`${review.id}:${review.choice ?? ""}`} ws={ws} goal={review.goal} id={review.id} me={me.id} choice={review.choice} onClose={closeReview} onChanged={reloadAll} />}
        </div>
      </div>
    </Shell>
  );
}
