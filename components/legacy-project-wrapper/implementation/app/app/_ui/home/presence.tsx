"use client";
import { useEffect, useRef, useState } from "react";
import type { GoalPresence, LiveStatus } from "../live";

// Live presence on a goal (LIM-2503): the shared sessions bound to it now, from lib/v2/live.ts presenceFor (sessions
// Align heard from in the last 15 minutes). A dot per session: filled once the session confirmed the newest directive
// Align sent it (a delivery receipt), hollow while it is sent and not confirmed, two bars when paused. When a new
// directive reaches a session its dot is ringed for a moment and the line says what was sent, so an approval or a
// launch is seen arriving where it lands. Only what Align holds: counts, states and receipts, never what an agent does,
// and never whose session it is.

const KIND: Record<string, string> = {
  goal_version: "the new goal version",
  binding_changed: "its new goal",
  binding_suspended: "a binding change",
  stop: "Stop",
  resume: "Resume",
  request: "a request",
  hold: "a hold",
  release: "a release",
};
const DELIVERY: Record<string, string> = { sent: "sent, not confirmed yet", received: "received", applied: "applied", enforced: "enforced" };

export function presenceSentence(p: GoalPresence): string {
  const s = (n: number) => (n === 1 ? "1 agent session" : `${n} agent sessions`);
  if (p.working && p.paused) return `${s(p.working)} ${p.working === 1 ? "is" : "are"} working toward this goal now · ${p.paused} paused`;
  if (p.working) return `${s(p.working)} ${p.working === 1 ? "is" : "are"} working toward this goal now`;
  return `${s(p.paused)} on this goal ${p.paused === 1 ? "is" : "are"} paused`;
}

/** What changed for this goal's sessions since the last picture: a new directive reached some, or some paused. */
function news(prev: GoalPresence | undefined, next: GoalPresence): { reached: Set<string>; line: string | null } {
  const reached = new Set<string>();
  if (!prev) return { reached, line: null };
  const before = new Map(prev.sessions.map((s) => [s.id, s]));
  const kinds = new Map<string, number>();
  let paused = 0;
  let resumed = 0;
  for (const s of next.sessions) {
    const b = before.get(s.id);
    if (!b) continue;
    if (s.directive && (s.directive.at !== b.directive?.at || s.directive.delivery !== b.directive?.delivery)) {
      reached.add(s.id);
      if (s.directive.at !== b.directive?.at) kinds.set(s.directive.kind, (kinds.get(s.directive.kind) ?? 0) + 1);
    }
    if (s.state === "paused" && b.state === "working") paused++;
    if (s.state === "working" && b.state === "paused") resumed++;
  }
  const parts: string[] = [];
  for (const [k, n] of kinds) parts.push(`Align sent ${KIND[k] ?? k} to ${n === 1 ? "1 session" : `${n} sessions`}`);
  if (!kinds.size && reached.size) parts.push(`${reached.size === 1 ? "1 session" : `${reached.size} sessions`} confirmed what Align sent`);
  if (paused) parts.push(`${paused} paused`);
  if (resumed) parts.push(`${resumed} resumed`);
  return { reached, line: parts.length ? `${parts.join(" · ")}.` : null };
}

export function GoalPresenceLine({ p }: { p: GoalPresence }) {
  const prev = useRef<GoalPresence | undefined>(undefined);
  const [flash, setFlash] = useState<{ reached: Set<string>; line: string | null; n: number }>({ reached: new Set(), line: null, n: 0 });
  useEffect(() => {
    const n = news(prev.current, p);
    prev.current = p;
    if (!n.reached.size && !n.line) return;
    const on = setTimeout(() => setFlash((f) => ({ ...n, n: f.n + 1 })), 0);
    const off = setTimeout(() => setFlash((f) => ({ reached: new Set(), line: null, n: f.n })), 4000);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [p]);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-(--text-2)" data-presence={p.goal_id} data-presence-working={p.working} data-presence-paused={p.paused}>
      <span className="flex items-center gap-1" aria-hidden="true">
        {p.sessions.slice(0, 12).map((s) => {
          const confirmed = s.directive && s.directive.delivery !== "sent";
          const ring = flash.reached.has(s.id) ? " al-reach" : "";
          return s.state === "paused" ? (
            <span key={`${s.id}:${flash.n}`} data-presence-dot="paused" title={`Paused${s.directive ? `; ${KIND[s.directive.kind] ?? s.directive.kind} ${DELIVERY[s.directive.delivery]}` : ""}`} className={`inline-flex h-2.5 w-2.5 items-center justify-center gap-[2px] rounded-full${ring}`}>
              <span className="h-2.5 w-[3px] rounded-[1px] bg-(--text-3)" />
              <span className="h-2.5 w-[3px] rounded-[1px] bg-(--text-3)" />
            </span>
          ) : (
            <span
              key={`${s.id}:${flash.n}`}
              data-presence-dot={confirmed ? "confirmed" : "sent"}
              title={s.directive ? `Working; ${KIND[s.directive.kind] ?? s.directive.kind} ${DELIVERY[s.directive.delivery]}` : "Working; nothing sent to it yet"}
              className={`inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-(--ev-receipt) ${confirmed || !s.directive ? "bg-(--ev-receipt)" : "bg-transparent"}${ring}`}
            />
          );
        })}
        {p.sessions.length > 12 && <span className="font-mono text-[11px] text-(--text-3)">+{p.sessions.length - 12}</span>}
      </span>
      <span data-presence-sentence>{presenceSentence(p)}</span>
      <span className="font-mono text-[11px] text-(--text-3)" aria-live="polite" data-presence-news>
        {flash.line}
      </span>
    </div>
  );
}

/** A small mark for the page header: whether this page updates by itself. */
export function LiveMark({ status }: { status: LiveStatus }) {
  const word = status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting" : status === "connecting" ? "Connecting" : "Updates when you act or reload";
  const tip =
    status === "live"
      ? "Changes others make here show up within about a second."
      : status === "off"
        ? "Live updates aren't reaching this tab, so it reads when you act or reload, and Since you last looked checks once a minute."
        : "Live updates will resume in a moment.";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-(--text-3)" title={tip} data-live-status={status}>
      <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${status === "live" ? "al-breathe bg-(--ev-receipt)" : status === "off" ? "border border-(--text-3)" : "bg-(--st-pending)"}`} />
      <span className={status === "off" ? "normal-case tracking-normal" : undefined}>{word}</span>
    </span>
  );
}
