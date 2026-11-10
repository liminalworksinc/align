// Hook handlers for Claude Code and Codex. Hook-safe: imports only node:fs, node:path, node:crypto (via shared/*).
// They read local files only (hot/, injected/, latch/, feeds/, drift/, me.json, config.json), never the network or
// credentials. The one transcript read is the Stop hook's local drift check (D5), which keeps no reply text.
import fs from "node:fs";
import path from "node:path";
import { gitInfo, matchAnchors } from "../shared/anchors.ts";
import {
  boundLimits,
  clean,
  collisionsReason,
  crossNote,
  endSentence,
  holdReason,
  LIMIT_WORDS,
  limitChange,
  goalMark,
  HELD_MARK,
  keptHoldsNote,
  limitsSeen,
  otherWorkspaceWords,
  expiredWhy,
  outOfReachWords,
  measureKey,
  renderAsksDelta,
  renderAsksGone,
  renderFollowedAsksEnded,
  renderCard,
  renderContextDelta,
  renderDelta,
  renderEnvelope,
  boundContextNote,
  siblingChangeNote,
  requestAnswerLine,
  stoppedForGoodWords,
  requestContext,
  requestNotice,
  requestShortId,
  requestWithdrawnNotice,
  requestWhat,
  SAFE_REQUESTS,
  type DeltaKind,
} from "../shared/envelope.ts";
import { readAsks, teamAsks } from "../shared/asks.ts";
import { crossingDigest, crossings, lastReply } from "../shared/drift.ts";
import { feedHold, feedHoldReason } from "../shared/feedhold.ts";
import { endedWhyWords, latchWayOut, noneTold, SHARE_CHANGED, STOP_HOLDS_NO_SHARE, shareAgainWords, shareNotice, shareRetell, toldSituation, type ReleaseReaches, type ShareAgain, type ShareFacts, type ShareTold } from "../shared/ended.ts";
import { contextGoals, snapshot } from "../shared/goaltree.ts";
import { randomId, readJson, readJsonStrict, removeFile, writeJsonAtomic } from "../shared/fsx.ts";
import { layout, localId, spoolWrite } from "../shared/layout.ts";
import { isShareStateNotice, noticeKind, resumedButHeld } from "../shared/notices.ts";
import { matchRule, readRules, realDir, removeRule, setRule } from "../shared/rules.ts";
import { queueSteering, steeringLine, unsharedNote } from "../shared/steering.ts";
import type { DriftFile, FeedFile, Goal, GoalSnapshot, Harness, HoldLatch, HotRequest, HotState, InjectedState, Latch, MeFile, RequestState, TeamAsks } from "../shared/types.ts";
import { CLAIM_MS, collisions, commitSubject, crossOverlap, display, editedPaths, liveGoalId, podReport, rawActs, readPaths, record, shellWrites, siblingChanges, siblingNews, activityHot, type Act, type StartingShare } from "./siblings.ts";
import { changedSince, COMMIT, commitMade, expectations, explainer, reflogMark, settle, shows, type SettleBy } from "./evidence.ts";
import { markPrivate } from "./private.ts";

export interface HookInput {
  session_id?: string;
  prompt_id?: string;
  turn_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** The harness's id for one tool call, the same at PreToolUse and PostToolUse. */
  tool_use_id?: string;
  model?: string;
  /** Set when a tool event fires inside a Claude Code subagent. */
  agent_id?: string;
  /** Stop: the turn's final reply, when the harness passes it (else it is read from the local transcript). */
  last_assistant_message?: string;
}

export type HookOutput = Record<string, unknown> | null;

const blankInjected = (): InjectedState => ({
  v: 1,
  goal_id: null,
  goal_version: null,
  goal_status: null,
  share_state: null,
  context_epoch: 0,
  consumed_binding: null,
  applied: [],
  notices_shown: [],
  at: new Date(0).toISOString(),
});

function readHot(home: string, lid: string): HotState | null {
  return readJson<HotState>(layout.hot(home, lid));
}

function readInjected(home: string, lid: string): InjectedState {
  return { ...blankInjected(), ...(readJson<InjectedState>(layout.injected(home, lid)) || {}) };
}

function writeInjected(home: string, lid: string, inj: InjectedState): void {
  inj.at = new Date().toISOString();
  inj.applied = inj.applied.slice(-200);
  inj.notices_shown = inj.notices_shown.slice(-200);
  if (inj.requests_seen) inj.requests_seen = Object.fromEntries(Object.entries(inj.requests_seen).slice(-100));
  writeJsonAtomic(layout.injected(home, lid), inj);
}

function markInjected(inj: InjectedState, goal: GoalSnapshot | null, shareState: InjectedState["share_state"]): void {
  inj.goal_id = goal ? goal.id : null;
  inj.goal_version = goal ? goal.version : null;
  inj.goal_status = goal ? goal.status : null;
  inj.share_state = shareState;
  inj.limits_seen = limitsSeen(goal);
}

/** The accepted asks put into context with an envelope; a fresh envelope replaces whatever context held before. */
function markAsks(inj: InjectedState, ta: TeamAsks | null): void {
  inj.asks_seen = ta ? { team_id: ta.team.id, team_name: ta.team.name, ids: ta.asks.map((a) => a.id), member: ta.member !== false } : undefined;
}

/**
 * The session no longer follows the goal of a team the person is not in (its approved alignment ended, or the session
 * moved to another goal or stopped counting), while that team's accepted asks are in its context: told once that they no
 * longer apply to it, honestly (not closed, and never "you are no longer in this team"; E2E acycle1 A1-cross-3).
 */
function followedAsksEnded(home: string, ws: string, inj: InjectedState, goal: GoalSnapshot | null): string | null {
  const seen = inj.asks_seen;
  if (!seen || seen.member !== false || !seen.ids.length) return null;
  const team = goal ? readJson<FeedFile>(layout.feed(home, ws))?.goals?.find((g) => g.id === goal.id)?.team?.id : null;
  if (team === seen.team_id) return null;
  inj.asks_seen = undefined;
  return renderFollowedAsksEnded(seen.team_name || "");
}

/**
 * The accepted asks of the bound goal's team changed since they were last put into context (D3): one short note, once.
 * Nothing when the goal has no team or the asks feed has not been fetched yet.
 */
function asksNote(home: string, ws: string, goalId: string, inj: InjectedState): string | null {
  const ta = teamAsks(home, ws, goalId);
  if (!ta) return null;
  const seen = inj.asks_seen && inj.asks_seen.team_id === ta.team.id ? inj.asks_seen : null;
  const prev = seen ? seen.ids : [];
  const ids = ta.asks.map((a) => a.id);
  const added = ta.asks.filter((a) => !prev.includes(a.id));
  // Gone from the accepted ones, not merely pushed past the first five by newer ones.
  const gone = prev.filter((id) => !ids.includes(id) && !(ta.accepted_ids || ids).includes(id));
  const member = ta.member !== false;
  inj.asks_seen = { team_id: ta.team.id, team_name: ta.team.name, ids, member };
  // Closed (done, reopened, withdrawn): the feed still holds it in another state. An ask the feed no longer holds is
  // closed too, unless the person was in the team and no longer is: then the feed dropped the team's asks, which is not
  // the same as closing them (C3-10). A session that follows a goal of a team the person was never in (an approved
  // alignment) gets that team's accepted asks only while they are accepted, so for it a missing one closed (E2E acycle1
  // A1-cross-3).
  const feed = readAsks(home, ws);
  const inFeed = new Map((feed?.asks || []).map((a) => [a.id, a.state]));
  const left = !member && seen?.member !== false;
  const closed = gone.filter((id) => inFeed.has(id) || !left).length;
  if (gone.length && !closed && !added.length) return renderAsksGone(ta);
  return added.length || closed ? renderAsksDelta(ta, added, closed) : null;
}

/** The drift check is on unless `align config drift off` turned it off. */
function driftOn(home: string): boolean {
  return readJson<{ drift?: boolean }>(layout.config(home))?.drift !== false;
}

/** A drift notice names at most this many limits; the rest wait for the next prompt (still pending, not latched). */
export const DRIFT_PER_PROMPT = 3;
/** A limit is named in at most this many drift notices per session, so a noisy limit can't nag. */
export const DRIFT_PER_LIMIT = 3;

/**
 * A drift notice the Stop hook left for this session: shown to the user, never to the model. It names every limit it
 * covers (up to `DRIFT_PER_PROMPT`; the rest stay pending for the next prompt), and latches only what it named: the
 * digests of the crossing sentences it was about, and one notice toward each limit's per-session cap. A false alarm
 * therefore never silences a later, different crossing of the same limit (E2E acycle2 A2-cross-1, A2-cross-4).
 */
function takeDrift(home: string, lid: string, hot: HotState | null, inj: InjectedState): string | null {
  const file = readJson<DriftFile>(layout.drift(home, lid));
  if (!file) return null;
  removeFile(layout.drift(home, lid));
  if (!hot?.goal || hot.goal.id !== file.goal_id || !Array.isArray(file.items)) return null;
  const count = inj.drift_count || {};
  const seen = new Set(inj.drift_seen || []);
  const items = file.items.filter((i) => (count[i.limit_id] || 0) < DRIFT_PER_LIMIT && (i.digests || []).some((d) => !seen.has(`${i.limit_id}:${d}`)));
  if (!items.length) return null;
  const named = items.slice(0, DRIFT_PER_PROMPT);
  const later = items.slice(DRIFT_PER_PROMPT);
  if (later.length) writeJsonAtomic(layout.drift(home, lid), { ...file, items: later });
  for (const i of named) {
    count[i.limit_id] = (count[i.limit_id] || 0) + 1;
    for (const d of i.digests || []) seen.add(`${i.limit_id}:${d}`);
  }
  inj.drift_count = count;
  inj.drift_seen = [...seen].slice(-200);
  delete inj.drift_shown;
  const quote = (i: DriftFile["items"][number]) => `${LIMIT_WORDS[i.type] ?? "Must"} "${clean(i.text, 160)}"`;
  const what = named.length === 1 ? `a limit on goal "${clean(file.goal_title, 80)}": ${quote(named[0])}` : `${named.length} limits on goal "${clean(file.goal_title, 80)}": ${named.map(quote).join("; ")}`;
  return `${endSentence(`Align: the agent's last reply may conflict with ${what}`)} This is a word check on this machine only; nothing was sent or added to the agent's context. \`align config drift off\` turns it off.`;
}

function sameAsInjected(inj: InjectedState, goal: GoalSnapshot | null, shareState: string): boolean {
  if (inj.share_state !== shareState) return false;
  if (!goal) return inj.goal_id === null;
  return inj.goal_id === goal.id && inj.goal_version === goal.version && inj.goal_status === goal.status;
}

/** Spool `applied` for directives whose effect is now in context, once each. */
function reportApplied(home: string, lid: string, inj: InjectedState, ids: (string | null | undefined)[]): void {
  const fresh = [...new Set(ids.filter((x): x is string => !!x && !inj.applied.includes(x)))];
  if (!fresh.length) return;
  inj.applied.push(...fresh);
  spoolWrite(home, { type: "applied", local_id: lid, directive_ids: fresh, ts: new Date().toISOString() });
}

/** The notices a prompt (or a session start) would tell now, which notice ids that marks as seen, and what the session is
 *  then told about its share (`told`). Pure, so a test can ask what the session would be told without telling it. */
export interface NoticePlan {
  told: HotState["notices"];
  seen: string[];
  share_told: ShareTold | null;
  /** The notices about the share's state among `seen` (`InjectedState.share_seen`). */
  share_seen: string[];
}

/**
 * The notices still worth telling. About the share's state only the newest notice still holds (C5-3, C7-2): it is
 * worded now, from the share's state now (`share_now`, the values its latch files carry), through the same words the
 * deny uses (`shareNotice`), and told when the session has not seen it, or again when its advice changed since it was
 * told (signed in or out, the workspace back or lost again, a release that no longer reaches it); held back, unseen,
 * while the ended shares are not read since this sign-in (E2E-AGENT cycle 11 C11-1 to C11-4). Of the others: a
 * "resumed" one only while that resume still holds (a later stop withdrew it, C4-6), a release only while it holds (a
 * later hold on its goal withdrew it, C14-2), a workspace this device reaches for
 * the first time only while the session has no share of its own (C11-2), and each text once. All count as seen.
 */
