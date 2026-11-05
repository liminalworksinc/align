import type { ChangeFields, ChangeRequest } from "../types";

// The decision record's events (LIM-2472 workstream S, item 1): who did what, when, to which object, from which
// source, built only from what Align recorded and the reader may read:
//  - a change request (GET …/goals/<goal>/change-requests/<id>, or the workspace list): its revisions, evidence,
//    condition acknowledgement, decision and launch decision, each with the person the server names;
//  - the workspace audit log (GET …/audit, workspace owners only): one row per recorded action, actor and object id.
// The source of an event is said only as far as Align records it. The audit log keeps no channel, so a row is
// "Person in Align" only for actions that have no other way in (see SOURCE_OF), "Align" when it names no actor, and
// "Source not recorded" when a person, their device or a connected app could each have done it.

export type Source = "person" | "app" | "device" | "align" | "unrecorded";

export const SOURCE_WORDS: Record<Source, string> = {
  person: "Person in Align",
  app: "Connected app (MCP)",
  device: "Device (align CLI)",
  align: "Align",
  unrecorded: "Source not recorded",
};

export type Kind = "proposal" | "counter" | "evidence" | "condition" | "decision" | "launch" | "goal" | "access" | "session" | "other";

export const KIND_WORDS: Record<Kind, string> = {
  proposal: "Proposals",
  counter: "Counters",
  evidence: "Evidence",
  condition: "Conditions",
  decision: "Decisions",
  launch: "Launch",
  goal: "Goals",
  access: "People and access",
  session: "Sessions",
  other: "Other",
};

export interface RecordEvent {
  id: string;
  at: string;
  kind: Kind;
  actor: { id: string; name: string } | null;
  source: Source;
  /** What was acted on: a change request and its goal, or an audit object id. */
  object: { label: string; href?: string; id?: string };
  /** One line: "proposed a change", "approved revision 2". */
  what: string;
  /** For change-request events: the request, so a card can show what the plan was and what it became. */
  cr?: ChangeRequest;
  /** A counter: the fields before and after this revision. */
  compare?: { before: ChangeFields; after: ChangeFields; beforeLabel: string; afterLabel: string };
  /** Free text the person wrote (a reason, a note, a condition), shown quoted. */
  quote?: string;
  /** Evidence: a link and how it is classed (never verified by Align). */
  link?: { url: string; label: string; reported: "self-reported" | "agent-reported" };
  tone?: "pending" | "approved" | "launched" | "declined" | "retry" | "neutral" | "accent";
  /** Where the time comes from when it isn't the event's own recorded time (said on the card). */
  timeNote?: string;
  /** The reads carry no time for it: `at` only orders it (right after what it answers); the card shows no time. */
  noTime?: boolean;
}

const crHref = (ws: string, cr: ChangeRequest) => `/app/w/${ws}/record?cr=${cr.id}`;

/** Every event one change request recorded, oldest first. `audit`: the workspace audit rows when the reader may read
 *  them (owners), used only for times the request read doesn't carry (accepting a suggested change). */
