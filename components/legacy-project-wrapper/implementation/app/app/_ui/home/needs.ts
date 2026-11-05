// LIM-2472 Home, section 1 "Needs you": one ranked list of what needs a human, built only from reads this person may
// make in the browser. A pure function of those reads (no fetch here), so the page, the integrator and a Node check run
// the same rules. Every row kind names the read behind it; a kind with no backing read is left out (see LEFT OUT).
//
// Reads (all cookie GETs the person makes as themselves):
//   CR     GET /api/v2/workspaces/<ws>/change-requests        -> { waiting_on_me, mine, others }: ChangeRequest views
//          (lib/v2/changes.ts requestView: state, launch, can, waiting_on_me, approvers, launchers, revisions, times)
//   ASKS   GET /api/v2/workspaces/<ws>/asks?state=open,accepted,done,declined -> { asks: AskView[] } (lib/v2/asks.ts:57-80)
//   AL     GET /api/v2/workspaces/<ws>/alignments              -> { waiting_on_me, mine, others } (lib/v2/alignments.ts:577)
//   HOME   GET /api/v2/workspaces/<ws>/home                    -> apps.items: { last_used_at, last_read_at, ... }
//          (lib/v2/home.ts workspaceHome; an owner sees every app, anyone else their own)
//   REQ    GET /api/v2/workspaces/<ws>/goals/<g>/requests      -> { requests: RequestView[] } per goal (lib/v2/requests.ts
//          requestView: type, sender, sessions[].state incl. "declined" with updated_at), read for at most REQ_GOALS_MAX
//          goals this person reads (their own first), in parallel
//
// LEFT OUT, no read backs them for the browser:
//   - "An agent's ask waiting on a person": v2 has no agent-originated ask. Asks (lib/v2/asks.ts) are what one team was
//     asked by people, recorded by a person or imported by an owner; POST …/asks is cookie-only. They appear below as
//     kind "team_ask", worded as a team's ask, never as an agent's.
//   - "A session not on the launched plan": the sessions read (GET …/sessions) gives a session's current goal but not
//     which version it was last sent or applied; per-session receipts exist only on the goal's value read after a launch.
//     Saying a session is "not on" a version would be a claim Align can't make from these reads.

import type { StatusKind } from "../ds";
import type { Alignment, ChangeRequest } from "../types";
import { changeWaits, launchWaits, type HomePerson } from "../../../../lib/v2/home-core.mts";

export type NeedKind = "launch" | "decide" | "returned" | "agent_declined" | "team_ask" | "alignment" | "app_behind";
export type NeedPhase = "needs_you" | "waiting_on_others" | "done";

/** The ranking, said once on the page. Launches first: approved work Align hasn't released yet; then what is yours to
 *  decide; then your own requests that came back; then requests an agent declined; then team asks; then alignments;
 *  then launched versions Align has not sent to an app. Oldest first inside a kind. */
export const RANK_NOTE =
  "Ranked: approved changes waiting to launch, then decisions waiting on you, then your requests that came back, then requests an agent declined, then team asks, then alignments, then launched versions Align has not sent to an app. Oldest first within each.";
/** The rank note, plus what wasn't checked: requests to agents are read per goal, at most REQ_GOALS_MAX goals. */
export const rankNote = (unchecked: number, unsent = 0) =>
  [RANK_NOTE, unchecked ? `Requests to agents not checked on ${unchecked} goal${unchecked === 1 ? "" : "s"}.` : "", unsent ? `What Align sent apps not checked on ${unsent} launch${unsent === 1 ? "" : "es"}.` : ""].filter(Boolean).join(" ");

/** The latest launch on each goal, newest first: the change requests whose value read SENT checks. */
export function latestLaunches(crs: ChangeRequest[]): ChangeRequest[] {
  const by = new Map<string, ChangeRequest>();
  for (const c of crs) {
    if (c.launch !== "launched" || !c.launch_decided_at || !c.version) continue;
    const p = by.get(c.goal.id);
    if (!p || c.version > p.version!) by.set(c.goal.id, c);
  }
  return [...by.values()].sort((a, b) => b.launch_decided_at!.localeCompare(a.launch_decided_at!) || a.id.localeCompare(b.id));
}
/** Goals whose requests to agents are read for this list. */
export const REQ_GOALS_MAX = 12;
/** Goals whose latest launch is checked for what Align sent each app. */
export const SENT_GOALS_MAX = 12;
// Rows rank by what the person can do about them. An app that hasn't read the launched plan comes last: the person's
// action there is the weakest (Align notifies nobody), and its real home as evidence is the launched goal's line.
export const KIND_ORDER: NeedKind[] = ["launch", "decide", "returned", "agent_declined", "team_ask", "alignment", "app_behind"];

