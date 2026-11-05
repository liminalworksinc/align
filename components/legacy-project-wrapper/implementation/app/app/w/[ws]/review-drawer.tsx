"use client";
import Link from "next/link";
import { ChangeRequestCard, useGoalTitles } from "../../_ui/changes";
import { decisionsFor } from "../../_ui/decide";
import { Drawer, EvidenceLabel, StatusPill, type StatusKind } from "../../_ui/ds";
import { Loading, Note, useApi, when } from "../../_ui/kit";
import type { ChangeRequest } from "../../_ui/types";

// Concept A's review drawer (LIM-2472): a change request opens beside the Home's work, never instead of it. The top is
// the decision at a glance, all from the request itself: who asked, which goal, the version in force and the one
// proposed, where it stands and who may act. Below it is the same decision card the goal page uses (decide.tsx /
// changes.tsx), so every action is the real POST with the server's own refusals (403, 404, 409 stale or changed).
// When the reader may not act, the drawer says so and names who can; it never shows a control that would fail.

/** The request's state as a pill: launch is its own state, so an approved, unlaunched change never reads as launched. */
export function crStatus(cr: Pick<ChangeRequest, "state" | "launch">): { kind: StatusKind; label?: string } {
  if (cr.state === "approved") return cr.launch === "launched" ? { kind: "launched" } : { kind: "approved", label: cr.launch === "not_yet" ? "Approved, launch not yet" : "Approved, not launched" };
  if (cr.state === "pending") return { kind: "pending" };
  if (cr.state === "countered") return { kind: "countered" };
  if (cr.state === "rejected") return { kind: "declined" };
  return { kind: "draft", label: cr.state === "withdrawn" ? "Withdrawn" : "Superseded" };
}

const people = (ps: { id: string; name: string }[], me: string) => ps.map((p) => (p.id === me ? "you" : p.name)).join(" or ") || "nobody yet";

function Who({ cr, me }: { cr: ChangeRequest; me: string }) {
  const open = cr.state === "pending" || cr.state === "countered";
  const mineToDecide = decisionsFor(cr).length > 0;
  const unlaunched = cr.state === "approved" && (cr.launch === "pending" || cr.launch === "not_yet");
  if (open && !mineToDecide)
    return (
      <p className="text-[14px] text-(--text-2)" data-review-not-yours>
        <b className="font-semibold text-(--text-1)">Not yours to decide.</b>{" "}
        {cr.state === "countered" ? `Waiting on ${cr.requester.id === me ? "you" : cr.requester.name} to accept the suggested change.` : `${people(cr.approvers, me)} can approve it.`}
      </p>
    );
  if (unlaunched && !cr.can.launch)
    return (
      <p className="text-[14px] text-(--text-2)" data-review-not-yours>
        <b className="font-semibold text-(--text-1)">Not yours to launch.</b> {people(cr.launchers, me)} can launch it. Until then Align has released v{cr.goal.version} only.
      </p>
    );
  return null;
}

export function ReviewDrawer({ ws, goal, id, me, onClose, onChanged }: { ws: string; goal: string; id: string; me: string; onClose: () => void; onChanged: () => void }) {
  const r = useApi<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${goal}/change-requests/${id}`);
  const titles = useGoalTitles(ws);
  const cr = r.data;
  const st = cr ? crStatus(cr) : null;
  const base = `/app/w/${ws}`;
  return (
    <Drawer
      open
      onClose={onClose}
      width="l"
      eyebrow="Review"
      title={cr ? cr.goal.title : "Change request"}
      footer={
        <>
          <Link
            href={`${base}/record?cr=${id}`}
            className="inline-flex min-h-[44px] items-center rounded-(--radius-s) px-3 text-[14px] text-(--accent-text) hover:underline"
            data-review-record
          >
            Open the full record
          </Link>
          <Link href={`${base}/goals/${goal}`} className="inline-flex min-h-[44px] items-center rounded-(--radius-s) px-3 text-[14px] text-(--accent-text) hover:underline" data-review-work>
            Work and evidence for this goal
          </Link>
        </>
      }
    >
      {!cr ? (
        r.error ? (
          <Note>Align couldn&apos;t read this request just now: {r.error}</Note>
        ) : (
          <Loading />
        )
      ) : (
        <div className="flex flex-col gap-4" data-review={cr.id}>
          <div className="grid gap-3 rounded-(--radius-m) border border-(--line) bg-(--bg-panel) p-4 sm:grid-cols-[1fr_auto]">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {st && <StatusPill kind={st.kind} label={st.label} />}
                <span className="font-mono text-[12px] text-(--text-3)">revision {cr.revision}</span>
              </div>
              <p className="text-[15px] text-(--text-1)">
                {cr.requester.id === me ? "You asked" : `${cr.requester.name} asked`} {when(cr.created_at)}
              </p>
              {cr.reason && <p className="text-[14px] text-(--text-2)">&ldquo;{cr.reason}&rdquo;</p>}
            </div>
            <dl className="grid grid-cols-[auto_auto] content-start gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-(--text-3)">In force</dt>
              <dd className="font-mono text-(--text-1)">v{cr.goal.version}</dd>
              <dt className="text-(--text-3)">Proposed</dt>
              <dd className="font-mono text-(--text-1)">{cr.version ? `v${cr.version}` : `v${cr.goal.version + 1} on approval`}</dd>
              <dt className="text-(--text-3)">Evidence</dt>
              <dd>
                {cr.evidence_count ? (
                  <EvidenceLabel kind="reported" size="s" detail={`${cr.evidence_count} link${cr.evidence_count === 1 ? "" : "s"}`} />
                ) : (
                  <EvidenceLabel kind="unobserved" size="s" detail="no links" />
                )}
              </dd>
            </dl>
            <p className="text-[13px] text-(--text-3) sm:col-span-2">Approving records the decision. Align sends the new version to agents only when someone launches it.</p>
          </div>
          <Who cr={cr} me={me} />
          <ChangeRequestCard
            ws={ws}
            cr={cr}
            me={me}
            titles={titles}
            onDone={() => {
              r.reload();
              onChanged();
            }}
          />
        </div>
      )}
    </Drawer>
  );
}
