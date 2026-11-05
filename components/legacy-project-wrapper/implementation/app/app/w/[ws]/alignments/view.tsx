"use client";
import { useState } from "react";
import { api, ApiError, Btn, Err, Field, Loading, Pill, sentence, Shell, TextArea, useAction, useApi, when } from "../../../_ui/kit";
import { Panel, StatusPill, type StatusKind } from "../../../_ui/ds";
import { NoticeBox, useNotice } from "../../../_ui/crparts";
import { ProposalsCard } from "../../../_ui/reallocations";
import type { Me } from "../../../_ui/server";
import type { Alignment, WsDetail } from "../../../_ui/types";

// LIM-2472 (stream R): the state as a word and a shape (ds StatusPill), in the product's own words. Withdrawn and revoked
// have no status shape of their own and stay neutral.
const STATE_KIND: Partial<Record<Alignment["state"], StatusKind>> = { pending: "pending", countered: "countered", approved: "approved", rejected: "declined" };

const STATE_WORDS: Record<Alignment["state"], string> = {
  pending: "waiting for approval",
  countered: "approver suggested a change",
  approved: "approved",
  rejected: "declined",
  withdrawn: "withdrawn",
  revoked: "revoked",
};
/** " · started <time> · …<key end>": two sessions of one person in one repository differ, as on the Sessions tab (X4). */
const sessionId = (s: Alignment["sessions"][number]) => (s.started_at ? ` · started ${when(s.started_at)} · …${s.key_end}` : "");
const named = (g: Alignment["target_goal"]) => (!g ? "" : g.visible ? g.title : "a goal you can't see");

/** A person as the reader hears them: "you" for themself (c9 W3), never their own name. */
const said = (p: { id: string; name: string }, me: string) => (p.id === me ? "you" : p.name);

/** What an approval requirement is for, in words: a goal (by title when visible) or a person's sessions. */
function requirementLabel(a: Alignment, forId: string | null, me: string): string {
  if (!forId) return a.requirements.some((r) => r.for) ? "A goal you can't see" : "Approval";
  if (forId.startsWith("sessions:")) {
    const owner = a.sessions.find((s) => `sessions:${s.owner.id}` === forId)?.owner;
    return owner ? (owner.id === me ? "Your sessions" : `${owner.name}'s sessions`) : "Their sessions";
  }
  const goals = [a.target_goal, a.source_goal, ...a.sessions.map((s) => s.current_goal)];
  const g = goals.find((x) => x?.id === forId);
  return g?.title ? `"${g.title}"` : "A goal";
}

/** A declined, withdrawn or revoked request shows its decision in place of the approvals it no longer waits for
 *  (A1-cross-8): "Declined by <name>, <time>. Nothing changes.", "you" for the reader. Null for an open or approved one. */
function closedLine(a: Alignment, me: string): string | null {
  const by = a.closed_by ? ` by ${said(a.closed_by, me)}` : "";
  const at = a.closed_at ? `, ${when(a.closed_at)}` : "";
  switch (a.state) {
    case "rejected":
      return `Declined${by}${at}. Nothing changes.`;
    case "withdrawn":
      return `Withdrawn${by}${at}. Nothing changes.`;
    case "revoked":
      return `Revoked${by}${at}. It has no effect from then on; past usage did not move.`;
    default:
      return null;
  }
}

/** What a decision recorded, for its "Recorded: …" line, as change requests and target changes confirm every decision
 *  (X2). `after` is the alignment as the server answered. */
function recordedLine(action: string, a: Alignment, after: Alignment | null): string {
  switch (action) {
    case "approve":
      return after?.state === "approved"
        ? `Recorded: you approved revision ${a.revision}. Every approval it needs is in, so it takes effect now.`
        : `Recorded: you approved revision ${a.revision}. It still needs another approval before it takes effect.`;
    case "counter":
      return `Recorded: you suggested a change to ${a.requester.name}. They accept it, then it needs approval again.`;
    case "accept_counter":
      return after?.state === "approved" ? "Recorded: you accepted the suggested change. Every approval it needs is in, so it takes effect now." : "Recorded: you accepted the suggested change. It waits for approval again.";
    case "reject":
      return "Recorded: you declined this request. Nothing changes.";
    case "withdraw":
      return "Recorded: you withdrew your request. Nothing changes.";
    case "revoke":
      return "Recorded: you revoked this alignment. It has no effect from now on; past usage does not move.";
    default:
      return "Recorded.";
  }
}

