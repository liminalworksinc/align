"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useGoalTitles } from "../../_ui/changes";
import { useCallback, useEffect, useState } from "react";
import { Drawer, ReviewActions, ReviewBody, type ReviewChoice } from "../../_ui/ds";
import { crStatus } from "../../_ui/home/cr-status";
import { api, ApiError, Loading, Note } from "../../_ui/kit";
import type { ChangeRequest } from "../../_ui/types";

// Concept A's review drawer (LIM-2472): a change request opens beside the Home's work, never instead of it. The body is
// the shared ReviewBody (who asked, the reason once, Compare, evidence, what it waits on); the footer is the shared
// ReviewActions, always on screen: this person's dominant action, the rest folded into "More actions" on a phone, or
// "Not yours" with who can. Every action is the real POST. Quiet links lead to the full record and the goal's work.

export { crStatus };

const quiet = "inline-flex min-h-[44px] items-center text-[13px] text-(--accent-text) hover:underline";

function Loaded({ ws, cr, me, choice, onClose, done }: { ws: string; cr: ChangeRequest; me: string; choice?: ReviewChoice; onClose: () => void; done: () => void }) {
  const titles = useGoalTitles(ws);
  return (
    <Drawer
      open
      onClose={onClose}
      width="l"
      eyebrow="Review"
      title={cr.goal.title}
      footer={<ReviewActions ws={ws} cr={cr} me={me} onDone={done} compact initialChoice={choice} />}
    >
      <div data-review={cr.id}>
        <ReviewBody ws={ws} cr={cr} me={me} titleOf={(id) => titles.get(id) ?? "a goal you can't see"} onDone={done} />
      </div>
    </Drawer>
  );
}

export interface ReviewTarget {
  goal: string;
  id: string;
  choice?: ReviewChoice;
}

/** The review's place in the URL (?review=<goal>.<id>[&choice=<choice>]), so Back, a reload, a shared link and a plain
 *  link from a row all open it, on any page that mounts the drawer. */
export function useReview(): [ReviewTarget | null, (r: ReviewTarget | null) => void] {
  const sp = useSearchParams();
  const [goal, id] = (sp.get("review") ?? "").split(".");
  const choice = (sp.get("choice") as ReviewChoice | null) ?? undefined;
  const set = useCallback((next: ReviewTarget | null) => {
    const u = new URL(window.location.href);
    u.searchParams.delete("choice");
    if (next) {
      u.searchParams.set("review", `${next.goal}.${next.id}`);
      if (next.choice) u.searchParams.set("choice", next.choice);
    } else u.searchParams.delete("review");
    window.history[next ? "pushState" : "replaceState"](null, "", u);
  }, []);
  return [goal && id ? { goal, id, choice } : null, set];
}

/** Read by id and kept mounted until the person closes it: a decision or a refusal re-reads the request in place, so
 *  the drawer shows it as it now stands with the outcome notice, even when the Home's reload drops it from "Needs you".
 *  Not re-keyed on state: a remount would lose ReviewActions' notice.
 *
 *  It is also how a shared link arrives (`?review=<goal>.<id>`, cold load included). The server answers 404 alike for a
 *  request that doesn't exist and one on a goal the reader can't see, so the not-found state says the same for both and
 *  names nothing from the link. Any other failure says Align couldn't read it and offers to try again. */
export function ReviewDrawer({ ws, goal, id, me, choice, onClose, onChanged }: { ws: string; goal: string; id: string; me: string; choice?: ReviewChoice; onClose: () => void; onChanged: () => void }) {
  const [r, setR] = useState<{ cr: ChangeRequest | null; status: number | null; error: string | null }>({ cr: null, status: null, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    api<ChangeRequest>(`/api/v2/workspaces/${ws}/goals/${encodeURIComponent(goal)}/change-requests/${encodeURIComponent(id)}`).then(
      (cr) => live && setR({ cr, status: null, error: null }),
      (e: Error) => live && setR((prev) => ({ cr: prev.cr, status: e instanceof ApiError ? e.status : null, error: e.message })),
    );
    return () => {
      live = false;
    };
  }, [ws, goal, id, tick]);

  if (!r.cr && (r.status === 404 || r.status === 400))
    return (
      <Drawer open onClose={onClose} width="l" eyebrow="Review" title="Not found">
        <div className="flex flex-col gap-3 text-[15px] text-(--text-2)" data-review-missing>
          <p>This link doesn&apos;t open a change request you can read. The request may not exist, or it may be on a goal you can&apos;t see.</p>
          <p>If someone sent you this link, ask them to check it, or to add you to the goal.</p>
          <Link href={`/app/w/${ws}/requests`} className={quiet}>
            Open Requests
          </Link>
        </div>
      </Drawer>
    );
  if (!r.cr)
    return (
      <Drawer open onClose={onClose} width="l" eyebrow="Review" title="Change request">
        {r.error ? (
          <div className="flex flex-col gap-2" data-review-error>
            <Note>Align couldn&apos;t read this request just now: {r.error}</Note>
            <button type="button" className={quiet} onClick={reload}>
              Try again
            </button>
          </div>
        ) : (
          <Loading />
        )}
      </Drawer>
    );
  return (
    <Loaded
      ws={ws}
      cr={r.cr}
      me={me}
      choice={choice}
      onClose={onClose}
      done={() => {
        reload();
        onChanged();
      }}
    />
  );
}