export function planNotices(hot: HotState, inj: InjectedState): NoticePlan {
  const unseen = (n: { id: string }) => !inj.notices_shown.includes(n.id);
  const seen: string[] = [];
  const state = hot.notices.filter((n) => n.facts || isShareStateNotice(noticeKind(n.id)));
  const newest = state[state.length - 1];
  let told: HotState["notices"][number] | null = null;
  let shareTold: ShareTold | null = null;
  seen.push(...state.filter((n) => n !== newest && unseen(n)).map((n) => n.id));
  // Never a share-state notice's stored words: one with no facts (an older agent wrote it, whenever that was: a
  // downgrade, or hooks and terminal at different builds after the one-time migration ran) is worded as "its share's
  // state changed", from the state now like any other (E2E-AGENT cycle 13 C13-1); the newer build's hot file gives it
  // (and another build's notices) those facts, with how its share ended as every view reads it (cycle 14 C14-1).
  const facts = newest ? (newest.facts ?? changedFacts(hot)) : null;
  const prev = inj.share_told ?? null;
  if (newest && facts && hot.share_now) {
    const fresh = unseen(newest);
    const changed = facts.e === "changed";
    const toldFacts = prev ? (hot.notices.find((n) => n.id === prev.id)?.facts ?? null) : null;
    const w = shareNotice(hot.local_id, newest.id, facts, hot.share_now, prev, toldFacts);
    if (w !== "hold") {
      if (fresh) seen.push(newest.id);
      // Seen, but by an older hook, which showed its stored text (that only says the sharing changed): told once now,
      // worded as now (E2E-AGENT cycle 12 C12-1).
      const olderHook = !fresh && prev?.id !== newest.id && !(inj.share_seen ?? []).includes(newest.id);
      if (w && (shareRetell(newest.id, w, prev, fresh, changed) || olderHook)) {
        told = { id: newest.id, text: w.text };
        shareTold = { id: newest.id, key: w.key, tail: w.tail };
      } else if (w && changed && (fresh || prev?.id !== newest.id)) {
        // An older build's notice in the situation the session was last told: nothing new, and what it was told stands.
        shareTold = { id: newest.id, key: w.key, tail: prev?.tail ?? w.tail };
      } else if (!w && (fresh || olderHook)) {
        // Nothing to tell about it now (shared again since, say): kept as told with no words, with the situation it is
        // in, so a later change of situation is told.
        shareTold = noneTold(newest.id, hot.share_now);
      }
    }
  } else if (newest && unseen(newest)) {
    // A hot file an older agent wrote, with no state to word it from: only what is true whenever it is shown. What the
    // session was told of its situation before stands (the sentence names none), so the newer build's next hot file
    // tells it when its situation differs from that, or, told none, once from the state then (E2E-AGENT cycle 14 C14-3).
    seen.push(newest.id);
    told = { id: newest.id, text: SHARE_CHANGED };
    shareTold = prev && toldSituation(prev.key) ? { id: newest.id, key: prev.key, tail: prev.tail } : { id: newest.id, key: "changed:neutral", tail: "" };
  }
  const others = hot.notices.filter((n) => !state.includes(n) && unseen(n));
  seen.push(...others.map((n) => n.id));
  const kept = hot.notices.filter((n) => {
    if (n.id === told?.id) return true;
    if (!others.includes(n)) return false;
    const k = noticeKind(n.id);
    if (k.startsWith("resumed_")) return !!hot.resumed && k === `resumed_${hot.resumed}`;
    // A release only while it holds: a later hold on its goal withdrew it (E2E-AGENT cycle 14 C14-2).
    if (k.startsWith("release_") && hot.releases_now) return hot.releases_now.includes(k.slice("release_".length));
    if (k.startsWith("workspace_added_")) return !hot.share;
    return true;
  });
  const words = kept.map((n) => (n.id === told?.id ? told : n));
  return { told: words.filter((n, i) => !words.slice(i + 1).some((m) => m.text === n.text)), seen, share_told: shareTold, share_seen: seen.filter((id) => state.some((n) => n.id === id)) };
}

/** The facts of a notice about a share's state stored with none: only that its state changed, with its workspace and
 *  goal as the hot file has them (C13-1). */
function changedFacts(hot: HotState): ShareFacts {
  return { e: "changed", ws: clean(hot.share?.workspace_name ?? "its workspace", 80), goal: hot.goal ? clean(hot.goal.title, 100) : null };
}

/** `held`: the goal holds that block this session's tools now (`blockingHolds`), so a "resumed" notice told while one
 *  does says the hold still blocks them instead of that the tools work again (C10-3). */
function takeNotices(hot: HotState | null, inj: InjectedState, held: () => BlockingHolds | null = () => null, stopped: () => boolean = () => false): string | null {
  if (!hot) return null;
  const plan = planNotices(hot, inj);
  inj.notices_shown.push(...plan.seen);
  if (plan.share_told) inj.share_told = plan.share_told;
  if (plan.share_seen.length) inj.share_seen = [...(inj.share_seen ?? []), ...plan.share_seen].slice(-100);
  const told = plan.told;
  if (!told.length) return null;
  const blocking = told.some((n) => noticeKind(n.id).startsWith("resumed_")) ? held() : null;
  // A release lifts the hold only: a session also stopped from the web stays blocked, and its user hears so.
  const stop = told.some((n) => noticeKind(n.id).startsWith("release_")) && stopped();
  return told
    .map((n) => (blocking && noticeKind(n.id).startsWith("resumed_") ? resumedButHeld(blocking.titles, "user") : stop && noticeKind(n.id).startsWith("release_") ? `${n.text} ${STILL_STOPPED}` : n.text))
    .join("\n");
}

const STILL_STOPPED = "This session is still stopped from its Align workspace, so its tools stay blocked until it is resumed there.";

/** The session's stop latch says it is stopped now (an unreadable one counts: it blocks tools too). */
function stoppedNow(home: string, lid: string): boolean {
  const l = readJsonStrict<Latch>(layout.latch(home, lid));
  return l.state === "ok" ? l.value?.stopped === true : l.state !== "absent";
}

/** Goal holds blocking a session's tools now: those its hold file names (an unreadable one blocks with no title known),
 *  or one the cached feed shows that has not reached it yet. */
interface BlockingHolds {
  ids: string[];
  titles: string[];
}

function blockingHolds(home: string, lid: string, cwd: string | null): BlockingHolds | null {
  const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
  if (h.state === "ok" && Array.isArray(h.value?.holds) && h.value.holds.length) {
    return { ids: h.value.holds.map((x) => x.goal_id), titles: h.value.holds.map((x) => clean(x.goal_title, 100)) };
  }
  if (h.state !== "absent" && !(h.state === "ok" && Array.isArray(h.value?.holds))) return { ids: [], titles: [] };
  const f = feedHold(home, lid, cwd);
  return f ? { ids: [f.goal_id], titles: [clean(f.goal_title, 100)] } : null;
}

function feeds(home: string): FeedFile[] {
  try {
    return fs
      .readdirSync(layout.feeds(home))
      .filter((f) => f.endsWith(".json"))
      .filter((f) => !f.startsWith("activity-") && !f.startsWith("asks-"))
      .map((f) => readJson<FeedFile>(path.join(layout.feeds(home), f)))
      .filter((f): f is FeedFile => !!f && Array.isArray(f.goals));
  } catch {
    return [];
  }
}

function recentSharedSibling(home: string, cwd: string | null, selfLid: string): HotState | null {
  if (!cwd) return null;
  let names: string[] = [];
  try {
    names = fs.readdirSync(layout.hotDir(home)).slice(0, 500);
  } catch {
    return null;
  }
  const dayAgo = Date.now() - 86_400_000;
  for (const n of names) {
    const h = readJson<HotState>(path.join(layout.hotDir(home), n));
    if (h && h.local_id !== selfLid && h.cwd === cwd && h.share?.state === "shared" && Date.parse(h.updated_at) > dayAgo) return h;
  }
  return null;
}

/** This machine signed out of Align (me.json says so; hooks never read credentials). */
function signedOut(home: string): boolean {
  const me = readJson<MeFile>(layout.me(home));
  return !me || me.signed_out === true;
}

function feedGoal(home: string, ws: string, goalId: string): GoalSnapshot | null {
  const g = readJson<FeedFile>(layout.feed(home, ws))?.goals.find((x) => x.id === goalId);
  if (!g || !g.bindable || g.status !== "active") return null;
  return snapshot(g);
}

/**
 * A folder rule covers this session: ask the next sync to share it from session start. Forks stay private. Returns the
 * share's first epoch, which this hook chooses, so the share the model is told about here is known by its id (cycle 7),
 * or null when it does not ask.
 */
function autoShare(home: string, harness: Harness, sid: string, cwd: string | null, inj: InjectedState, messages: string[]): string | null {
  const rule = matchRule(readRules(home), cwd);
  if (!rule) return null;
  if (signedOut(home)) {
    // Nothing could reach the server: the session stays private, and the developer hears why (N4).
    messages.push(`Align: this folder is shared with ${rule.workspace_name}, but this machine is signed out of Align, so this session stays private. Run \`align login\` in a terminal, then type \`::align share\` here.`);
    return null;
  }
  // The cached goals already say the rule's goal can't be bound by this person (it needs an approved alignment): the
  // sync would refuse the share, so the session stays private and is told so now, never "shared ... for <goal>" first
  // (cycle 9).
  const cached = rule.goal_id ? readJson<FeedFile>(layout.feed(home, rule.workspace_id))?.goals.find((x) => x.id === rule.goal_id) : undefined;
  if (cached && !cached.bindable) {
    inj.notices_shown.push("anchor");
    messages.push(
      `Align: this folder's rule shares sessions with ${rule.workspace_name} for "${clean(cached.title, 100)}" (folder rule for ${rule.dir}), but that goal needs an approved alignment before a session of yours can count toward it, so this session stays private. Once it has one, type \`::align share ${clean(cached.title, 100)}\` here; \`align rules\` shows the rule.`,
    );
    return null;
  }
  const epochId = randomId("ep_");
  spoolWrite(home, {
    type: "command",
    harness,
    native_id: sid,
    cwd,
    command: "share",
    arg: rule.goal_id,
    workspace: rule.workspace_id,
    rule_dir: rule.dir,
    epoch_id: epochId,
    ts: new Date().toISOString(),
  });
  inj.notices_shown.push("anchor");
  const goal = rule.goal_id ? feedGoal(home, rule.workspace_id, rule.goal_id) : null;
  // Until a sync pass makes the share, this stands in for it, so the session's edits are recorded and held, and hold
  // others, from its first tool call (A2-local-7). Written after the spool record, so a pass that started before it
  // read that record.
  try {
    fs.mkdirSync(layout.activityDir(home), { recursive: true, mode: 0o700 });
    const start: StartingShare = { harness, native_session_id: sid, cwd, workspace_id: rule.workspace_id, workspace_name: rule.workspace_name, goal_id: rule.goal_id, at: new Date().toISOString() };
    writeJsonAtomic(layout.activityStarting(home, localId(harness, sid)), start);
  } catch {
    /* the share still comes with the next pass */
  }
  inj.rule_share = { workspace_id: rule.workspace_id, workspace_name: rule.workspace_name, goal_id: rule.goal_id, goal_title: goal?.title ?? rule.goal_title, at: new Date().toISOString() };
  // A goal the cached feed says is held: its tools are blocked from the first call, so the start says so (cycle 11,
  // section 5), as `::align share` toward it does.
  messages.push(
    `Align: shared with ${rule.workspace_name}${goal ? ` for "${goal.title}"` : rule.goal_title ? ` for "${rule.goal_title}"` : ""} (folder rule for ${rule.dir}).${cached ? heldNote(cached) : ""} Type \`::align unshare\` to keep this session private.`,
  );
  return epochId;
}

/**
 * The share the model knows this session counts in (`share_since`), which only a delivered envelope or delta records
 * (cycle 7): a later share (shared again after the one it knew ended) is a new share to tell it about, even toward the
 * goal already in its context. A context given before this was recorded (an older hook) is taken to know the share it
 * matches.
 */
function sharedAgain(inj: InjectedState, hot: HotState, goal: GoalSnapshot | null): boolean {
  const since = hot.share?.since;
  if (!since || hot.share?.state !== "shared" || !goal) return false;
  if (!inj.share_since) {
    if (sameAsInjected(inj, goal, "shared")) inj.share_since = since;
    return false;
  }
  return inj.share_since !== since;
}

// ---------- requests (REQ-002) ----------
/** A request's state as this session knows it: the developer's in-session answer counts before the sync records it. */
function requestState(r: HotRequest, seen: NonNullable<InjectedState["requests_seen"]>[string] | undefined): RequestState {
  if (seen?.answer === "declined" && (r.state === "pending" || r.state === "auto_accepted")) return "declined";
  if (seen?.answer === "accepted" && (r.state === "pending" || (r.state === "auto_accepted" && r.type === "replan"))) return "accepted";
  if (seen?.auto && r.state === "pending") return "auto_accepted";
  return r.state;
}

/**
 * At a prompt (never mid-turn): each new request once, as a user notice plus Align-worded model context; then the
 * developer's answer once as one context line; a withdrawal as one user notice. A request answered or withdrawn before
 * it reached the session tells the model nothing it did not already have.
 */
function requestParts(hot: HotState, inj: InjectedState, boundGoalId: string | null): { context: string[]; notices: string[] } {
  const out = { context: [] as string[], notices: [] as string[] };
  if (!hot.share || hot.share.state === "stopped") return out;
  const seen = (inj.requests_seen = inj.requests_seen || {});
  // An accepted switch_goal is told only once the session has moved to its target goal, never ahead of the binding.
  const moved = (r: HotRequest) => r.type !== "switch_goal" || (!!r.target_goal && boundGoalId === r.target_goal.id);
  for (const r of hot.requests || []) {
    const s = seen[r.id] || {};
    const state = requestState(r, s);
    if (s.told && s.told === state) continue;
    if (state === "accepted" && !moved(r)) {
      seen[r.id] = { ...s, shown: true };
      continue;
    }
    if (state === "withdrawn") {
      if (s.shown) out.notices.push(requestWithdrawnNotice(r));
      seen[r.id] = { ...s, shown: true, told: "withdrawn" };
      continue;
    }
    if (!s.shown) {
      if (state === "pending") {
        out.notices.push(requestNotice(r));
        out.context.push(requestContext(r, boundGoalId));
        seen[r.id] = { ...s, shown: true };
      } else if (state === "accepted") {
        // Accepted from the terminal before the next prompt: the model still needs what a safe request asks for.
        if (r.type !== "switch_goal") out.context.push(requestContext(r, boundGoalId));
        out.context.push(requestAnswerLine(r, "accepted"));
        seen[r.id] = { ...s, shown: true, told: "accepted" };
      } else seen[r.id] = { ...s, shown: true, told: state };
      continue;
    }
    if (state === "accepted" || state === "declined") out.context.push(requestAnswerLine(r, state));
    if (state !== "pending") seen[r.id] = { ...s, told: state };
  }
  return out;
}

/** Context a compact or clear dropped: the model context of each request still waiting for the developer's answer. */
function pendingRequestContext(hot: HotState | null, inj: InjectedState, boundGoalId: string | null): string[] {
  if (!hot?.share || hot.share.state === "stopped") return [];
  return (hot.requests || []).filter((r) => inj.requests_seen?.[r.id]?.shown && requestState(r, inj.requests_seen[r.id]) === "pending").map((r) => requestContext(r, boundGoalId));
}

/** Stop: a checkpoint or replan draft the developer has not declined by the end of the turn it arrived in is reported
 *  as delivered to the agent and not declined (an `accepted` receipt with `auto_accepted`). That says nothing about
 *  what the agent did with it; Align has no agent-reported completion. */
