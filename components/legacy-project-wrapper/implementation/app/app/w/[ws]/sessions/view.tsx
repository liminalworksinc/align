"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, Btn, Card, Err, Loading, Note, Pill, Shell, num, useAction, useApi, when } from "../../../_ui/kit";
import type { Me } from "../../../_ui/server";
import { EvidencePill } from "../../../_ui/evidence";
import { HoldBanner } from "../../../_ui/requests";
import { receiptEvidence } from "@/lib/v2/home-core.mts";
import { count } from "@/lib/v2/plural.mts";
import { shareAgainWords } from "@/lib/v2/share-again.mts";
import type { AnySession, GoalLabel, MySession, StopStatus } from "../../../_ui/types";

const goalText = (g: GoalLabel | null | undefined) => (!g ? "no goal" : g.private ? "a goal you can't see" : g.title);

/** How far a stop or resume got, with its evidence class (the checklist's §E2): a delivery receipt once the machine
 *  sent any receipt, else not observed. */
function StopStatusPills({ s, stopped, ended = false }: { s: StopStatus | null; stopped: boolean; ended?: boolean }) {
  const text = stopText(s, stopped, ended);
  if (!text) return null;
  return (
    <>
      <Pill tone={stopped ? "red" : "neutral"}>{text}</Pill>
      <EvidencePill c={receiptEvidence(s?.receipts.length ?? 0)} />
    </>
  );
}

/** Plain words for how far a stop or resume got: sent, received by the machine, active there. A session whose machine
 *  signed out can't get either, so it never reads "sent". */
function stopText(s: StopStatus | null, stopped: boolean, ended = false) {
  if (ended) return stopped ? "Stopped; can't be resumed from here" : null;
  if (!s) return stopped ? "Stop requested" : null;
  const has = (x: string) => s.receipts.some((r) => r.state === x);
  if (s.kind === "stop") return has("enforced") ? "Local stop active" : has("received") ? "Stop received by the machine" : "Stop sent, not yet received";
  return has("applied") || has("received") ? "Resumed" : "Resume sent, not yet received";
}

/** How to share a session again that ended when its person left the workspace, by where its machine stands now (W7):
 *  the words the Stop and Resume refusal uses too (lib/v2/share-again.mts, E2E-WEB cycle 13 W1), with the machine's
 *  name wrapped anywhere and the Devices page linked. */
function shareAgain(s: MySession): ReactNode {
  return shareAgainWords(s.device, null).map((p, i) =>
    typeof p === "string" ? (
      p
    ) : "device" in p ? (
      <span key={i} className="[overflow-wrap:anywhere]">
        {p.device}
      </span>
    ) : (
      <Link key={i} href="/app/devices" className="underline">
        {p.devices_page}
      </Link>
    ),
  );
}

/** Stop and Resume refusals that mean the session's sharing ended since the page loaded: the list is reloaded and the
 *  refusal is shown at the session's row (E2E-WEB cycle 13 W2). */
const ENDED_CODES = new Set(["member_removed", "device_signed_out", "sharing_stopped"]);

/** A Stop or Resume refused because the session's sharing ended: at its row, as an alert that takes focus, so a
 *  keyboard or screen reader user hears why where they pressed. */
function RowRefusal({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [text]);
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="alert"
      data-row-refusal
      className="my-2 w-full rounded-[10px] border border-red-700 bg-red-50 px-3 py-2 text-[15px] text-zinc-900 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
    >
      {text}
    </p>
  );
}

/** The refused row: the session, where its row was in the owner's list (it leaves the list once reloaded, as an ended
 *  session does), and the refusal. */
interface Refused {
  key: string;
  text: string;
  row: AnySession | null;
  index: number;
}