function Counter({ a, busy, onSend }: { a: Alignment; busy: boolean; onSend: (body: Record<string, unknown>) => void }) {
  const [choice, setChoice] = useState(a.choice);
  const keep = a.sessions;
  const [drop, setDrop] = useState<number[]>([]);
  const [note, setNote] = useState("");
  // Approvers see the requester's sessions without their keys, so a counter names the ones to keep by ref.
  return (
    <div className="mt-3 rounded-(--radius-s) border border-(--edge) bg-(--bg-panel) p-3">
      <p className="mb-2 text-[15px] text-(--text-2)">Suggest a change. It replaces the request and needs everyone&apos;s approval again.</p>
      <label className="mb-1 flex min-h-[44px] items-center gap-2 text-[15px] text-(--text-1)">
        <input type="radio" className="size-4 shrink-0 accent-(--accent-text)" checked={choice === "contribution"} onChange={() => setChoice("contribution")} /> Recognize contribution only
      </label>
      <label className="mb-2 flex min-h-[44px] items-center gap-2 text-[15px] text-(--text-1)">
        <input type="radio" className="size-4 shrink-0 accent-(--accent-text)" checked={choice === "work_toward"} onChange={() => setChoice("work_toward")} /> Work toward the goal and count future usage there
      </label>
      {keep.length > 0 && <p className="mb-1 text-[14px] text-(--text-2)">Sessions to keep</p>}
      {keep.map((s) => (
        <label key={s.ref} className="mb-1 flex min-h-[44px] items-center gap-2 text-[15px] text-(--text-1)">
          <input type="checkbox" className="size-4 shrink-0 accent-(--accent-text)" checked={!drop.includes(s.ref)} onChange={(e) => setDrop((d) => (e.target.checked ? d.filter((x) => x !== s.ref) : [...d, s.ref]))} />
          <span className="min-w-0">
            {s.label} <span className="text-(--text-3)">({s.owner.name}{sessionId(s)})</span>
          </span>
        </label>
      ))}
      <Field label="Note (never sent to agents)">
        <TextArea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Btn kind="secondary" disabled={busy} onClick={() => onSend({ choice, keep: keep.map((s) => s.ref).filter((r) => !drop.includes(r)), note: note || null })}>
        Send counter
      </Btn>
    </div>
  );
}

