"use client";
import { Card, Err, Loading, Note, Shell, useApi } from "../../../_ui/kit";
import { ChangeRequestCard, useGoalTitles } from "../../../_ui/changes";
import type { Me } from "../../../_ui/server";
import type { ChangeRequest } from "../../../_ui/types";

// The workspace Requests tab: every change request the person can see, split by what it needs from them.
export default function Requests({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ waiting_on_me: ChangeRequest[]; mine: ChangeRequest[]; others: ChangeRequest[] }>(`/api/v2/workspaces/${ws}/change-requests`);
  const titles = useGoalTitles(ws);
  const section = (title: string, list: ChangeRequest[] | undefined, empty: string) => (
    <Card title={title}>
      {list?.length === 0 && <Note>{empty}</Note>}
      {list?.map((cr) => (
        <ChangeRequestCard key={`${cr.id}:${cr.revision}:${cr.state}:${cr.goal.version}`} ws={ws} cr={cr} me={me.id} showGoal titles={titles} onDone={d.reload} />
      ))}
    </Card>
  );
  return (
    <Shell me={me} ws={ws} tab="Requests">
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Change requests</h1>
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