export const KIND_WORDS: Record<NeedKind, string> = {
  launch: "Approved, not launched",
  decide: "Decision",
  returned: "Your request came back",
  agent_declined: "Agent declined",
  team_ask: "Team ask",
  alignment: "Alignment",
  app_behind: "Launched, not sent",
};

/** Evidence counts by class. Self-reported is a person's link; agent reported is a link a connected app added; a receipt
 *  is a goal read Align served (apps) ; not observed is an app Align has seen no goal read from. */
export interface EvidenceCounts {
  receipt: number;
  agent_reported: number;
  not_observed: number;
  self_reported: number;
}

export interface Need {
  key: string;
  kind: NeedKind;
  phase: NeedPhase;
  goal: { id: string; title: string } | null;
  /** Who asked, or what caused it. */
  cause: string;
  /** The person's words for the row (the request's reason, the ask text), quoted by the renderer. */
  quote: string | null;
  /** When the wait is measured from, and which field that is. */
  since: { at: string; field: string } | null;
  evidence: EvidenceCounts;
  /** The one action: its label and what it opens. Empty when the row is someone else's (`who` says whose). */
  action: { label: string; opens: string } | null;
  /** Whose move it is when it isn't this person's. */
  who: string | null;
  /** The review link target, "?review=<goal>.<id>", for a change request. */
  review: string | null;
  tone: StatusKind;
  /** The row's label: the kind's word (KIND_WORDS) while open; once done, what happened ("Launched as v2", "Declined"). */
  word: string;
  /** The change request a row is about, for the renderer's evidence summary. */
  cr?: ChangeRequest;
}

/** Not a judgment, so never a row and never counted: a connected app Align has recorded no goal read from (a setup
 *  state, with no goal). Home prints at most one muted line for these under the list. */
export interface Notice {
  kind: "app_never_read";
  app: { id: string; name: string };
  connected_by: HomePerson;
  action: { label: "See apps"; opens: "apps" };
}

export interface NeedsInput {
  ws: string;
  me: string;
  /** CR: every view from the three groups. */
  crs: ChangeRequest[] | null;
  /** ASKS. */
  asks: AskLite[] | null;
  /** AL: every view from the three groups. */
  alignments: Alignment[] | null;
  /** HOME apps.items. */
  apps: AppLite[] | null;
  /** SENT: per goal, the latest launch and the apps the value read says Align sent that version
   *  (GET …/change-requests/<id>/value apps.items); null when it couldn't be read. */
  sends?: { goal: { id: string; title: string }; cr: string; version: number; launched_at: string; apps: { id: string }[]; current_version?: number }[] | null;
  /** REQ, per goal read; null when none could be read. */
  requests?: { goal: { id: string; title: string }; requests: RequestLite[] }[] | null;
}

/** The fields of a request to agents (lib/v2/requests.ts requestView) this model reads. */
export interface RequestLite {
  id: string;
  type: "replan" | "checkpoint" | "switch_goal";
  sender: HomePerson;
  state: "open" | "answered" | "expired" | "cancelled";
  sessions: { session_key: string; owner: HomePerson; repo_alias: string | null; harness: string; state: string; updated_at: string }[];
}

/** The fields of an AskView (lib/v2/asks.ts:57-80) this model reads. */
export interface AskLite {
  id: string;
  state: "open" | "accepted" | "done" | "declined" | "withdrawn";
  team: { id: string; name: string };
  goal: { id: string; title: string } | null;
  text: string;
  from_label: string | null;
  requester: HomePerson;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  waiting_on_me: boolean;
  can: { accept: boolean; decline: boolean; done: boolean };
}

/** The fields of a Home app item (lib/v2/home.ts) this model reads. */
export interface AppLite {
  id: string;
  name: string;
  connected_by: HomePerson;
  approved_at: string;
  last_used_at: string | null;
  last_read_at: string | null;
}