function autoAccept(home: string, lid: string, hot: HotState | null): void {
  if (!hot?.share || !hot.requests?.length) return;
  const inj = readInjected(home, lid);
  let changed = false;
  for (const r of hot.requests) {
    const s = inj.requests_seen?.[r.id];
    if (!s?.shown || !SAFE_REQUESTS.has(r.type) || requestState(r, s) !== "pending") continue;
    spoolWrite(home, { type: "request_answer", local_id: lid, request_id: r.id, answer: "accepted", auto: true, ts: new Date().toISOString() });
    s.auto = true;
    changed = true;
  }
  if (changed) writeInjected(home, lid, inj);
}

// ---------- SessionStart ----------
export function sessionStart(home: string, harness: Harness, input: HookInput, env: NodeJS.ProcessEnv): HookOutput {
  const sid = input.session_id;
  if (!sid) return null;
  const source = input.source || "startup";
  const cwd = input.cwd || null;
  const lid = localId(harness, sid);
  spoolWrite(home, {
    type: "session_start",
    harness,
    native_id: sid,
    source,
    cwd,
    transcript_path: typeof input.transcript_path === "string" ? input.transcript_path : null,
    model: typeof input.model === "string" ? input.model : null,
    api_key_env: harness === "claude-code" ? !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) : !!env.OPENAI_API_KEY,
    cloud_provider_env: harness === "claude-code" && ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"].some((k) => env[k] === "1"),
    ts: new Date().toISOString(),
  });
  const hot = readHot(home, lid);
  const inj = readInjected(home, lid);
  let context: string | null = null;
  const messages: string[] = [];
  let ruleEpoch: string | null = null;
  if (hot?.share?.state === "shared" && hot.goal) {
    const full = source === "startup" || source === "clear" || source === "compact";
    // A resumed session shared again since its context was given (cycles 6, 7) gets the envelope again, as a new goal
    // would.
    const again = sharedAgain(inj, hot, hot.goal);
    const need = full || ((source === "resume" || source === "fork") && (!sameAsInjected(inj, hot.goal, "shared") || again));
    if (need) {
      const ta = teamAsks(home, hot.share.workspace_id, hot.goal.id);
      context = renderEnvelope(hot.goal, hot.context_goals || [], ta);
      markInjected(inj, hot.goal, "shared");
      if (hot.share.since) inj.share_since = hot.share.since;
      markAsks(inj, ta);
      markContext(inj, hot.context_goals);
      inj.context_epoch++;
      reportApplied(home, lid, inj, hot.pending_directives);
    }
    const card = cardFor(home, lid, hot.goal.id, inj, cwd, hot.share.workspace_id);
    if (card) context = context ? `${context}\n${card}` : card;
    const steer = steerOnce(home, lid, source, hot.share.workspace_id, hot.goal.id, inj);
    if (steer) context = context ? `${context}\n${steer}` : steer;
  } else if (!hot?.share && (source === "startup" || source === "clear") && (ruleEpoch = autoShare(home, harness, sid, cwd, inj, messages))) {
    const rule = matchRule(readRules(home), cwd);
    const goal = rule?.goal_id ? feedGoal(home, rule.workspace_id, rule.goal_id) : null;
    if (goal) {
      const related = contextGoals(home, rule!.workspace_id, goal.id);
      const ta = teamAsks(home, rule!.workspace_id, goal.id);
      context = renderEnvelope(goal, related, ta);
      markInjected(inj, goal, "shared");
      // The share this envelope is about: the one the sync makes from this rule, with the epoch chosen here. It may
      // only take effect after this session's prompts (`claude -p`), so no later hook call can record it (cycle 7).
      inj.share_since = ruleEpoch;
      markAsks(inj, ta);
      markContext(inj, related);
      inj.context_epoch++;
      // Held (the cached feed says so): the model hears it with its goal, not first from a deny (cycle 11, section 5).
      const cached = readJson<FeedFile>(layout.feed(home, rule!.workspace_id))?.goals.find((x) => x.id === goal.id);
      if (cached?.allocation?.held) {
        context = `${context}\n${heldContext([goal.title])}`;
        // Told to wait for the hold's release: so the release (or the hold no longer applying) is told to it too
        // (E2E-AGENT cycle 13 C13-2).
        holdsTold(inj, [goal.id], [goal.title]);
      }
      const card = cardFor(home, lid, goal.id, inj, cwd, rule!.workspace_id);
      if (card) context = `${context}\n${card}`;
      const steer = steerOnce(home, lid, source, rule!.workspace_id, goal.id, inj);
      if (steer) context = `${context}\n${steer}`;
    }
  } else if (!hot?.share || hot.share.state === "stopped") {
    if (source === "fork" || source === "clear") {
      const sib = recentSharedSibling(home, cwd, lid);
      if (sib) messages.push(`Align: this ${source === "fork" ? "forked" : "new"} session is private. Type \`::align share\` to share it.`);
    }
    if (source === "startup" && cwd && !inj.notices_shown.includes("anchor")) {
      const info = gitInfo(cwd);
      if (info) {
        for (const f of feeds(home)) {
          const hits = matchAnchors(f.goals, info);
          if (hits.length) {
            messages.push(`Align: this repo matches goal "${hits[0].title}" in ${f.workspace_name}. Type \`::align share ${hits[0].title}\` to share this session toward it.`);
            inj.notices_shown.push("anchor");
            break;
          }
        }
      }
    }
  }
  if (source === "compact" || source === "clear") {
    const again = pendingRequestContext(hot, inj, hot?.goal?.id ?? null);
    if (again.length) context = [context, ...again].filter(Boolean).join("\n");
  }
  const notices = takeNotices(hot, inj, () => blockingHolds(home, lid, cwd), () => stoppedNow(home, lid));
  if (notices) messages.push(notices);
  if (source === "startup") {
    const note = unsharedNote(home);
    if (note) messages.push(note);
  }
  if (!context && !messages.length) {
    if (hot) writeInjected(home, lid, inj);
    return null;
  }
  writeInjected(home, lid, inj);
  const out: Record<string, unknown> = {};
  if (context) out.hookSpecificOutput = { hookEventName: "SessionStart", additionalContext: context };
  if (messages.length) out.systemMessage = messages.join("\n");
  return out;
}

/** The session's one steering line (fresh starts only; never while the session is stopped or held), queued for the
 *  next sync to report. */
function steerOnce(home: string, lid: string, source: string, ws: string, goalId: string, inj: InjectedState): string | null {
  if ((source !== "startup" && source !== "clear") || inj.steering_at) return null;
  if (fs.existsSync(layout.latch(home, lid)) || fs.existsSync(layout.hold(home, lid))) return null;
  const pick = steeringLine(goalId, readJson<FeedFile>(layout.feed(home, ws)));
  if (!pick) return null;
  const at = new Date().toISOString();
  inj.steering_at = at;
  try {
    queueSteering(home, { local_id: lid, workspace_id: ws, goal_id: pick.goal_id, suggested_goal_id: pick.suggested_goal_id, share: pick.share, target: pick.target, at });
  } catch {
    /* counting is best effort; the line still shows */
  }
  return pick.text;
}

/** Cards are rate-limited per session; work that overlaps this session's own files comes through at once. */
const CARD_EVERY_MS = 10 * 60_000;

/** The sibling card for this session, marking what it reports as seen. Null when nothing is new (or too soon). */
function cardFor(home: string, lid: string, goalId: string, inj: InjectedState, cwd: string | null, ws?: string): string | null {
  const news = siblingNews(home, lid, goalId, inj.siblings_seen || {}, cwd, Date.now(), ws);
  if (!news.summaries.length) return null;
  const overlap = news.summaries.some((s) => s.overlap?.length);
  if (!overlap && inj.card_at && Date.now() - Date.parse(inj.card_at) < CARD_EVERY_MS) return null;
  inj.siblings_seen = news.seen;
  inj.card_at = new Date().toISOString();
  return renderCard(news.summaries);
}

/** Notes for parents and dependencies whose version changed since this session last had them in context. */
const measuresOf = (c: NonNullable<HotState["context_goals"]>[number]) => (Array.isArray(c.goal.measures) ? c.goal.measures : []).map(measureKey).slice(0, 10);

function contextNotes(inj: InjectedState, ctx: HotState["context_goals"]): string[] {
  const seen = inj.context_seen || {};
  const before = inj.context_measures || {};
  const out: string[] = [];
  for (const c of ctx || []) {
    if (seen[c.goal.id] === undefined) {
      seen[c.goal.id] = c.goal.version; // first sight comes with the envelope or the bound note
      before[c.goal.id] = measuresOf(c);
      continue;
    }
    if (seen[c.goal.id] !== c.goal.version) {
      out.push(renderContextDelta(c, before[c.goal.id]));
      seen[c.goal.id] = c.goal.version;
      before[c.goal.id] = measuresOf(c);
    }
  }
  inj.context_seen = seen;
  inj.context_measures = before;
  return out;
}

function markContext(inj: InjectedState, ctx: HotState["context_goals"]): void {
  inj.context_seen = { ...(inj.context_seen || {}) };
  inj.context_measures = { ...(inj.context_measures || {}) };
  for (const c of ctx || []) {
    inj.context_seen[c.goal.id] = c.goal.version;
    inj.context_measures[c.goal.id] = measuresOf(c);
  }
}

// ---------- UserPromptSubmit ----------
/**
 * The binding the next prompt opens: one chosen in this session (`::align bind`, `::align accept` of a switch_goal)
 * applies before any sync has recorded it (the sync records the same id); otherwise the one the sync recorded (CLI,
 * directive), unless the developer replaced it in the session since (N1: the sync may not have caught up yet).
 */
function nextBinding(hot: HotState | null, inj: InjectedState): InjectedState["local_binding"] | HotState["pending_binding"] {
  const local = inj.local_binding && inj.consumed_binding !== inj.local_binding.id ? inj.local_binding : null;
  if (local) return local;
  const synced = hot?.pending_binding;
  return synced && !(inj.superseded_bindings || []).includes(synced.id) ? synced : null;
}

/** Record a binding chosen in this session; whatever binding was waiting for the next prompt is replaced by it. */
function chooseBinding(hot: HotState | null, inj: InjectedState, b: NonNullable<InjectedState["local_binding"]>): void {
  const replaced = [nextBinding(hot, inj)?.id, hot?.pending_binding?.id].filter((id): id is string => !!id && id !== inj.consumed_binding);
  inj.superseded_bindings = [...new Set([...(inj.superseded_bindings || []), ...replaced])].slice(-20);
  inj.local_binding = b;
}

/** One context line per hold released since the model saw it block a tool (it would otherwise go on thinking it
 *  paused); a release of a hold it never saw is not told to it, only to the user (cycle 8). */
function releaseLines(hot: HotState, inj: InjectedState): string[] {
  const told = inj.releases_told || [];
  const fresh = (hot.released_holds || []).filter((r) => !told.includes(r.directive_id));
  if (!fresh.length) return [];
  inj.releases_told = [...told, ...fresh.map((r) => r.directive_id)].slice(-50);
  const seen = inj.holds_told || [];
  // A hot file of an older agent names no goal: told when any hold was seen.
  const lines = fresh.filter((r) => (r.goal_id ? seen.includes(r.goal_id) : seen.length > 0));
  inj.holds_told = seen.filter((g) => !fresh.some((r) => r.goal_id === g));
  return lines.map((r) => `[Align] ${clean(r.by, 50) || "Someone"} released the hold on goal "${clean(r.goal_title, 100)}", so it no longer blocks tools.`);
}

/** A stop lifted from the web since the model saw the stop block a tool: one context line, once (a stop it never saw
 *  is not told as lifted to it, only to the user, cycle 8). */
function resumeLine(hot: HotState, inj: InjectedState, held: BlockingHolds | null): string | null {
  if (!hot.resumed || inj.resume_told === hot.resumed) return null;
  inj.resume_told = hot.resumed;
  const saw = !!inj.stop_told;
  delete inj.stop_told;
  if (!saw) return null;
  if (!held) return "[Align] This session was resumed from its Align workspace, so its tools are no longer blocked. Continue the user's task.";
  // A goal hold still blocks them (a resume never lifts one): said so, never "continue", and the hold counts as told to
  // the model, so its release is told to it later (C10-3).
  holdsTold(inj, held.ids, held.titles);
  return resumedButHeld(held.titles, "model");
}

/** Holds on goals `ids` (titled `titles`) were named to the model as blocking its tools, in a context line (the envelope
 *  of a session a folder rule shares toward a held goal, a move that keeps a hold, a resume while held): recorded as a
 *  deny records them (`noteBlockTold`), so their release, or their no longer applying, is told to it, and only then
 *  (C10-3; E2E-AGENT cycle 13 C13-2: told by its envelope, it never heard the release). */
function holdsTold(inj: InjectedState, ids: string[], titles: string[]): void {
  inj.holds_told = [...new Set([...(inj.holds_told || []), ...ids])].slice(-50);
  inj.hold_titles = { ...(inj.hold_titles || {}), ...Object.fromEntries(ids.map((g, i) => [g, clean(titles[i] ?? "", 100)]).filter(([, t]) => t)) };
}

/**
 * Holds the model saw block a tool (`holds_told`) that block it no longer, which no release directive told it about: a
 * hold it saw only in the cached feed that was released before it reached the session (its share still pending, or the
 * machine offline), or one that stopped applying to it (its share stopped since). Without a word the model would go on
 * waiting for instructions while its tools work again: one context line each, once, and, when the cached feed says the
 * hold was released, a notice for the user too (E2E-AGENT cycle 9 C9-3). Run after `releaseLines`, which tells (and
 * forgets) the holds a release directive lifted. A hold file that can't be read still blocks every tool: nothing is told.
 */
