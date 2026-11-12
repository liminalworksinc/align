// LIM-2472 concept B (decision desk): one row per change request, read from the server's own view of it (the
// change-requests feed, lib/v2/changes.ts). Every word here restates a field the server sent: its state, its launch
// state, its `can` flags and who it waits on (changeWaits, lib/v2/home-core.mts). Nothing is inferred about agents.

import type { StatusKind } from "../ds";
import type { ChangeRequest } from "../types";
import { changeWaits, type HomePerson } from "@/lib/v2/home-core.mts";

export type Phase = "on_me" | "on_others" | "decided";

export const PHASE_WORDS: Record<Phase, string> = { on_me: "Waiting on me", on_others: "Waiting on others", decided: "Decided" };

/** The state of a change request in the product's words, with the status shape that carries it. */
export function crStatus(cr: ChangeRequest): { kind: StatusKind; label: string } {
  if (cr.state === "pending") return cr.behind ? { kind: "pending", label: "Needs an update" } : { kind: "pending", label: "Waiting for approval" };
  if (cr.state === "countered") return { kind: "countered", label: "Change suggested" };
  if (cr.state === "approved") {
    if (cr.launch === "launched") return { kind: "launched", label: `Launched as v${cr.version}` };
    if (cr.launch === "not_yet") return { kind: "held", label: "Approved, launch not yet" };
    if (cr.launch === "superseded") return { kind: "draft", label: "Superseded before launch" };
    return { kind: "approved", label: "Approved, not launched" };
  }
  if (cr.state === "rejected") return { kind: "declined", label: "Declined" };
  if (cr.state === "withdrawn") return { kind: "draft", label: "Withdrawn" };
  return { kind: "draft", label: "Superseded" };
}

/** Open and waiting on someone: pending, countered, or approved with no launch yet. */
export const isOpen = (cr: ChangeRequest) => cr.state === "pending" || cr.state === "countered" || (cr.state === "approved" && (cr.launch === "pending" || cr.launch === "not_yet"));

export function phaseOf(cr: ChangeRequest): Phase {
  if (cr.waiting_on_me) return "on_me";
  return isOpen(cr) ? "on_others" : "decided";
}

/** Who the request waits on now, and for what, from the server's fields. */
export function waitsOn(cr: ChangeRequest): { people: HomePerson[]; for: string } | null {
  if (cr.state === "approved" && (cr.launch === "pending" || cr.launch === "not_yet")) return { people: cr.launchers, for: "launch" };
  const w = changeWaits(cr);
  if (!w) return null;
  const what = { decide: "decision", accept_counter: "answer to the suggested change", rebase: "update to the goal's current version", resolve_loop: "decision without the looping dependency", launch: "launch", accept: "answer", done: "done" }[w.next];
  return { people: w.waiting_on, for: what };
}

export const nameList = (ps: HomePerson[], me: string) => (ps.length ? ps.map((p) => (p.id === me ? "you" : p.name)).join(", ") : "nobody yet");

/** The proposed version: the goal's next version on the request's base. */
export const proposedVersion = (cr: ChangeRequest) => cr.base_version + 1;

/** What is launched (the goal's current version, the one Align serves) and what is approved but not launched. */
export function versions(cr: ChangeRequest): { launched: string; approved: string; approvedLine: string; line: string } {
  // A goal's first version was saved by its owner, not launched by a request: call it what it is.
  const launched = cr.goal.version === 1 ? "Version 1" : `Launched v${cr.goal.version}`;
  // What this request did or asks, in a few words true in every state ("Asks for v3"); the State beside it says the
  // rest, and the review names the goal's current version.
  if (cr.state === "approved" && cr.launch === "launched")
    return { launched, approved: `v${cr.version}`, approvedLine: `Approved v${cr.version}`, line: `Launched v${cr.version}` };
  if (cr.state === "approved" && (cr.launch === "pending" || cr.launch === "not_yet"))
    return { launched, approved: `v${proposedVersion(cr)}, not launched`, approvedLine: `Approved v${proposedVersion(cr)}, not launched`, line: `Approved v${proposedVersion(cr)}` };
  if (cr.state === "pending" || cr.state === "countered")
    return { launched, approved: `not yet, asks for v${proposedVersion(cr)}`, approvedLine: `Not approved yet, asks for v${proposedVersion(cr)}`, line: `Asks for v${proposedVersion(cr)}` };
  return { launched, approved: "none", approvedLine: "Not approved", line: "Not approved" };
}

/** A one-line meaning of the request: its first change in words, from the request's own diff, and how many more, so
 *  two requests on one goal never read alike (founder ruling, PR 68 pass 1 item 9). */
export function oneLine(cr: ChangeRequest): string {
  const { before, after } = cr.diff;
  const q = (s: string) => `“${s.length > 48 ? `${s.slice(0, 47)}…` : s}”`;
  const out: string[] = [];
  if (after.title !== undefined && after.title !== before.title) out.push(`Renames it ${q(after.title)}`);
  if (after.measures) {
    const b = before.measures ?? [];
    for (const m of after.measures) {
      const was = b.find((x) => x.id === m.id);
      if (!was) out.push(`Adds measure ${q(m.text)}`);
      else if (was.text === m.text && (was.target ?? null) !== (m.target ?? null)) out.push(`Target of ${q(m.text)}: ${was.target ?? "none"} → ${m.target ?? "none"}`);
      else if (was.text !== m.text) out.push(`Rewords measure ${q(was.text)}`);
    }
    for (const m of b) if (!after.measures.some((x) => x.id === m.id)) out.push(`Removes measure ${q(m.text)}`);
  }
  if (after.limits) {
    const b = before.limits ?? [];
    for (const l of after.limits) {
      const was = b.find((x) => x.id === l.id);
      if (!was) out.push(`Adds limit ${q(l.text)}`);
      else if (was.text !== l.text || was.type !== l.type) out.push(`Changes limit ${q(was.text)}`);
    }
    for (const l of b) if (!after.limits.some((x) => x.id === l.id)) out.push(`Removes limit ${q(l.text)}`);
  }
  if (after.status !== undefined && after.status !== before.status) out.push(after.status === "dropped" ? "Drops the goal" : after.status === "achieved" ? "Marks it achieved" : "Makes it active again");
  if (after.depends_on) out.push("Changes what it depends on");
  if (!out.length) {
    // Only an order changed, or the diff is missing: name the fields, as before.
    const keys = Object.keys(cr.changes) as (keyof ChangeRequest["changes"])[];
    const words: Record<string, string> = { title: "the goal's title", measures: "the measures", depends_on: "what it depends on", status: "the goal's status", limits: "the limits" };
    return keys.length ? `Changes ${keys.map((k) => words[k] ?? k).join(", ")}` : "No field changes";
  }
  return out.length > 1 ? `${out[0]} and ${out.length - 1} more change${out.length > 2 ? "s" : ""}` : out[0];
}

export const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export const decisionHref = (ws: string, cr: { id: string; goal: { id: string } }) => `/app/w/${ws}/decisions/${cr.goal.id}/${cr.id}`;
export const recordHref = (ws: string, cr: { id: string }) => `/app/w/${ws}/record?cr=${cr.id}`;
