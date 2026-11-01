// Hook handlers for Claude Code and Codex. Hook-safe: imports only node:fs, node:path, node:crypto (via shared/*).
// They read local files only (hot/, injected/, latch/, feeds/, drift/, me.json, config.json), never the network or
// credentials. The one transcript read is the Stop hook's local drift check (D5), which keeps no reply text.
import fs from "node:fs";
import path from "node:path";
import { gitInfo, matchAnchors } from "../shared/anchors.ts";
import {
  boundLimits,
  clean,
  collisionReason,
  crossNote,
  holdReason,
  LIMIT_WORDS,
  limitChange,
  limitsSeen,
  measureKey,
  renderAsksDelta,
  renderAsksGone,
  renderCard,
  renderContextDelta,
  renderDelta,
  renderEnvelope,
  requestAnswerLine,
  requestContext,
  requestNotice,
  requestShortId,
  requestWithdrawnNotice,
  SAFE_REQUESTS,
  type DeltaKind,
} from "../shared/envelope.ts";
import { myTeams, teamAsks } from "../shared/asks.ts";
import { crossing, lastReply } from "../shared/drift.ts";
import { contextGoals, snapshot } from "../shared/goaltree.ts";
import { randomId, readJson, readJsonStrict, removeFile, writeJsonAtomic } from "../shared/fsx.ts";
import { layout, localId, spoolWrite } from "../shared/layout.ts";
import { matchRule, readRules, removeRule, setRule } from "../shared/rules.ts";
import { queueSteering, steeringLine, unsharedNote } from "../shared/steering.ts";
import type { DriftFile, FeedFile, GoalSnapshot, Harness, HoldLatch, HotRequest, HotState, InjectedState, Latch, MeFile, RequestState, TeamAsks } from "../shared/types.ts";
import { CLAIM_MS, collision, commitSubject, crossOverlap, display, editedPaths, podReport, readPath, record, shellWrites, siblingNews, type Act } from "./siblings.ts";

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
  inj.asks_seen = ta ? { team_id: ta.team.id, ids: ta.asks.map((a) => a.id) } : undefined;
}

/**
 * The accepted asks of the bound goal's team changed since they were last put into context (D3): one short note, once.
 * Nothing when the goal has no team or the asks feed has not been fetched yet.
 */
function asksNote(home: string, ws: string, goalId: string, inj: InjectedState): string | null {
  const ta = teamAsks(home, ws, goalId);
  if (!ta) return null;
  const prev = inj.asks_seen && inj.asks_seen.team_id === ta.team.id ? inj.asks_seen.ids : [];
  const ids = ta.asks.map((a) => a.id);
  const added = ta.asks.filter((a) => !prev.includes(a.id));
  // Closed (done, declined, reopened, withdrawn), not merely pushed past the first five by newer ones.
  const removed = prev.filter((id) => !ids.includes(id) && !(ta.accepted_ids || ids).includes(id)).length;
  inj.asks_seen = { team_id: ta.team.id, ids };
  // The person left the goal's team (or was taken out of it): its asks are no longer in this machine's feed, which is
  // not the same as closed (C3-10).
  const member = myTeams(readJson<MeFile>(layout.me(home)), ws).some((t) => t.id === ta.team.id);
  if (removed && !member && !added.length) return renderAsksGone(ta);
  return added.length || removed ? renderAsksDelta(ta, added, removed) : null;
}

/** The drift check is on unless `align config drift off` turned it off. */
function driftOn(home: string): boolean {
  return readJson<{ drift?: boolean }>(layout.config(home))?.drift !== false;
}