const none = (): EvidenceCounts => ({ receipt: 0, agent_reported: 0, not_observed: 0, self_reported: 0 });
const names = (ps: HomePerson[], me: string) => (ps.length ? ps.map((p) => (p.id === me ? "you" : p.name)).join(", ") : "nobody yet");

/** A request's links on its current revision, by who reported them (Evidence.source, lib/v2/evidence.ts). */
function crEvidence(cr: ChangeRequest): EvidenceCounts {
  const e = none();
  for (const x of cr.revisions.find((r) => r.revision === cr.revision)?.evidence ?? []) {
    if (x.source === "agent") e.agent_reported++;
    else e.self_reported++;
  }
  return e;
}

const reviewOf = (cr: ChangeRequest) => `?review=${cr.goal.id}.${cr.id}`;
const goalOf = (cr: ChangeRequest) => ({ id: cr.goal.id, title: cr.goal.title });

/** One change request as at most one row (CR read). */
function crNeed(cr: ChangeRequest, me: string): Need | null {
  const base = { key: `cr:${cr.id}`, goal: goalOf(cr), quote: cr.reason, evidence: crEvidence(cr), review: reviewOf(cr), cr, word: "" };
  const asker = cr.requester.id === me ? "Your request" : `${cr.requester.name}'s request`;
  const c = cr.can;
  const next = cr.version ?? cr.base_version + 1;

  // (b) An approved change not launched (launchWaits: state approved, launch pending or not_yet).
  const lw = launchWaits(cr);
  if (lw) {
    // Nobody can launch it as it stands: a dependency it adds would close a loop (C5-1). Shown, with the server's reason.
    if (cr.dependency_loop)
      return { ...base, kind: "launch", phase: "waiting_on_others", tone: "held", cause: asker, since: cr.decided_at ? { at: cr.decided_at, field: "decided_at" } : null, action: null, who: `Nobody can launch it as it stands: ${cr.dependency_loop}` };
    const since = cr.launch === "not_yet" && cr.launch_decided_at ? { at: cr.launch_decided_at, field: "launch_decided_at" } : cr.decided_at ? { at: cr.decided_at, field: "decided_at" } : null;
    return lw.can_launch
      ? { ...base, kind: "launch", phase: "needs_you", tone: cr.launch === "not_yet" ? "held" : "approved", cause: `${asker}, approved by ${cr.approved_by?.id === me ? "you" : (cr.approved_by?.name ?? "an approver")}`, since, action: { label: `Launch v${next}`, opens: "review: launch" }, who: null }
      : { ...base, kind: "launch", phase: "waiting_on_others", tone: cr.launch === "not_yet" ? "held" : "approved", cause: asker, since, action: null, who: `${names(lw.launchers, me)} can launch it` };
  }

  // (a) and (c): open requests (changeWaits: pending, countered).
  const w = changeWaits(cr);
  if (w) {
    // The wait starts at the latest revision (a counter or an update writes one); updated_at would restart it whenever
    // evidence is added or a condition acknowledged.
    const last = cr.revisions.reduce<ChangeRequest["revisions"][number] | null>((m, r) => (!m || r.revision > m.revision ? r : m), null);
    const since = last ? { at: last.created_at, field: "revisions[latest].created_at" } : { at: cr.created_at, field: "created_at" };
    // (a) A decision waiting on you: your `can` has a decision (approve, approve_and_launch, reject or counter).
    if ((w.next === "decide" || w.next === "resolve_loop") && (c.approve || c.approve_and_launch || c.reject || c.counter)) {
      // "Review", not a decision's name: the choice is made in the review.
      return { ...base, kind: "decide", phase: "needs_you", tone: "pending", cause: asker, since, action: { label: "Review", opens: "review" }, who: null };
    }
    // (c) Your request that came back: a suggested change to accept, a condition to acknowledge, an update to the
    // goal's current version.
    if (cr.requester.id === me && (c.accept_counter || (c.acknowledge && cr.condition && !cr.condition.acknowledged_by) || (c.rebase && cr.behind))) {
      const label = c.accept_counter ? "Accept the change" : c.acknowledge && cr.condition && !cr.condition.acknowledged_by ? "Confirm the condition" : `Update to v${cr.goal.version}`;
      const why = c.accept_counter ? "An approver suggested a change" : label === "Confirm the condition" ? "Approved on a condition" : `The goal moved on to v${cr.goal.version}`;
      return { ...base, kind: "returned", phase: "needs_you", tone: c.accept_counter ? "countered" : "pending", cause: why, since, action: { label, opens: "review" }, who: null };
    }
    // "Your request came back" only for the requester; anyone else sees what the request waits for.
    const other = cr.requester.id !== me && (w.next === "accept_counter" || w.next === "rebase");
    return { ...base, word: other ? (w.next === "accept_counter" ? "Change suggested" : "Needs an update") : "", kind: w.next === "accept_counter" || w.next === "rebase" ? "returned" : "decide", phase: "waiting_on_others", tone: cr.state === "countered" ? "countered" : "pending", cause: asker, since, action: null, who: `Waiting on ${names(w.waiting_on, me)}` };
  }

  // Done: decided, withdrawn, superseded, or launched.
  const at = cr.launch_decided_at ?? cr.decided_at ?? cr.updated_at;
  const field = cr.launch_decided_at ? "launch_decided_at" : cr.decided_at ? "decided_at" : "updated_at";
  const tone: StatusKind = cr.launch === "launched" ? "launched" : cr.state === "rejected" ? "declined" : cr.state === "approved" ? "approved" : "draft";
  const word = cr.launch === "launched" ? `Launched as v${cr.version}` : cr.state === "rejected" ? "Declined" : cr.state === "withdrawn" ? "Withdrawn" : cr.launch === "superseded" || cr.state === "superseded" ? "Superseded" : "Approved";
  return { ...base, kind: cr.launch === "launched" ? "launch" : "decide", phase: "done", tone, word, cause: asker, since: { at, field }, action: null, who: null };
}

