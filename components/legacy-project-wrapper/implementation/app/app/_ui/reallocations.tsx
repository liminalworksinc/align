"use client";
import { useState } from "react";
import { api, ApiError, Btn, Card, Err, Field, Input, Loading, Note, Pill, TextArea, useAction, useApi, when } from "./kit";
import { NoticeBox, useNotice, type Notice } from "./crparts";
import type { Me } from "./server";
import type { Goal, Reallocation, WsDetail } from "./types";

// Target changes on the Alignments page (lib/v2/reallocations.ts): proposals to change the target share of agent time
// of one or more goals at once. Each goal's approval set approves its part; once every goal is approved, someone who
// may launch for all of them launches it (or "not yet"), and only then do the goals get new versions and their agents
// hear the new targets.

const pctOr = (v: number | null) => (v === null ? "no target" : `${v}%`);
const names = (l: { name: string }[]) => l.map((p) => p.name).join(", ");

const STATE_WORDS: Record<Reallocation["state"], string> = {
  pending: "waiting for approval",
  countered: "approver suggested other targets",
  approved: "approved",
  rejected: "declined",
  withdrawn: "withdrawn",
  superseded: "superseded",
};

function launchLine(r: Reallocation) {
  if (r.state === "superseded") return "Superseded: one of its goals got a newer version first. It never reached agents; propose again if it still applies.";
  if (r.state !== "approved") return null;
  if (r.launch === "launched") return `Launched by ${r.launch_decided_by?.name ?? "someone"}, ${when(r.launch_decided_at)}. Agents on these goals hear the new targets at their next turn.`;
  if (r.launch === "not_yet") return `Approved, not launched yet: ${r.launch_decided_by?.name ?? "someone"} decided not yet. Agents still have the old targets.`;
  return "Approved, waiting for launch. Agents still have the old targets.";
}

/** What a decision recorded, for its "Recorded: …" line (W2, as change requests confirm every decision). `after` is
 *  the proposal as the server answered. */
function recordedLine(action: string, r: Reallocation, after: Reallocation | null): string {
  const allApproved = after?.state === "approved";
  switch (action) {
    case "approve":
      return allApproved
        ? `Recorded: you approved revision ${r.revision}. Every goal in it is approved; agents keep the old targets until someone launches it.`
        : `Recorded: you approved revision ${r.revision} for the goals you decide on. Other goals in it still need an approval.`;
    case "approve_and_launch":
      return `Recorded: you approved revision ${r.revision} and launched it. Agents on these goals hear the new targets at their next turn.`;
    case "launch":
      return "Recorded: you launched the new targets. Agents on these goals hear them at their next turn.";
    case "not_yet":
      return "Recorded: you decided not yet. Agents keep the old targets until someone launches them.";
    case "counter":
      return `Recorded: you suggested other targets to ${r.requester.name}. They accept them, then they can be approved.`;
    case "accept_counter":
      return allApproved ? "Recorded: you accepted the suggested targets. Every goal in it is approved; agents keep the old targets until someone launches it." : "Recorded: you accepted the suggested targets. They wait for approval again.";
    case "reject":
      return "Recorded: you declined these targets. The goals keep their targets.";
    case "withdraw":
      return "Recorded: you withdrew your proposal. The goals keep their targets.";
    default:
      return "Recorded.";
  }
}