export default function Sessions({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ mine: MySession[]; all: AnySession[] | null }>(`/api/v2/workspaces/${ws}/sessions`);
  const holds = useApi<{ holds: { goal: { id: string; title: string }; held_by: { id: string; name: string }; reason: string | null; held_at: string }[] }>(`/api/v2/workspaces/${ws}/holds`);
  const act = useAction();
  const base = `/api/v2/workspaces/${ws}/sessions`;
  const [alreadyDeleted, setAlreadyDeleted] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);
  /** Every action starts afresh: the note about an already deleted history is about that delete only (W5), and a
   *  refusal shown at a row is about that press only. */
  const post = (key: string, verb: string) =>
    act.run(() => {
      setAlreadyDeleted(false);
      setRefused(null);
      return api(`${base}/${key}/${verb}`, { body: {} });
    }, d.reload);
  /** Stop or Resume. Refused because the session's sharing ended since the page loaded (its person left, or its
   *  machine signed out): the page reloads, so no ended row keeps offering them, and the refusal is shown and focused
   *  at that session's row, kept in place in the owner's list though the session has left it (W2). */
  const stopOrResume = (key: string, verb: "stop" | "resume", row: AnySession | null = null, index = 0) =>
    act.run(async () => {
      setAlreadyDeleted(false);
      setRefused(null);
      try {
        await api(`${base}/${key}/${verb}`, { body: {} });
      } catch (e) {
        if (!(e instanceof ApiError && ENDED_CODES.has(e.code))) throw e;
        setRefused({ key, text: e.message, row, index });
      }
    }, d.reload);
  /** The owner's list, with a refused session that has left it kept where it was, shown with its refusal. */
  const everyone = (() => {
    const list = d.data?.all ?? null;
    if (!list || !refused?.row || list.some((s) => s.session_key === refused.key)) return list;
    const at = Math.min(refused.index, list.length);
    return [...list.slice(0, at), refused.row, ...list.slice(at)];
  })();
  /** Delete a session's shared history. 410 history_deleted means it is already gone (deleted in another tab or window,
   *  or from the machine): the deletion is done, so the row goes and the page says so instead of an error (Z3). */
  const del = (key: string) =>
    act.run(async () => {
      setAlreadyDeleted(false);
      try {
        await api(`${base}/${key}`, { method: "DELETE" });
      } catch (e) {
        if (!(e instanceof ApiError && e.code === "history_deleted")) throw e;
        setAlreadyDeleted(true);
      }
    }, d.reload);

  return (
    <Shell me={me} ws={ws} tab="Sessions">
      <h1 className="mb-2 text-[26px] font-semibold text-zinc-900">Shared sessions</h1>
      <p className="mb-5 text-[15px] text-zinc-600">Sessions you shared from your machine with align share. Nothing else from your machine reaches this workspace.</p>
      {holds.data?.holds.map((h) => (
        <HoldBanner key={h.goal.id} hold={h} goalTitle={h.goal.title} me={me.id} />
      ))}
      {d.loading && <Loading />}
      <Err>{d.error ?? act.error}</Err>
      {alreadyDeleted && <Note>That session&apos;s shared history was already deleted, in another tab or window or from its machine, so it is no longer listed.</Note>}
      <Card title="Yours">
        {d.data?.mine.length === 0 && <Note>You have not shared a session in this workspace.</Note>}
        <ul className="divide-y divide-zinc-200">
          {d.data?.mine.map((s) => (
            <li key={s.session_key} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] text-zinc-900">{s.title || s.repo_alias || `${s.harness} session`}</span>
                <Pill>{s.harness}</Pill>
                <Pill tone={s.state === "shared" ? "green" : s.state === "suspended" ? "amber" : s.ended_reason ? "red" : "neutral"}>
                  {s.ended_reason === "device_signed_out" ? "ended: device signed out" : s.ended_reason === "member_removed" ? "ended: left the workspace" : s.state === "stopped" ? "not shared" : s.state}
                </Pill>
                <StopStatusPills s={s.stop_status} stopped={s.agent_stopped} ended={!!s.ended_reason} />
              </div>
              <p className="text-[14px] text-zinc-500">
                Started {when(s.started_at)}. Counting under: {goalText(s.current_epoch?.goal)}
                {s.governing_goal ? `. Follows: ${goalText(s.governing_goal)}` : ""}. {count(s.usage.requests, "request", undefined, num)}, {num(s.usage.input + s.usage.output)} input and output tokens.
              </p>
              {s.state === "suspended" && <Note>The alignment this session counted under was revoked. Pick a goal for it on your machine to resume uploads.</Note>}
              {s.ended_reason === "device_signed_out" && (
                <Note>
                  The machine that shared this session signed out of Align, so sharing ended and Stop or Resume can&apos;t reach it.
                  {s.agent_stopped ? " It stays stopped on that machine until you run align stop-sharing there." : ""} To share it again, run align login on that machine, then
                  ::align share in the session. To keep it from being shared again, press Stop sharing for good.
                </Note>
              )}
              {s.ended_reason === "member_removed" && (
                <Note>
                  {/* Its machine's name wraps anywhere and what can't wrap is clipped inside the note (C11-2). */}
                  <span className="block overflow-hidden [overflow-wrap:anywhere]">
                    Sharing ended when you left this workspace (or were removed from it), so Stop or Resume can&apos;t reach it.
                    {s.agent_stopped ? " It stays stopped on your machine until you run align stop-sharing there." : ""} {shareAgain(s)} To keep it from being shared again, press
                    Stop sharing for good.
                  </span>
                </Note>
              )}
              {refused?.key === s.session_key && <RowRefusal text={refused.text} />}
              <div className="mt-2 flex flex-wrap gap-2">
                {s.state !== "stopped" &&
                  (s.agent_stopped ? (
                    <Btn kind="secondary" disabled={act.busy} onClick={() => void stopOrResume(s.session_key, "resume")}>
                      Resume agent
                    </Btn>
                  ) : (
                    <Btn kind="secondary" disabled={act.busy} onClick={() => void stopOrResume(s.session_key, "stop")}>
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
                {/* An ended session can still be stopped by its person, for good: it is then never shared again, from any
                    of their machines (W8; workspaces "Stopping a session that had ended"). */}
                {s.state === "stopped" && s.ended_reason && (
                  <Btn
                    kind="secondary"
                    disabled={act.busy}
                    onClick={() => {
                      if (window.confirm("Stop sharing this session for good? It won't be shared again, even if its machine runs ::align share. What was already shared stays until you delete it.")) {
                        void post(s.session_key, "stop-sharing");
                      }
                    }}
                  >
                    Stop sharing for good
                  </Btn>
                )}
                <Btn
                  kind="danger"
                  disabled={act.busy}
                  onClick={() => {
                    if (window.confirm("Delete this session's shared history? Its usage is removed from every total, so goal and team totals will change. This can't be undone.")) {
                      void del(s.session_key);
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
      {everyone && (
        <Card title="Everyone's shared sessions (workspace owners)">
          <Note>As an owner you can stop or resume any shared session&apos;s agent. Titles and usage stay with each person.</Note>
          <ul className="divide-y divide-zinc-200">
            {everyone.map((s, i) => (
              <li key={s.session_key} data-session-row={s.session_key} className="flex flex-wrap items-center gap-2 py-2 text-[15px]">
                <span className="text-zinc-900">{s.owner.name}</span>
                <span className="text-zinc-500">{s.repo_alias ? `${s.repo_alias} (${s.harness})` : `a ${s.harness} session`}</span>
                {/* Titles stay private; the start time and the key's end tell one person's sessions apart (W3). */}
                <span className="text-[14px] text-zinc-500" data-session-detail>
                  started {when(s.started_at)} · …{s.session_key.slice(-6)}
                </span>
                {refused?.key === s.session_key ? (
                  // Its sharing ended: no Stop or Resume reaches it any more, so none is offered.
                  <RowRefusal text={refused.text} />
                ) : (
                  <>
                    <StopStatusPills s={s.stop_status} stopped={s.agent_stopped} />
                    <span className="ml-auto">
                      {s.agent_stopped ? (
                        <Btn kind="secondary" disabled={act.busy} onClick={() => void stopOrResume(s.session_key, "resume", s, i)}>
                          Resume agent
                        </Btn>
                      ) : (
                        <Btn kind="secondary" disabled={act.busy} onClick={() => void stopOrResume(s.session_key, "stop", s, i)}>
                          Stop agent
                        </Btn>
                      )}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}