function liftedHolds(home: string, lid: string, inj: InjectedState, cwd: string | null): { context: string[]; notices: string[] } {
  const out = { context: [] as string[], notices: [] as string[] };
  const seen = inj.holds_told || [];
  if (!seen.length) return out;
  const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
  if (h.state !== "absent" && !(h.state === "ok" && Array.isArray(h.value?.holds))) return out;
  const held = new Set(h.state === "ok" ? h.value.holds.map((x) => x.goal_id) : []);
  const fromFeed = feedHold(home, lid, cwd)?.goal_id ?? null;
  const gone = seen.filter((g) => !held.has(g) && g !== fromFeed);
  if (!gone.length) return out;
  const titles = { ...(inj.hold_titles || {}) };
  const cached = feeds(home).flatMap((f) => f.goals);
  for (const g of gone) {
    const title = titles[g];
    delete titles[g];
    // Seen by an older hook, which kept no title: forgotten without a line.
    if (!title) continue;
    const goal = cached.find((x) => x.id === g);
    if (goal && !goal.allocation?.held) {
      out.context.push(`[Align] The hold on goal "${clean(title, 100)}" was released, so it no longer blocks tools.`);
      out.notices.push(`Align: the hold on "${clean(title, 100)}" was released, so this session's tools work again.`);
    } else {
      out.context.push(`[Align] The hold on goal "${clean(title, 100)}" no longer applies to this session, so it no longer blocks tools.`);
    }
  }
  inj.holds_told = seen.filter((g) => !gone.includes(g));
  inj.hold_titles = titles;
  return out;
}

/** The model is shown a deny of a tool by the stop latch (`stop`) or by holds on `goals` (`titles`: each one's goal
 *  title): recorded, so their lifting is told to it later, and only then. */
function noteBlockTold(home: string, lid: string, block: { stop?: boolean; goals?: string[]; titles?: Record<string, string> }): void {
  try {
    const inj = readInjected(home, lid);
    const goals = [...new Set([...(inj.holds_told || []), ...(block.goals || [])])];
    const untitled = (block.goals || []).some((g) => block.titles?.[g] && !inj.hold_titles?.[g]);
    if (!(block.stop && !inj.stop_told) && goals.length === (inj.holds_told || []).length && !untitled) return;
    if (block.stop) inj.stop_told = true;
    inj.holds_told = goals.slice(-50);
    const titles = { ...(inj.hold_titles || {}), ...(block.titles || {}) };
    inj.hold_titles = Object.fromEntries(Object.entries(titles).filter(([g]) => inj.holds_told!.includes(g)));
    writeInjected(home, lid, inj);
  } catch {
    /* best effort: a deny never fails on its bookkeeping */
  }
}

export function userPromptSubmit(home: string, harness: Harness, input: HookInput): HookOutput {
  const sid = input.session_id;
  if (!sid) return null;
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const lid = localId(harness, sid);
  if (/^\s*::align\b/i.test(prompt)) {
    return { decision: "block", reason: command(home, harness, sid, input.cwd || null, prompt.trim()) };
  }
  const ts = new Date().toISOString();
  const rootTurn = (harness === "claude-code" ? input.prompt_id : input.turn_id) || input.prompt_id || input.turn_id || `ts:${ts}`;
  spoolWrite(home, { type: "root_turn", harness, native_id: sid, root_turn: rootTurn, cwd: input.cwd || null, ts });
  const hot = readHot(home, lid);
  if (!hot || !hot.share) {
    // A session whose share failed (or ended) still hears the sync's notices at its next prompt (N5); and one a folder
    // rule is sharing that saw the cached feed's hold, that the hold is gone (C9-3).
    const inj = readInjected(home, lid);
    const notices = takeNotices(hot, inj, undefined, () => stoppedNow(home, lid));
    const lifted = liftedHolds(home, lid, inj, input.cwd || hot?.cwd || null);
    const system = [notices, ...lifted.notices].filter(Boolean).join("\n") || null;
    if (!system && !lifted.context.length) return null;
    writeInjected(home, lid, inj);
    const out: Record<string, unknown> = {};
    if (lifted.context.length) out.hookSpecificOutput = { hookEventName: "UserPromptSubmit", additionalContext: lifted.context.join("\n") };
    if (system) out.systemMessage = system;
    return out;
  }
  const inj = readInjected(home, lid);
  let goal: GoalSnapshot | null = hot.goal;
  const applied: (string | null)[] = [];
  const pending = nextBinding(hot, inj);
  // A suspended share takes a new binding too: `::align bind <goal>` is how its user resumes uploading (sync turns
  // the share back to shared when the epoch opens).
  // The epoch this hook opened at an earlier prompt that the sync has not recorded yet: its goal, not the hot file's
  // older one, is the session's goal until then.
  // Dropped once the sync has it, once the share is no longer live (the sync drops the epoch then), or after 10 minutes.
  const opened = inj.opened_epoch;
  if (opened && ((hot.epochs_seen || []).includes(opened.epoch_id) || (hot.share.state !== "shared" && hot.share.state !== "suspended") || Date.now() - Date.parse(opened.at) > 10 * 60_000)) delete inj.opened_epoch;
  else if (opened && (hot.share.state === "shared" || opened.resumed)) goal = opened.goal;
  if ((hot.share.state === "shared" || hot.share.state === "suspended") && pending) {
    if (inj.consumed_binding !== pending.id) {
      const epochId = randomId("ep_");
      if (pending.goal || !pending.goal_id) inj.opened_epoch = { epoch_id: epochId, goal: pending.goal, at: ts, ...(hot.share.state === "suspended" ? { resumed: true } : {}) };
      else delete inj.opened_epoch;
      spoolWrite(home, {
        type: "epoch_open",
        harness,
        native_id: sid,
        local_id: lid,
        epoch_id: epochId,
        goal_id: pending.goal_id,
        starts_at: ts,
        root_turn: rootTurn,
        cause: pending.cause,
        pending_id: pending.id,
        directive_id: pending.directive_id,
        ts,
      });
      inj.consumed_binding = pending.id;
      if (inj.local_binding?.id === pending.id) delete inj.local_binding;
    }
    if (pending.goal || !pending.goal_id) {
      goal = pending.goal;
      applied.push(pending.directive_id);
    }
  }
  // Paused, and this prompt (or one before it the sync has not recorded yet) applied the goal its person picked: the
  // session is on that goal from this turn, so the model hears it now and never reads as unbound meanwhile.
  const resuming = hot.share.state === "suspended" && ((!!pending && (!!pending.goal || !pending.goal_id)) || !!inj.opened_epoch?.resumed);
  const shareState = resuming ? "shared" : hot.share.state;
  let kind: DeltaKind | null = null;
  if (shareState === "shared") {
    if (!goal) kind = inj.goal_id ? "unbound" : null;
    else if (inj.goal_id !== goal.id || inj.share_state !== "shared") kind = "bound";
    else if (inj.goal_version !== goal.version || inj.goal_status !== goal.status) kind = "updated";
  } else if (shareState === "suspended") {
    if (inj.goal_id || inj.share_state === "shared") kind = "unbound";
    goal = null;
  }
  // Shared again (a new share, after the one the model knew ended) toward the goal already in its context: it was
  // never told the session stopped counting, so it is told it counts again, with the goal in full (cycles 6, 7).
  if (kind !== "unbound" && sharedAgain(inj, hot, goal)) kind = "bound";
  // Whatever is told now is told about this share.
  if (kind && shareState === "shared" && hot.share.since) inj.share_since = hot.share.since;
  let context: string | null = null;
  if (kind) {
    // A newly bound goal comes with all its limits, as the envelope words them; a version whose limits changed names
    // the first change in the note, and when it adds more than one, all its limits follow it too: a running session
    // gets the envelope again only at startup, clear or compact (E2E acycle2 A2-cross-3).
    const limits = goal && kind === "updated" ? limitChange(goal, inj.limits_seen) : null;
    context = renderDelta(kind, goal, limits);
    const all = goal && (kind === "bound" || (limits?.added.length ?? 0) > 1) ? boundLimits(goal) : null;
    if (all) context = `${context}\n${all}`;
    // Moved to another goal while a hold on the old one still blocks the tools: the model hears that too, as the user
    // did at `::align bind` (cycle 11, section 5).
    if (goal && kind === "bound") {
      const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
      const kept = h.state === "ok" && Array.isArray(h.value?.holds) ? h.value.holds.filter((x) => x.goal_id !== goal!.id) : [];
      if (kept.length) {
        context = `${context}\n${heldContext(kept.map((x) => x.goal_title), true)}`;
        holdsTold(inj, kept.map((x) => x.goal_id), kept.map((x) => x.goal_title));
      }
    }
    const ended = followedAsksEnded(home, hot.share.workspace_id, inj, kind === "unbound" ? null : goal);
    if (ended) context = `${context}\n${ended}`;
    markInjected(inj, kind === "unbound" ? null : goal, shareState);
  }
  if (shareState === "shared" && goal) {
    // A newly bound goal's parents and dependencies arrive with the bound note (from the cached feed when the hot file
    // still has the goal before a move made in this session); later parent or dependency versions as short notes.
    let notes: string[] = [];
    if (kind === "bound") {
      const related = goal.id === hot.goal?.id ? hot.context_goals || [] : contextGoals(home, hot.share.workspace_id, goal.id);
      markContext(inj, related);
      const line = boundContextNote(related);
      if (line) notes = [line];
    } else if (goal.id === hot.goal?.id) notes = contextNotes(inj, hot.context_goals);
    const asks = asksNote(home, hot.share.workspace_id, goal.id, inj);
    // Which session changed a file this one read or edited: told now, whatever the card's throttle (A1-local-3).
    const changed = changeNotes(home, lid, goal.id, input.cwd || hot.cwd);
    const card = cardFor(home, lid, goal.id, inj, input.cwd || hot.cwd, hot.share.workspace_id);
    const parts = [context, ...notes, asks, ...changed, card].filter((x): x is string => !!x);
    context = parts.length ? parts.join("\n") : null;
  }
  if (kind || sameAsInjected(inj, goal, shareState)) {
    reportApplied(home, lid, inj, [...hot.pending_directives, ...applied]);
  }
  const req = requestParts(hot, inj, shareState === "shared" && goal ? goal.id : null);
  if (req.context.length) context = [context, ...req.context].filter(Boolean).join("\n");
  const released = releaseLines(hot, inj);
  if (released.length) context = [context, ...released].filter(Boolean).join("\n");
  const lifted = liftedHolds(home, lid, inj, input.cwd || hot.cwd);
  if (lifted.context.length) context = [context, ...lifted.context].filter(Boolean).join("\n");
  const held = blockingHolds(home, lid, input.cwd || hot.cwd);
  const resumed = resumeLine(hot, inj, held);
  if (resumed) context = [context, resumed].filter(Boolean).join("\n");
  const notices = [takeNotices(hot, inj, () => held, () => stoppedNow(home, lid)), ...req.notices, ...lifted.notices, takeDrift(home, lid, hot, inj)].filter(Boolean).join("\n") || null;
  writeInjected(home, lid, inj);
  if (!context && !notices) return null;
  const out: Record<string, unknown> = {};
  if (context) out.hookSpecificOutput = { hookEventName: "UserPromptSubmit", additionalContext: context };
  if (notices) out.systemMessage = notices;
  return out;
}

// ---------- Stop ----------
/**
 * Auto-accepts the safe requests delivered this turn (spooled for the sync, which posts the receipt). Then the
 * local drift check (D5): for a shared session bound to a goal with limits, compare the turn's last reply with each
 * limit under its per-session cap and leave a notice for the next prompt for each crossing sentence not told before
 * (its digest, never its text). Prints nothing (a Stop hook's output would continue the turn), uploads nothing, keeps no
 * reply text.
 */
export function stop(home: string, harness: Harness, input: HookInput): void {
  const sid = input.session_id;
  if (!sid) return;
  const lid = localId(harness, sid);
  const hot = readHot(home, lid);
  autoAccept(home, lid, hot);
  if (hot?.share?.state !== "shared" || !hot.goal) return;
  const limits = Array.isArray(hot.goal.limits) ? hot.goal.limits : [];
  if (!limits.length || !driftOn(home)) return;
  const pending = readJson<DriftFile>(layout.drift(home, lid));
  const keep = pending && pending.goal_id === hot.goal.id && Array.isArray(pending.items) ? pending.items : [];
  const inj = readInjected(home, lid);
  const count = inj.drift_count || {};
  const seen = new Set(inj.drift_seen || []);
  const open = limits.filter((l) => (count[l.id] || 0) < DRIFT_PER_LIMIT);
  if (!open.length) return;
  const reply = lastReply(input);
  if (!reply) return;
  const known = { titles: goalTitles(home, hot), texts: limits.map((l) => l.text) };
  const items = keep.map((i) => ({ ...i, digests: [...(i.digests || [])] }));
  let added = false;
  for (const l of open) {
    // Each crossing sentence once per session: one already told (or waiting) is not told again.
    const fresh = crossings(l, reply, known)
      .map((sen) => crossingDigest(l.id, sen))
      .filter((d) => !seen.has(`${l.id}:${d}`));
    if (!fresh.length) continue;
    let item = items.find((i) => i.limit_id === l.id);
    if (!item) items.push((item = { limit_id: l.id, type: l.type, text: l.text, digests: [] }));
    for (const d of fresh) if (!item.digests.includes(d)) (item.digests.push(d), (added = true));
  }
  if (!added) return;
  const file: DriftFile = { v: 1, goal_id: hot.goal.id, goal_title: hot.goal.title, items, at: new Date().toISOString() };
  writeJsonAtomic(layout.drift(home, lid), file);
}

/** Every goal title and measure this session could name (Align's own words, so a reply naming one is no crossing):
 *  its own, related goals', requests' goals and the cached feed's. */
function goalTitles(home: string, hot: HotState): string[] {
  const out = new Set<string>();
  const add = (t: unknown) => typeof t === "string" && t.trim() && out.add(t);
  const measures = (g: { measures?: unknown } | null | undefined) => {
    for (const m of Array.isArray(g?.measures) ? g.measures : []) add((m as { text?: unknown })?.text);
  };
  add(hot.goal?.title);
  measures(hot.goal);
  for (const c of hot.context_goals || []) (add(c.goal?.title), measures(c.goal));
  for (const r of hot.requests || []) {
    add(r.goal?.title);
    add(r.target_goal?.title);
  }
  if (hot.share) for (const g of readJson<FeedFile>(layout.feed(home, hot.share.workspace_id))?.goals || []) (add(g.title), measures(g));
  return [...out].slice(0, 500);
}