/** One team ask as a row (ASKS read). Waiting on you: open and you lead the team, or accepted and your team finishes it
 *  (AskView.waiting_on_me, lib/v2/asks.ts:220). */
function askNeed(a: AskLite, me: string): Need {
  const base = { key: `ask:${a.id}`, kind: "team_ask" as const, goal: a.goal, quote: a.text, evidence: none(), review: null, word: "" };
  const cause = `${a.from_label ?? (a.requester.id === me ? "You" : a.requester.name)} asked ${a.team.name}`;
  if (a.state === "done" || a.state === "declined" || a.state === "withdrawn")
    return { ...base, phase: "done", tone: a.state === "done" ? "approved" : a.state === "declined" ? "declined" : "draft", word: a.state === "done" ? "Ask done" : a.state === "declined" ? "Ask declined" : "Ask withdrawn", cause, since: { at: a.decided_at ?? a.updated_at, field: a.decided_at ? "decided_at" : "updated_at" }, action: null, who: null };
  const since = { at: a.state === "accepted" && a.decided_at ? a.decided_at : a.created_at, field: a.state === "accepted" && a.decided_at ? "decided_at" : "created_at" };
  if (a.waiting_on_me)
    return { ...base, phase: "needs_you", tone: "pending", cause, since, action: a.state === "open" ? { label: "Accept or decline", opens: "asks" } : { label: "Mark done", opens: "asks" }, who: null };
  return { ...base, phase: "waiting_on_others", tone: "pending", cause, since, action: null, who: a.state === "open" ? `Waiting on a lead of ${a.team.name}` : `Accepted; waiting on ${a.team.name} to finish it` };
}