function ProposalItem({ ws, r, me, onDone }: { ws: string; r: Reallocation; me: Me; onDone: () => void }) {
  const act = useAction();
  const [countering, setCountering] = useState(false);
  const [values, setValues] = useState<string[]>(r.targets.map((t) => (t.target_share === null ? "" : String(t.target_share))));
  const [note, setNote] = useState("");
  // The item is keyed by its revision, state and launch, so a decision remounts it: the notice outlives that.
  const [notice, setNotice] = useNotice(`reallocation:${r.id}`);
  const base = `/api/v2/workspaces/${ws}/reallocations/${r.id}`;
  const visible = r.targets.every((t) => t.goal);
  /** Send a decision: "Recorded: …" when it is, "Not recorded. <why>" when the server refuses it (a 409 reloads, to show
   *  the proposal as it is now). */
  const decide = (action: string, body: Record<string, unknown> = {}, after?: () => void) =>
    void act.run(async () => {
      setNotice(null);
      try {
        const out = await api<Reallocation>(`${base}/${action}`, { body });
        setNotice({ kind: "done", text: recordedLine(action, r, out ?? null) });
        after?.();
        onDone();
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const conflict = e.status === 409;
        setNotice({ kind: "refused", text: `Not recorded. ${e.message}${conflict ? "" : " Nothing changed."}` });
        if (conflict) onDone();
      }
    });
  const doIt = decide;
  const line = launchLine(r);
  const reason = r.history.find((h) => h.revision === 1)?.note ?? null;
  const counterNote = [...r.history].reverse().find((h) => h.revision > 1 && h.author.id !== r.requester.id && h.note) ?? null;
  return (
    <li className="py-3" data-reallocation={r.id}>
      {notice && <NoticeBox notice={notice} />}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-zinc-900">{r.requester.id === me.id ? "You" : r.requester.name} proposed new targets</span>
        <Pill tone={r.state === "approved" ? "green" : r.state === "pending" || r.state === "countered" ? "amber" : "neutral"}>{STATE_WORDS[r.state]}</Pill>
        {r.launch === "launched" && <Pill tone="violet">launched</Pill>}
        <span className="text-[13px] text-zinc-500">
          revision {r.revision} · {when(r.updated_at)}
        </span>
      </div>
      <ul className="text-[15px]">
        {r.targets.map((t, i) => (
          <li key={i} className="break-words">
            {t.goal ? t.goal.title : "A goal you can't see"}: {t.goal ? `${pctOr(t.from_share)} → ${pctOr(t.target_share)}` : "changes"}
            {t.goal && (t.approved ? <span className="text-zinc-500"> (approved by {t.approved_by?.name ?? "someone"})</span> : <span className="text-zinc-500"> (needs one of: {names(t.approvers) || "nobody yet"})</span>)}
          </li>
        ))}
      </ul>
      {/* The requester's reason (their first revision's note) stays on the card whatever a counter says or leaves out, as a
          change request keeps "<requester>'s reason, as written" next to a counter's note (X3). */}
      {reason && (
        <p className="text-[14px] text-zinc-600" data-reallocation-reason>
          {r.requester.id === me.id ? "Your" : `${r.requester.name}'s`} reason: “{reason}”
        </p>
      )}
      {counterNote && (
        <p className="text-[14px] text-zinc-600" data-reallocation-counter-note>
          {counterNote.author.id === me.id ? "Your" : `${counterNote.author.name}'s`} note on revision {counterNote.revision}: “{counterNote.note}”
        </p>
      )}
      {r.rejection_reason && <p className="text-[14px] text-zinc-600">Declined by {r.rejected_by?.name}: “{r.rejection_reason}”</p>}
      {line && <p className="text-[14px] text-zinc-600">{line}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {r.can.approve && (
          <Btn disabled={act.busy} onClick={() => doIt("approve", { revision: r.revision })}>
            Approve (agents switch at launch)
          </Btn>
        )}
        {r.can.approve_and_launch && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => doIt("approve_and_launch", { revision: r.revision })}>
            Approve and launch
          </Btn>
        )}
        {r.can.launch && (
          <Btn disabled={act.busy} onClick={() => doIt("launch")}>
            Launch
          </Btn>
        )}
        {r.can.not_yet && r.launch !== "not_yet" && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => doIt("not_yet")}>
            Not yet
          </Btn>
        )}
        {r.can.accept_counter && (
          <Btn disabled={act.busy} onClick={() => doIt("accept_counter", { revision: r.revision })}>
            Accept the counter
          </Btn>
        )}
        {r.can.counter && visible && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => setCountering((c) => !c)}>
            Counter
          </Btn>
        )}
        {r.can.reject && (
          <Btn kind="danger" disabled={act.busy} onClick={() => doIt("reject")}>
            Decline
          </Btn>
        )}
        {r.can.withdraw && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => doIt("withdraw")}>
            Withdraw
          </Btn>
        )}
      </div>
      {countering && (
        <form
          className="mt-3 rounded-[10px] border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            decide("counter", { revision: r.revision, targets: r.targets.map((t, i) => ({ goal_id: t.goal!.id, target_share: values[i].trim() === "" ? null : Number(values[i]) })), note: note || null }, () => setCountering(false));
          }}
        >
          {r.targets.map((t, i) => (
            <Field key={t.goal!.id} label={`${t.goal!.title}: target %`}>
              <Input type="number" min={0} max={100} step={1} value={values[i]} onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
            </Field>
          ))}
          <Field label="Note (optional)">
            <TextArea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Btn type="submit" disabled={act.busy}>
            Send counter
          </Btn>
        </form>
      )}
      <Err>{act.error}</Err>
    </li>
  );
}