// ---------- PreToolUse ----------
const READ_ONLY: Record<Harness, Set<string>> = {
  "claude-code": new Set(["Read", "Glob", "Grep", "LS"]),
  codex: new Set(["update_plan"]),
};

export const DENY_REASON =
  "Align: this session was stopped from its Align workspace. Tools are blocked until it is resumed there. Tell the user and wait for instructions.";

export function denyOutput(reason = DENY_REASON): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

type EndedWhy = NonNullable<Latch["ended"]>;

/**
 * The way out of a latch nothing can lift from the web any more (B6), or, when the session can be shared there again now
 * (`reshare`), the way back (C6-2), with `align sync` first while the ended shares are unread, and, signed out, both
 * ways in one sentence (`more`, cycle 12, section 6): worded by `latchWayOut`, which every notice about a share that ended
 * uses too, so the deny and the notices never give different advice (C9-2). Why it ended is `endedWhyWords`, as
 * `align latch status` says it (a share a replacing `align login` ended never reads as signed out, cycle 13).
 */
function endedNote(ended: EndedWhy, lid: string, reshare = false, release: ReleaseReaches | null = null, more: ShareAgain = {}, relogin = false, stop = false): string {
  if (reshare && ended !== "sharing_ended") return `Its sharing ended (${endedWhyWords(ended, true, relogin)}), so ${latchWayOut(lid, true, "model", null, more)}`;
  const why = endedWhyWords(ended, false, relogin);
  // A hold whose release still reaches it can still be lifted from the web; its stop, if any, can't (C10-4).
  if (release?.goals.length) return `Its sharing has since ended (${why}), so ${latchWayOut(lid, false, "model", release, { lost: ended === "access_lost" }, stop)}`;
  if (more.login) return `Its sharing has since ended (${why}), so ${latchWayOut(lid, false, "model", null, more, stop)}`;
  // A stop holds after its sharing ends (LIM-2441): nothing lifts it from here, and `align stop-sharing` frees only a hold.
  if (stop) return `Its sharing has since ended (${why}), so ${latchWayOut(lid, false, "model", null, { lost: ended === "access_lost" }, true)}`;
  return `Its sharing has since ended (${why}), so this can no longer be lifted from the web: ${latchWayOut(lid, false, "model")}`;
}

/** What a latch file says about sharing its session again besides now (`ShareAgain`). */
const againOf = (l: { unread?: true; login?: true } | null | undefined): ShareAgain => ({ unread: !!l?.unread, login: !!l?.login });

/** What every deny that blocks tools until people act ends with: the model tells the user instead of working around it. */
const TELL_USER = "Tell the user and wait for instructions.";

/** The stop deny: the plain wording, or, when the session's sharing ended, how the user gets out. */
export function stopReason(latch: Latch | null, lid: string): string {
  if (!latch?.ended) return DENY_REASON;
  return `Align: this session was stopped from its Align workspace. ${endedNote(latch.ended, lid, !!latch.reshare, latch.release ?? null, againOf(latch), !!latch.relogin, true)} ${TELL_USER}`;
}

function holdDenyReason(h: HoldLatch | null, lid: string): string {
  const base = holdReason(h);
  return `${h?.ended ? `${base} ${endedNote(h.ended, lid, !!h.reshare, h.release ?? null, againOf(h), !!h.relogin)}` : base} ${TELL_USER}`;
}

/** The goal-hold latch: a hold file that names a hold, or one that can't be read, blocks every tool (read-only ones too). */
function holdDeny(home: string, lid: string): HookOutput {
  const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
  if (h.state === "absent") return null;
  if (h.state === "ok" && h.value && Array.isArray(h.value.holds) && !h.value.holds.length) return null;
  if (h.state === "ok" && h.value && Array.isArray(h.value.holds)) noteBlockTold(home, lid, { goals: h.value.holds.map((x) => x.goal_id), titles: Object.fromEntries(h.value.holds.map((x) => [x.goal_id, x.goal_title])) });
  return denyOutput(holdDenyReason(h.state === "ok" ? h.value : null, lid));
}

/** The deny a crashed PreToolUse emits: the stop wording unless only a goal hold is known for this session. */
export function failureDeny(home: string, harness: Harness, sessionId: string | null): Record<string, unknown> {
  if (!sessionId) return denyOutput();
  const lid = localId(harness, sessionId);
  if (!fs.existsSync(layout.latch(home, lid)) && fs.existsSync(layout.hold(home, lid))) return denyOutput(holdDenyReason(readJson<HoldLatch>(layout.hold(home, lid)), lid));
  return denyOutput(stopReason(readJson<Latch>(layout.latch(home, lid)), lid));
}

/** How the hook was installed: `post`, a Claude Code plugin whose PreToolUse command says `--post-tool-use` installs
 *  PostToolUse too, so an edit counts only once that hook saw its own call run (E2E acycle2 A2-local-1). */
export interface ToolHookOpts {
  post?: boolean;
}

/**
 * Fail closed: a latch file that exists but cannot be read denies. The stop latch and the goal-hold latch are
 * independent; a tool runs only when neither blocks it. Otherwise, deliver a pending goal change.
 */
export function preToolUse(home: string, harness: Harness, input: HookInput, opts: ToolHookOpts = {}): HookOutput {
  const sid = input.session_id;
  if (!sid) return anyLatch(home) ? denyOutput() : null;
  const lid = localId(harness, sid);
  const blocked = latchDeny(home, harness, input);
  if (blocked) return blocked;
  const sib = siblingEdits(home, harness, lid, input, opts);
  if (sib.held) return sib.held;
  // Context from a subagent's tool call reaches only that subagent, so the delta waits for the main agent.
  const delta = input.agent_id ? null : midTurnDelta(home, lid);
  if (!sib.note) return delta;
  const prev = (delta?.hookSpecificOutput as { additionalContext?: string } | undefined)?.additionalContext;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: prev ? `${prev}\n${sib.note}` : sib.note } };
}

/**
 * The stop latch and the goal hold, nothing else: a stopped session may still read (read-only tools), a held one may
 * not; a latch file that can't be read denies. Also what the hooks enforce on an unsupported Node, so a stopped
 * session behaves the same there.
 */
export function latchDeny(home: string, harness: Harness, input: HookInput): HookOutput {
  const sid = input.session_id;
  if (!sid) return anyLatch(home) ? denyOutput() : null;
  const lid = localId(harness, sid);
  const latch = readJsonStrict<Latch>(layout.latch(home, lid));
  const allowed =
    latch.state === "absent" ||
    (latch.state === "ok" && latch.value && latch.value.stopped !== true) ||
    (latch.state === "ok" && !!input.tool_name && READ_ONLY[harness].has(input.tool_name));
  if (!allowed) {
    noteBlockTold(home, lid, { stop: true });
    return denyOutput(latch.state === "ok" ? stopReason(latch.value, lid) : DENY_REASON);
  }
  return holdDeny(home, lid) || feedHoldDeny(home, lid, input.cwd || null);
}

/** A goal hold that has not reached this session yet, from the cached feed (`shared/feedhold.ts`): every tool is denied
 *  as a hold, fail closed (cycle 6). */
function feedHoldDeny(home: string, lid: string, cwd: string | null): HookOutput {
  const h = feedHold(home, lid, cwd);
  if (h) noteBlockTold(home, lid, { goals: [h.goal_id], titles: { [h.goal_id]: h.goal_title } });
  return h ? denyOutput(`${feedHoldReason(h.goal_title, clean)} ${TELL_USER}`) : null;
}

/**
 * Record this shared session's edits, reads and commits for its siblings (with the goal it counts toward now, A1-local-5),
 * and hold an edit to a file another session toward the same goal changed in the last 20 minutes, once, naming every
 * such session (A2-local-4), so the agent re-reads it instead of overwriting that work. Any tool call of the main agent
 * also tells, once, which session changed a file it read or edited (A1-local-3); a subagent's never does, since its
 * context does not reach the main agent (A2-local-3). The goal is the one the session counts toward from its last
 * prompt (A1-local-6); a session a folder rule shared at its start counts from its first call, before any sync pass
 * makes its share (A2-local-7). Each edit and commit carries what will show that its own call made it (A2-local-1, 5).
 */
function siblingEdits(home: string, harness: Harness, lid: string, input: HookInput, opts: ToolHookOpts): { held?: HookOutput; note?: string } {
  const hot = activityHot(home, lid, readHot(home, lid));
  if (hot?.share?.state !== "shared") {
    // Not shared: nothing is recorded, only a local mark that it works in this repo, so the git pass credits its
    // changes to no one (A3-local-2).
    markUnshared(home, harness, lid, input);
    return {};
  }
  const goalId = liveGoalId(hot, readInjected(home, lid));
  if (!goalId) return {};
  const cwd = input.cwd || hot.cwd;
  const agent = typeof input.agent_id === "string" && input.agent_id ? input.agent_id.slice(0, 64) : null;
  // Calls this agent made before this one are over: those still undecided (no PostToolUse came, or none is installed)
  // are decided by their evidence now (A2-local-1, A3-local-4, 5).
  const post = harness === "claude-code" && !!opts.post;
  settleQuietly(home, lid, { by: "hook", agent });
  const files = editedPaths(harness, input.tool_name, input.tool_input, cwd);
  const subject = commitSubject(input.tool_name, input.tool_input);
  const at = new Date().toISOString();
  const g = goalId;
  const hits = collisions(home, lid, goalId, files);
  if (hits.length) {
    record(home, lid, hits.map((h): Act => ({ t: "warned", at, p: h.file, ref: `${h.sib.lid}@${h.at}`, g })));
    const reason = collisionsReason(hits.map((h) => ({ harness: h.sib.hot.harness, id: h.sib.hot.native_session_id, file: display(h.file, cwd), minutesAgo: Math.floor((Date.now() - Date.parse(h.at)) / 60_000) })));
    return { held: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } } };
  }
  const changed = input.agent_id ? [] : changeNotes(home, lid, goalId, cwd);
  // Files written through the shell count as edits for the team (never held: one command can't be partly denied).
  const shell = shellWrites(input.tool_name, input.tool_input, cwd).filter((p) => !files.includes(p));
  // The tool call's id, so its PostToolUse hook (or, without one, its evidence) can confirm it ran (A1-local-1).
  const id = typeof input.tool_use_id === "string" && input.tool_use_id ? input.tool_use_id : (files.length || shell.length || subject) && !post ? randomId("call_") : null;
  const u = id ? { u: id } : {};
  const ag = agent ? { ag: 1 as const, ai: agent } : {};
  // What the files should show afterwards, recorded either way: with PostToolUse installed it decides a shell write by
  // its file's content (A3-local-1) and is the fallback when that hook never comes (A3-local-5); an edit of the same
  // lines by another session is known for what it is (`evidence.ts` `explained`).
  const expect = id ? expectations(harness, input.tool_name, input.tool_input, cwd, files, shell) : null;
  const proof = (p: string) => ({ ...(post && id ? { c: 1 as const } : {}), ...(expect?.get(p) ? { v: expect.get(p)! } : {}) });
  const acts: Act[] = [...files.map((p): Act => ({ t: "edit", at, p, g, ...u, ...proof(p), ...ag })), ...shell.map((p): Act => ({ t: "edit", at, p, g, sh: 1, ...u, ...proof(p), ...ag }))];
  for (const p of readPaths(harness, input.tool_name, input.tool_input, cwd)) acts.push({ t: "read", at, p, g, ...ag });
  // A commit counts once HEAD's reflog has it among the lines logged after this call (A2-local-5, A3-local-6), whatever
  // the command's exit status; its PostToolUse (or PostToolUseFailure) checks, else its evidence.
  if (subject) {
    const mark = cwd ? reflogMark(cwd) : null;
    acts.push({ t: "commit", at, s: subject, g, ...u, ...(post && id ? { c: 1 as const } : {}), ...(cwd ? { d: cwd, ...(mark !== null ? { rl: mark } : {}) } : {}), ...ag });
  }
  // Another person (or a claim) on this file: one note, never a hold, since nothing local gets overwritten.
  const cross = crossOverlap(home, lid, hot.share.workspace_id, goalId, [...files, ...shell], cwd);
  if (cross) acts.push({ t: "noted", at, ref: cross.ref });
  record(home, lid, acts);
  const notes = [...changed, ...(cross ? [crossNote(cross.who, cross.file, cross.minutes, { goal: cross.goal, claimUntil: cross.claimUntil, task: cross.task, remote: cross.remote })] : [])];
  return notes.length ? { note: notes.join("\n") } : {};
}

/** The goal a session counts toward now, recorded with its task labels and claims so they count toward that goal only
 *  (A3-cross-4); null when none is known yet. */
function goalNowOf(home: string, lid: string, hot: HotState | null): string | null {
  const h = activityHot(home, lid, hot);
  return h ? liveGoalId(h, readInjected(home, lid)) : null;
}

/** A session that is not shared works in the repo of its folder and of the files this call writes: a local mark only
 *  (`hooks/private.ts`). */
function markUnshared(home: string, harness: Harness, lid: string, input: HookInput): void {
  try {
    const cwd = input.cwd || null;
    markPrivate(home, lid, cwd, [...editedPaths(harness, input.tool_name, input.tool_input, cwd), ...shellWrites(input.tool_name, input.tool_input, cwd)]);
  } catch {
    /* best effort */
  }
}

/** Decide this session's waiting edits and commits by their evidence (`hooks/evidence.ts`); never fails a hook. */
function settleQuietly(home: string, lid: string, when: SettleBy): void {
  try {
    settle(home, lid, when, (acts) => record(home, lid, acts));
  } catch {
    /* decided by a later hook or pass */
  }
}