/** One alignment as a row (AL read; alignmentWaits would give the same people). */
function alignmentNeed(a: Alignment, me: string): Need | null {
  const target = a.target_goal?.visible && a.target_goal.id && a.target_goal.title ? { id: a.target_goal.id, title: a.target_goal.title } : null;
  const base = { key: `al:${a.id}`, kind: "alignment" as const, goal: target, quote: a.note, evidence: none(), review: null, word: "" };
  const from = a.source_goal ? ` from ${a.source_goal.visible && a.source_goal.title ? a.source_goal.title : "a goal you can't see"}` : "";
  const cause = `${a.requester.id === me ? "You ask" : `${a.requester.name} asks`} to align with ${target ? target.title : "a goal you can't see"}${from}`;
  if (a.state === "approved" || a.state === "rejected" || a.state === "withdrawn" || a.state === "revoked")
    return { ...base, phase: "done", tone: a.state === "approved" ? "approved" : a.state === "rejected" ? "declined" : "draft", word: a.state === "approved" ? "Alignment approved" : a.state === "rejected" ? "Alignment declined" : a.state === "revoked" ? "Alignment revoked" : "Alignment withdrawn", cause, since: { at: a.closed_at ?? a.updated_at, field: a.closed_at ? "closed_at" : "updated_at" }, action: null, who: null };
  const lastH = a.history.reduce<Alignment["history"][number] | null>((m, h) => (!m || h.revision > m.revision ? h : m), null);
  const since = lastH ? { at: lastH.created_at, field: "history[latest].created_at" } : { at: a.created_at, field: "created_at" };
  if (a.waiting_on_me) {
    const label = a.can.accept_counter ? "Accept the change" : "Review";
    return { ...base, phase: "needs_you", tone: a.state === "countered" ? "countered" : "pending", cause, since, action: { label, opens: "alignments" }, who: null };
  }
  const waiting = a.state === "countered" ? [a.requester] : a.requirements.filter((r) => !r.approved_by).flatMap((r) => r.approvers);
  return { ...base, phase: "waiting_on_others", tone: a.state === "countered" ? "countered" : "pending", cause, since, action: null, who: `Waiting on ${names(waiting, me)}` };
}

/** Connected apps Align has not sent a launched version to (HOME apps + SENT). For the latest launch on each goal
 *  (at most SENT_GOALS_MAX goals, newest launches first), the value read lists the apps an MCP goal read was sent that
 *  version (lib/oauth/grants.ts appsSentGoalVersion, recorded per app, goal and version); an app this person can see,
 *  that Align has served some goal read, and that isn't in that list gets a row: "Align has not sent v<n> to <app>."
 *  Not observed for v<n>. An app with no goal read at all is a notice, not a row (neverRead). Nothing is said about
 *  what the app or its agent is doing. */
function appNeeds(apps: AppLite[], sends: NonNullable<NeedsInput["sends"]> | undefined, me: string): Need[] {
  const out: Need[] = [];
  const mine = (a: AppLite) => a.connected_by.id === me;
  const row = (a: AppLite, key: string, goal: Need["goal"], cause: string, since: Need["since"], e: EvidenceCounts): Need => ({
    key,
    kind: "app_behind",
    phase: mine(a) ? "needs_you" : "waiting_on_others",
    goal,
    cause,
    quote: null,
    since,
    evidence: e,
    action: mine(a) ? { label: "See apps", opens: "apps" } : null,
    who: mine(a) ? null : `Connected by ${a.connected_by.name}`,
    review: null,
    tone: "draft",
    word: "",
  });
  for (const s of sends ?? []) {
    const sent = new Set(s.apps.map((x) => x.id));
    for (const a of apps) {
      if (!a.last_read_at || sent.has(a.id)) continue;
      const e = none();
      e.not_observed = 1;
      // A newer version saved directly (no change request) may have been sent; these reads can't tell, so the row
      // names the goal's current version rather than reading as "behind".
      const now = s.current_version && s.current_version > s.version ? ` The goal is now at v${s.current_version}.` : "";
      out.push(row(a, `app:${a.id}:${s.goal.id}:${s.version}`, s.goal, `Align has not sent v${s.version} to ${a.name}.${now}`, { at: s.launched_at, field: "launch_decided_at" }, e));
    }
  }
  return out;
}

/** Apps Align has recorded no goal read from (HOME apps): notices, launches or not. */
function neverRead(apps: AppLite[]): Notice[] {
  return apps.filter((a) => !a.last_read_at).map((a) => ({ kind: "app_never_read", app: { id: a.id, name: a.name }, connected_by: a.connected_by, action: { label: "See apps", opens: "apps" } }));
}

const TYPE_WORDS: Record<RequestLite["type"], string> = { replan: "replan", checkpoint: "checkpoint", switch_goal: "switch goal" };

/** Your requests to agents that a session declined (REQ). The decline is the session's own answer, so it is Agent
 *  reported, never "the agent is blocked". One row per request; done once the request is cancelled. */
