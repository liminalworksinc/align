"use client";
import Link from "next/link";
import { useCompactReview } from "../../_ui/a/compact-review";
import { useGoalTitles } from "../../_ui/changes";
import { Drawer, StatusPill, type StatusKind } from "../../_ui/ds";
import { Loading, Note, useApi, when } from "../../_ui/kit";
import type { ChangeRequest } from "../../_ui/types";

// Concept A's review drawer (LIM-2472): a change request opens beside the Home's work, never instead of it. The body is
// the decision at a glance (who asked, when, why, once), then the change and what Align holds about it; the footer is
// the decision bar, always on screen: this person's dominant action first, the others beside it, or "Not yours" with
// who can. Every action is the real POST (_ui/a/compact-review.tsx). Quiet links lead to the full record and the
// goal's work and evidence.

/** The request's state as a pill: launch is its own state, so an approved, unlaunched change never reads as launched. */
export function crStatus(cr: Pick<ChangeRequest, "state" | "launch">): { kind: StatusKind; label?: string } {
  if (cr.state === "approved") return cr.launch === "launched" ? { kind: "launched" } : { kind: "approved", label: cr.launch === "not_yet" ? "Approved, launch not yet" : "Approved, not launched" };
  if (cr.state === "pending") return { kind: "pending" };
  if (cr.state === "countered") return { kind: "countered" };
  if (cr.state === "rejected") return { kind: "declined" };
  return { kind: "draft", label: cr.state === "withdrawn" ? "Withdrawn" : "Superseded" };
}

const quiet = "inline-flex min-h-[44px] items-center text-[13px] text-(--accent-text) hover:underline";

function Loaded({ ws, cr, me, onClose, done }: { ws: string; cr: ChangeRequest; me: string; onClose: () => void; done: () => void }) {
  const titles = useGoalTitles(ws);
  const base = `/app/w/${ws}`;
  const record = `${base}/record?cr=${cr.id}`;
  const { body, footer } = useCompactReview({ ws, cr, me, titles, recordHref: record, onDone: done });
  const st = crStatus(cr);
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
          {footer}
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-review={cr.id}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill kind={st.kind} label={st.label} />
            <span className="font-mono text-[12px] text-(--text-3)">
              revision {cr.revision} · v{cr.goal.version} approved now{cr.version ? ` · became v${cr.version}` : ""}
            </span>
          </div>
          <p className="text-[15px] text-(--text-1)">
            {cr.requester.id === me ? "You asked" : `${cr.requester.name} asked`} {when(cr.created_at)}
          </p>
          {cr.reason && <p className="text-[14px] text-(--text-2)">&ldquo;{cr.reason}&rdquo;</p>}
        </div>
        {body}
      </div>
    </Drawer>
  );
}

export function ReviewDrawer({ ws, goal, id, me, onClose, onChanged }: { ws: string; goal: string; id: string; me: string; onClose: () => void; onChanged: () => void }) {
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
      onClose={onClose}
      done={() => {
        r.reload();
        onChanged();
      }}
    />
  );
}