/**
 * The turn is over (Stop), a new one starts (UserPromptSubmit) or the session starts again (SessionStart, as after a
 * resume): every tool call before it is done, so a shared session's edits and commits still undecided (no PostToolUse
 * came: refused, or the session was killed or interrupted mid-tool; or none is installed) are decided now by their
 * evidence, those whose evidence is missing as not made (A2-local-1, A3-local-5). An unshared session leaves its local
 * mark (A3-local-2). Prints nothing.
 */
export function settleTurn(home: string, harness: Harness, input: HookInput): void {
  const sid = input.session_id;
  if (!sid) return;
  const lid = localId(harness, sid);
  if (activityHot(home, lid, readHot(home, lid))?.share?.state !== "shared") markUnshared(home, harness, lid, { ...input, tool_name: undefined, tool_input: undefined });
  if (!fs.existsSync(layout.activity(home, lid))) return;
  settleQuietly(home, lid, { by: "final" });
}

/** The sibling-change notes for this session (at most three), each recorded as told so it is never repeated. */
function changeNotes(home: string, lid: string, goalId: string, cwd: string | null): string[] {
  const hits = siblingChanges(home, lid, goalId);
  if (!hits.length) return [];
  const at = new Date().toISOString();
  record(home, lid, hits.map((h): Act => ({ t: "noted", at, p: h.file, ref: `chg:${h.sib.lid}@${h.at}` })));
  return hits.slice(0, 3).map((h) => siblingChangeNote(h.sib.hot.harness, h.sib.hot.native_session_id, display(h.file, cwd), Math.floor((Date.now() - Date.parse(h.at)) / 60_000)));
}

// ---------- PostToolUse ----------
/**
 * Claude Code's PostToolUse (and, for a call that failed, PostToolUseFailure). For a shared session it records, once,
 * that its edits now count only when confirmed, and the verdict on a call that edits or commits: an edit tool's own
 * outcome (`ran`, or `failed` on PostToolUseFailure); for a shell command, whatever its exit status, per file `ran`
 * when the file's content or existence changed since PreToolUse and no other session explains it, and its commit `ran`
 * when HEAD's reflog has it (A3-local-1, 6). An edit refused at the permission prompt fires no hook at all; the
 * session's next hook decides it from its evidence (A1-local-1, A3-local-5). An unshared session leaves its local mark
 * (A3-local-2). Prints nothing.
 */
export function postToolUse(home: string, harness: Harness, input: HookInput, failed: boolean): void {
  const sid = input.session_id;
  if (!sid) return;
  const lid = localId(harness, sid);
  const hot = activityHot(home, lid, readHot(home, lid));
  if (hot?.share?.state !== "shared") {
    markUnshared(home, harness, lid, input);
    return;
  }
  const marker = layout.activityConfirmed(home, lid);
  if (!fs.existsSync(marker)) {
    fs.mkdirSync(layout.activityDir(home), { recursive: true, mode: 0o700 });
    fs.writeFileSync(marker, "", { mode: 0o600 });
  }
  const u = input.tool_use_id;
  if (typeof u !== "string" || !u) return;
  const cwd = input.cwd || hot.cwd;
  const at = new Date().toISOString();
  const acts: Act[] = [];
  // An edit tool reports its own outcome.
  if (editedPaths(harness, input.tool_name, input.tool_input, cwd).length) acts.push({ t: failed ? "failed" : "ran", at, u });
  // A shell command's exit status says nothing about which of its parts ran (A3-local-1, 6): each file it was to write
  // counts when its content (or existence) now differs from what it was at PreToolUse and nothing else explains that,
  // and its commit when HEAD's reflog has it after the call's mark.
  const subject = commitSubject(input.tool_name, input.tool_input);
  if (shellWrites(input.tool_name, input.tool_input, cwd).length || subject) {
    let explains: ((a: Act) => boolean) | null = null;
    for (const a of rawActs(home, lid)) {
      if (a.u !== u) continue;
      if (a.t === "edit" && a.sh && a.p) {
        const made = (a.v ? shows(a.p, a.v) : !failed && changedSince(a)) && !(explains ??= explainer(home, lid))(a);
        acts.push({ t: made ? "ran" : "failed", at, u, p: a.p });
      } else if (a.t === "commit") acts.push({ t: commitMade(a, !failed) ? "ran" : "failed", at, u, p: COMMIT });
    }
  }
  record(home, lid, acts);
}

/**
 * A goal edit or a suspension that arrived during a turn goes into context next to the tool call instead of waiting
 * for the next prompt. Same bytes as the prompt-time delta, and nothing when unchanged. Binding switches still wait
 * for the next prompt, so usage moves to another goal only at a root-turn boundary.
 */
function deltaKind(hot: HotState, inj: InjectedState): DeltaKind | null {
  const share = hot.share;
  if (share?.state === "shared" && hot.goal && inj.share_state === "shared" && inj.goal_id === hot.goal.id) {
    if (inj.goal_version !== hot.goal.version || inj.goal_status !== hot.goal.status) return "updated";
  } else if (share?.state === "suspended" && (inj.goal_id || inj.share_state === "shared")) return "unbound";
  return null;
}

/**
 * Parallel tool calls run their PreToolUse hooks at the same time, and each would see the same undelivered change.
 * Only the hook that creates this lock directory delivers it; a lock older than the hook deadline was left by a hook
 * that died and is taken over.
 */
function claimDelta(home: string, lid: string): (() => void) | null {
  const dir = `${layout.injected(home, lid)}.lock`;
  fs.mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(dir, { mode: 0o700 });
      return () => fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") return null;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(dir).mtimeMs;
      } catch {
        continue; // released meanwhile
      }
      if (age < 2_000) return null;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return null;
}

function contextChanged(hot: HotState, inj: InjectedState): boolean {
  const seen = inj.context_seen || {};
  return (hot.context_goals || []).some((c) => seen[c.goal.id] !== undefined && seen[c.goal.id] !== c.goal.version);
}

function midTurnDelta(home: string, lid: string): HookOutput {
  const hot = readHot(home, lid);
  if (!hot?.share) return null;
  const pre = readInjected(home, lid);
  const own = deltaKind(hot, pre);
  if (!own && !(hot.share.state === "shared" && contextChanged(hot, pre))) return null;
  const release = claimDelta(home, lid);
  if (!release) return null;
  try {
    const inj = readInjected(home, lid); // re-read under the lock: another hook may have just delivered it
    const kind = deltaKind(hot, inj);
    const parts: string[] = [];
    if (kind) {
      const goal = kind === "unbound" ? null : hot.goal;
      parts.push(renderDelta(kind, goal, goal ? limitChange(goal, inj.limits_seen) : null));
      markInjected(inj, goal, hot.share.state);
      reportApplied(home, lid, inj, hot.pending_directives);
    }
    if (hot.share.state === "shared") parts.push(...contextNotes(inj, hot.context_goals));
    if (!parts.length) return null;
    writeInjected(home, lid, inj);
    return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: parts.join("\n") } };
  } finally {
    release();
  }
}

/** After a crash or the deadline in PreToolUse: deny when this session's stop latch or goal hold exists or can't be
 *  ruled out. With no known session (unreadable input), any latch on the machine denies. Another session's latch
 *  never blocks this one. */
export function latchedOnFailure(home: string, harness: Harness, sessionId: string | null): boolean {
  if (!sessionId) return anyLatch(home);
  const lid = localId(harness, sessionId);
  return [layout.latch(home, lid), layout.hold(home, lid)].some((f) => {
    try {
      fs.accessSync(f);
      return true;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code !== "ENOENT";
    }
  });
}

export function anyLatch(home: string): boolean {
  try {
    return fs.readdirSync(layout.latchDir(home)).some((f) => f.endsWith(".json"));
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

// ---------- ::align commands ----------
const STATE_LABELS: Record<RequestState, string> = {
  pending: "waiting for your answer",
  accepted: "accepted by you",
  auto_accepted: "delivered, not declined",
  declined: "declined",
  withdrawn: "withdrawn",
  expired: "expired (this session's share ended)",
};
/** A request's state in the session's words; an expired one says why, as `align requests` does (cycle 14, section 5). */
const stateLabel = (s: RequestState, r?: HotRequest) => (s === "expired" && r ? `expired (${expiredWhy(r as Parameters<typeof expiredWhy>[0])})` : STATE_LABELS[s] || s);

/** One line about a request for people (never model context). */
function requestLine(r: HotRequest): string {
  const what =
    r.type === "switch_goal" ? `switch to "${clean(r.target_goal?.title, 60)}"` : r.type === "checkpoint" ? "checkpoint" : `replan toward "${clean(r.goal?.title, 60)}" v${Math.trunc(Number(r.goal?.version) || 0)}`;
  return `${what}, from ${clean(r.sender?.name, 50) || "someone"}${r.note ? ` (note: "${clean(r.note, 80)}")` : ""}`;
}

/** Requests still open for an answer: waiting, or delivered to the agent, not declined, and still declinable. */
function openRequests(hot: HotState | null, inj: InjectedState): HotRequest[] {
  return (hot?.requests || []).filter((r) => {
    const st = requestState(r, inj.requests_seen?.[r.id]);
    return st === "pending" || st === "auto_accepted";
  });
}

function holdLine(home: string, lid: string, cwd: string | null): string {
  const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
  if (h.state === "absent" || (h.state === "ok" && Array.isArray(h.value?.holds) && !h.value.holds.length)) {
    // A hold the cached feed shows that has not reached the session yet: denied as PreToolUse denies it (cycle 6).
    const f = feedHold(home, lid, cwd);
    return f ? `  Goal hold: on goal "${clean(f.goal_title, 80)}" (held in Align's cached goals; it reaches this session at the next sync) (all tools blocked)` : "  Goal hold: off";
  }
  if (h.state !== "ok" || !Array.isArray(h.value?.holds)) return "  Goal hold: unreadable (tools blocked)";
  const out = h.value.holds.map((x) => `  Goal hold: on goal "${clean(x.goal_title, 80)}" by ${clean(x.by, 50) || "someone"} (all tools blocked)`);
  if (h.value.ended && h.value.reshare) out.push(`  Sharing ended (${endedWhyWords(h.value.ended, true, !!h.value.relogin, true)}); ${shareAgainWords(!!h.value.unread, "here")}, after which the hold can be released from the web`);
  else if (h.value.ended && h.value.login) out.push(`  Sharing ended (this machine signed out): ${latchWayOut(lid, false, "user", null, { login: true })}`);
  else if (h.value.ended && h.value.release?.goals.length) out.push(`  Sharing ended: ${latchWayOut(lid, false, "user", h.value.release)}`);
  else if (h.value.ended) out.push(`  Sharing ended, so no release can reach it: run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal to unblock it`);
  return out.join("\n");
}

function lastSync(home: string): string {
  const d = readJson<{ at: string; error?: string; error_since?: string }>(layout.lastSync(home));
  if (!d) return "never";
  const ago = (at: string) => `${Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000))} s ago`;
  // A pass that could not reach the server still ran: say so, as `align status` does (cycle 11, section 5).
  return d.error ? `${ago(d.at)}; the Align server could not be reached (since ${ago(d.error_since || d.at)}: ${clean(d.error, 160)}), so queued work waits on this machine` : ago(d.at);
}

/**
 * The cached goals of the session's workspace: the one it is (or was) shared with; else, in a folder a rule covers, the
 * rule's workspace while this device reaches it, which a machine with two workspaces and no default could not otherwise
 * tell (C10-2); else the default; else the only one in reach.
 */
function feedFor(home: string, hot: HotState | null, cwd: string | null): FeedFile | null {
  const me = readJson<MeFile>(layout.me(home));
  const rule = hot?.share ? null : matchRule(readRules(home), cwd);
  const ruleWs = rule && (me?.workspaces || []).some((w) => w.id === rule.workspace_id) ? rule.workspace_id : null;
  const ws = hot?.share?.workspace_id || ruleWs || me?.default_workspace || (me?.workspaces?.length === 1 ? me.workspaces[0].id : null);
  return ws ? readJson<FeedFile>(layout.feed(home, ws)) : null;
}

/** Shared, or about to be: a share is pending, or a folder rule covers this folder (the first sync shares it). */
function willShare(home: string, hot: HotState | null, cwd: string | null): boolean {
  if (hot?.share) return hot.share.state === "shared" || hot.share.state === "pending";
  return !!matchRule(readRules(home), cwd);
}

const MULTI_WORKSPACE = "Align: this machine reaches more than one workspace and none is the default, so `::align share` can't tell which. Run `align share --latest --workspace <name>` in a terminal.";

/** `::align share` in a session whose share ended, before this sign-in read which shares their person stopped (C11-1). */
const SHARE_UNREAD =
  "Align: this machine is signed in to Align again, but has not yet heard from the Align server whether this session's sharing was stopped on the web meanwhile (a session stopped there is not shared again), so nothing was asked for. Run `align sync` in a terminal, then type `::align share` here again.";

/** The same for this session in `::align share --dir` (E2E-AGENT cycle 12 C12-3): the rule is made, this session waits. */
const DIR_UNREAD =
  "This session is not shared yet: this machine has not yet heard from the Align server whether its sharing was stopped on the web meanwhile (a session stopped there is not shared again). Run `align sync` in a terminal, then type `::align share` here.";

/**
 * A session whose share a sign-out or a lost workspace ended, while this sign-in has not read which shares their person
 * stopped on the web: no share path asks for it until that is known (`::align share`, C11-1; `::align share --dir`,
 * C12-3), as its notices are held back.
 */
function endedUnread(hot: HotState | null): boolean {
  return hot?.share?.state === "stopped" && !!hot.share_now?.unread && (hot.share.ended === "device_signed_out" || hot.share.ended === "access_lost");
}

/** The same for `::align goals` (C11-6): every workspace's goals are cached, and the terminal lists them by workspace. */
const MULTI_WORKSPACE_GOALS =
  "Align: this machine reaches more than one workspace and none is the default, so `::align goals` can't tell which this session's is. Run `align goals` in a terminal to list each workspace's goals (`align goals --workspace <name>` for one); `align share --latest --workspace <name> --goal <goal>` shares this session in the one you pick.";

/** The cached workspace, other than `except`, with a goal `arg` names (by id or title prefix), and that goal. */
function goalElsewhere(home: string, except: string | null, arg: string): { feed: FeedFile; goal: Goal } | null {
  for (const f of feeds(home)) {
    if (f.workspace_id === except) continue;
    const goal = f.goals.find((g) => g.id === arg) || f.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase()));
    if (goal) return { feed: f, goal };
  }
  return null;
}

