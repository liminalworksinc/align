"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { when } from "../kit";
import type { ChangeRequest } from "../types";
import type { Act } from "./act";
import { nameList, proposedVersion } from "./model";
import { Who } from "./parts";

// The role-lane state map of one change request (LIM-2472 concept B). One lane per role, in order: the person asking,
// the goal's approvers (who approve, suggest a change or decline), and the people who can launch (the approvers and the
// workspace owners: the request's `launchers`). Cards are the states lib/v2/changes.ts has; the card this request is in
// is lit. Each connector is labelled with the real action name. A connector the signed-in person may take now (its `can`
// flag, from the request's current state) is a live button; one someone else may take says who; the rest are drawn
// but inert. Nothing here sends anything: a live connector hands its action to the page, which confirms first.

export type Node = "asked" | "update" | "suggested" | "withdrawn" | "deciding" | "declined" | "approved" | "launched";
type Lane = "asking" | "approvers" | "launch";

export interface Edge {
  from: Node;
  to: Node;
  label: string;
  /** The ReviewActions choice a live connector opens; none for the historical "Ask". */
  act?: Act;
  can: boolean;
  who: { id: string; name: string }[];
}

const COL: Record<Node, number> = { asked: 1, update: 2, deciding: 2, suggested: 3, approved: 3, withdrawn: 4, declined: 4, launched: 4 };
const LANE_OF: Record<Node, Lane> = { asked: "asking", update: "asking", suggested: "asking", withdrawn: "asking", deciding: "approvers", declined: "approvers", approved: "launch", launched: "launch" };

/** The card this request is in now, or null when it left the map (superseded). */
export function currentNode(cr: ChangeRequest): Node | null {
  if (cr.state === "pending") return cr.behind ? "update" : "deciding";
  if (cr.state === "countered") return "suggested";
  if (cr.state === "withdrawn") return "withdrawn";
  if (cr.state === "rejected") return "declined";
  if (cr.state === "approved") return cr.launch === "launched" ? "launched" : cr.launch === "superseded" ? null : "approved";
  return null;
}

export function cards(cr: ChangeRequest, me: string): Record<Node, { title: string; meaning: string }> {
  const v = proposedVersion(cr);
  const req = cr.requester.id === me ? "You" : cr.requester.name;
  return {
    asked: { title: "Asked", meaning: `${req} asked to change v${cr.base_version} into v${v}.` },
    update: {
      title: "Needs an update",
      meaning: cr.behind ? `The goal moved on to v${cr.goal.version}; the request must be updated before anyone can approve it.` : "If the goal gets a newer version first, the request must be updated before anyone can approve it.",
    },
    suggested: { title: "Change suggested", meaning: "An approver suggested a different change; the person asking accepts it or withdraws." },
    withdrawn: { title: "Withdrawn", meaning: "The person asking withdrew it. The goal doesn't change." },
    deciding: { title: "Waiting for a decision", meaning: "An approver approves it, suggests a change, or declines it." },
    declined: { title: "Declined", meaning: "Declined with a reason. The goal doesn't change." },
    approved: {
      title: cr.launch === "not_yet" ? "Approved, launch not yet" : "Approved, not launched",
      meaning:
        cr.launch === "not_yet" && cr.launch_decided_by
          ? `${cr.launch_decided_by.id === me ? "You" : cr.launch_decided_by.name} chose Not yet ${when(cr.launch_decided_at)}. Align keeps serving v${cr.base_version}; v${v} can still be launched.`
          : `Approval is recorded. Align keeps serving v${cr.base_version} until someone launches v${v}.`,
    },
    launched: { title: cr.launch === "launched" ? `Launched as v${cr.version}` : "Launched", meaning: "Align launched it as the goal's new version and serves it to any connected app that reads the goal." },
  };
}