/** A drift notice the Stop hook left for this session: shown once to the user, never to the model. */
function takeDrift(home: string, lid: string, hot: HotState | null, inj: InjectedState): string | null {
  const file = readJson<DriftFile>(layout.drift(home, lid));
  if (!file) return null;
  removeFile(layout.drift(home, lid));
  if (!hot?.goal || hot.goal.id !== file.goal_id || !Array.isArray(file.items)) return null;
  const shown = inj.drift_shown || [];
  const items = file.items.filter((i) => !shown.includes(i.limit_id));
  if (!items.length) return null;
  inj.drift_shown = [...shown, ...items.map((i) => i.limit_id)].slice(-50);
  const first = items[0];
  const more = items.length > 1 ? ` (and ${items.length - 1} more of its limits)` : "";
  return `Align: the agent's last reply may conflict with a limit on goal "${clean(file.goal_title, 80)}": ${LIMIT_WORDS[first.type] ?? "Must"} "${clean(first.text, 160)}"${more}. This is a word check on this machine only; nothing was sent or added to the agent's context. \`align config drift off\` turns it off.`;
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

/** Notices about whether this session is shared (started, refused, ended, or its lost workspace back so it can be shared
 *  there again): only the newest of them still holds (C5-3). A workspace this device reaches for the first time is not
 *  one: it says nothing about this session's own share, so a notice that its share ended is still told next to it. */
const SHARE_STATE_NOTICES = ["share_started_", "share_err_", "upload_refused_", "signed_out_", "access_lost_", "workspace_back_"];

/**
 * The notices still worth telling, of those the session has not seen: one about its share's state (the newest, the
 * earlier ones are stale), a "resumed" one only while that resume still holds (a later stop withdrew it, C4-6), and each
 * text once. All of them count as seen.
 */
export function currentNotices(hot: HotState, fresh: HotState["notices"]): HotState["notices"] {
  const kind = (n: { id: string }) => n.id.slice(n.id.indexOf("/") + 1);
  const lastState = fresh.filter((n) => SHARE_STATE_NOTICES.some((k) => kind(n).startsWith(k))).pop();
  const kept = fresh.filter((n) => {
    const k = kind(n);
    if (k.startsWith("resumed_")) return !!hot.resumed && k === `resumed_${hot.resumed}`;
    if (SHARE_STATE_NOTICES.some((p) => k.startsWith(p))) return n === lastState;
    return true;
  });
  return kept.filter((n, i) => !kept.slice(i + 1).some((m) => m.text === n.text));
}

function takeNotices(hot: HotState | null, inj: InjectedState): string | null {
  if (!hot) return null;
  const fresh = hot.notices.filter((n) => !inj.notices_shown.includes(n.id));
  if (!fresh.length) return null;
  inj.notices_shown.push(...fresh.map((n) => n.id));
  const told = currentNotices(hot, fresh);
  return told.length ? told.map((n) => n.text).join("\n") : null;
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

/** A folder rule covers this session: ask the next sync to share it from session start. Forks stay private. */
function autoShare(home: string, harness: Harness, sid: string, cwd: string | null, inj: InjectedState, messages: string[]): boolean {
  const rule = matchRule(readRules(home), cwd);
  if (!rule) return false;
  if (signedOut(home)) {
    // Nothing could reach the server: the session stays private, and the developer hears why (N4).
    messages.push(`Align: this folder is shared with ${rule.workspace_name}, but this machine is signed out of Align, so this session stays private. Run \`align login\` in a terminal, then type \`::align share\` here.`);
    return false;
  }
  spoolWrite(home, {
    type: "command",
    harness,
    native_id: sid,
    cwd,
    command: "share",
    arg: rule.goal_id,
    workspace: rule.workspace_id,
    rule_dir: rule.dir,
    ts: new Date().toISOString(),
  });
  inj.notices_shown.push("anchor");
  const goal = rule.goal_id ? feedGoal(home, rule.workspace_id, rule.goal_id) : null;
  messages.push(
    `Align: shared with ${rule.workspace_name}${goal ? ` for "${goal.title}"` : rule.goal_title ? ` for "${rule.goal_title}"` : ""} (folder rule for ${rule.dir}). Type \`::align unshare\` to keep this session private.`,
  );
  return true;
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
  if (hot?.share?.state === "shared" && hot.goal) {
    const full = source === "startup" || source === "clear" || source === "compact";
    // A resumed session shared again since its context was given (cycle 6) gets the envelope again, as a new goal would.
    const since = hot.share.since;
    const again = !!since && !!inj.share_since && inj.share_since !== since;
    const need = full || ((source === "resume" || source === "fork") && (!sameAsInjected(inj, hot.goal, "shared") || again));
    if (since) inj.share_since = since;
    if (need) {
      const ta = teamAsks(home, hot.share.workspace_id, hot.goal.id);
      context = renderEnvelope(hot.goal, hot.context_goals || [], ta);
      markInjected(inj, hot.goal, "shared");
      markAsks(inj, ta);
      markContext(inj, hot.context_goals);
      inj.context_epoch++;
      reportApplied(home, lid, inj, hot.pending_directives);
    }
    const card = cardFor(home, lid, hot.goal.id, inj, cwd, hot.share.workspace_id);
    if (card) context = context ? `${context}\n${card}` : card;
    const steer = steerOnce(home, lid, source, hot.share.workspace_id, hot.goal.id, inj);
    if (steer) context = context ? `${context}\n${steer}` : steer;
  } else if (!hot?.share && (source === "startup" || source === "clear") && autoShare(home, harness, sid, cwd, inj, messages)) {
    const rule = matchRule(readRules(home), cwd);
    const goal = rule?.goal_id ? feedGoal(home, rule.workspace_id, rule.goal_id) : null;
    if (goal) {
      const related = contextGoals(home, rule!.workspace_id, goal.id);
      const ta = teamAsks(home, rule!.workspace_id, goal.id);
      context = renderEnvelope(goal, related, ta);
      markInjected(inj, goal, "shared");
      markAsks(inj, ta);
      markContext(inj, related);
      inj.context_epoch++;
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
  const notices = takeNotices(hot, inj);
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

/** One context line per hold released since the model saw it blocked (it would otherwise go on thinking it paused). */
function releaseLines(hot: HotState, inj: InjectedState): string[] {
  const told = inj.releases_told || [];
  const fresh = (hot.released_holds || []).filter((r) => !told.includes(r.directive_id));
  if (!fresh.length) return [];
  inj.releases_told = [...told, ...fresh.map((r) => r.directive_id)].slice(-50);
  return fresh.map((r) => `[Align] ${clean(r.by, 50) || "Someone"} released the hold on goal "${clean(r.goal_title, 100)}", so it no longer blocks tools.`);
}

/** A stop lifted from the web since the model was told it was blocked: one context line, once. */
function resumeLine(hot: HotState, inj: InjectedState): string | null {
  if (!hot.resumed || inj.resume_told === hot.resumed) return null;
  inj.resume_told = hot.resumed;
  return "[Align] This session was resumed from its Align workspace, so its tools are no longer blocked. Continue the user's task.";
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
  if (!hot) return null;
  if (!hot.share) {
    // A session whose share failed (or ended) still hears the sync's notices at its next prompt (N5).
    const inj = readInjected(home, lid);
    const notices = takeNotices(hot, inj);
    if (!notices) return null;
    writeInjected(home, lid, inj);
    return { systemMessage: notices };
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
  else if (opened && hot.share.state === "shared") goal = opened.goal;
  if ((hot.share.state === "shared" || hot.share.state === "suspended") && pending) {
    if (inj.consumed_binding !== pending.id) {
      const epochId = randomId("ep_");
      if (pending.goal || !pending.goal_id) inj.opened_epoch = { epoch_id: epochId, goal: pending.goal, at: ts };
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
  let kind: DeltaKind | null = null;
  if (hot.share.state === "shared") {
    if (!goal) kind = inj.goal_id ? "unbound" : null;
    else if (inj.goal_id !== goal.id || inj.share_state !== "shared") kind = "bound";
    else if (inj.goal_version !== goal.version || inj.goal_status !== goal.status) kind = "updated";
  } else if (hot.share.state === "suspended") {
    if (inj.goal_id || inj.share_state === "shared") kind = "unbound";
    goal = null;
  }
  // Shared again (a new share, after the one the model knew ended) toward the goal already in its context: it was
  // never told the session stopped counting, so it is told it counts again (cycle 6). A share the model's context
  // predates the record of is taken as the one it knows.
  const since = hot.share.since;
  if (!kind && hot.share.state === "shared" && goal && since && inj.share_since && inj.share_since !== since) kind = "bound";
  if (hot.share.state === "shared" && since) inj.share_since = since;
  let context: string | null = null;
  if (kind) {
    // A newly bound goal comes with all its limits, as the envelope words them; a version whose limits changed names
    // the first change in the note (the rest come with the next envelope).
    const limits = goal && kind === "updated" ? limitChange(goal, inj.limits_seen) : null;
    context = renderDelta(kind, goal, limits);
    const all = goal && kind === "bound" ? boundLimits(goal) : null;
    if (all) context = `${context}\n${all}`;
    markInjected(inj, kind === "unbound" ? null : goal, hot.share.state);
  }
  if (hot.share.state === "shared" && goal) {
    // A newly bound goal's parents arrive with the bound note; later parent or dependency versions as short notes.
    const notes = kind === "bound" ? (markContext(inj, hot.context_goals), []) : goal.id === hot.goal?.id ? contextNotes(inj, hot.context_goals) : [];
    const asks = asksNote(home, hot.share.workspace_id, goal.id, inj);
    const card = cardFor(home, lid, goal.id, inj, input.cwd || hot.cwd, hot.share.workspace_id);
    const parts = [context, ...notes, asks, card].filter((x): x is string => !!x);
    context = parts.length ? parts.join("\n") : null;
  }
  if (kind || sameAsInjected(inj, goal, hot.share.state)) {
    reportApplied(home, lid, inj, [...hot.pending_directives, ...applied]);
  }
  const req = requestParts(hot, inj, hot.share.state === "shared" && goal ? goal.id : null);
  if (req.context.length) context = [context, ...req.context].filter(Boolean).join("\n");
  const released = releaseLines(hot, inj);
  if (released.length) context = [context, ...released].filter(Boolean).join("\n");
  const resumed = resumeLine(hot, inj);
  if (resumed) context = [context, resumed].filter(Boolean).join("\n");
  const notices = [takeNotices(hot, inj), ...req.notices, takeDrift(home, lid, hot, inj)].filter(Boolean).join("\n") || null;
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
 * limit not yet noticed and leave a notice for the next prompt. Prints nothing (a Stop hook's output would continue the
 * turn), uploads nothing, keeps no reply text.
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
  const known = new Set([...(readInjected(home, lid).drift_shown || []), ...keep.map((i) => i.limit_id)]);
  const open = limits.filter((l) => !known.has(l.id));
  if (!open.length) return;
  const reply = lastReply(input);
  if (!reply) return;
  const hits = open.filter((l) => crossing(l, reply));
  if (!hits.length) return;
  const file: DriftFile = {
    v: 1,
    goal_id: hot.goal.id,
    goal_title: hot.goal.title,
    items: [...keep, ...hits.map((l) => ({ limit_id: l.id, type: l.type, text: l.text }))],
    at: new Date().toISOString(),
  };
  writeJsonAtomic(layout.drift(home, lid), file);
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

const ENDED_WHY = {
  device_signed_out: "this machine signed out of Align",
  access_lost: "this machine no longer has access to its Align workspace",
  sharing_ended: "the Align server no longer has this session's share",
} as const;

/** Why a share ended, when this machine can share the session there again now (C6-2). */
const ENDED_AGAIN: Partial<Record<keyof typeof ENDED_WHY, string>> = {
  device_signed_out: "this machine signed out of Align, and is signed in again now",
  access_lost: "this machine lost access to its Align workspace, and can reach it again now",
};

/**
 * The way out of a latch nothing can lift from the web any more (B6): `align stop-sharing <id>` in a terminal. When the
 * session can be shared there again now (`reshare`), the way the session's own notice gives instead: `::align share`,
 * after which the web can lift it (C6-2). Never both: following `align stop-sharing` makes re-sharing impossible.
 */
function endedNote(ended: keyof typeof ENDED_WHY, lid: string, reshare = false): string {
  const again = reshare ? ENDED_AGAIN[ended] : undefined;
  if (again) return `Its sharing ended (${again}), so the user can share it there again by typing \`::align share\` in this session; once it is shared again, this can be lifted from the web. Until then tools stay blocked.`;
  return `Its sharing has since ended (${ENDED_WHY[ended] ?? ENDED_WHY.sharing_ended}), so this can no longer be lifted from the web: tools stay blocked until the user runs \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal.`;
}

/** The stop deny: the plain wording, or, when the session's sharing ended, how the user gets out. */
export function stopReason(latch: Latch | null, lid: string): string {
  if (!latch?.ended) return DENY_REASON;
  return `Align: this session was stopped from its Align workspace. ${endedNote(latch.ended, lid, !!latch.reshare)} Tell the user and wait for instructions.`;
}

function holdDenyReason(h: HoldLatch | null, lid: string): string {
  const base = holdReason(h);
  return h?.ended ? `${base} ${endedNote(h.ended, lid, !!h.reshare)}` : base;
}

/** The goal-hold latch: a hold file that names a hold, or one that can't be read, blocks every tool (read-only ones too). */
function holdDeny(home: string, lid: string): HookOutput {
  const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
  if (h.state === "absent") return null;
  if (h.state === "ok" && h.value && Array.isArray(h.value.holds) && !h.value.holds.length) return null;
  return denyOutput(holdDenyReason(h.state === "ok" ? h.value : null, lid));
}

/** The deny a crashed PreToolUse emits: the stop wording unless only a goal hold is known for this session. */
export function failureDeny(home: string, harness: Harness, sessionId: string | null): Record<string, unknown> {
  if (!sessionId) return denyOutput();
  const lid = localId(harness, sessionId);
  if (!fs.existsSync(layout.latch(home, lid)) && fs.existsSync(layout.hold(home, lid))) return denyOutput(holdDenyReason(readJson<HoldLatch>(layout.hold(home, lid)), lid));
  return denyOutput(stopReason(readJson<Latch>(layout.latch(home, lid)), lid));
}

/**
 * Fail closed: a latch file that exists but cannot be read denies. The stop latch and the goal-hold latch are
 * independent; a tool runs only when neither blocks it. Otherwise, deliver a pending goal change.
 */
export function preToolUse(home: string, harness: Harness, input: HookInput): HookOutput {
  const sid = input.session_id;
  if (!sid) return anyLatch(home) ? denyOutput() : null;
  const lid = localId(harness, sid);
  const blocked = latchDeny(home, harness, input);
  if (blocked) return blocked;
  const sib = siblingEdits(home, harness, lid, input);
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
  if (!allowed) return denyOutput(latch.state === "ok" ? stopReason(latch.value, lid) : DENY_REASON);
  return holdDeny(home, lid) || feedHoldDeny(home, lid, input.cwd || null);
}

/**
 * A goal hold that has not reached this session yet (cycle 6): the server holds every session bound to a held goal, but
 * a session learns it from a hold directive at a sync, so a folder-rule session bound to a held goal would run tools
 * until its first sync. When the cached goals feed already says the session's goal is held (`allocation.held`) and no
 * hold or release of that goal has reached the session, every tool is denied as a hold (fail closed). The goal is the
 * live share's (the one this hook opened last, until the sync has it) or, for a session a folder rule is sharing that
 * has no share yet, the rule's goal it was given at its start. A release the session got wins over a stale feed.
 */
function feedHoldDeny(home: string, lid: string, cwd: string | null): HookOutput {
  const hot = readHot(home, lid);
  const inj = readInjected(home, lid);
  let ws: string | null = null;
  let goalId: string | null = null;
  const share = hot?.share;
  if (share && (share.state === "shared" || share.state === "pending")) {
    ws = share.workspace_id;
    goalId = inj.opened_epoch ? (inj.opened_epoch.goal?.id ?? null) : (hot!.goal?.id ?? null);
  } else if (!share && inj.share_state === "shared" && inj.goal_id) {
    const rule = matchRule(readRules(home), cwd || hot?.cwd || null);
    if (rule && rule.goal_id === inj.goal_id) [ws, goalId] = [rule.workspace_id, rule.goal_id];
  }
  if (!ws || !goalId) return null;
  const g = readJson<FeedFile>(layout.feed(home, ws))?.goals?.find((x) => x.id === goalId);
  if (!g?.allocation?.held) return null;
  if ((hot?.released_holds || []).some((r) => r.goal_id === goalId)) return null;
  return denyOutput(`Align: all agents on goal "${clean(g.title, 100)}" were paused from its Align workspace. Work resumes when the hold is released. Your work so far is saved.`);
}

/**
 * Record this shared session's edits and commits for its siblings, and hold an edit to a file another session toward
 * the same goal changed in the last 20 minutes, once, so the agent re-reads it instead of overwriting that work.
 */
function siblingEdits(home: string, harness: Harness, lid: string, input: HookInput): { held?: HookOutput; note?: string } {
  const hot = readHot(home, lid);
  if (hot?.share?.state !== "shared" || !hot.goal) return {};
  const cwd = input.cwd || hot.cwd;
  const files = editedPaths(harness, input.tool_name, input.tool_input, cwd);
  const subject = commitSubject(input.tool_name, input.tool_input);
  const at = new Date().toISOString();
  const hit = collision(home, lid, hot.goal.id, files);
  if (hit) {
    record(home, lid, [{ t: "warned", at, p: hit.file, ref: `${hit.sib.lid}@${hit.at}` }]);
    const reason = collisionReason(hit.sib.hot.harness, hit.sib.hot.native_session_id, display(hit.file, cwd), Math.floor((Date.now() - Date.parse(hit.at)) / 60_000));
    return { held: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } } };
  }
  // Files written through the shell count as edits for the team (never held: one command can't be partly denied).
  const shell = shellWrites(input.tool_name, input.tool_input, cwd).filter((p) => !files.includes(p));
  const acts: Act[] = [...files, ...shell].map((p) => ({ t: "edit", at, p }));
  const read = readPath(harness, input.tool_name, input.tool_input, cwd);
  if (read) acts.push({ t: "read", at, p: read });
  if (subject) acts.push({ t: "commit", at, s: subject });
  // Another person (or a claim) on this file: one note, never a hold, since nothing local gets overwritten.
  const cross = crossOverlap(home, lid, hot.share.workspace_id, hot.goal.id, [...files, ...shell], cwd);
  if (cross) acts.push({ t: "noted", at, ref: cross.ref });
  record(home, lid, acts);
  return cross ? { note: crossNote(cross.who, cross.file, cross.minutes, { goal: cross.goal, claimUntil: cross.claimUntil, task: cross.task, remote: cross.remote }) } : {};
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
};
const stateLabel = (s: RequestState) => STATE_LABELS[s] || s;

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

function holdLine(home: string, lid: string): string {
  const h = readJsonStrict<HoldLatch>(layout.hold(home, lid));
  if (h.state === "absent" || (h.state === "ok" && Array.isArray(h.value?.holds) && !h.value.holds.length)) return "  Goal hold: off";
  if (h.state !== "ok" || !Array.isArray(h.value?.holds)) return "  Goal hold: unreadable (tools blocked)";
  const out = h.value.holds.map((x) => `  Goal hold: on goal "${clean(x.goal_title, 80)}" by ${clean(x.by, 50) || "someone"} (all tools blocked)`);
  if (h.value.ended && h.value.reshare) out.push("  Sharing ended; `::align share` here shares it again, after which the hold can be released from the web");
  else if (h.value.ended) out.push(`  Sharing ended, so no release can reach it: run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal to unblock it`);
  return out.join("\n");
}

function lastSync(home: string): string {
  const d = readJson<{ at: string }>(layout.lastSync(home));
  return d ? `${Math.round((Date.now() - Date.parse(d.at)) / 1000)} s ago` : "never";
}

function feedFor(home: string, hot: HotState | null): FeedFile | null {
  const me = readJson<MeFile>(layout.me(home));
  const ws = hot?.share?.workspace_id || me?.default_workspace || (me?.workspaces?.length === 1 ? me.workspaces[0].id : null);
  return ws ? readJson<FeedFile>(layout.feed(home, ws)) : null;
}

/** Shared, or about to be: a share is pending, or a folder rule covers this folder (the first sync shares it). */
function willShare(home: string, hot: HotState | null, cwd: string | null): boolean {
  if (hot?.share) return hot.share.state === "shared" || hot.share.state === "pending";
  return !!matchRule(readRules(home), cwd);
}

const MULTI_WORKSPACE = "Align: this machine reaches more than one workspace and none is the default, so `::align share` can't tell which. Run `align share --latest --workspace <name>` in a terminal.";

/** No cached goal matches: say when the goals were fetched, and that a goal created moments ago arrives with the next
 *  sync (this command starts one), so trying again shortly works. */
function noCachedGoal(arg: string, feed: FeedFile | null): string {
  const when = feed?.fetched_at ? ` (goals fetched ${Math.max(0, Math.round((Date.now() - Date.parse(feed.fetched_at)) / 1000))} s ago)` : "";
  return `Align: no cached goal matches "${arg}"${when}. A goal created just now arrives with the next sync, which starts now: try again in a few seconds, or run \`align goals --refresh\` in a terminal. \`::align goals\` lists the cached ones.`;
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
      const lines = [
        `Align status (this message stays local; the model does not see it)`,
        `  Sharing:  ${hot?.share ? `${hot.share.state} with ${hot.share.workspace_name}` : "private"}`,
        `  Goal:     ${
          hot?.share?.state === "suspended"
            ? "none (the alignment that set it was revoked; `::align bind <goal>` picks one)"
            : hot?.goal
              ? `${hot.goal.title} (v${hot.goal.version}, ${hot.goal.status})`
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
                ? "on (tools blocked; sharing ended: `::align share` here shares it again, after which it can be resumed from the web)"
                : latch.value.ended
                  ? `on (tools blocked; sharing ended, so run \`align stop-sharing ${lid.slice(0, 8)}\` in a terminal to unblock it)`
                  : "on (tools blocked)"
              : "unreadable (tools blocked)"
        }`,
        holdLine(home, lid),
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
        ...list.map((r) => `  ${requestShortId(r.id)} ${requestLine(r)} [${stateLabel(requestState(r, inj.requests_seen?.[r.id]))}]`),
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
        if (known.length === 1) return `Align: the request ${requestShortId(known[0].id)} is already ${stateLabel(requestState(known[0], inj.requests_seen?.[known[0].id]))}, so it can't be ${answer} now.`;
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
      if (answer === "declined") return `Align: you declined ${who}'s request; ${who} will see that.${seen[r.id].shown ? " The agent hears it at your next prompt." : ""}`;
      if (r.type === "switch_goal" && later) return `Align: you accepted ${who}'s request. This session moves to "${clean(r.target_goal?.title, 100)}" at the first prompt after Align has fetched that goal (the next sync).`;
      if (r.type === "switch_goal") return `Align: you accepted ${who}'s request. From your next prompt this session counts toward "${clean(r.target_goal?.title, 100)}".`;
      return `Align: you accepted ${who}'s request; ${who} will see that. The agent hears it at your next prompt.`;
    }
    case "goals": {
      const feed = feedFor(home, hot);
      if (!feed) return "Align: no cached goals. Run `align goals --refresh` in a terminal.";
      const list = feed.goals.slice(0, 12).map((g) => `  ${g.bindable ? "*" : " "} ${g.title} (${g.id}, v${g.version}, ${g.status})`);
      const age = feed.fetched_at ? `, fetched ${Math.max(0, Math.round((Date.now() - Date.parse(feed.fetched_at)) / 1000))} s ago` : "";
      return [`Align goals in ${feed.workspace_name} (* = you can bind to it now${age}; each sync fetches them again):`, ...list].join("\n");
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
      const feed = feedFor(home, hot);
      // With no workspace of its own, no default and more than one in reach, no goal can be looked up either: say why
      // first, whatever goal was named, rather than that the goal is not cached (C4-7).
      if (!dirMode && !feed && (me.workspaces?.length ?? 0) > 1) return MULTI_WORKSPACE;
      // Shared before (its share ended, say by a sign-out): with no goal named it shares toward the goal it had, while
      // that goal can still be bound (N8).
      const before = !arg && !dirMode && hot?.goal ? feed?.goals.find((g) => g.id === hot.goal!.id && g.bindable && g.status === "active") || null : null;
      const goal = arg && feed ? feed.goals.find((g) => g.id === arg) || feed.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase())) || null : before;
      if (arg && !goal) return noCachedGoal(arg, feed);
      if (dirMode) {
        if (!feed) return "Align: no cached workspace. Run `align goals --refresh` in a terminal.";
        if (!cwd) return "Align: this session has no working folder to share.";
        if (goal && !goal.bindable) return `Align: "${goal.title}" needs an approved alignment before sessions can count toward it.`;
        const dir = gitInfo(cwd)?.toplevel || cwd;
        if (!confirm) {
          return [
            `Align folder share preview (nothing changes yet):`,
            `  Folder: ${dir} (stays on this machine)`,
            `  Every new session started in it is shared with ${feed.workspace_name}${goal ? ` for "${goal.title}"` : " with no goal"}, from its start.`,
            `  ${already ? "This session is already shared." : hot?.prior_share?.stopped ? "This session stays private: its sharing was stopped (or its history deleted)." : "This session is shared too."} Forks stay private. \`::align unshare\` keeps one session private.`,
            `  Sent per session: harness, a keyed repo hash, start time, an epoch, and per-request token counts with model, basis and estimated list cost.`,
            signals
              ? `  Work signals on: repo-relative paths of edited files, commit subjects, task labels and the branch name go to people who can read the goal, kept 24 hours. Never sent: prompts, responses, tool output, file contents.`
              : `  Never sent: prompts, responses, tool input or output, paths, branch names. (Add --signals to share file paths and task labels with the team.)`,
            `Type \`::align share --dir ${signals ? "--signals " : ""}${arg ? `${arg} ` : ""}confirm\` to turn it on.`,
          ].join("\n");
        }
        setRule(home, { dir, workspace_id: feed.workspace_id, workspace_name: feed.workspace_name, goal_id: goal ? goal.id : null, goal_title: goal ? goal.title : null, signals });
        // A session its person stopped sharing (or whose history was deleted) stays private: only `::align share` or
        // `align share` shares it again (C6-1).
        const kept = !already && !!hot?.prior_share?.stopped;
        if (!already && !kept) spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "share", arg: goal ? goal.id : null, workspace: feed.workspace_id, rule_dir: dir, ts });
        const self = already ? "" : kept ? " This session stays private: its sharing was stopped (or its history deleted)." : " This session too; your next prompt carries the goal.";
        return `Align: new sessions in ${dir} are now shared with ${feed.workspace_name}${goal ? ` for "${goal.title}"` : ""}.${self} \`::align unshare --dir\` turns it off.`;
      }
      if (!confirm) {
        // Shared before (its share ended, or its history was deleted since): the new share counts from now, as the sync
        // then shares it (C5-1, C6-1).
        const from = hot?.share || hot?.prior_share ? "now" : "session start";
        return [
          `Align share preview for this session (nothing uploaded yet):`,
          `  Workspace: ${feed?.workspace_name || "your default workspace"}`,
          `  Goal: ${goal ? `${goal.title}${before ? " (the goal it had before)" : ""}` : "none (unallocated)"}; counts from ${from}.`,
          `  Sent: harness, a keyed repo hash, start time, an epoch, and per-request token counts with model, basis and estimated list cost.`,
          `  Never sent: prompts, responses, tool input or output, paths, branch names.`,
          `Type \`::align share ${arg ? `${arg} ` : ""}confirm\` to share.`,
        ].join("\n");
      }
      // The workspace whose goals it read (the one the session had, or the default): a device with two workspaces and
      // no default would otherwise not know which (C3-6).
      spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "share", arg: goal ? goal.id : null, workspace: feed?.workspace_id, ts });
      return goal
        ? `Align: sharing requested toward "${goal.title}". It takes effect within a few seconds; your next prompt carries the goal.`
        : "Align: sharing requested with no goal (its usage counts as unallocated; `::align bind <goal>` picks one). It takes effect within a few seconds.";
    }
    case "unshare":
    case "stop":
      if (/(^|\s)--dir(\s|$)/.test(arg)) {
        const removed = removeRule(home, cwd || "");
        if (!removed) return "Align: no folder rule covers this folder.";
        return `Align: new sessions in ${removed.dir} are private again. Sessions already shared stay shared; \`::align unshare\` stops this one.`;
      }
      spool("unshare", null);
      return "Align: this session will stop sharing. Usage from now on stays on this machine. Shared history is kept until you run `align delete-history`.";
    case "bind": {
      if (!hot?.share) return "Align: this session is not shared. Type `::align share <goal>` first.";
      if (hot.share.state === "stopped") return "Align: this session is no longer shared. Type `::align share <goal>` to share it again.";
      if (!arg) return "Align: usage is `::align bind <goal>`.";
      const feed = feedFor(home, hot);
      const goal = feed ? feed.goals.find((g) => g.id === arg) || feed.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase())) : null;
      if (!goal) return noCachedGoal(arg, feed);
      if (!goal.bindable) return `Align: "${goal.title}" needs an approved alignment before this session can count toward it.`;
      // Recorded here, so the very next prompt opens the epoch even before a sync runs (as `align bind` does).
      const inj = readInjected(home, lid);
      const id = randomId("pb_");
      chooseBinding(hot, inj, { id, goal_id: goal.id, goal: snapshot(goal), cause: "manual", directive_id: null });
      writeInjected(home, lid, inj);
      spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "bind", arg: goal.id, pending_id: id, ts });
      return `Align: from your next prompt this session counts toward "${goal.title}".`;
    }
    case "task": {
      if (!willShare(home, hot, cwd)) return "Align: this session is not shared, so there is no one to tell.";
      if (!arg) return "Align: usage is `::align task <what this session is working on>`.";
      record(home, lid, [{ t: "task", at: ts, s: arg.slice(0, 120) }]);
      return `Align: sessions toward related goals will see this session is on "${arg.slice(0, 120)}".`;
    }
    case "claim": {
      if (!willShare(home, hot, cwd)) return "Align: this session is not shared, so there is no one to tell.";
      if (!arg) return "Align: usage is `::align claim <file> [what for]`.";
      const [file, ...why] = arg.split(/\s+/);
      const abs = path.resolve(cwd || "/", file);
      record(home, lid, [{ t: "claim", at: ts, p: abs, s: why.join(" ").slice(0, 120) || undefined }]);
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