/** The same for `::align share --dir`, which can't name a workspace either: the terminal command for this folder (C7-3). */
function multiWorkspaceDir(cwd: string | null): string {
  const dir = cwd ? gitInfo(cwd)?.toplevel || cwd : "<folder>";
  const arg = /\s/.test(dir) ? `"${dir}"` : dir;
  return `Align: this machine reaches more than one workspace and none is the default, so \`::align share --dir\` can't tell which. Run \`align share --dir ${arg} --workspace <name> --goal <goal|none>\` in a terminal.`;
}

/** No cached goal matches: say when the goals were fetched, and that a goal created moments ago arrives with the next
 *  sync (this command starts one), so trying again shortly works. */
function noCachedGoal(arg: string, feed: FeedFile | null): string {
  const when = feed?.fetched_at ? ` (goals fetched ${Math.max(0, Math.round((Date.now() - Date.parse(feed.fetched_at)) / 1000))} s ago)` : "";
  return `Align: no cached goal matches "${arg}"${when}. A goal created just now arrives with the next sync, which starts now: try again in a few seconds, or run \`align goals --refresh\` in a terminal. \`::align goals\` lists the cached ones.`;
}

/** The model's line for goal holds that block this session's tools (`titles`); `moved` after a move to another goal. */
function heldContext(titles: string[], moved = false): string {
  const q = titles.map((t) => `"${clean(t, 100)}"`);
  const which = q.length > 1 ? `the holds on goals ${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}` : `the hold on goal ${q[0]}`;
  return moved
    ? `[Align] ${which.charAt(0).toUpperCase()}${which.slice(1)} still ${q.length > 1 ? "block" : "blocks"} this session's tools until ${q.length > 1 ? "they are" : "it is"} released: moving to another goal does not lift ${q.length > 1 ? "them" : "it"}. Tell the user and wait for instructions.`
    : `[Align] All agents on goal ${q.join(", ")} were paused from its Align workspace (a goal hold), so this session's tools are blocked until the hold is released. Tell the user and wait for instructions.`;
}

/** A goal the cached feed says is held: binding or sharing toward it works, but its tools stay blocked (cycle 7). */
function heldNote(g: { allocation?: { held?: boolean } | null }): string {
  return g.allocation?.held ? " That goal is on hold (all agents on it were paused from its Align workspace), so this session's tools stay blocked until the hold is released." : "";
}

/** The folder rule a new `--dir` rule for `dir` replaces, in words (as `align share --dir` says it). */
function replacedRule(home: string, dir: string): string | null {
  const prev = matchRule(readRules(home), dir);
  if (!prev || prev.dir !== realDir(dir)) return null;
  const title = (prev.goal_id && readJson<FeedFile>(layout.feed(home, prev.workspace_id))?.goals.find((g) => g.id === prev.goal_id)?.title) || prev.goal_title;
  return `${clean(prev.workspace_name, 80)}, ${title ? `"${clean(title, 100)}"` : "no goal"}`;
}

