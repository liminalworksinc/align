"use client";
import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ChangeRequest } from "../types";
import type { Act } from "./act";
import { nameList, proposedVersion } from "./model";
import { Who } from "./shell";

// The role-lane state map of one change request (LIM-2472 concept B). One lane per role, in order: the person asking,
// the goal's approvers (who approve, suggest a change or decline), and the people who can launch (the approvers and the
// workspace owners: the request's `launchers`). Cards are the states lib/v2/changes.ts has; the card this request is in
// is lit. Each connector is labelled with the real action name. A connector the signed-in person may take now (its `can`
// flag, from the request's current state) is a live button; one someone else may take says who; the rest are drawn
// but inert. Nothing here sends anything: a live connector hands its action to the page, which confirms first.

type Node = "asked" | "update" | "suggested" | "withdrawn" | "deciding" | "declined" | "approved" | "launched";
type Lane = "asking" | "approvers" | "launch";

interface Edge {
  from: Node;
  to: Node;
  label: string;
  /** The action the page confirms and sends, or a link to the goal page's form. */
  act?: Act;
  form?: boolean;
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

function cards(cr: ChangeRequest, me: string): Record<Node, { title: string; meaning: string }> {
  const v = proposedVersion(cr);
  const req = cr.requester.id === me ? "You" : cr.requester.name;
  return {
    asked: { title: "Asked", meaning: `${req} asked to change v${cr.base_version} into v${v}.` },
    update: { title: "Needs an update", meaning: `The goal moved on to v${cr.goal.version}; the request must be updated before anyone can approve it.` },
    suggested: { title: "Change suggested", meaning: "An approver suggested a different change; the person asking accepts it or withdraws." },
    withdrawn: { title: "Withdrawn", meaning: "The person asking withdrew it. The goal doesn't change." },
    deciding: { title: "Waiting for a decision", meaning: "An approver approves it, suggests a change, or declines it." },
    declined: { title: "Declined", meaning: "Declined with a reason. The goal doesn't change." },
    approved: {
      title: cr.launch === "not_yet" ? "Approved, launch not yet" : "Approved, not launched",
      meaning: `Approval is recorded. Align keeps serving v${cr.goal.version} until someone launches v${v}.`,
    },
    launched: { title: cr.launch === "launched" ? `Launched as v${cr.version}` : "Launched", meaning: "Align launched it as the goal's new version and serves it to any connected app that reads the goal." },
  };
}

function edges(cr: ChangeRequest): Edge[] {
  const c = cr.can;
  const req = [cr.requester];
  return [
    { from: "asked", to: "deciding", label: "Ask", can: false, who: req },
    { from: "update", to: "deciding", label: `Update to v${cr.goal.version}`, form: true, can: c.rebase && cr.behind, who: req },
    { from: "deciding", to: "launched", label: "Approve and launch", act: "approve_and_launch", can: c.approve_and_launch, who: cr.approvers },
    { from: "deciding", to: "approved", label: "Approve only", act: "approve", can: c.approve, who: cr.approvers },
    { from: "deciding", to: "suggested", label: "Suggest a change", form: true, can: c.counter, who: cr.approvers },
    { from: "deciding", to: "declined", label: "Decline", act: "reject", can: c.reject && cr.state === "pending", who: cr.approvers },
    { from: "deciding", to: "withdrawn", label: "Withdraw", act: "withdraw", can: c.withdraw && cr.state === "pending", who: req },
    { from: "suggested", to: "deciding", label: "Accept the change", act: "accept_counter", can: c.accept_counter, who: req },
    { from: "suggested", to: "declined", label: "Decline", act: "reject", can: c.reject && cr.state === "countered", who: cr.approvers },
    { from: "suggested", to: "withdrawn", label: "Withdraw", act: "withdraw", can: c.withdraw && cr.state === "countered", who: req },
    { from: "approved", to: "launched", label: "Launch", act: "launch", can: c.launch, who: cr.launchers },
    { from: "approved", to: "approved", label: "Not yet", act: "not_yet", can: c.not_yet, who: cr.launchers },
  ];
}

/** Cards already passed on the way to the current one. */
function passed(cur: Node | null, cr: ChangeRequest): Set<Node> {
  const s = new Set<Node>(["asked"]);
  if (cur === "approved" || cur === "launched" || cur === "declined" || cur === "suggested") s.add("deciding");
  if (cur === "launched" && cr.launch_decided_by) s.add("approved");
  s.delete(cur as Node);
  return s;
}

type Line = { d: string; live: boolean; key: string };

export function LaneMap({ cr, me, ws, onAct }: { cr: ChangeRequest; me: string; ws: string; onAct: (a: Act) => void }) {
  const cur = currentNode(cr);
  const done = passed(cur, cr);
  const words = cards(cr, me);
  const all = edges(cr);
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const measure = useCallback(() => {
    const root = box.current;
    if (!root || !window.matchMedia("(min-width: 64rem)").matches) return setLines([]);
    const r0 = root.getBoundingClientRect();
    const out: Line[] = [];
    root.querySelectorAll<HTMLElement>("[data-edge-from]").forEach((chip) => {
      const to = chip.dataset.edgeTo!;
      if (to === chip.dataset.edgeFrom) return;
      const target = root.querySelector<HTMLElement>(`[data-node="${to}"]`);
      if (!target) return;
      const a = chip.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const x1 = a.right - r0.left;
      const y1 = a.top + a.height / 2 - r0.top;
      const forward = b.left > a.right;
      const x2 = forward ? b.left - r0.left - 4 : b.left + b.width / 2 - r0.left;
      const y2 = forward ? b.top + Math.min(28, b.height / 2) - r0.top : b.top - r0.top + (b.top > a.top ? -4 : b.height + 4);
      const mx = forward ? (x1 + x2) / 2 : x1 + 24;
      out.push({ key: `${chip.dataset.edgeFrom}-${to}-${chip.dataset.edgeLabel}`, live: chip.dataset.live === "1", d: forward ? `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${x2},${y1} ${x2},${y2}` });
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
    };
    if (live && e.form) {
      return (
        <Link key={e.label} {...common} href={`/app/w/${ws}/goals/${cr.goal.id}#change-requests`} className="flex min-h-[36px] w-full items-center justify-between gap-2 rounded-(--radius-s) border border-(--accent) px-2.5 py-1 text-left text-[13px] font-medium text-(--accent-text) hover:bg-(--accent-soft) max-sm:min-h-[44px]">
          <span>{e.label}</span>
          <span aria-hidden="true">→</span>
          <span className="sr-only">, to {target}, on the goal page</span>
        </Link>
      );
    }
    if (live) {
      const dominant = e.act === "approve_and_launch" || e.act === "launch" || e.act === "accept_counter";
      return (
        <button
          key={e.label}
          type="button"
          {...common}
          onClick={() => onAct(e.act!)}
          className={`flex min-h-[36px] w-full items-center justify-between gap-2 rounded-(--radius-s) px-2.5 py-1 text-left text-[13px] font-medium max-sm:min-h-[44px] ${dominant ? "bg-(--accent) text-(--text-on-accent) hover:bg-(--accent-hover)" : "border border-(--accent) text-(--accent-text) hover:bg-(--accent-soft)"}`}
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
    const out = all.filter((e) => e.from === n);
    return (
      <div
        key={n}
        data-node={n}
        data-current={on ? "1" : undefined}
        aria-current={on ? "step" : undefined}
        className={`relative z-10 flex min-w-0 flex-col lg:[grid-column:var(--col)] gap-2 rounded-(--radius-m) border p-3 ${on ? "border-(--accent) bg-(--bg-raised) shadow-[0_0_0_1px_var(--accent)]" : was ? "border-(--line-strong) bg-(--bg-panel)" : "border-(--line) bg-(--bg-inset)"}`}
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
              <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
            </marker>
          </defs>
          {lines.map((l) => (
            <path key={l.key} d={l.d} fill="none" stroke={l.live ? "var(--accent)" : "var(--line-strong)"} strokeWidth={l.live ? 1.5 : 1} strokeDasharray={l.live ? undefined : "4 4"} markerEnd={`url(#${l.live ? "lm-arrow-live" : "lm-arrow"})`} />
          ))}
        </svg>
        <div className="flex flex-col">
          {lanes.map((lane) => (
            <section
              key={lane.key}
              aria-label={`${lane.label} lane`}
              data-lane={lane.key}
              className="grid gap-x-10 gap-y-3 border-b border-dashed border-(--line-strong) py-4 first:border-t lg:grid-cols-[160px_repeat(4,minmax(0,1fr))]"
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
      </div>
    </div>
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
        <span aria-hidden="true" className="inline-block h-3 w-5 rounded-[4px] border border-(--accent)" /> Where this request is now
      </li>
    </ul>
  );
}
