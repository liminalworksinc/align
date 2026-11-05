"use client";
import Link from "next/link";
import { Err, Loading, Shell, useApi } from "../../../_ui/kit";
import { Panel, ReviewActions, ReviewBody } from "@/app/app/_ui/ds";
import type { Me } from "../../../_ui/server";
import type { ChangeRequest, Goal } from "../../../_ui/types";

const LINK = "max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center text-[14px] text-(--accent-text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus)";

type Section = { id: string; title: string; list: ChangeRequest[]; empty: string };

// The workspace Requests tab: every change request the person can see, split by what it needs from them. Each request
// is the shared review (LIM-2472 workstream S, @/app/app/_ui/ds): ReviewBody says what was asked and what it waits for;
// ReviewActions offers exactly the choices the server's `can` flags give this person, or says whose move it is.
export default function Requests({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ waiting_on_me: ChangeRequest[]; mine: ChangeRequest[]; others: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/change-requests`);
  // Goal titles for dependency rows in the diff: the same goals read the tab made before (was useGoalTitles).
  const goals = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const titles = new Map((goals.data?.goals ?? []).map((g) => [g.id, g.title]));
  const titleOf = (id: string) => titles.get(id) ?? id;

  const sections: Section[] = d.data
    ? [
        { id: "waiting", title: "Waiting on you", list: d.data.waiting_on_me, empty: "Nothing is waiting on you." },
        {
          id: "mine",
          title: "Your requests",
          list: d.data.mine,
          // A request of yours that waits on you (a counter to accept, or a launch you may do) is listed above.
          empty: d.data.waiting_on_me.some((cr) => cr.requester.id === me.id) ? "No other requests of yours. Yours that need you are under Waiting on you." : "You have not proposed a change. Open someone else's goal to propose one.",
        },
        { id: "others", title: "Others", list: d.data.others, empty: "None." },
      ]
    : [];

  return (
    <Shell me={me} ws={ws} tab="Requests">
      <h1 className="mb-5 font-display text-[32px] leading-[1.1] text-(--text-1) max-sm:text-[28px]">Change requests</h1>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        // One flat keyed list (headings are siblings, not wrappers), so a request that moves section after a decision (say, from Waiting on
        // you to Others) keeps its review mounted and its "Recorded: …" or "Not recorded. …" notice stays on screen.
        <div className="flex flex-col">
          {sections.flatMap((s) => [
            <h2 key={`h:${s.id}`} id={`requests-${s.id}`} className="mb-3 mt-7 flex items-baseline gap-2 border-b border-(--line) pb-2 text-[17px] font-semibold text-(--text-1) first:mt-0">
              {s.title}
              {s.list.length > 0 && <span className="font-mono text-[12px] font-normal text-(--text-3)">{s.list.length}</span>}
            </h2>,
            ...(s.list.length === 0
              ? [
                  <p key={`e:${s.id}`} className="text-[15px] text-(--text-2)">
                    {s.empty}
                  </p>,
                ]
              : s.list.map((cr) => <RequestReview key={cr.id} ws={ws} cr={cr} me={me.id} titleOf={titleOf} onDone={d.reload} />)),
          ])}
        </div>
      )}
    </Shell>
  );
}

function RequestReview({ ws, cr, me, titleOf, onDone }: { ws: string; cr: ChangeRequest; me: string; titleOf: (id: string) => string; onDone: () => void }) {
  return (
    <Panel
      as="div"
      className="mb-3"
      eyebrow="Change request"
      actions={
        <>
          <Link href={`/app/w/${ws}/goals/${cr.goal.id}`} className={LINK}>
            Goal
          </Link>
          <Link href={`/app/w/${ws}/record?cr=${cr.id}`} className={LINK}>
            Record
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ReviewBody ws={ws} cr={cr} me={me} titleOf={titleOf} />
        <div className="border-t border-(--line) pt-3">
          <ReviewActions ws={ws} cr={cr} me={me} onDone={onDone} compact />
        </div>
      </div>
    </Panel>
  );
}