export function changeRequestEvents(ws: string, cr: ChangeRequest, audit: AuditRow[] = []): RecordEvent[] {
  const obj = { label: `Change to ${cr.goal.title}`, href: crHref(ws, cr), id: cr.id };
  const out: RecordEvent[] = [];
  const revs = [...cr.revisions].sort((a, b) => a.revision - b.revision);
  // The plan as it was before the request: the diff's before side (the fields the request touches).
  const base = cr.diff.before;
  revs.forEach((r, i) => {
    if (i === 0) {
      out.push({
        id: `${cr.id}:r${r.revision}`,
        at: r.created_at,
        kind: "proposal",
        actor: r.author,
        // Change requests are created only from a signed-in browser (no MCP tool or device route creates one).
        source: "person",
        object: obj,
        what: `proposed a change to ${cr.goal.title} (version ${r.base_version})`,
        compare: { before: base, after: { ...base, ...r.changes }, beforeLabel: `Version ${r.base_version}`, afterLabel: "Proposed" },
        quote: cr.reason || undefined,
        tone: "neutral",
      });
    } else {
      const prev = revs[i - 1];
      out.push({
        id: `${cr.id}:r${r.revision}`,
        at: r.created_at,
        kind: "counter",
        actor: r.author,
        source: "person",
        object: obj,
        what: r.author.id === cr.requester.id ? `revised the request (revision ${r.revision})` : `countered with revision ${r.revision}`,
        compare: { before: { ...base, ...prev.changes }, after: { ...base, ...r.changes }, beforeLabel: `Revision ${prev.revision}`, afterLabel: `Revision ${r.revision}` },
        quote: r.condition ? `Accept if: ${r.condition}` : (r.note ?? undefined),
        tone: "accent",
      });
    }
    for (const e of r.evidence) {
      out.push({
        id: `${cr.id}:ev:${e.id}`,
        at: e.added_at,
        kind: "evidence",
        actor: e.added_by,
        // Evidence records its source: "agent" arrives only through the MCP tool align_add_change_request_evidence.
        source: e.source === "agent" ? "app" : "person",
        object: obj,
        what: `added evidence to revision ${e.revision}`,
        link: { url: e.url, label: e.label, reported: e.reported_as },
        tone: "neutral",
      });
    }
    if (r.acknowledged_by && r.acknowledged_at) {
      out.push({
        id: `${cr.id}:ack:${r.revision}`,
        at: r.acknowledged_at,
        kind: "condition",
        actor: r.acknowledged_by,
        source: "person",
        object: obj,
        what: `acknowledged the condition on revision ${r.revision}`,
        quote: r.condition ?? undefined,
        tone: "neutral",
      });
    }
  });
  // Accepting a suggested change writes no revision and no time on the request: the latest revision being someone
  // else's counter while the request has left "countered" (pending again, then approved or declined) says it was
  // accepted. Its time is the audit row's for owners; anyone else's read has none (a server ask).
  const last = revs[revs.length - 1];
  if (last && revs.length > 1 && last.author.id !== cr.requester.id && ["pending", "approved", "rejected"].includes(cr.state)) {
    const row = audit.filter((a) => a.action === "change_request.counter_accepted" && a.object_id === cr.id).sort((a, b) => b.at.localeCompare(a.at))[0];
    out.push({
      id: `${cr.id}:accepted:${last.revision}`,
      at: row?.at ?? last.created_at,
      noTime: !row,
      kind: "counter",
      actor: cr.requester,
      source: "person",
      object: obj,
      what: `accepted the suggested change (revision ${last.revision})`,
      tone: "neutral",
    });
  }
  // Withdrawn and superseded record no decided_at; withdrawing or superseding closes the request, so its last update
  // (updated_at) is when that happened. Said as such on the card.
  if (!cr.decided_at && (cr.state === "withdrawn" || cr.state === "superseded")) {
    out.push({
      id: `${cr.id}:closed`,
      at: cr.updated_at,
      timeNote: `Time of the request's last change: ${cr.state === "withdrawn" ? "withdrawing" : "superseding"} closed it, so nothing changed after.`,
      kind: "decision",
      actor: cr.state === "withdrawn" ? cr.requester : null,
      source: cr.state === "withdrawn" ? "person" : "align",
      object: obj,
      what: cr.state === "withdrawn" ? "withdrew the request" : "closed the request: the goal changed another way first",
      tone: "neutral",
    });
  }
  if (cr.decided_at) {
    const decided = {
      approved: { actor: cr.approved_by, what: `approved revision ${cr.revision}${cr.version ? `: ${cr.goal.title} version ${cr.version}` : ""}`, tone: "approved" as const },
      rejected: { actor: cr.rejected_by, what: "declined the request", tone: "declined" as const },
      withdrawn: { actor: cr.requester, what: "withdrew the request", tone: "neutral" as const },
      superseded: { actor: null, what: "closed the request: the goal changed another way first", tone: "neutral" as const },
    }[cr.state as "approved" | "rejected" | "withdrawn" | "superseded"];
    if (decided) {
      out.push({
        id: `${cr.id}:decided`,
        at: cr.decided_at,
        kind: "decision",
        actor: decided.actor,
        source: decided.actor ? "person" : "align",
        object: obj,
        what: decided.what,
        cr,
        quote: cr.state === "rejected" ? (cr.rejection_reason ?? undefined) : (cr.decision_note ?? undefined),
        tone: decided.tone,
      });
    }
  }
  if (cr.launch_decided_at && (cr.launch === "launched" || cr.launch === "not_yet")) {
    out.push({
      id: `${cr.id}:launch`,
      at: cr.launch_decided_at,
      kind: "launch",
      actor: cr.launch_decided_by,
      source: cr.launch_decided_by ? "person" : "align",
      object: obj,
      what: cr.launch === "launched" ? `launched version ${cr.version ?? ""}`.trim() : "decided not to launch yet",
      tone: cr.launch === "launched" ? "launched" : "retry",
    });
  }
  return out;
}

export interface AuditRow {
  at: string;
  actor: { id: string; name: string } | null;
  action: string;
  object_id: string | null;
}

/** Actions with only one way in, by the routes that record them; anything not listed is "Source not recorded". */
const SOURCE_OF: Record<string, Source> = {
  "session.shared_again": "device",
  "device.paired": "person",
  "device.workspace_added": "person",
  "oauth.app_approved": "person",
  "oauth.app_revoked": "person",
  "session.agent_stopped": "person",
  "session.agent_resumed": "person",
};
// Families recorded only from a signed-in browser (no MCP tool or device route writes them).
const PERSON_FAMILIES = ["goal.", "alignment.", "reallocation.", "invite.", "member.", "team.", "workspace.", "ask.", "request.", "passkey.", "account."];

