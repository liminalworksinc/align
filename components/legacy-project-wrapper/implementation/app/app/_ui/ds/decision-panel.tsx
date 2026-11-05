"use client";
import Link from "next/link";
import { diffWords } from "@/lib/v2/change-words.mts";
import { changeWaits, launchWaits } from "@/lib/v2/home-core.mts";
import type { ChangeRequest } from "../types";
import { deliveryStatement, type Delivery } from "./evidence-facts.mts";
import { DECISION_LINK, DecisionLinks } from "./decision-links";
import { Panel } from "./panel";
import { StatusPill, type StatusKind } from "./status-pill";

// "The decision this belongs to" (LIM-2472 round 2, founder ruling eaa5cf92: evidence serves a decision): the top of
// Work when it is opened for one goal. One request: its status, the change in one line, one sentence for where it
// stands (who decided what, when, and whose move it is now), and the way back to its review and record. `latest` says
// the request wasn't named in the link (the goal's open one, else its latest decided one). Times are absolute.

type Person = { id: string; name: string };
const at = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const who = (p: Person | null | undefined, me: string) => (!p ? "Someone" : p.id === me ? "You" : p.name);
const whoLower = (p: Person | null | undefined, me: string) => (!p ? "someone" : p.id === me ? "you" : p.name);
const people = (ps: Person[], me: string) => (ps.length ? ps.map((p) => whoLower(p, me)).join(" or ") : "nobody yet");

function status(cr: ChangeRequest): { kind: StatusKind; label?: string } {
  if (cr.state === "approved") return cr.launch === "launched" ? { kind: "launched", label: `Launched v${cr.version}` } : { kind: "approved", label: cr.launch === "not_yet" ? "Approved, not yet launched" : "Approved, not launched" };
  if (cr.state === "pending") return { kind: "pending" };
  if (cr.state === "countered") return { kind: "countered" };
  if (cr.state === "rejected") return { kind: "declined" };
  return { kind: "draft", label: cr.state === "withdrawn" ? "Withdrawn" : "Superseded" };
}

/** The change in one line: the first changed field's words, and how many more fields change. */
function changeLine(cr: ChangeRequest): string {
  const fields = Object.keys(cr.diff.after) as (keyof typeof cr.diff.after)[];
  const diff = Object.fromEntries(fields.map((k) => [k, { before: cr.diff.before[k], after: cr.diff.after[k] }]));
  const lines = diffWords(diff as Parameters<typeof diffWords>[0]);
  if (!lines.length) return "No field changes.";
  return lines.length > 1 ? `${lines[0]} (and ${lines.length - 1} more)` : lines[0]!;
}

/** Where the request stands, in one or two sentences, from the request read alone. */
export function decisionSentence(cr: ChangeRequest, me: string): string {
  const asked = `${who(cr.requester, me)} asked to change this goal on ${at(cr.created_at)}.`;
  const waits = changeWaits(cr);
  if (cr.state === "pending") {
    if (waits?.next === "rebase") return `${asked} It was asked against v${cr.base_version}; the goal is now v${cr.goal.version}. Waits on ${people(waits.waiting_on, me)} to update it.`;
    if (waits?.next === "resolve_loop") return `${asked} Nobody can approve it as it stands: a dependency it adds would close a loop.`;
    return `${asked} Waits on ${people(waits?.waiting_on ?? cr.approvers, me)} to decide.`;
  }
  const cond = cr.condition && !cr.condition.acknowledged_by ? cr.condition : null;
  const counterer = cr.revisions.find((r) => r.revision === cr.revision)?.author ?? null;
  if (cr.state === "countered")
    return cond
      ? `${who(counterer, me)} accepts it if ${cond.text}. Waits on ${whoLower(cr.requester, me)} to confirm the condition is met.`
      : `${who(counterer, me)} suggested a change. Waits on ${whoLower(cr.requester, me)} to accept it or keep theirs.`;
  if (cr.state === "approved") {
    const approved = `${who(cr.approved_by, me)} approved revision ${cr.revision} on ${at(cr.decided_at)}.`;
    if (cr.launch === "launched") return `Launched by ${whoLower(cr.launch_decided_by, me)} on ${at(cr.launch_decided_at)}: v${cr.version} is now the launched version.`;
    if (cr.launch === "not_yet") return `${approved} ${who(cr.launch_decided_by, me)} decided not yet on ${at(cr.launch_decided_at)}.`;
    const l = launchWaits(cr);
    return `${approved} Approval is not launch: v${cr.version ?? cr.goal.version + 1} becomes the launched version only when ${people(l?.launchers ?? cr.launchers, me)} launch${l && l.launchers.length === 1 && l.launchers[0]!.id !== me ? "es" : ""} it.`;
  }
  if (cr.state === "rejected") return `${who(cr.rejected_by, me)} declined it on ${at(cr.decided_at ?? cr.updated_at)}.`;
  if (cr.state === "withdrawn") return `${who(cr.requester, me)} withdrew it on ${at(cr.updated_at)}.`;
  return `A later version of the goal replaced it on ${at(cr.updated_at)}.`;
}

/** `delivery`: the launch's …/value read for a launched request (undefined while reading, null when it failed), for the
 *  one-sentence delivery statement under "now the launched version". */
export function DecisionPanel({ ws, cr, me, latest = false, delivery }: { ws: string; cr: ChangeRequest; me: string; latest?: boolean; delivery?: Delivery | null }) {
  const s = status(cr);
  return (
    <Panel eyebrow={latest ? (cr.state === "pending" || cr.state === "countered" || (cr.state === "approved" && cr.launch !== "launched") ? "Open decision on this goal" : "Latest decision on this goal") : "The decision this belongs to"} title={`${cr.requester.name}'s change, revision ${cr.revision}`}>
      <div data-decision-panel={cr.id} data-decision-state={cr.state} className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill kind={s.kind} label={s.label} size="s" />
          <span className="min-w-0 text-[14px] text-(--text-1) [overflow-wrap:anywhere]">{changeLine(cr)}</span>
        </div>
        <p className="text-[14px] text-(--text-1)">{decisionSentence(cr, me)}</p>
        {cr.launch === "launched" && cr.version && delivery !== undefined && (
          <p data-delivery-statement className="text-[14px] text-(--text-1)">
            {deliveryStatement(cr.version, delivery)}
          </p>
        )}
        {cr.state === "rejected" && cr.rejection_reason && <blockquote className="border-l-2 border-(--line-strong) pl-3 text-[14px] text-(--text-1) [overflow-wrap:anywhere]">{cr.rejection_reason}</blockquote>}
        <DecisionLinks ws={ws} goalId={cr.goal.id} crId={cr.id} here="work" />
      </div>
    </Panel>
  );
}

/** No request on the goal (or none the reader can read): say so, and where a change is proposed. */
export function NoDecisionPanel({ ws, goalId, missing = false }: { ws: string; goalId: string; missing?: boolean }) {
  return (
    <Panel eyebrow="The decision this belongs to" title={missing ? "No such request on this goal" : "No decision on this goal yet"}>
      <div data-decision-panel="none" className="flex flex-col gap-2 text-[14px] text-(--text-2)">
        <p>{missing ? "Align has no change request with this address on this goal that you can read. Below is what Align knows about the goal itself." : "Nobody has asked to change this goal. Changes are proposed on the goal's page."}</p>
        <Link href={`/app/w/${ws}/goals/${goalId}#change-requests`} className={`${DECISION_LINK} self-start`}>
          Open the goal
        </Link>
      </div>
    </Panel>
  );
}
