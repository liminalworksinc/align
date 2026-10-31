"use client";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, Select, SignInAgain, TextArea, useAction, useApi, when } from "./kit";
import type { Me } from "./server";
import type { Goal } from "./types";

// The goal page's "Agents on this goal" card (REQ-001): requests to the agents working on the goal (replan,
// checkpoint, switch goal) and the goal hold. Align writes the wording the developer and the agent see; the sender is
// named and their note is quoted. Holding and releasing need a sign-in from the last 15 minutes
// (GET/POST .../goals/<goal>/requests, DELETE .../requests/<id>, PUT/DELETE .../goals/<goal>/hold).

type RequestType = "replan" | "checkpoint" | "switch_goal";
type TargetState = "sent" | "received" | "accepted" | "declined" | "expired";
interface Person {
  id: string;
  name: string;
}
interface RequestView {
  id: string;
  type: RequestType;
  goal: { id: string; title: string; version: number };
  target_goal: { id: string | null; title: string | null; version: number | null; private?: boolean } | null;
  note: string | null;
  sender: Person & { role: "approver" | "owner" };
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: Person | null;
  state: "open" | "answered" | "cancelled" | "expired";
  counts: { pending: number; accepted: number; declined: number; expired: number; done_by_agent: number };
  sessions: { session_key: string; owner: Person; mine: boolean; repo_alias: string | null; harness: string; title: string | null; state: TargetState; auto_accepted: boolean; updated_at: string }[];
  can_cancel: boolean;
}
export interface HoldState {
  held: { held_by: Person; reason: string | null; held_at: string } | null;
  can_hold: boolean;
}
interface RequestsData {
  requests: RequestView[];
  can_send: boolean;
  sessions: { session_key: string; owner: Person; mine: boolean; repo_alias: string | null; harness: string }[] | null;
  hold: HoldState;
}

export const TYPE_LABEL: Record<RequestType, string> = { replan: "Replan", checkpoint: "Checkpoint", switch_goal: "Switch goal" };
const TYPE_HELP: Record<RequestType, string> = {
  replan: "The agent re-reads this goal and drafts an updated plan for the developer. It keeps working as before until the developer agrees.",
  checkpoint: "At the end of its current step the agent commits its work and summarizes where it is, then continues. A safe step: the agent does it without asking, and the developer can still decline.",
  switch_goal: "The sessions you pick move to another goal, only if their developer accepts. Until then they keep working toward this goal.",
};

/** pending / accepted / declined / expired, and whether an accept was the agent's own (a safe request) or the developer's. */
function statePill(s: { state: TargetState; auto_accepted: boolean }) {
  if (s.state === "accepted") return <Pill tone="green">{s.auto_accepted ? "done by the agent" : "accepted by the developer"}</Pill>;
  if (s.state === "declined") return <Pill tone="red">declined</Pill>;
  if (s.state === "expired") return <Pill>expired</Pill>;
  return <Pill tone="amber">pending</Pill>;
}

const sessionName = (s: { owner: Person; mine: boolean; repo_alias: string | null; harness: string; title?: string | null }) =>
  `${s.mine ? "Your" : `${s.owner.name}'s`} ${s.title || s.repo_alias || s.harness} session`;

/** The hold banner for the top of the goal page (also shown on the Goals and Sessions tabs). */
export function HoldBanner({ hold, goalTitle }: { hold: HoldState["held"]; goalTitle?: string }) {
  if (!hold) return null;
  return (
    <div data-hold-banner className="mb-5 rounded-[14px] border border-red-700 bg-red-50 px-4 py-3 text-[15px] text-red-800">
      <strong>All agents on {goalTitle ? `"${goalTitle}"` : "this goal"} are on hold.</strong> {hold.held_by.name} paused them {when(hold.held_at)}
      {hold.reason ? `: ${hold.reason}` : ""}. Their tools are blocked until someone who can approve for the goal releases it.
    </div>
  );
}