export function edges(cr: ChangeRequest): Edge[] {
  const c = cr.can;
  const req = [cr.requester];
  return [
    { from: "asked", to: "deciding", label: "Ask", can: false, who: req },
    { from: "update", to: "deciding", label: `Update to v${cr.goal.version}`, act: "rebase", can: c.rebase && cr.behind, who: req },
    { from: "deciding", to: "launched", label: "Approve and launch", act: "approve_and_launch", can: c.approve_and_launch, who: cr.approvers },
    { from: "deciding", to: "approved", label: "Approve only", act: "approve", can: c.approve, who: cr.approvers },
    { from: "deciding", to: "suggested", label: "Suggest a change", act: "counter", can: c.counter, who: cr.approvers },
    { from: "deciding", to: "declined", label: "Decline", act: "reject", can: c.reject && cr.state === "pending", who: cr.approvers },
    { from: "deciding", to: "withdrawn", label: "Withdraw", act: "withdraw", can: c.withdraw && cr.state === "pending", who: req },
    { from: "suggested", to: "deciding", label: "Accept the change", act: "accept_counter", can: c.accept_counter, who: req },
    { from: "suggested", to: "declined", label: "Decline", act: "reject", can: c.reject && cr.state === "countered", who: cr.approvers },
    { from: "suggested", to: "withdrawn", label: "Withdraw", act: "withdraw", can: c.withdraw && cr.state === "countered", who: req },
    { from: "approved", to: "launched", label: "Launch", act: "launch", can: c.launch, who: cr.launchers },
    { from: "approved", to: "approved", label: "Not yet", act: "not_yet", can: c.not_yet && cr.launch !== "not_yet", who: cr.launchers },
  ];
}

/** Cards already passed on the way to the current one. */
export function passed(cur: Node | null, cr: ChangeRequest): Set<Node> {
  const s = new Set<Node>(["asked"]);
  if (cur === "approved" || cur === "launched" || cur === "declined" || cur === "suggested") s.add("deciding");
  // Launched in a separate step (not "Approve and launch", which records both at one time) passed through Approved.
  if (cur === "launched" && cr.launch_decided_at && cr.decided_at && cr.launch_decided_at !== cr.decided_at) s.add("approved");
  s.delete(cur as Node);
  return s;
}

type Line = { d: string; live: boolean; key: string };

