"use client";
import { Disclosure, LaneMap, NeedAction, type LaneCard, type LaneCardState, type LaneLink } from "../ds";
import type { ChangeRequest } from "../types";
import type { Act } from "./act";
import { cards, currentNode, edges, passed, type Edge, type Node } from "./lanes";
import { nameList } from "./model";

// "See who decides" (LIM-2472 round 2, founder ruling eaa5cf92): one change request as the foundation's lane map, inside
// the review, closed by default. Lanes are columns: the person asking, the approvers, the people who can launch. The
// cards are the states lib/v2/changes.ts has; the request's own is "Now", the way it came is "Done", and the states one
// step away are "next". Lines carry no words; each card says in its action slot which steps lead out of it and whose
// they are. A step is this person's exactly when its `cr.can` flag says so, and pressing it hands the choice to the
// review's own ReviewActions (`onAct`), which confirms and sends. Desktop only: below md the disclosure is in the DOM but
// hidden (`hidden md:block`, display none), so it is neither seen nor reached by keyboard or screen reader there, and the
// review's one-sentence "who decides" answer stands alone.

// Rows chosen so most steps are straight lines between neighbours: from "Waiting for a decision" (row 1) the suggested
// change sits beside it on the left, "Approved, not launched" beside it on the right, "Declined" right under it, and
// "Launched" under "Approved". Only "Approve and launch" and the way in from "Asked" run through a gutter.
const ROW: Record<Node, number> = { asked: 0, suggested: 1, deciding: 1, approved: 1, update: 2, declined: 2, launched: 2, withdrawn: 3 };
const LANE: Record<Node, "asking" | "approvers" | "launch"> = { asked: "asking", update: "asking", suggested: "asking", withdrawn: "asking", deciding: "approvers", declined: "approvers", approved: "launch", launched: "launch" };
const ORDER: Node[] = ["asked", "suggested", "deciding", "approved", "update", "declined", "launched", "withdrawn"];

export function WhoDecides({ cr, me, onAct }: { cr: ChangeRequest; me: string; onAct?: (a: Act) => void }) {
  const cur = currentNode(cr);
  const done = passed(cur, cr);
  const words = cards(cr, me);
  const all = edges(cr);
  const out = all.filter((e) => e.from === cur && e.to !== e.from);
  const next = new Set(out.map((e) => e.to));

  const stateOf = (n: Node): LaneCardState => (n === cur ? "now" : done.has(n) ? "done" : next.has(n) ? "next" : "idle");

  /** What leads out of the current card: this person's steps as quiet buttons (or words when the page can't take them),
   *  everyone else's as "<names> can". */
  const steps = (es: Edge[]) => (
    <ul className="flex flex-col gap-1" data-steps>
      {es.map((e) => (
        <li key={e.label} className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]">
          {e.can && e.act && onAct ? (
            <NeedAction quiet dense onClick={() => onAct(e.act!)}>
              {e.label}
            </NeedAction>
          ) : (
            <span className={e.can ? "font-medium text-(--text-1)" : "text-(--text-2)"}>{e.label}</span>
          )}
          {/* A separator a screen reader speaks, so the step and who can take it aren't read as one word. */}
          <span className="sr-only">, </span>
          <span className="text-(--text-3)">{e.can ? "(you)" : `${nameList(e.who, me)} can`}</span>
        </li>
      ))}
    </ul>
  );

  const laneCards: LaneCard[] = ORDER.map((n) => ({
    id: n,
    lane: LANE[n],
    row: ROW[n],
    title: words[n].title,
    body: words[n].meaning,
    state: stateOf(n),
    action: n === cur ? (() => {
      const own = all.filter((e) => e.from === n);
      return own.length ? steps(own) : undefined;
    })() : undefined,
  }));

  // The way the request came (done), then the steps out of where it is now: live when they're this person's.
  const links: LaneLink[] = [
    ...all.filter((e) => e.to !== e.from && done.has(e.from) && (done.has(e.to) || e.to === cur)).map((e) => ({ from: e.from, to: e.to, kind: "done" as const })),
    ...out.map((e) => ({ from: e.from, to: e.to, kind: e.can ? ("live" as const) : ("muted" as const) })),
  ];

  const lanes = [
    { id: "asking", label: "Asking", role: "The person who asked", people: who([cr.requester], me) },
    { id: "approvers", label: "Approvers", role: "Approve, suggest a change or decline", people: who(cr.approvers, me) },
    { id: "launch", label: "Launch", role: "Approvers and workspace owners", people: who(cr.launchers, me) },
  ];

  return (
    <Disclosure className="hidden md:block" summary="See who decides">
      <div data-who-decides>
        {!cur && <p className="mb-2 text-[13px] text-(--text-2)">This request was superseded: the goal got a newer version first, so nobody can act on it.</p>}
        <LaneMap
          caption={`Who decides on ${cr.requester.name}'s request to change ${cr.goal.title}: asked by ${cr.requester.name}; approvers ${nameList(cr.approvers, me)}; can launch ${nameList(cr.launchers, me)}.${cur ? ` It is now: ${words[cur].title}.` : ""}`}
          lanes={lanes}
          cards={laneCards}
          links={links}
        />
      </div>
    </Disclosure>
  );
}

const who = (ps: { id: string; name: string }[], me: string) => (ps.length ? ps.map((p) => (p.id === me ? "You" : p.name)).join(", ") : "Nobody yet");
