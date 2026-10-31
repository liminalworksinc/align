"use client";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Loading, Note, Pill, Shell, TextArea, useAction, useApi, when } from "../../../_ui/kit";
import { ProposalsCard } from "../../../_ui/reallocations";
import type { Me } from "../../../_ui/server";
import type { Alignment, WsDetail } from "../../../_ui/types";

const STATE_WORDS: Record<Alignment["state"], string> = {
  pending: "waiting for approval",
  countered: "approver suggested a change",
  approved: "approved",
  rejected: "declined",
  withdrawn: "withdrawn",
  revoked: "revoked",
};
const named = (g: Alignment["target_goal"]) => (!g ? "" : g.visible ? g.title : "a goal you can't see");

/** What an approval requirement is for, in words: a goal (by title when visible) or a person's sessions. */
function requirementLabel(a: Alignment, forId: string | null): string {
  if (!forId) return a.requirements.some((r) => r.for) ? "A goal you can't see" : "Approval";
  if (forId.startsWith("sessions:")) {
    const owner = a.sessions.find((s) => `sessions:${s.owner.id}` === forId)?.owner.name;
    return owner ? `${owner}'s sessions` : "Their sessions";
  }
  const goals = [a.target_goal, a.source_goal, ...a.sessions.map((s) => s.current_goal)];
  const g = goals.find((x) => x?.id === forId);
  return g?.title ? `"${g.title}"` : "A goal";
}

function Counter({ ws, a, onDone }: { ws: string; a: Alignment; onDone: () => void }) {
  const [choice, setChoice] = useState(a.choice);
  const keep = a.sessions;
  const [drop, setDrop] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const act = useAction();
  // Approvers see the requester's sessions without their keys, so a counter names the ones to keep by ref.
  return (
    <div className="mt-3 rounded-[12px] border border-zinc-300 p-3">
      <p className="mb-2 text-[15px] text-zinc-700">Suggest a change. It replaces the request and needs everyone&apos;s approval again.</p>
      <label className="mb-1 flex items-center gap-2 text-[15px]">
        <input type="radio" checked={choice === "contribution"} onChange={() => setChoice("contribution")} /> Recognize contribution only
      </label>
      <label className="mb-2 flex items-center gap-2 text-[15px]">
        <input type="radio" checked={choice === "work_toward"} onChange={() => setChoice("work_toward")} /> Work toward the goal and count future usage there
      </label>
      {keep.length > 0 && <p className="mb-1 text-[14px] text-zinc-600">Sessions to keep</p>}
      {keep.map((s) => (
        <label key={s.ref} className="mb-1 flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={!drop.includes(s.ref)} onChange={(e) => setDrop((d) => (e.target.checked ? d.filter((x) => x !== s.ref) : [...d, s.ref]))} />
          {s.label} <span className="text-zinc-500">({s.owner.name})</span>
        </label>
      ))}
      <Field label="Note (never sent to agents)">
        <TextArea rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Btn
        kind="secondary"
        disabled={act.busy}
        onClick={() => void act.run(() => api(`/api/v2/workspaces/${ws}/alignments/${a.id}/counter`, { body: { revision: a.revision, choice, keep: keep.map((s) => s.ref).filter((r) => !drop.includes(r)), note: note || null } }), onDone)}
      >
        Send counter
      </Btn>
      <Err>{act.error}</Err>
    </div>
  );
}

function AlignmentCard({ ws, a, onDone }: { ws: string; a: Alignment; onDone: () => void }) {
  const act = useAction();
  const [countering, setCountering] = useState(false);
  const doIt = (action: string, body: Record<string, unknown> = {}) => act.run(() => api(`/api/v2/workspaces/${ws}/alignments/${a.id}/${action}`, { body }), onDone);
  return (
    <div className="mb-4 rounded-[12px] border border-zinc-200 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[16px] text-zinc-900">
          {a.requester.name} asks to align with {named(a.target_goal)}
        </span>
        <Pill tone={a.state === "approved" ? "green" : a.state === "pending" || a.state === "countered" ? "amber" : "neutral"}>{STATE_WORDS[a.state]}</Pill>
        <Pill>{a.choice === "contribution" ? "contribution only" : "work toward, usage moves"}</Pill>
        <Pill>revision {a.revision}</Pill>
      </div>
      <ul className="mb-2 list-disc pl-5 text-[15px] text-zinc-700">
        {a.effects.map((e) => (
          <li key={e.kind}>{e.text}</li>
        ))}
      </ul>
      {a.sessions.length > 0 && <p className="text-[14px] text-zinc-500">Sessions: {a.sessions.map((s) => `${s.label}${s.current_goal ? `, now on ${s.current_goal.visible ? s.current_goal.title : "a goal you can't see"}` : ""}`).join("; ")}</p>}
      <p className="text-[14px] text-zinc-500">Approvals needed (one from each):</p>
      <ul className="mb-1 list-disc pl-5 text-[14px] text-zinc-500">
        {a.requirements.map((r, i) => (
          <li key={`${r.for}-${i}`}>
            {requirementLabel(a, r.for)}: {r.approvers.map((p) => p.name).join(" or ") || "nobody yet"}{" "}
            {r.approved_by ? <Pill tone="green">approved by {r.approved_by.name}</Pill> : <Pill tone="amber">waiting</Pill>}
          </li>
        ))}
      </ul>
      {a.note && <p className="mt-1 text-[14px] text-zinc-600">Note: {a.note}</p>}
      {a.history.length > 1 && (
        <details className="mt-1 text-[14px] text-zinc-500">
          <summary className="cursor-pointer">History</summary>
          {a.history.map((h) => (
            <p key={h.revision}>
              Revision {h.revision} by {h.author.name}, {h.choice === "contribution" ? "contribution only" : "work toward"}, {when(h.created_at)}
              {h.note ? `: ${h.note}` : ""}
            </p>
          ))}
        </details>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.can.approve && (
          <Btn disabled={act.busy} onClick={() => void doIt("approve", { revision: a.revision })}>
            Approve
          </Btn>
        )}
        {a.can.counter && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => setCountering((c) => !c)}>
            Suggest a change
          </Btn>
        )}
        {a.can.accept_counter && (
          <Btn disabled={act.busy} onClick={() => void doIt("accept_counter", { revision: a.revision })}>
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
      {countering && <Counter ws={ws} a={a} onDone={onDone} />}
      <Err>{act.error}</Err>
    </div>
  );
}

export default function Alignments({ me, ws }: { me: Me; ws: string }) {
  const d = useApi<{ waiting_on_me: Alignment[]; mine: Alignment[]; others: Alignment[] }>(`/api/v2/workspaces/${ws}/alignments`);
  const detail = useApi<WsDetail>(`/api/v2/workspaces/${ws}`);
  const section = (title: string, list: Alignment[] | undefined, empty: string) => (
    <Card title={title}>
      {list?.length === 0 && <Note>{empty}</Note>}
      {list?.map((a) => (
        <AlignmentCard key={`${a.id}:${a.revision}:${a.state}`} ws={ws} a={a} onDone={d.reload} />
      ))}
    </Card>
  );
  return (
    <Shell me={me} ws={ws} tab="Alignments">
      <h1 className="mb-5 text-[26px] font-semibold text-zinc-900">Alignments</h1>
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