export function LaneMap({ cr, me, onAct, picked = null }: { cr: ChangeRequest; me: string; onAct: (a: Act) => void; picked?: Act | null }) {
  const cur = currentNode(cr);
  const done = passed(cur, cr);
  // Live (LIM-2503): when the request moves while the map is open (someone decided in another window, or here), the
  // card it moved to lights up and the line it came along draws itself, so the cause reads before the effect. Words
  // for a screen reader say the same; with reduced motion the card is simply lit (app/globals.css).
  const prevCur = useRef(cur);
  const [arrived, setArrived] = useState<{ from: Node | null; to: Node } | null>(null);
  useEffect(() => {
    const from = prevCur.current;
    prevCur.current = cur;
    if (from === cur || !cur) return;
    const on = setTimeout(() => setArrived({ from, to: cur }), 0);
    const off = setTimeout(() => setArrived(null), 2400);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [cur]);
  const words = cards(cr, me);
  const all = edges(cr);
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  // The map shows the way here, where it is now and where it can go next; every other state and transition on request.
  const [every, setEvery] = useState(false);
  const near = new Set<Node>([...done, ...(cur ? [cur] : []), ...all.filter((e) => e.from === cur).map((e) => e.to)]);

  const measure = useCallback(() => {
    const root = box.current;
    if (!root || !window.matchMedia("(min-width: 64rem)").matches) return setLines([]);
    const r0 = root.getBoundingClientRect();
    const out: Line[] = [];
    // Orthogonal routes through the gaps between columns: out of the source card's side at the connector's height, along
    // the gap to the target's row, then into the target's side. Cards sit above the lines, so a route never crosses text.
    const fan = new Map<string, number>();
    root.querySelectorAll<HTMLElement>("[data-edge-from]").forEach((chip) => {
      const to = chip.dataset.edgeTo!;
      if (to === chip.dataset.edgeFrom || chip.dataset.drawn !== "1") return;
      const target = root.querySelector<HTMLElement>(`[data-node="${to}"]`);
      const card = chip.closest<HTMLElement>("[data-node]");
      if (!target || !card) return;
      const c = chip.getBoundingClientRect();
      const k = card.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const X = (v: number) => Math.round(v - r0.left);
      const Y = (v: number) => Math.round(v - r0.top);
      const from = chip.dataset.edgeFrom!;
      const i = fan.get(from) ?? 0;
      fan.set(from, i + 1);
      const y1 = Y(c.top + c.height / 2);
      const y2 = Y(b.top + 18 + Math.min(i, 3) * 6);
      let d: string;
      if (b.left >= k.right) {
        const gx = X(k.right) + 12 + i * 6;
        d = `M${X(k.right)},${y1} H${gx} V${y2} H${X(b.left) - 3}`;
      } else if (b.right <= k.left) {
        const gx = X(k.left) - 12 - i * 6;
        d = `M${X(k.left)},${y1} H${gx} V${y2} H${X(b.right) + 3}`;
      } else {
        const down = b.top > k.bottom;
        const x = X(k.left + 24 + i * 8);
        d = `M${x},${Y(down ? k.bottom : k.top)} V${Y(down ? b.top : b.bottom) + (down ? -3 : 3)}`;
      }
      out.push({ key: `${from}-${to}-${chip.dataset.edgeLabel}`, live: chip.dataset.live === "1", d });
    });
    setLines(out);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [measure, cr]);

  const lanes: { key: Lane; label: string; role: string; people: { id: string; name: string }[] }[] = [
    { key: "asking", label: "Asking", role: "The person who asked", people: [cr.requester] },
    { key: "approvers", label: "Approvers", role: "Approve, suggest a change or decline", people: cr.approvers },
    { key: "launch", label: "Launch", role: "Approvers and workspace owners", people: cr.launchers },
  ];

  const chip = (e: Edge) => {
    const fromCur = e.from === cur;
    const live = fromCur && e.can;
    const target = e.to === e.from ? "stays here" : words[e.to].title;
    const common = {
      "data-edge-from": e.from,
      "data-edge-to": e.to,
      "data-edge-label": e.label,
      "data-live": live ? "1" : "0",
      // Lines only for the way this request came and the ways out of where it is now; the rest stay as dashed chips.
      "data-drawn": fromCur || (done.has(e.from) && (done.has(e.to) || e.to === cur)) ? "1" : "0",
    };
    if (live) {
      return (
        <button
          key={e.label}
          type="button"
          {...common}
          aria-pressed={picked === e.act}
          onClick={() => onAct(e.act!)}
          className={`flex min-h-[36px] w-full items-center justify-between gap-2 rounded-(--radius-s) px-2.5 py-1 text-left text-[13px] font-medium max-sm:min-h-[44px] border border-(--accent-text) text-(--accent-text) hover:bg-(--accent-soft) ${picked === e.act ? "bg-(--accent-soft) outline-2 outline-offset-2 outline-(--focus)" : ""}`}
        >
          <span>{e.label}</span>
          <span aria-hidden="true">→</span>
          <span className="sr-only">, to {target}</span>
        </button>
      );
    }
    const why = fromCur ? `${nameList(e.who, me)} can` : e.from === "asked" ? `by ${nameList(e.who, me)}` : "not from this state";
    return (
      <div key={e.label} {...common} className={`flex min-h-[32px] w-full flex-wrap items-center justify-between gap-x-2 rounded-(--radius-s) border border-dashed px-2.5 py-1 text-[12px] ${fromCur ? "border-(--line-strong) text-(--text-2)" : "border-(--line) text-(--text-3)"}`}>
        <span>
          {e.label} <span className="sr-only">, to {target}, </span>
        </span>
        <span className="font-mono text-[11px] text-(--text-3)">{why}</span>
      </div>
    );
  };

  const nodeCard = (n: Node) => {
    const on = n === cur;
    const was = done.has(n);
    // Transitions out of other states are hidden until "Show every state" (the historical Ask stays).
    const out = all.filter((e) => e.from === n && (every || e.from === cur || e.from === "asked"));
    // A state neither passed, current nor one step away is a one-line chip until "Show every state".
    if (!every && !near.has(n))
      return (
        <button
          key={n}
          type="button"
          data-node={n}
          onClick={() => setEvery(true)}
          title={words[n].meaning}
          className="relative z-10 flex min-h-[36px] min-w-0 items-center rounded-(--radius-s) border border-dashed border-(--line) bg-(--bg-inset) px-3 text-left text-[12px] text-(--text-3) hover:text-(--text-2) max-sm:min-h-[44px] lg:[grid-column:var(--col)]"
          style={{ "--col": COL[n] + 1 } as CSSProperties}
        >
          {words[n].title}
        </button>
      );
    return (
      <div
        key={n}
        data-node={n}
        data-current={on ? "1" : undefined}
        data-arrived={arrived?.to === n ? "1" : undefined}
        aria-current={on ? "step" : undefined}
        className={`relative z-10 flex min-w-0 flex-col gap-2 lg:[grid-column:var(--col)] rounded-(--radius-m) border p-3 ${arrived?.to === n ? "al-arrive " : ""}${on ? "border-(--accent-text) bg-(--bg-raised) shadow-[0_0_0_1px_var(--accent-text)]" : was ? "border-(--line-strong) bg-(--bg-panel)" : "border-(--line) bg-(--bg-inset)"}`}
        style={{ "--col": COL[n] + 1 } as CSSProperties}
      >
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[14px] font-semibold ${on ? "text-(--text-1)" : was ? "text-(--text-2)" : "text-(--text-3)"}`}>{words[n].title}</p>
          {on ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--accent-text)">Now</span>
          ) : was ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-(--text-3)">Done</span>
          ) : null}
        </div>
        <p className={`text-[12px] leading-snug ${on ? "text-(--text-2)" : "text-(--text-3)"}`}>{words[n].meaning}</p>
        {n === "approved" && <ReachNote cr={cr} />}
        {out.length > 0 && <div className="flex flex-col gap-1">{out.map(chip)}</div>}
      </div>
    );
  };

  return (
    <div data-lane-map className="min-w-0">
      {!cur && (
        <p className="mb-3 rounded-(--radius-s) border border-dashed border-(--line-strong) bg-(--bg-inset) px-3 py-2 text-[13px] text-(--text-2)">
          This request left the map: the goal got a newer version before it was {cr.state === "approved" ? "launched" : "decided"}, so it was superseded. Nobody can act on it.
        </p>
      )}
      <div ref={box} className="relative">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
          <defs>
            <marker id="lm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--edge)" />
            </marker>
            <marker id="lm-arrow-live" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--accent-text)" />
            </marker>
          </defs>
          {lines.map((l) => (
            <path {...(arrived && l.key.startsWith(`${arrived.from}-${arrived.to}-`) ? { className: "al-draw", pathLength: 1 } : { strokeDasharray: l.live ? undefined : "4 4" })} key={l.key} d={l.d} fill="none" strokeLinejoin="round" stroke={l.live ? "var(--accent-text)" : "var(--line-strong)"} strokeWidth={l.live ? 1.5 : 1} markerEnd={`url(#${l.live ? "lm-arrow-live" : "lm-arrow"})`} />
          ))}
        </svg>
        <p className="sr-only" aria-live="polite">
          {arrived ? `Moved just now: ${words[arrived.to].title}.` : ""}
        </p>
        <div className="flex flex-col">
          {lanes.map((lane) => (
            <section
              key={lane.key}
              aria-label={`${lane.label} lane`}
              data-lane={lane.key}
              className="grid items-start gap-x-10 gap-y-2 border-b border-dashed border-(--line-strong) py-3 first:border-t lg:grid-cols-[160px_repeat(4,minmax(0,1fr))]"
            >
              <header className="flex min-w-0 flex-col gap-1.5 lg:col-start-1 lg:pr-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-(--text-3)">{lane.label}</p>
                <p className="text-[12px] text-(--text-2)">{lane.role}</p>
                <div className="flex flex-col gap-1 text-[13px] text-(--text-1)">
                  {lane.people.length ? lane.people.map((p) => <Who key={p.id} p={p} me={me} size="s" />) : <span className="text-(--text-3)">Nobody yet</span>}
                </div>
              </header>
              {(["asked", "update", "suggested", "withdrawn", "deciding", "declined", "approved", "launched"] as Node[]).filter((n) => LANE_OF[n] === lane.key).map(nodeCard)}
            </section>
          ))}
        </div>
        <button type="button" onClick={() => setEvery((v) => !v)} aria-expanded={every} className="mt-3 min-h-[36px] rounded-(--radius-s) border border-(--edge) px-3 text-[13px] text-(--text-2) hover:text-(--text-1) max-sm:min-h-[44px]">
          {every ? "Show only the steps around this request" : "Show every state and transition"}
        </button>
      </div>
    </div>
  );
}

/** Before a launch the only "who would this reach" Align has is the snapshot it recorded with the revision: how many
 *  shared sessions were bound to the goal then. Delivery counts exist only after a launch. */
function ReachNote({ cr }: { cr: ChangeRequest }) {
  const snap = cr.revisions.find((r) => r.revision === cr.revision)?.snapshot;
  if (!snap) return <p className="text-[11px] text-(--text-3)">No Align snapshot on this revision, so how many sessions it would reach is unknown.</p>;
  return (
    <p className="text-[11px] text-(--text-3)" data-reach>
      Align&apos;s snapshot when revision {snap.revision} was written: {snap.bound_sessions} shared session{snap.bound_sessions === 1 ? "" : "s"} bound to this goal. Recorded by Align, not a delivery.
    </p>
  );
}

export function LaneLegend(): ReactNode {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-(--text-3)">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-5 rounded-[4px] bg-(--accent)" /> Yours to take now
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-5 rounded-[4px] border border-dashed border-(--line-strong)" /> Someone else&apos;s, or not from this state
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-5 rounded-[4px] border border-(--accent-text)" /> Where this request is now
      </li>
    </ul>
  );
}