function auditSource(r: AuditRow): Source {
  if (!r.actor) return "align";
  if (SOURCE_OF[r.action]) return SOURCE_OF[r.action];
  // A change request's evidence may come from the person or their connected app; the audit row doesn't say which.
  if (r.action === "change_request.evidence_added" || r.action === "change_request.evidence_removed") return "unrecorded";
  if (r.action.startsWith("change_request.")) return "person";
  if (PERSON_FAMILIES.some((p) => r.action.startsWith(p))) return "person";
  return "unrecorded";
}

function auditKind(action: string): Kind {
  if (action === "change_request.created" || action === "alignment.requested" || action === "reallocation.requested") return "proposal";
  if (action.endsWith(".countered") || action.endsWith(".rebased")) return "counter";
  if (action.includes("evidence")) return "evidence";
  if (action.endsWith("condition_acknowledged")) return "condition";
  if (action.endsWith(".launched") || action.endsWith(".not_yet")) return "launch";
  if (/\.(approved|approved_without_evidence|rejected|withdrawn|superseded|counter_accepted|revoked|approval)$/.test(action)) return "decision";
  if (action.startsWith("goal.")) return "goal";
  if (/^(invite|member|team|device|oauth|passkey|account|workspace)\./.test(action)) return "access";
  if (action.startsWith("session.")) return "session";
  return "other";
}

/** "goal.created" → "created a goal"; "change_request.approved_without_evidence" → "approved a change request
 *  without evidence". The object (its title when the reader can read it, else its id) follows on the card. */
const SAID: Record<string, string> = {
  "team.member_set": "set a team member",
  "team.member_removed": "removed a team member",
  "member.role_changed": "changed a member's role",
  "member.account_deleted": "deleted their account",
  "member.sessions_deleted": "deleted a member's sessions",
  "goal.parent_reviewed": "reviewed a goal it contributes to",
  "workspace.steering_on": "turned steering on",
  "workspace.steering_off": "turned steering off",
  "session.agent_stopped": "stopped a session's agent",
  "session.agent_resumed": "resumed a session's agent",
  "session.sharing_stopped": "stopped sharing a session",
  "session.shared_again": "shared a session again",
  "session.history_deleted": "deleted a session's history",
  "change_request.approved_without_evidence": "approved a change request without evidence",
  "change_request.condition_acknowledged": "acknowledged a condition",
  "change_request.counter_accepted": "accepted a counter",
  "change_request.evidence_added": "added evidence to a change request",
  "change_request.evidence_removed": "removed evidence from a change request",
  "change_request.not_yet": "decided not to launch a change yet",
  "reallocation.not_yet": "decided not to launch a target change yet",
  "reallocation.approval": "gave one approval on a target change",
  "reallocation.counter_accepted": "accepted a counter on a target change",
  "alignment.goal_closed": "closed an alignment when its goal closed",
  "request.not_declined": "took back a decline",
  "oauth.app_approved": "approved a connected app",
  "oauth.app_revoked": "disconnected a connected app",
  "device.workspace_added": "added a device to this workspace",
  "account.signed_out_everywhere": "signed out everywhere",
};

function auditWhat(action: string): string {
  if (SAID[action]) return SAID[action];
  const [family, verb = action] = action.split(/\.(.+)/);
  const noun = (FAMILY[family] ?? family).toLowerCase();
  const article = /^[aeiou]/.test(noun) ? "an" : "a";
  const words = verb.replace(/_/g, " ");
  const m = /^(approved|countered|rejected|withdrawn|superseded|launched|revoked|created|accepted|declined|cancelled|expired|renamed|restored|held|released|versioned|requested|paired|imported|added|deleted|removed|left|sent) ?(.*)$/.exec(words);
  if (!m) return `${words} (${noun})`;
  return `${m[1]} ${article} ${noun}${m[2] ? ` ${m[2]}` : ""}`;
}

const FAMILY: Record<string, string> = {
  change_request: "Change request",
  alignment: "Alignment",
  reallocation: "Target change",
  goal: "Goal",
  invite: "Invite",
  member: "Member",
  team: "Team",
  device: "Device",
  oauth: "Connected app",
  session: "Session",
  workspace: "Workspace",
  ask: "Ask",
  request: "Request",
  passkey: "Passkey",
  account: "Account",
};

/** Audit rows as events. Rows about a change request already shown from its own record (`shown`) are left out. */
export function auditEvents(rows: AuditRow[], shown: Set<string>): RecordEvent[] {
  return rows
    .filter((r) => !(r.action.startsWith("change_request.") && r.object_id && shown.has(r.object_id)))
    .map((r, i) => {
      const family = r.action.split(".")[0];
      return {
        id: `audit:${i}:${r.at}`,
        at: r.at,
        kind: auditKind(r.action),
        actor: r.actor,
        source: auditSource(r),
        object: { label: FAMILY[family] ?? family, id: r.object_id ?? undefined },
        what: auditWhat(r.action),
        tone: "neutral" as const,
      };
    });
}