function HoldControls({ ws, goal, me, hold, onDone }: { ws: string; goal: Goal; me: Me; hold: HoldState; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const act = useAction();
  if (!hold.can_hold) return null;
  const path = `/api/v2/workspaces/${ws}/goals/${goal.id}/hold`;
  if (act.reauth)
    return (
      <SignInAgain me={me} next={`/app/w/${ws}/goals/${goal.id}`}>
        {act.reauth}
      </SignInAgain>
    );
  return (
    <div className="mb-4 border-b border-zinc-200 pb-4">
      {hold.held ? (
        <Btn kind="secondary" disabled={act.busy} onClick={() => void act.run(() => api(path, { method: "DELETE" }), onDone)}>
          Release
        </Btn>
      ) : (
        goal.status === "active" && (
          <>
            <Field label="Reason (optional, shown to the developers)">
              <Input value={reason} maxLength={280} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Btn kind="danger" disabled={act.busy} onClick={() => void act.run(() => api(path, { method: "PUT", body: { reason: reason || null } }), onDone)}>
              Hold all agents on this goal
            </Btn>
            <p className="mt-1 text-[13px] text-zinc-500">Align blocks their tools until you release it. It asks for a recent sign-in.</p>
          </>
        )
      )}
      <Err>{act.error}</Err>
    </div>
  );
}

function SendRequest({ ws, goal, data, onDone }: { ws: string; goal: Goal; data: RequestsData; onDone: () => void }) {
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [type, setType] = useState<RequestType>("checkpoint");
  const [keys, setKeys] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const act = useAction();
  const sessions = data.sessions ?? [];
  const others = feed.data?.goals.filter((g) => g.id !== goal.id && g.status === "active") ?? [];
  if (!sessions.length) return <Note>No shared session is working on this goal, so there is no one to send a request to.</Note>;
  return (
    <div className="mb-4 border-b border-zinc-200 pb-4" id="send-request">
      <p className="mb-2 text-[15px] font-medium text-zinc-900">Send a request</p>
      {(Object.keys(TYPE_LABEL) as RequestType[]).map((t) => (
        <label key={t} className="mb-2 flex items-start gap-2 text-[15px]">
          <input type="radio" name="request-type" value={t} checked={type === t} onChange={() => setType(t)} className="mt-1" />
          <span>
            <strong className="text-zinc-900">{TYPE_LABEL[t]}.</strong> {TYPE_HELP[t]}
          </span>
        </label>
      ))}
      {type === "switch_goal" && (
        <>
          <p className="mb-1 text-[14px] text-zinc-600">Sessions to move (pick at least one)</p>
          {sessions.map((s) => (
            <label key={s.session_key} className="mb-1 flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={keys.includes(s.session_key)} onChange={(e) => setKeys((k) => (e.target.checked ? [...k, s.session_key] : k.filter((x) => x !== s.session_key)))} />
              {sessionName(s)}
            </label>
          ))}
          <Field label="Move them to">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Pick a goal</option>
              {others.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
      <Field label="Note (optional; shown to the developer and the agent, quoted)">
        <TextArea rows={2} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Btn
        disabled={act.busy || (type === "switch_goal" && (!keys.length || !target))}
        onClick={() =>
          void act.run(
            () => api(`/api/v2/workspaces/${ws}/goals/${goal.id}/requests`, { body: { type, note: note || null, ...(type === "switch_goal" ? { session_keys: keys, target_goal_id: target } : {}) } }),
            () => {
              setNote("");
              setKeys([]);
              onDone();
            },
          )
        }
      >
        Send
      </Btn>
      <Err>{act.error}</Err>
    </div>
  );
}

function RequestRow({ ws, r, onDone }: { ws: string; r: RequestView; onDone: () => void }) {
  const act = useAction();
  const c = r.counts;
  return (
    <li className="py-3" data-request={r.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[16px] text-zinc-900">{TYPE_LABEL[r.type]}</span>
        {r.state === "cancelled" ? <Pill>cancelled</Pill> : r.state === "expired" ? <Pill>expired: the goal closed</Pill> : r.state === "open" ? <Pill tone="amber">waiting</Pill> : <Pill tone="green">answered</Pill>}
        <span className="text-[14px] text-zinc-500">
          from {r.sender.name} ({r.sender.role === "approver" ? "approver" : "workspace owner"}), {when(r.created_at)}, goal version {r.goal.version}
        </span>
        {r.can_cancel && (
          <span className="ml-auto">
            <Btn kind="secondary" disabled={act.busy} onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/goals/${r.goal.id}/requests/${r.id}`, { method: "DELETE" }), onDone)}>
              Cancel
            </Btn>
          </span>
        )}
      </div>
      {r.target_goal && <p className="text-[14px] text-zinc-600">Move to: {r.target_goal.private ? "a goal you can't see" : r.target_goal.title}</p>}
      {r.note && <p className="text-[14px] text-zinc-600">Note: &ldquo;{r.note}&rdquo;</p>}
      {r.cancelled_by && <p className="text-[14px] text-zinc-500">Cancelled by {r.cancelled_by.name}, {when(r.cancelled_at)}</p>}
      <p className="text-[14px] text-zinc-500">
        {c.pending} pending, {c.accepted} accepted{c.done_by_agent ? ` (${c.done_by_agent} done by the agent)` : ""}, {c.declined} declined{c.expired ? `, ${c.expired} expired` : ""}
      </p>
      {r.sessions.map((s) => (
        <p key={s.session_key} className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-700">
          {sessionName(s)} {statePill(s)}
        </p>
      ))}
      <Err>{act.error}</Err>
    </li>
  );
}

/** "Agents on this goal": hold and release, send a request, and the requests sent so far with each session's answer. */
export function AgentsOnGoalCard({ ws, goal, me, onHoldChanged }: { ws: string; goal: Goal; me: Me; onHoldChanged: () => void }) {
  const d = useApi<RequestsData>(`/api/v2/workspaces/${ws}/goals/${goal.id}/requests`);
  const data = d.data;
  const reload = () => {
    d.reload();
    onHoldChanged();
  };
  if (d.loading && !data) return <Loading />;
  if (!data) return null;
  if (!data.can_send && !data.hold.can_hold && !data.requests.length) return null;
  return (
    <section id="agents-on-goal">
      <Card title="Agents on this goal">
        <HoldControls ws={ws} goal={goal} me={me} hold={data.hold} onDone={reload} />
        {data.can_send && <SendRequest ws={ws} goal={goal} data={data} onDone={d.reload} />}
        <Err>{d.error}</Err>
        {data.requests.length === 0 ? (
          <Note>No requests sent to agents on this goal yet.</Note>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {data.requests.map((r) => (
              <RequestRow key={`${r.id}:${r.state}`} ws={ws} r={r} onDone={d.reload} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