function declinedNeeds(groups: NonNullable<NeedsInput["requests"]>, me: string): Need[] {
  const out: Need[] = [];
  for (const { goal, requests } of groups)
    for (const r of requests) {
      if (r.sender.id !== me) continue;
      const declined = r.sessions.filter((x) => x.state === "declined");
      if (!declined.length) continue;
      const first = declined[0]!;
      const latest = declined.reduce((a, b) => (b.updated_at > a.updated_at ? b : a));
      const who = `${first.harness}${first.repo_alias ? ` in ${first.repo_alias}` : ""}${declined.length > 1 ? ` and ${declined.length - 1} more` : ""}`;
      const e = none();
      e.agent_reported = declined.length;
      out.push({
        key: `req:${r.id}`,
        kind: "agent_declined",
        phase: r.state === "cancelled" ? "done" : "needs_you",
        goal,
        cause: `${who} declined your ${TYPE_WORDS[r.type]} request`,
        quote: null,
        since: { at: latest.updated_at, field: "sessions[].updated_at" },
        evidence: e,
        action: r.state === "cancelled" ? null : { label: "Open the requests", opens: "goal requests" },
        who: null,
        review: null,
        tone: "draft",
        word: "",
      });
    }
  return out;
}

/** A row's label: its own once done, else its kind's word. */
const withWord = (n: Need): Need => ({ ...n, word: n.word || KIND_WORDS[n.kind] });

/** One change request as the row Home would show for it (kind, word, tone, action), for the desk's rows, so a request
 *  has the same label in both places. Null when Home shows no row (an approved change that can't launch is shown). */
export function needForChangeRequest(cr: ChangeRequest, me: string): Need | null {
  const n = crNeed(cr, me);
  return n && withWord(n);
}

/** Every row this person's reads support, ranked, in its phase. A read that failed (null) contributes no rows; the
 *  renderer says that kind is unknown rather than showing nothing. */
export type Unknown = "change requests" | "asks" | "alignments" | "apps" | "requests to agents" | "what Align sent apps";

export function buildNeeds(input: NeedsInput): { rows: Need[]; unknown: Unknown[]; notices: Notice[] } {
  const { me } = input;
  const rows: Need[] = [];
  const unknown: Unknown[] = [];
  if (input.crs) for (const cr of input.crs) {
    const n = crNeed(cr, me);
    if (n) rows.push(n);
  }
  else unknown.push("change requests");
  if (input.asks) for (const a of input.asks) rows.push(askNeed(a, me));
  else unknown.push("asks");
  if (input.alignments) for (const a of input.alignments) {
    const n = alignmentNeed(a, me);
    if (n) rows.push(n);
  }
  else unknown.push("alignments");
  if (input.requests) rows.push(...declinedNeeds(input.requests, me));
  else if (input.requests === null) unknown.push("requests to agents");
  if (input.apps) rows.push(...appNeeds(input.apps, input.sends ?? undefined, me));
  else unknown.push("apps");
  if (input.sends === null) unknown.push("what Align sent apps");
  return { rows: rankNeeds(rows.map(withWord)), unknown, notices: input.apps ? neverRead(input.apps) : [] };
}

const PHASE_ORDER: NeedPhase[] = ["needs_you", "waiting_on_others", "done"];

/** Phase, then kind order, then oldest first (done: newest first, by time alone), then key, so the order never depends
 *  on the order a read returned. */
export function rankNeeds(rows: Need[]): Need[] {
  return [...rows].sort((x, y) => {
    const ph = PHASE_ORDER.indexOf(x.phase) - PHASE_ORDER.indexOf(y.phase);
    if (ph) return ph;
    const k = KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind);
    if (x.phase !== "done" && k) return k;
    // A row with no recorded time goes last within its kind (the renderer says "time not recorded").
    if (!x.since !== !y.since) return x.since ? -1 : 1;
    const ax = x.since?.at ?? "";
    const ay = y.since?.at ?? "";
    if (ax !== ay) return x.phase === "done" ? ay.localeCompare(ax) : ax.localeCompare(ay);
    if (k) return k;
    return x.key.localeCompare(y.key);
  });
}

export const inPhase = (rows: Need[], p: NeedPhase) => rows.filter((r) => r.phase === p);