export function ProposalsCard({ ws, me, detail }: { ws: string; me: Me; detail: WsDetail | null }) {
  const list = useApi<{ waiting_on_me: Reallocation[]; mine: Reallocation[]; others: Reallocation[] }>(`/api/v2/workspaces/${ws}/reallocations`);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [proposed, setProposed] = useState<Notice | null>(null);
  const act = useAction();
  const active = feed.data?.goals.filter((g) => g.status === "active") ?? [];
  const changes = active.filter((g) => (values[g.id] ?? "").trim() !== "" && Number(values[g.id]) !== (g.target_share ?? -1));
  const canPropose = detail && detail.role !== "viewer";
  const all = [...(list.data?.waiting_on_me ?? []), ...(list.data?.mine ?? []), ...(list.data?.others ?? [])];
  const reload = () => {
    list.reload();
    feed.reload();
  };
  return (
    <section id="target-changes">
      <Card title="Target changes">
        <Note>
          A proposal changes the target share of agent time of one or more goals. Someone who can approve for each goal approves its part; then someone who can launch for every goal launches it, and
          only then do agents on those goals hear the new targets.
        </Note>
        {list.loading && <Loading />}
        <Err>{list.error}</Err>
        {all.length === 0 && !list.loading && <p className="text-[15px] text-zinc-500">No proposals yet.</p>}
        <ul className="divide-y divide-zinc-200">
          {all.map((r) => (
            <ProposalItem key={`${r.id}:${r.revision}:${r.state}:${r.launch}`} ws={ws} r={r} me={me} onDone={reload} />
          ))}
        </ul>
        {canPropose && active.length > 0 && (
          <form
            className="mt-4 border-t border-zinc-200 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              const n = changes.length;
              setProposed(null);
              void act.run(
                () => api(`/api/v2/workspaces/${ws}/reallocations`, { body: { targets: changes.map((g) => ({ goal_id: g.id, target_share: Number(values[g.id]) })), note: note || null } }),
                () => {
                  setProposed({ kind: "done", text: `Recorded: you proposed new targets for ${n === 1 ? "1 goal" : `${n} goals`}. Someone who can approve for each goal decides on its part.` });
                  setValues({});
                  setNote("");
                  reload();
                },
              );
            }}
          >
            <p className="mb-2 text-[15px] font-medium text-zinc-900">Propose new targets</p>
            {proposed && <NoticeBox notice={proposed} />}
            <div className="grid gap-2 sm:grid-cols-2">
              {active.map((g) => (
                <Field key={g.id} label={`${g.title} (now ${g.target_share === null || g.target_share === undefined ? "no target" : `${g.target_share}%`})`}>
                  <Input type="number" min={0} max={100} step={1} placeholder="unchanged" aria-label={`New target for ${g.title}`} value={values[g.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [g.id]: e.target.value }))} />
                </Field>
              ))}
            </div>
            <Field label="Why (optional)">
              <TextArea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Btn type="submit" disabled={act.busy || changes.length === 0}>
              Propose {changes.length || ""} {changes.length === 1 ? "change" : "changes"}
            </Btn>
            <Err>{act.error}</Err>
          </form>
        )}
      </Card>
    </section>
  );
}
