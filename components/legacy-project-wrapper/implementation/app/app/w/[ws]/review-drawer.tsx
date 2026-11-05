"use client";
import Link from "next/link";
import { useGoalTitles } from "../../_ui/changes";
import { Drawer, ReviewActions, ReviewBody, type ReviewChoice, type StatusKind } from "../../_ui/ds";
import { Loading, Note, useApi } from "../../_ui/kit";
import type { ChangeRequest } from "../../_ui/types";

// Concept A's review drawer (LIM-2472): a change request opens beside the Home's work, never instead of it. The body is
// the shared ReviewBody (who asked, the reason once, Compare, evidence, what it waits on); the footer is the shared
// ReviewActions, always on screen: this person's dominant action, the rest folded into "More actions" on a phone, or
// "Not yours" with who can. Every action is the real POST. Quiet links lead to the full record and the goal's work.

/** The request's state as a pill: launch is its own state, so an approved, unlaunched change never reads as launched. */
export function crStatus(cr: Pick<ChangeRequest, "state" | "launch">): { kind: StatusKind; label?: string } {
  if (cr.state === "approved") return cr.launch === "launched" ? { kind: "launched" } : { kind: "approved", label: cr.launch === "not_yet" ? "Approved, launch not yet" : "Approved, not launched" };
  if (cr.state === "pending") return { kind: "pending" };
  if (cr.state === "countered") return { kind: "countered" };
  if (cr.state === "rejected") return { kind: "declined" };
  return { kind: "draft", label: cr.state === "withdrawn" ? "Withdrawn" : "Superseded" };
}

const quiet = "inline-flex min-h-[44px] items-center text-[13px] text-(--accent-text) hover:underline";

function Loaded({ ws, cr, me, choice, onClose, done }: { ws: string; cr: ChangeRequest; me: string; choice?: ReviewChoice; onClose: () => void; done: () => void }) {
  const titles = useGoalTitles(ws);
  const base = `/app/w/${ws}`;
  const record = `${base}/record?cr=${cr.id}`;
  return (
    <Drawer
      open
      onClose={onClose}
      width="l"
      eyebrow="Review"
      title={cr.goal.title}
      footer={
        <div className="flex w-full flex-col gap-1">
          <div className="flex flex-wrap gap-x-4">
            <Link href={record} className={quiet} data-review-record>
              Open the full record
            </Link>
            <Link href={`${base}/goals/${cr.goal.id}`} className={quiet} data-review-work>
              Work and evidence for this goal
            </Link>
          </div>
          <ReviewActions ws={ws} cr={cr} me={me} onDone={done} compact initialChoice={choice} />
        </div>
      }
    >
      <div data-review={cr.id}>
        <ReviewBody ws={ws} cr={cr} me={me} titleOf={(id) => titles.get(id) ?? "a goal you can't see"} onDone={done} />
      </div>
    </Drawer>
  );
}

export function ReviewDrawer({ ws, goal, id, me, choice, onClose, onChanged }: { ws: string; goal: string; id: string; me: string; choice?: ReviewChoice; onClose: () => void; onChanged: () => void }) {
  const r = useApi<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${id}`);
  if (!r.data)
    return (
      <Drawer open onClose={onClose} width="l" eyebrow="Review" title="Change request">
        {r.error ? <Note>Align couldn&apos;t read this request just now: {r.error}</Note> : <Loading />}
      </Drawer>
    );
  return (
    <Loaded
      key={`${r.data.id}:${r.data.revision}:${r.data.state}:${r.data.launch}`}
      ws={ws}
      cr={r.data}
      me={me}
      choice={choice}
      onClose={onClose}
      done={() => {
        r.reload();
        onChanged();
      }}
    />
  );
}