function AlignmentCard({ ws, a, me, onDone }: { ws: string; a: Alignment; me: string; onDone: () => void }) {
  const act = useAction();
  const [countering, setCountering] = useState(false);
  // The card is keyed by its revision and state, and moves between sections, so a decision remounts it: the notice
  // outlives that.
  const [notice, setNotice] = useNotice(`alignment:${a.id}`);
  const closed = closedLine(a, me);
  /** Send a decision on the revision on screen: "Recorded: …" when it is, "Not recorded. <why>" when the server refuses
   *  it (a 409 reloads, to show the request as it is now). Every decision names the revision, so one taken on an older
   *  view is refused instead of recorded against a counter the person never saw (c10 C10-2). */
  const doIt = (action: string, body: Record<string, unknown> = {}) =>
    act.run(async () => {
      setNotice(null);
      try {
        const out = await api<Alignment>(`/api/v2/workspaces/${ws}/alignments/${a.id}/${action}`, { body: { ...body, revision: a.revision } });
        setNotice({ kind: "done", text: recordedLine(action, a, out ?? null) });
        setCountering(false);
        onDone();
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const conflict = e.status === 409;
        setNotice({ kind: "refused", text: `Not recorded. ${sentence(e.message)}${conflict ? "" : " Nothing changed."}` });
        if (conflict) onDone();
      }
    });
  return (
    <div className="mb-3 rounded-(--radius-m) border border-(--line) bg-(--bg-raised) p-4 last:mb-0" data-alignment={a.id}>
      {notice && <NoticeBox notice={notice} />}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-[15px] font-semibold text-(--text-1)">
          {a.requester.id === me ? "You ask" : `${a.requester.name} asks`} to align with {named(a.target_goal)}
        </span>
        {STATE_KIND[a.state] ? <StatusPill kind={STATE_KIND[a.state]!} label={STATE_WORDS[a.state]} size="s" /> : <Pill>{STATE_WORDS[a.state]}</Pill>}
        <Pill>{a.choice === "contribution" ? "contribution only" : "work toward, usage moves"}</Pill>
        <Pill>revision {a.revision}</Pill>
      </div>
      <ul className="mb-2 list-disc pl-5 text-[15px] text-(--text-2)">
        {a.effects.map((e) => (
          <li key={e.kind}>{e.text}</li>
        ))}
      </ul>
      {a.sessions.length > 0 && (
        <p className="text-[14px] text-(--text-2)" data-alignment-sessions>
          Sessions: {a.sessions.map((s) => `${s.label}${sessionId(s)}${s.current_goal ? `, now on ${s.current_goal.visible ? s.current_goal.title : "a goal you can't see"}` : ""}`).join("; ")}
        </p>
      )}
      {closed ? (
        <p className="text-[14px] text-(--text-2)" data-alignment-decision>
          {closed}
        </p>
      ) : (
        <>
          <p className="text-[14px] text-(--text-2)">Approvals needed (one from each):</p>
          <ul className="mb-1 flex list-disc flex-col gap-1 pl-5 text-[14px] text-(--text-2)">
            {a.requirements.map((r, i) => (
              <li key={`${r.for}-${i}`}>
                {requirementLabel(a, r.for, me)}: {r.approvers.map((p) => said(p, me)).join(" or ") || "nobody yet"}{" "}
                {r.approved_by ? <StatusPill kind="approved" label={`approved by ${said(r.approved_by, me)}`} size="s" /> : <StatusPill kind="pending" label="waiting" size="s" />}
              </li>
            ))}
          </ul>
        </>
      )}
      {a.note && <p className="mt-1 text-[14px] text-(--text-2)">Note: {a.note}</p>}
      {a.history.length > 1 && (
        <details className="mt-1 text-[14px] text-(--text-2)">
          <summary className="cursor-pointer py-1 font-medium text-(--text-1) max-sm:flex max-sm:min-h-[44px] max-sm:items-center">History</summary>
          {a.history.map((h) => (
            <p key={h.revision}>
              Revision {h.revision} by {said(h.author, me)}, {h.choice === "contribution" ? "contribution only" : "work toward"}, {when(h.created_at)}
              {h.note ? `: ${h.note}` : ""}
            </p>
          ))}
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.can.approve && (
          <Btn disabled={act.busy} onClick={() => void doIt("approve")}>
            Approve
          </Btn>
        )}
        {a.can.counter && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => setCountering((c) => !c)}>
            Suggest a change
          </Btn>
        )}
        {a.can.accept_counter && (
          <Btn disabled={act.busy} onClick={() => void doIt("accept_counter")}>
            Accept the change
          </Btn>
        )}
        {a.can.reject && (
          <Btn kind="danger" disabled={act.busy} onClick={() => void doIt("reject")}>
            Decline
          </Btn>
        )}
        {a.can.withdraw && (
          <Btn kind="danger" disabled={act.busy} onClick={() => void doIt("withdraw")}>
            Withdraw
          </Btn>
        )}
        {a.can.revoke && (
          <Btn
            kind="danger"
            disabled={act.busy}
            onClick={() => {
              if (window.confirm("Revoke this alignment? From now on it has no effect. Sessions that counted under the goal only because of it stop uploading until their owner picks a goal. Past usage does not move.")) void doIt("revoke");
            }}
          >
            Revoke
          </Btn>
        )}
      </div>
      {countering && <Counter a={a} busy={act.busy} onSend={(body) => void doIt("counter", body)} />}
      <Err>{act.error}</Err>
    </div>
  );
}

export default function Alignments({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ waiting_on_me: Alignment[]; mine: Alignment[]; others: Alignment[] }>(`/api/v2/workspaces/${ws}/alignments`);
  const detail = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const section = (title: string, list: Alignment[] | undefined, empty: string) => (
    <Panel className="mb-4" title={title}>
      {list?.length === 0 && <p className="text-[15px] text-(--text-2)">{empty}</p>}
      {list?.map((a) => (
        <AlignmentCard key={`${a.id}:${a.revision}:${a.state}`} ws={ws} a={a} me={me.id} onDone={d.reload} />
      ))}
    </Panel>
  );
  return (
    <Shell me={me} ws={ws} tab="Alignments">
      <h1 className="mb-5 font-display text-[32px] leading-[1.1] text-(--text-1) max-sm:text-[28px]">Alignments</h1>
      {d.loading && <Loading />}
      <Err>{d.error}</Err>
      {d.data && (
        <>
          {section("Waiting on you", d.data.waiting_on_me, "Nothing is waiting on you.")}
          {section("Your requests", d.data.mine, "You have not asked to align with anyone's goal. Open a goal to ask.")}
          {section("Others you are part of", d.data.others, "None.")}
          <ProposalsCard ws={ws} me={me} detail={detail.data} />
        </>
      )}
    </Shell>
  );
}
