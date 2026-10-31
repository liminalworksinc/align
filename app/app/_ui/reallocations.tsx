"use client";
import { useState } from "react";
import { api, Btn, Card, Err, Field, Input, Loading, Note, Pill, TextArea, useAction, useApi, when } from "./kit";
import type { Me } from "./server";
import type { Goal, Reallocation, WsDetail } from "./types";

// Target changes on the Alignments page: proposals to change the target share of agent time for one or more goals.
// Every owner of a goal whose target changes approves it (lib/v2/reallocations.ts), with the same approve, counter,
// accept and decline steps as alignments.

const pctOr = (v: number | null) => (v === null ? "no target" : `${v}%`);

function Targets({ r }: { r: Reallocation }) {
  return (
    <ul className="text-[15px]">
      {r.targets.map((t, i) => (
        <li key={i}>
          {t.goal ? t.goal.title : "A goal you can't see"}: {t.goal ? `${pctOr(t.from_share)} → ${pctOr(t.target_share)}` : "changes"}
          {t.goal && r.state !== "approved" && t.current_share !== t.from_share && <span className="text-amber-700"> (now {pctOr(t.current_share)})</span>}
          {t.owner && <span className="text-zinc-500"> (owner: {t.owner.name})</span>}
        </li>
      ))}
    </ul>
  );
}

function ProposalItem({ ws, r, me, onDone }: { ws: string; r: Reallocation; me: Me; onDone: () => void }) {
  const act = useAction();
  const [countering, setCountering] = useState(false);
  const [values, setValues] = useState<string[]>(r.targets.map((t) => (t.target_share === null ? "" : String(t.target_share))));
  const [note, setNote] = useState("");
  const base = `/api/v2/workspaces/${ws}/reallocations/${r.id}`;
  const visible = r.targets.every((t) => t.goal);
  return (
    <li className="py-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[15px] text-zinc-900">{r.requester.id === me.id ? "You" : r.requester.name} proposed new targets</span>
        <Pill tone={r.state === "approved" ? "green" : r.state === "rejected" || r.state === "withdrawn" ? "neutral" : "amber"}>{r.state}</Pill>
        <span className="text-[13px] text-zinc-500">revision {r.revision} · {when(r.updated_at)}</span>
      </div>
      <Targets r={r} />
      {r.note && <p className="text-[14px] text-zinc-600">“{r.note}”</p>}
      <p className="text-[14px] text-zinc-500">Approvers: {r.approvers.map((a) => `${a.id === me.id ? "you" : a.name}${a.approved ? " (approved)" : ""}`).join(", ")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.can.approve && (
          <Btn disabled={act.busy} onClick={() => void act.run(() => api(`${base}/approve`, { body: { revision: r.revision } }), onDone)}>
            Approve
          </Btn>
        )}
        {r.can.accept_counter && (
          <Btn disabled={act.busy} onClick={() => void act.run(() => api(`${base}/accept_counter`, { body: { revision: r.revision } }), onDone)}>
            Accept the counter
          </Btn>
        )}
        {r.can.counter && visible && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => setCountering((c) => !c)}>
            Counter
          </Btn>
        )}
        {r.can.reject && (
          <Btn kind="danger" disabled={act.busy} onClick={() => void act.run(() => api(`${base}/reject`, { body: {} }), onDone)}>
            Decline
          </Btn>
        )}
        {r.can.withdraw && (
          <Btn kind="secondary" disabled={act.busy} onClick={() => void act.run(() => api(`${base}/withdraw`, { body: {} }), onDone)}>
            Withdraw
          </Btn>
        )}
      </div>
      {countering && (
        <form
          className="mt-3 rounded-[10px] border border-zinc-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(
              () =>
                api(`${base}/counter`, {
                  body: { revision: r.revision, targets: r.targets.map((t, i) => ({ goal_id: t.goal!.id, target_share: values[i].trim() === "" ? null : Number(values[i]) })), note: note || null },
                }),
              () => {
                setCountering(false);
                onDone();
              },
            );
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
  const list = useApi<{ waiting_on_me: Reallocation[]; others: Reallocation[] }>(`/api/v2/workspaces/${ws}/reallocations`);
  const feed = useApi<{ goals: Goal[] }>(`/api/v2/workspaces/${ws}/goals`);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const act = useAction();
  const active = feed.data?.goals.filter((g) => g.status === "active") ?? [];
  const changes = active.filter((g) => (values[g.id] ?? "").trim() !== "" && Number(values[g.id]) !== (g.target_share ?? -1));
  const canPropose = detail && detail.role !== "viewer";
  const all = [...(list.data?.waiting_on_me ?? []), ...(list.data?.others ?? [])];
  return (
    <Card title="Target changes">
      <Note>A proposal changes the target share of one or more goals. Every owner of a goal whose target changes approves it; sessions bound to those goals hear the new target at their next turn.</Note>
      {list.loading && <Loading />}
      <Err>{list.error}</Err>
      {all.length === 0 && !list.loading && <p className="text-[15px] text-zinc-500">No proposals yet.</p>}
      <ul className="divide-y divide-zinc-200">
        {all.map((r) => (
          <ProposalItem key={r.id + r.revision + r.state} ws={ws} r={r} me={me} onDone={list.reload} />
        ))}
      </ul>
      {canPropose && active.length > 0 && (
        <form
          className="mt-4 border-t border-zinc-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(
              () => api(`/api/v2/workspaces/${ws}/reallocations`, { body: { targets: changes.map((g) => ({ goal_id: g.id, target_share: Number(values[g.id]) })), note: note || null } }),
              () => {
                setValues({});
                setNote("");
                list.reload();
                feed.reload();
              },
            );
          }}
        >
          <p className="mb-2 text-[15px] font-medium text-zinc-900">Propose new targets</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {active.map((g) => (
              <Field key={g.id} label={`${g.title} (now ${g.target_share === null ? "no target" : `${g.target_share}%`})`}>
                <Input type="number" min={0} max={100} step={1} placeholder="unchanged" value={values[g.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [g.id]: e.target.value }))} />
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
  );
}