export function command(home: string, harness: Harness, sid: string, cwd: string | null, line: string): string {
  const lid = localId(harness, sid);
  const hot = readHot(home, lid);
  const parts = line.replace(/^\s*::align\s*/i, "").trim();
  const [verbRaw, ...rest] = parts.split(/\s+/);
  const verb = (verbRaw || "status").toLowerCase();
  let arg = rest.join(" ").trim();
  const ts = new Date().toISOString();
  const spool = (command: "share" | "unshare" | "bind", a: string | null) =>
    spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command, arg: a, ts });
  switch (verb) {
    case "status": {
      const inj = readInjected(home, lid);
      const latch = readJsonStrict<Latch>(layout.latch(home, lid));
      // A folder rule's share asked for at the start that the sync has not made yet (its first seconds): on its way, with
      // the goal the model already has, never "private" and "none" next to "In context: goal" (cycle 10, section 5).
      const coming = !hot?.share && inj.rule_share && Date.now() - Date.parse(inj.rule_share.at) < 10 * 60_000 ? inj.rule_share : null;
      const comingGoal = coming?.goal_id ? feedGoal(home, coming.workspace_id, coming.goal_id) : null;
      const lines = [
        `Align status (this message stays local; the model does not see it)`,
        `  Sharing:  ${hot?.share ? `${hot.share.state} with ${hot.share.workspace_name}` : coming ? `pending with ${coming.workspace_name} (folder rule; the next sync shares it)` : "private"}`,
        `  Goal:     ${
          hot?.share?.state === "suspended"
            ? "none (the alignment that set it no longer applies; `::align bind <goal>` picks one)"
            : hot?.goal
              ? `${hot.goal.title} (v${hot.goal.version}, ${hot.goal.status})`
              : comingGoal
                ? `${comingGoal.title} (v${comingGoal.version}, ${comingGoal.status})`
                : coming?.goal_title
                  ? coming.goal_title
                  : "none"
        }`,
        (() => {
          const next = nextBinding(hot, inj);
          return next && inj.consumed_binding !== next.id ? `  Next prompt switches to: ${next.goal ? next.goal.title : "no goal"}` : "";
        })(),
        `  In context: ${inj.goal_id ? `goal v${inj.goal_version}` : "nothing from Align"}`,
        `  Stop latch: ${
          latch.state === "absent"
            ? "off"
            : latch.state === "ok" && latch.value.stopped
              ? latch.value.ended && latch.value.reshare
                ? `on (tools blocked; sharing ended (${endedWhyWords(latch.value.ended, true, !!latch.value.relogin, true)}): ${shareAgainWords(!!latch.value.unread, "here")}, after which it can be resumed from the web)`
                : latch.value.ended && latch.value.login
                  ? `on (tools blocked; sharing ended, this machine signed out: ${latchWayOut(lid, false, "user", null, { login: true }, true)})`
                  : latch.value.ended
                    ? `on (tools blocked; sharing ended, so ${latchWayOut(lid, false, "user", latch.value.release?.goals.length ? latch.value.release : null, { lost: latch.value.ended === "access_lost" }, true)})`
                    : "on (tools blocked)"
              : "unreadable (tools blocked)"
        }`,
        holdLine(home, lid, cwd),
        ...openRequests(hot, inj).map((r) =>
          requestState(r, inj.requests_seen?.[r.id]) === "pending"
            ? `  Request:  ${requestLine(r)}; \`::align accept ${requestShortId(r.id)}\` or \`::align decline ${requestShortId(r.id)}\``
            : r.type === "replan"
              ? `  Request:  ${requestLine(r)}; delivered to the agent to draft a plan, not declined; \`::align accept ${requestShortId(r.id)}\` to agree to its plan or \`::align decline ${requestShortId(r.id)}\``
              : `  Request:  ${requestLine(r)}; delivered to the agent, not declined; \`::align decline ${requestShortId(r.id)}\` to decline it`,
        ),
        `  Last sync: ${lastSync(home)}`,
        hot?.goal?.limits?.length ? `  Limits:   ${hot.goal.limits.length} on this goal; drift notice ${driftOn(home) ? "on" : "off"} (\`align config drift on|off\`)` : "",
        (() => {
          const r = matchRule(readRules(home), cwd);
          if (!r) return "";
          const title = (r.goal_id && readJson<FeedFile>(layout.feed(home, r.workspace_id))?.goals.find((g) => g.id === r.goal_id)?.title) || r.goal_title;
          return `  Folder rule: ${r.dir} shares new sessions with ${r.workspace_name}${title ? ` for "${title}"` : ""}`;
        })(),
      ];
      return lines.filter(Boolean).join("\n");
    }
    case "requests": {
      const list = (hot?.requests || []).slice(-10);
      if (!list.length) return "Align: no requests for this session.";
      const inj = readInjected(home, lid);
      return [
        "Align requests for this session (sent by people who can approve its goal):",
        ...list.map((r) => `  ${requestShortId(r.id)} ${requestLine(r)} [${stateLabel(requestState(r, inj.requests_seen?.[r.id]), r)}]`),
        "Answer with `::align accept <id>` or `::align decline <id>`.",
      ].join("\n");
    }
    case "accept":
    case "decline": {
      const inj = readInjected(home, lid);
      const answer = verb === "accept" ? "accepted" : "declined";
      const open = (hot?.requests || []).filter((r) => {
        const st = requestState(r, inj.requests_seen?.[r.id]);
        return st === "pending" || (st === "auto_accepted" && (answer === "declined" || r.type === "replan"));
      });
      const ref = arg.toLowerCase().replace(/^rq_/, "");
      const hits = ref ? open.filter((r) => r.id.toLowerCase().replace(/^rq_/, "").startsWith(ref)) : open;
      if (!hits.length) {
        const known = ref ? (hot?.requests || []).filter((r) => r.id.toLowerCase().replace(/^rq_/, "").startsWith(ref)) : [];
        if (known.length === 1) return `Align: the request ${requestShortId(known[0].id)} is already ${stateLabel(requestState(known[0], inj.requests_seen?.[known[0].id]), known[0])}, so it can't be ${answer} now.`;
        return ref ? `Align: no open request matches "${arg}". Type \`::align requests\` to list them.` : "Align: no request is waiting for an answer.";
      }
      if (hits.length > 1) return `Align: ${hits.length} requests match; use one of the ids: ${hits.map((r) => requestShortId(r.id)).join(", ")}.`;
      const r = hits[0];
      const who = clean(r.sender?.name, 50) || "the sender";
      // Accepting a switch_goal moves the session at the very next prompt, like `::align bind`: the binding is recorded
      // here from the cached goal, and the sync records the same one with the request's directive as its cause.
      let pendingId: string | undefined;
      let later = false;
      if (answer === "accepted" && r.type === "switch_goal" && r.target_goal && hot?.share) {
        const cached = readJson<FeedFile>(layout.feed(home, hot.share.workspace_id))?.goals.find((g) => g.id === r.target_goal!.id);
        if (cached && (!cached.bindable || cached.status !== "active")) return `Align: goal "${clean(cached.title, 100)}" can no longer be bound; \`::align decline ${requestShortId(r.id)}\` instead.`;
        if (cached && r.directive_id) {
          pendingId = randomId("pb_");
          chooseBinding(hot, inj, { id: pendingId, goal_id: cached.id, goal: snapshot(cached), cause: `directive:${r.directive_id}`, directive_id: null });
        } else later = true;
      }
      spoolWrite(home, { type: "request_answer", local_id: lid, request_id: r.id, answer, auto: false, ...(pendingId ? { pending_id: pendingId } : {}), ts });
      const seen = (inj.requests_seen = inj.requests_seen || {});
      seen[r.id] = { ...(seen[r.id] || {}), answer };
      writeInjected(home, lid, inj);
      // Which request: the model's line names it, and so does this (E2E-AGENT cycle 12, section 6).
      if (answer === "declined") return `Align: you declined ${who}'s request to ${requestWhat(r)} (${requestShortId(r.id)}); ${who} will see that.${seen[r.id].shown ? " The agent hears it at your next prompt." : ""}`;
      // Named as a decline names it: which request, and its short id (E2E-AGENT cycle 13, section 5).
      const which = `${who}'s request to ${requestWhat(r)} (${requestShortId(r.id)})`;
      if (r.type === "switch_goal" && later) return `Align: you accepted ${which}. This session moves to "${clean(r.target_goal?.title, 100)}" at the first prompt after Align has fetched that goal (the next sync).`;
      if (r.type === "switch_goal") return `Align: you accepted ${which}. From your next prompt this session counts toward ${endSentence(`"${clean(r.target_goal?.title, 100)}"`)}`;
      return `Align: you accepted ${which}; ${who} will see that. The agent hears it at your next prompt.`;
    }
    case "goals": {
      const feed = feedFor(home, hot, cwd);
      // No workspace of its own and several in reach with no default: say that, and how to pick one, not that no goals
      // are cached (E2E-AGENT cycle 11 C11-6).
      if (!feed && (readJson<MeFile>(layout.me(home))?.workspaces?.length ?? 0) > 1) return MULTI_WORKSPACE_GOALS;
      if (!feed) return "Align: no cached goals. Run `align goals --refresh` in a terminal.";
      const shown = feed.goals.slice(0, 12);
      const list = shown.map((g) => `  ${goalMark(g)} ${g.title} (${g.id}, v${g.version}, ${g.status})`);
      const age = feed.fetched_at ? `, fetched ${Math.max(0, Math.round((Date.now() - Date.parse(feed.fetched_at)) / 1000))} s ago` : "";
      const held = shown.some((g) => g.bindable && g.allocation?.held) ? [HELD_MARK] : [];
      return [`Align goals in ${feed.workspace_name} (* = you can bind to it now${age}; each sync fetches them again):`, ...list, ...held].join("\n");
    }
    case "share": {
      const dirMode = /(^|\s)--dir(\s|$)/.test(arg);
      arg = arg.replace(/(^|\s)--dir(?=\s|$)/, " ").trim();
      const signals = /(^|\s)--signals(\s|$)/.test(arg);
      arg = arg.replace(/(^|\s)--signals(?=\s|$)/, " ").trim();
      const already = hot?.share && (hot.share.state === "shared" || hot.share.state === "pending");
      if (already && !dirMode) return `Align: this session is already shared with ${hot!.share!.workspace_name}.`;
      const confirm = /\s*(confirm|--yes|-y)$/i.test(arg);
      arg = arg.replace(/\s*(confirm|--yes|-y)$/i, "").trim();
      const me = readJson<MeFile>(layout.me(home));
      if (!me || me.signed_out) return "Align: not signed in on this machine. Run `align login` in a terminal first.";
      // Stopped by its person while it was shared there; not one whose share a sign-out or a lost workspace had ended
      // before `align stop-sharing` freed its tools, which the server shares again.
      // Stopped from its workspace, and its sharing stopped or its history deleted since: the stop holds and it is not
      // shared again (LIM-2441; `stopOutlivesShare`, from the hot file).
      if (
        hot?.share_now?.stopped &&
        (hot.share ? hot.share.state === "stopped" && (hot.share.ended ?? "sharing_ended") === "sharing_ended" : !!hot.prior_share)
      )
        return `Align: ${STOP_HOLDS_NO_SHARE}`;
      if (!dirMode && hot?.share?.state === "stopped" && hot.prior_share?.stopped && (hot.share.ended ?? "sharing_ended") === "sharing_ended") return `Align: ${stoppedForGoodWords(lid, "type `::align share` here")}`;
      // A share a sign-out or a lost workspace ended, while this sign-in has not read which shares their person stopped
      // on the web: one stopped there is never shared again, so nothing is asked for until that is known (C11-1).
      if (!dirMode && endedUnread(hot)) return SHARE_UNREAD;
      // Shared before in a workspace this machine can't reach now (its person was removed from it, say): shared again
      // only there, never into the default workspace, which would file that workspace's work under another (cycle 8).
      const own = hot?.share;
      if (!dirMode && own && !(me.workspaces || []).some((w) => w.id === own.workspace_id)) {
        return `Align: ${outOfReachWords(own.workspace_name, lid, fs.existsSync(layout.latch(home, lid)) || fs.existsSync(layout.hold(home, lid)), fs.existsSync(layout.latch(home, lid)))}`;
      }
      const feed = feedFor(home, hot, cwd);
      // With no workspace of its own, no default and more than one in reach, no goal can be looked up either: say why
      // first, whatever goal was named, rather than that the goal is not cached (C4-7); a folder rule can't tell which
      // either (C7-3).
      if (!feed && (me.workspaces?.length ?? 0) > 1) return dirMode ? multiWorkspaceDir(cwd) : MULTI_WORKSPACE;
      // Shared before (its share ended, say by a sign-out): with no goal named it shares toward the goal it had, while
      // that goal can still be bound (N8).
      const before = !arg && !dirMode && hot?.goal ? feed?.goals.find((g) => g.id === hot.goal!.id && g.bindable && g.status === "active") || null : null;
      // With no goal named, in a folder a rule covers in this workspace: the rule's goal, as a session started there gets
      // (`::align share` in a session that started before the rule), and `--dir` keeps the rule's goal rather than
      // replacing it with none, which `--dir none` asks for (E2E-AGENT cycle 12, section 6).
      const noGoal = dirMode && arg.toLowerCase() === "none";
      if (noGoal) arg = "";
      const rule = !arg && !noGoal && !before && feed ? matchRule(readRules(home), cwd) : null;
      const ruleGoal =
        rule && feed && rule.workspace_id === feed.workspace_id && rule.goal_id && (!dirMode || rule.dir === realDir(gitInfo(cwd || "")?.toplevel || cwd || ""))
          ? feed.goals.find((g) => g.id === rule.goal_id && g.bindable && g.status === "active") || null
          : null;
      const goal = arg && feed ? feed.goals.find((g) => g.id === arg) || feed.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase())) || null : before || ruleGoal;
      if (arg && !goal) {
        // Shared before in its own workspace, which is in reach, and the goal named is another workspace's: it is shared
        // again only there, as the out-of-reach answer says, never "no cached goal matches" (cycle 9).
        const elsewhere = !dirMode && own ? feeds(home).find((f) => f.workspace_id !== own.workspace_id && f.goals.some((g) => g.id === arg || g.title.toLowerCase().startsWith(arg.toLowerCase()))) : undefined;
        if (elsewhere && own) return `Align: ${otherWorkspaceWords(own.workspace_name, elsewhere.workspace_name)}`;
        // Not shared before, and the goal is another cached workspace's: `::align share` shares this session in its
        // folder rule's workspace (or the default), so say which, and the terminal command for the one named (C11-6).
        const other = feed ? goalElsewhere(home, feed.workspace_id, arg) : null;
        if (other && feed) {
          const rule = matchRule(readRules(home), cwd);
          const why = dirMode ? "`::align share --dir` makes a rule for that workspace" : rule && rule.workspace_id === feed.workspace_id ? "this folder's rule shares sessions there" : "it is this machine's default workspace";
          const how = dirMode
            ? `\`align share --dir ${cwd ? gitInfo(cwd)?.toplevel || cwd : "<folder>"} --workspace "${clean(other.feed.workspace_name, 80)}" --goal "${clean(other.goal.title, 100)}"\``
            : `\`align share ${lid.slice(0, 8)} --workspace "${clean(other.feed.workspace_name, 80)}" --goal "${clean(other.goal.title, 100)}"\``;
          return `Align: "${clean(other.goal.title, 100)}" is a goal of ${clean(other.feed.workspace_name, 80)}, and \`::align share\` here shares this session with ${clean(feed.workspace_name, 80)} (${why}). To share it toward that goal, run ${how} in a terminal.`;
        }
        return noCachedGoal(arg, feed);
      }
      // A goal the cached feed says this person can't bind yet: said now, never "sharing requested" and a failure later.
      if (!dirMode && goal && !goal.bindable) return `Align: "${goal.title}" needs an approved alignment before sessions can count toward it.`;
      if (dirMode) {
        if (!feed) return "Align: no cached workspace. Run `align goals --refresh` in a terminal.";
        if (!cwd) return "Align: this session has no working folder to share.";
        if (goal && !goal.bindable) return `Align: "${goal.title}" needs an approved alignment before sessions can count toward it.`;
        const dir = gitInfo(cwd)?.toplevel || cwd;
        const replaces = replacedRule(home, dir);
        if (!confirm) {
          return [
            `Align folder share preview (nothing changes yet):`,
            `  Folder: ${dir} (stays on this machine)`,
            `  Every new session started in it is shared with ${feed.workspace_name}${goal ? ` for "${goal.title}"${goal === ruleGoal ? " (the goal its rule has now; `::align share --dir none` for no goal)" : ""}` : " with no goal"}, from its start.${goal ? heldNote(goal) : ""}`,
            replaces ? `  This replaces the current rule (${replaces}).` : "",
            `  ${already ? "This session is already shared." : hot?.prior_share?.stopped ? "This session stays private: its sharing was stopped (or its history deleted)." : endedUnread(hot) ? DIR_UNREAD : "This session is shared too."} Forks stay private. \`::align unshare\` keeps one session private.`,
            `  Sent per session: harness, a keyed repo hash, start time, an epoch, and per-request token counts with model, basis and estimated list cost.`,
            signals
              ? `  Work signals on: repo-relative paths of edited files, commit subjects, task labels and the branch name go to people who can read the goal, kept 24 hours. Never sent: prompts, responses, tool output, file contents.`
              : `  Never sent: prompts, responses, tool input or output, paths, branch names. (Add --signals to share file paths and task labels with the team.)`,
            `Type \`::align share --dir ${signals ? "--signals " : ""}${noGoal ? "none " : arg ? `${arg} ` : ""}confirm\` to turn it on.`,
          ]
            .filter(Boolean)
            .join("\n");
        }
        setRule(home, { dir, workspace_id: feed.workspace_id, workspace_name: feed.workspace_name, goal_id: goal ? goal.id : null, goal_title: goal ? goal.title : null, signals });
        // A session its person stopped sharing (or whose history was deleted) stays private: only `::align share` or
        // `align share` shares it again (C6-1).
        const kept = !already && !!hot?.prior_share?.stopped;
        // Its share ended, and whether its person stopped it on the web is not read yet: not asked for (C12-3).
        const waits = !already && !kept && endedUnread(hot);
        if (!already && !kept && !waits) spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "share", arg: goal ? goal.id : null, workspace: feed.workspace_id, rule_dir: dir, ts });
        const self = already ? "" : kept ? " This session stays private: its sharing was stopped (or its history deleted)." : waits ? ` ${DIR_UNREAD}` : goal ? " This session too; your next prompt carries the goal." : " This session too, with no goal (its usage counts as unallocated).";
        return `Align: new sessions in ${dir} are now shared with ${feed.workspace_name}${goal ? ` for "${goal.title}"` : ""}.${replaces ? ` This replaces the current rule (${replaces}).` : ""}${self}${goal ? heldNote(goal) : ""} \`::align unshare --dir\` turns it off.`;
      }
      if (!confirm) {
        // Shared before (its share ended, or its history was deleted since): the new share counts from now, as the sync
        // then shares it (C5-1, C6-1).
        const from = hot?.share || hot?.prior_share ? "now" : "session start";
        return [
          `Align share preview for this session (nothing uploaded yet):`,
          `  Workspace: ${feed?.workspace_name || "your default workspace"}`,
          `  Goal: ${goal ? `${goal.title}${before ? " (the goal it had before)" : goal === ruleGoal ? " (this folder's rule's goal)" : ""}` : "none (unallocated)"}; counts from ${from}.${goal ? heldNote(goal) : ""}`,
          `  Sent: harness, a keyed repo hash, start time, an epoch, and per-request token counts with model, basis and estimated list cost.`,
          `  Never sent: prompts, responses, tool input or output, paths, branch names.`,
          `Type \`::align share ${arg ? `${arg} ` : ""}confirm\` to share.`,
        ].join("\n");
      }
      // The workspace whose goals it read (the one the session had, or the default): a device with two workspaces and
      // no default would otherwise not know which (C3-6).
      spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "share", arg: goal ? goal.id : null, workspace: feed?.workspace_id, ts });
      return goal
        ? `Align: sharing requested toward "${goal.title}". The next sync asks the Align server for it (within a few seconds); once it is shared, your next prompt carries the goal.${heldNote(goal)}`
        : "Align: sharing requested with no goal (its usage counts as unallocated; `::align bind <goal>` picks one). The next sync asks the Align server for it (within a few seconds).";
    }
    case "unshare":
    case "stop":
      if (/(^|\s)--dir(\s|$)/.test(arg)) {
        const removed = removeRule(home, cwd || "");
        if (!removed) return "Align: no folder rule covers this folder.";
        return `Align: new sessions in ${removed.dir} are private again. Sessions already shared stay shared; \`::align unshare\` stops this one.`;
      }
      spool("unshare", null);
      {
        // A folder rule's share not made yet is not on its way any more.
        const inj = readInjected(home, lid);
        if (inj.rule_share) {
          delete inj.rule_share;
          writeInjected(home, lid, inj);
        }
      }
      return "Align: this session will stop sharing. Usage from now on stays on this machine. Shared history is kept until you run `align delete-history`.";
    case "bind": {
      if (!hot?.share) return "Align: this session is not shared. Type `::align share <goal>` first.";
      if (hot.share.state === "stopped") return "Align: this session is no longer shared. Type `::align share <goal>` to share it again.";
      if (!arg) return "Align: usage is `::align bind <goal>`.";
      const feed = feedFor(home, hot, cwd);
      const goal = feed ? feed.goals.find((g) => g.id === arg) || feed.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase())) : null;
      // Another workspace's goal: a session counts only toward goals of the workspace it is shared with (C11-6).
      const other = goal ? null : goalElsewhere(home, hot.share.workspace_id, arg);
      if (other) return `Align: "${clean(other.goal.title, 100)}" is a goal of ${clean(other.feed.workspace_name, 80)}, and this session is shared with ${clean(hot.share.workspace_name, 80)}, so it counts only toward ${clean(hot.share.workspace_name, 80)}'s goals. \`::align goals\` lists them.`;
      if (!goal) return noCachedGoal(arg, feed);
      if (!goal.bindable) return `Align: "${goal.title}" isn't a goal you can bind: only your own goals and your team's goals. If an approved alignment lists this session, Align moves it there by itself.`;
      // Recorded here, so the very next prompt opens the epoch even before a sync runs (as `align bind` does).
      const inj = readInjected(home, lid);
      const id = randomId("pb_");
      chooseBinding(hot, inj, { id, goal_id: goal.id, goal: snapshot(goal), cause: "manual", directive_id: null });
      writeInjected(home, lid, inj);
      spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "bind", arg: goal.id, pending_id: id, ts });
      const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
      const kept = h.state === "ok" && Array.isArray(h.value?.holds) ? h.value.holds.filter((x) => x.goal_id !== goal.id).map((x) => x.goal_title) : [];
      return `${endSentence(`Align: from your next prompt this session counts toward "${goal.title}"`)}${heldNote(goal)}${keptHoldsNote(kept)}`;
    }
    case "task": {
      if (!willShare(home, hot, cwd)) return "Align: this session is not shared, so there is no one to tell.";
      if (!arg) return "Align: usage is `::align task <what this session is working on>`.";
      record(home, lid, [{ t: "task", at: ts, s: arg.slice(0, 120), g: goalNowOf(home, lid, hot) }]);
      return endSentence(`Align: sessions toward related goals will see this session is on "${arg.slice(0, 120)}"`);
    }
    case "claim": {
      if (!willShare(home, hot, cwd)) return "Align: this session is not shared, so there is no one to tell.";
      if (!arg) return "Align: usage is `::align claim <file> [what for]`.";
      const [file, ...why] = arg.split(/\s+/);
      const abs = path.resolve(cwd || "/", file);
      record(home, lid, [{ t: "claim", at: ts, p: abs, s: why.join(" ").slice(0, 120) || undefined, g: goalNowOf(home, lid, hot) }]);
      const until = new Date(Date.now() + CLAIM_MS).toTimeString().slice(0, 5);
      return `Align: ${display(abs, cwd)} is claimed by this session until ${until}. Sessions toward related goals get a note before editing it.`;
    }
    case "team":
    case "pod": {
      if (hot?.share?.state !== "shared" || !hot.goal) return "Align: this session is not bound to a goal, so there is no team work to show.";
      return podReport(home, lid, hot.share.workspace_id, hot.goal.id, cwd, 1500);
    }
    default:
      return "Align commands: `::align status`, `::align goals`, `::align share [--dir] [goal]`, `::align bind <goal>`, `::align unshare [--dir]`, `::align task <label>`, `::align claim <file>`, `::align team`, `::align requests`, `::align accept|decline <id>`. They stay local and never reach the model.";
  }
}
