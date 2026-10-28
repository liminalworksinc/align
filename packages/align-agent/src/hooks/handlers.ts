// Hook handlers for Claude Code and Codex. Hook-safe: imports only node:fs, node:path, node:crypto (via shared/*).
// They read local files only (hot/, injected/, latch/, feeds/, me.json), never the network, credentials or transcripts.
import fs from "node:fs";
import path from "node:path";
import { gitInfo, matchAnchors } from "../shared/anchors.ts";
import { collisionReason, crossNote, measureKey, renderCard, renderContextDelta, renderDelta, renderEnvelope, type DeltaKind } from "../shared/envelope.ts";
import { contextGoals } from "../shared/goaltree.ts";
import { randomId, readJson, readJsonStrict, writeJsonAtomic } from "../shared/fsx.ts";
import { layout, localId, spoolWrite } from "../shared/layout.ts";
import { matchRule, readRules, removeRule, setRule } from "../shared/rules.ts";
import { queueSteering, steeringLine, unsharedNote } from "../shared/steering.ts";
import type { FeedFile, GoalSnapshot, Harness, HotState, InjectedState, Latch, MeFile } from "../shared/types.ts";
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
  writeJsonAtomic(layout.injected(home, lid), inj);
}

function markInjected(inj: InjectedState, goal: GoalSnapshot | null, shareState: InjectedState["share_state"]): void {
  inj.goal_id = goal ? goal.id : null;
  inj.goal_version = goal ? goal.version : null;
  inj.goal_status = goal ? goal.status : null;
  inj.share_state = shareState;
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

function takeNotices(hot: HotState | null, inj: InjectedState): string | null {
  if (!hot) return null;
  const fresh = hot.notices.filter((n) => !inj.notices_shown.includes(n.id));
  if (!fresh.length) return null;
  inj.notices_shown.push(...fresh.map((n) => n.id));
  return fresh.map((n) => n.text).join("\n");
}

function feeds(home: string): FeedFile[] {
  try {
    return fs
      .readdirSync(layout.feeds(home))
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson<FeedFile>(path.join(layout.feeds(home), f)))
      .filter((f): f is FeedFile => !!f);
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

function feedGoal(home: string, ws: string, goalId: string): GoalSnapshot | null {
  const g = readJson<FeedFile>(layout.feed(home, ws))?.goals.find((x) => x.id === goalId);
  if (!g || !g.bindable || g.status !== "active") return null;
  return { id: g.id, version: g.version, title: g.title, measures: Array.isArray(g.measures) ? g.measures : [], status: g.status };
}

/** A folder rule covers this session: ask the next sync to share it from session start. Forks stay private. */
function autoShare(home: string, harness: Harness, sid: string, cwd: string | null, inj: InjectedState, messages: string[]): boolean {
  const rule = matchRule(readRules(home), cwd);
  if (!rule) return false;
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
    const need = full || ((source === "resume" || source === "fork") && !sameAsInjected(inj, hot.goal, "shared"));
    if (need) {
      context = renderEnvelope(hot.goal, hot.context_goals || []);
      markInjected(inj, hot.goal, "shared");
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
      context = renderEnvelope(goal, related);
      markInjected(inj, goal, "shared");
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

/** The session's one steering line (fresh starts only), queued for the next sync to report. */
function steerOnce(home: string, lid: string, source: string, ws: string, goalId: string, inj: InjectedState): string | null {
  if ((source !== "startup" && source !== "clear") || inj.steering_at) return null;
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
  if (!hot || !hot.share) return null;
  const inj = readInjected(home, lid);
  let goal: GoalSnapshot | null = hot.goal;
  const applied: (string | null)[] = [];
  const pending = hot.pending_binding;
  if (hot.share.state === "shared" && pending) {
    if (inj.consumed_binding !== pending.id) {
      spoolWrite(home, {
        type: "epoch_open",
        harness,
        native_id: sid,
        local_id: lid,
        epoch_id: randomId("ep_"),
        goal_id: pending.goal_id,
        starts_at: ts,
        root_turn: rootTurn,
        cause: pending.cause,
        pending_id: pending.id,
        directive_id: pending.directive_id,
        ts,
      });
      inj.consumed_binding = pending.id;
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
  let context: string | null = null;
  if (kind) {
    context = renderDelta(kind, goal);
    markInjected(inj, kind === "unbound" ? null : goal, hot.share.state);
  }
  if (hot.share.state === "shared" && goal) {
    // A newly bound goal's parents arrive with the bound note; later parent or dependency versions as short notes.
    const notes = kind === "bound" ? (markContext(inj, hot.context_goals), []) : goal.id === hot.goal?.id ? contextNotes(inj, hot.context_goals) : [];
    const card = cardFor(home, lid, goal.id, inj, input.cwd || hot.cwd, hot.share.workspace_id);
    const parts = [context, ...notes, card].filter((x): x is string => !!x);
    context = parts.length ? parts.join("\n") : null;
  }
  if (kind || sameAsInjected(inj, goal, hot.share.state)) {
    reportApplied(home, lid, inj, [...hot.pending_directives, ...applied]);
  }
  const notices = takeNotices(hot, inj);
  writeInjected(home, lid, inj);
  if (!context && !notices) return null;
  const out: Record<string, unknown> = {};
  if (context) out.hookSpecificOutput = { hookEventName: "UserPromptSubmit", additionalContext: context };
  if (notices) out.systemMessage = notices;
  return out;
}

// ---------- PreToolUse ----------
const READ_ONLY: Record<Harness, Set<string>> = {
  "claude-code": new Set(["Read", "Glob", "Grep", "LS"]),
  codex: new Set(["update_plan"]),
};

export const DENY_REASON =
  "Align: this session was stopped from its Align workspace. Tools are blocked until it is resumed there. Tell the user and wait for instructions.";

export function denyOutput(): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: DENY_REASON } };
}

/** Fail closed: a latch file that exists but cannot be read denies. Otherwise, deliver a pending goal change. */
export function preToolUse(home: string, harness: Harness, input: HookInput): HookOutput {
  const sid = input.session_id;
  if (!sid) return anyLatch(home) ? denyOutput() : null;
  const lid = localId(harness, sid);
  const latch = readJsonStrict<Latch>(layout.latch(home, lid));
  const allowed =
    latch.state === "absent" ||
    (latch.state === "ok" && latch.value && latch.value.stopped !== true) ||
    (latch.state === "ok" && !!input.tool_name && READ_ONLY[harness].has(input.tool_name));
  if (!allowed) return denyOutput();
  const sib = siblingEdits(home, harness, lid, input);
  if (sib.held) return sib.held;
  // Context from a subagent's tool call reaches only that subagent, so the delta waits for the main agent.
  const delta = input.agent_id ? null : midTurnDelta(home, lid);
  if (!sib.note) return delta;
  const prev = (delta?.hookSpecificOutput as { additionalContext?: string } | undefined)?.additionalContext;
  return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: prev ? `${prev}\n${sib.note}` : sib.note } };
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
  // Files written through the shell count as edits for the pod (never held: one command can't be partly denied).
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
      parts.push(renderDelta(kind, goal));
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

export function anyLatch(home: string): boolean {
  try {
    return fs.readdirSync(layout.latchDir(home)).some((f) => f.endsWith(".json"));
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

// ---------- ::align commands ----------
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
        hot?.pending_binding ? `  Next prompt switches to: ${hot.pending_binding.goal ? hot.pending_binding.goal.title : "no goal"}` : "",
        `  In context: ${inj.goal_id ? `goal v${inj.goal_version}` : "nothing from Align"}`,
        `  Stop latch: ${latch.state === "absent" ? "off" : latch.state === "ok" && latch.value.stopped ? "on (tools blocked)" : "unreadable (tools blocked)"}`,
        `  Last sync: ${lastSync(home)}`,
        (() => {
          const r = matchRule(readRules(home), cwd);
          if (!r) return "";
          const title = (r.goal_id && readJson<FeedFile>(layout.feed(home, r.workspace_id))?.goals.find((g) => g.id === r.goal_id)?.title) || r.goal_title;
          return `  Folder rule: ${r.dir} shares new sessions with ${r.workspace_name}${title ? ` for "${title}"` : ""}`;
        })(),
      ];
      return lines.filter(Boolean).join("\n");
    }
    case "goals": {
      const feed = feedFor(home, hot);
      if (!feed) return "Align: no cached goals. Run `align goals --refresh` in a terminal.";
      const list = feed.goals.slice(0, 12).map((g) => `  ${g.bindable ? "*" : " "} ${g.title} (${g.id}, v${g.version}, ${g.status})`);
      return [`Align goals in ${feed.workspace_name} (* = you can bind to it now):`, ...list].join("\n");
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
      if (!me) return "Align: not signed in on this machine. Run `align login` in a terminal first.";
      const feed = feedFor(home, hot);
      const goal = arg && feed ? feed.goals.find((g) => g.id === arg) || feed.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase())) : null;
      if (arg && !goal) return `Align: no cached goal matches "${arg}". Type \`::align goals\` to list them.`;
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
            `  ${already ? "This session is already shared." : "This session is shared too."} Forks stay private. \`::align unshare\` keeps one session private.`,
            `  Sent per session: harness, a keyed repo hash, start time, an epoch, and per-request token counts with model, basis and estimated list cost.`,
            signals
              ? `  Work signals on: repo-relative paths of edited files, commit subjects, task labels and the branch name go to people who can read the goal, kept 24 hours. Never sent: prompts, responses, tool output, file contents.`
              : `  Never sent: prompts, responses, tool input or output, paths, branch names. (Add --signals to share file paths and task labels with the pod.)`,
            `Type \`::align share --dir ${signals ? "--signals " : ""}${arg ? `${arg} ` : ""}confirm\` to turn it on.`,
          ].join("\n");
        }
        setRule(home, { dir, workspace_id: feed.workspace_id, workspace_name: feed.workspace_name, goal_id: goal ? goal.id : null, goal_title: goal ? goal.title : null, signals });
        if (!already) spoolWrite(home, { type: "command", harness, native_id: sid, cwd, command: "share", arg: goal ? goal.id : null, workspace: feed.workspace_id, rule_dir: dir, ts });
        return `Align: new sessions in ${dir} are now shared with ${feed.workspace_name}${goal ? ` for "${goal.title}"` : ""}.${already ? "" : " This session too; your next prompt carries the goal."} \`::align unshare --dir\` turns it off.`;
      }
      if (!confirm) {
        return [
          `Align share preview for this session (nothing uploaded yet):`,
          `  Workspace: ${feed?.workspace_name || "your default workspace"}`,
          `  Goal: ${goal ? goal.title : "none (unallocated)"}; counts from session start.`,
          `  Sent: harness, a keyed repo hash, start time, an epoch, and per-request token counts with model, basis and estimated list cost.`,
          `  Never sent: prompts, responses, tool input or output, paths, branch names.`,
          `Type \`::align share ${arg ? `${arg} ` : ""}confirm\` to share.`,
        ].join("\n");
      }
      spool("share", goal ? goal.id : null);
      return "Align: sharing requested. It takes effect within a few seconds; your next prompt carries the goal.";
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
      if (!arg) return "Align: usage is `::align bind <goal>`.";
      const feed = feedFor(home, hot);
      const goal = feed ? feed.goals.find((g) => g.id === arg) || feed.goals.find((g) => g.title.toLowerCase().startsWith(arg.toLowerCase())) : null;
      if (!goal) return `Align: no cached goal matches "${arg}". Type \`::align goals\` to list them.`;
      if (!goal.bindable) return `Align: "${goal.title}" needs an approved alignment before this session can count toward it.`;
      spool("bind", goal.id);
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
    case "pod": {
      if (hot?.share?.state !== "shared" || !hot.goal) return "Align: this session is not bound to a goal, so there is no pod work to show.";
      return podReport(home, lid, hot.share.workspace_id, hot.goal.id, cwd, 1500);
    }
    default:
      return "Align commands: `::align status`, `::align goals`, `::align share [--dir] [goal]`, `::align bind <goal>`, `::align unshare [--dir]`, `::align task <label>`, `::align claim <file>`, `::align pod`. They stay local and never reach the model.";
  }
}
