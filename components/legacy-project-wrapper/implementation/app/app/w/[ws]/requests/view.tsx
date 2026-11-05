"use client";
import { Err, Loading, Shell, useApi } from "../../../_ui/kit";
import { ChangeRequestCard, useGoalTitles } from "../../../_ui/changes";
import type { Me } from "../../../_ui/server";
import type { ChangeRequest } from "../../../_ui/types";

// The workspace Requests tab: every change request the person can see, split by what it needs from them.
export default function Requests({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ waiting_on_me: ChangeRequest[]; mine: ChangeRequest[]; others: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/change-requests`);
  const titles = useGoalTitles(ws);
  // LIM-2472 (stream R): each section is a heading with its count over the request cards themselves (the cards are their
  // own panels), so a request is never a box inside a box; an empty section is one quiet line.
  const section = (title: string, list: ChangeRequest[] | undefined, empty: string) => (
    <section aria-label={title} className="mb-7">
      <h2 className="mb-3 flex items-baseline gap-2 border-b border-(--line) pb-2 text-[17px] font-semibold text-(--text-1)">
        {title}
        {!!list?.length && <span className="font-mono text-[12px] font-normal text-(--text-3)">{list.length}</span>}
      </h2>
      {list?.length === 0 && <p className="text-[15px] text-(--text-2)">{empty}</p>}
      {list?.map((cr) => (
        <ChangeRequestCard key={`${cr.id}:${cr.revision}:${cr.state}:${cr.goal.version}`} ws={ws} cr={cr} me={me.id} showGoal titles={titles} onDone={d.reload} />
      ))}
    </section>
  );
  return (
    <Shell me={me} ws={ws} tab="Requests">
      <h1 className="mb-5 font-display text-[32px] leading-[1.1] text-(--text-1) max-sm:text-[28px]">Change requests</h1>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          {section("Waiting on you", d.data.waiting_on_me, "Nothing is waiting on you.")}
          {section(
            "Your requests",
            d.data.mine,
            // A request of yours that waits on you (a counter to accept, or a launch you may do) is listed above.
            d.data.waiting_on_me.some((cr) => cr.requester.id === me.id) ? "No other requests of yours. Yours that need you are under Waiting on you." : "You have not proposed a change. Open someone else's goal to propose one.",
          )}
          {section("Others", d.data.others, "None.")}
        </>
      )}
    </Shell>
  );
}
