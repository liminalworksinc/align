"use client";
import { api, Btn, Card, Err, Loading, Note, Pill, Shell, num, useAction, useApi, when } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import type { AnySession, GoalLabel, MySession, StopStatus } from "../../../_ui/types";

const goalText = (g: GoalLabel | null | undefined) => (!g ? "no goal" : g.private ? "a goal you can't see" : g.title);

/** Plain words for how far a stop or resume got: sent, received by the machine, active there. */
function stopText(s: StopStatus | null, stopped: boolean) {
  if (!s) return stopped ? "Stop requested" : null;
  const has = (x: string) => s.receipts.some((r) => r.state === x);
  if (s.kind === "stop") return has("enforced") ? "Local stop active" : has("received") ? "Stop received by the machine" : "Stop sent, not yet received";
  return has("applied") || has("received") ? "Resumed" : "Resume sent, not yet received";
}

export default function Sessions({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ mine: MySession[]; all: AnySession[] | null }>(`/api/v2/workspaces/${ws}/sessions`);
  const act = useAction();
  const base = `/api/v2/workspaces/${ws}/sessions`;
  const post = (key: string, verb: string) => act.run(() => api(`${base}/${key}/${verb}`, { body: {} }), d.reload);

  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <h1 className="mb-2 text-[26px] font-semibold text-zinc-900">Shared sessions</h1>
      <p className="mb-5 text-[15px] text-zinc-600">Sessions you shared from your machine with align share. Nothing else from your machine reaches this workspace.</p>
      {d.loading && <Loading />}
      <Err>{d.error ?? act.error}</Err>
      <Card title="Yours">
        {d.data?.mine.length === 0 && <Note>You have not shared a session in this workspace.</Note>}
        <ul className="divide-y divide-zinc-200">
          {d.data?.mine.map((s) => (
            <li key={s.session_key} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] text-zinc-900">{s.title || s.repo_alias || `${s.harness} session`}</span>
                <Pill>{s.harness}</Pill>
                <Pill tone={s.state === "shared" ? "green" : s.state === "suspended" ? "amber" : "neutral"}>{s.state === "stopped" ? "not shared" : s.state}</Pill>
                {stopText(s.stop_status, s.agent_stopped) && <Pill tone={s.agent_stopped ? "red" : "neutral"}>{stopText(s.stop_status, s.agent_stopped)}</Pill>}
              </div>
              <p className="text-[14px] text-zinc-500">
                Started {when(s.started_at)}. Counting under: {goalText(s.current_epoch?.goal)}
                {s.governing_goal ? `. Follows: ${goalText(s.governing_goal)}` : ""}. {num(s.usage.requests)} requests, {num(s.usage.input + s.usage.output)} input and output tokens.
              </p>
              {s.state === "suspended" && <Note>The alignment this session counted under was revoked. Pick a goal for it on your machine to resume uploads.</Note>}
              <div className="mt-2 flex flex-wrap gap-2">
                {s.state !== "stopped" &&
                  (s.agent_stopped ? (
                    <Btn kind="secondary" disabled={act.busy} onClick={() => void post(s.session_key, "resume")}>
                      Resume agent
                    </Btn>
                  ) : (
                    <Btn kind="secondary" disabled={act.busy} onClick={() => void post(s.session_key, "stop")}>
                      Stop agent
                    </Btn>
                  ))}
                {s.state !== "stopped" && (
                  <Btn
                    kind="secondary"
                    disabled={act.busy}
                    onClick={() => {
                      if (window.confirm("Stop sharing this session? Nothing more will be uploaded. What was already shared stays until you delete it.")) void post(s.session_key, "stop-sharing");
                    }}
                  >
                    Stop sharing
                  </Btn>
                )}
                <Btn
                  kind="danger"
                  disabled={act.busy}
                  onClick={() => {
                    if (window.confirm("Delete this session's shared history? Its usage is removed from every total, so goal and team totals will change. This can't be undone.")) {
                      void act.run(() => api(`${base}/${s.session_key}`, { method: "DELETE" }), d.reload);
                    }
                  }}
                >
                  Delete shared history
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {d.data?.all && (
        <Card title="Everyone's shared sessions (workspace owners)">
          <Note>As an owner you can stop or resume any shared session&apos;s agent. Titles and usage stay with each person.</Note>
          <ul className="divide-y divide-zinc-200">
            {d.data.all.map((s) => (
              <li key={s.session_key} className="flex flex-wrap items-center gap-2 py-2 text-[15px]">
                <span className="text-zinc-900">{s.owner.name}</span>
                <span className="text-zinc-500">{s.repo_alias ? `${s.repo_alias} (${s.harness})` : `a ${s.harness} session`}</span>
                {stopText(s.stop_status, s.agent_stopped) && <Pill tone={s.agent_stopped ? "red" : "neutral"}>{stopText(s.stop_status, s.agent_stopped)}</Pill>}
                <span className="ml-auto">
                  {s.agent_stopped ? (
                    <Btn kind="secondary" disabled={act.busy} onClick={() => void post(s.session_key, "resume")}>
                      Resume agent
                    </Btn>
                  ) : (
                    <Btn kind="secondary" disabled={act.busy} onClick={() => void post(s.session_key, "stop")}>
                      Stop agent
                    </Btn>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}
