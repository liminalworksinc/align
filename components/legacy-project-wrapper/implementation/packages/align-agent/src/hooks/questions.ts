// Agent questions (LIM-2505). When the Stop hook's drift check (shared/drift.ts) finds the last reply crossing a limit of
// the bound goal, this session asks the goal's owner one question: may it go on? One per stretch of drift, never a
// stream: an open question (asked/<lid>.json) stops another until its answer has reached the agent; the stretch after it
// starts then. What leaves the machine is evidence only, never the agent's words: the limit's id (the server reads its
// text from the goal), the repo-relative files this session edited while shared in the stretch (none an unshared
// session also wrote in it), and the stretch's times. The answer arrives as an `answer` directive; the next prompt puts
// it in the agent's context (quoted) and tells the user.
// Hook-safe: node:fs, node:path, node:crypto only (through shared/* and siblings/private).
import { clean, endSentence, LIMIT_WORDS, personName, quoted } from "../shared/envelope.ts";
import { randomId, readJson, removeFile, writeJsonAtomic } from "../shared/fsx.ts";
import { layout, spoolWrite } from "../shared/layout.ts";
import type { HotAnswer, HotState, InjectedState, Limit } from "../shared/types.ts";
import { privateChecker, workTree } from "./private.ts";
import { readActs, relTo } from "./siblings.ts";

/** Files a question names at most (the server takes 20): the latest edit of each, newest kept. */
export const QUESTION_FILES = 20;
/** A question unanswered this long no longer stops the next one. */
export const ASKED_FOR_MS = 24 * 3600_000;

/** asked/<lid>.json: the question this session has open, until its answer reached the agent. */
export interface AskedFile {
  v: 1;
  client_id: string;
  goal_id: string;
  limit_id: string;
  at: string;
}

/** Files this session edited while shared since `fromMs`, repo-relative, the latest edit of each, newest first. */
function stretchFiles(home: string, lid: string, goalId: string, fromMs: number, cwd: string | null): { path: string; at: string }[] {
  const unshared = privateChecker(home);
  const latest = new Map<string, string>();
  for (const a of readActs(home, lid)) {
    if (a.t !== "edit" || !a.p || Date.parse(a.at) < fromMs) continue;
    // Recorded toward another goal (before a switch in this stretch): not this goal's evidence.
    if (a.g && a.g !== goalId) continue;
    // A file an unshared session also wrote in this stretch: its name could tell of that work, so it stays here.
    if (unshared(a.p, fromMs)) continue;
    const top = workTree(a.p) ?? (cwd ? workTree(cwd) : null);
    const rel = top ? relTo(top, a.p) : null;
    if (!rel || rel.length > 200 || !/^[A-Za-z0-9._@+\-][A-Za-z0-9._@+\-/ ]*$/.test(rel) || rel.split("/").includes("..")) continue;
    const prev = latest.get(rel);
    if (!prev || a.at > prev) latest.set(rel, a.at);
  }
  return [...latest.entries()]
    .sort((x, y) => y[1].localeCompare(x[1]))
    .slice(0, QUESTION_FILES)
    .map(([p, at]) => ({ path: p, at }));
}

/** Where this stretch starts: after the last answer the agent heard, and never before this share began. */
function stretchFrom(hot: HotState, inj: InjectedState): number {
  const since = hot.share?.since ? Date.parse(hot.share.since) : NaN;
  const after = inj.question_stretch_from ? Date.parse(inj.question_stretch_from) : NaN;
  return Math.max(Number.isNaN(since) ? 0 : since, Number.isNaN(after) ? 0 : after);
}

/**
 * Ask the goal's owner, from the Stop hook, about the first limit the reply crossed: only for a session shared and bound
 * to that goal now, and only when it has no question open. Spooled for the sync pass, which posts it. Returns whether
 * it asked.
 */
export function askAboutDrift(home: string, lid: string, hot: HotState, inj: InjectedState, crossed: Pick<Limit, "id">[], cwd: string | null): boolean {
  if (hot.share?.state !== "shared" || !hot.goal || !crossed.length) return false;
  // One open at a time; one left over from another goal, or a day old (its answer never came: the session stopped
  // sharing meanwhile, say), no longer stands for this stretch.
  const open = readJson<AskedFile>(layout.asked(home, lid));
  if (open && open.goal_id === hot.goal.id && Date.now() - Date.parse(open.at) < ASKED_FOR_MS) return false;
  const now = new Date();
  const from = stretchFrom(hot, inj);
  const files = stretchFiles(home, lid, hot.goal.id, from, cwd);
  const asked: AskedFile = { v: 1, client_id: randomId("q_"), goal_id: hot.goal.id, limit_id: crossed[0].id, at: now.toISOString() };
  writeJsonAtomic(layout.asked(home, lid), asked);
  spoolWrite(home, {
    type: "question",
    local_id: lid,
    client_id: asked.client_id,
    goal_id: asked.goal_id,
    limit_id: asked.limit_id,
    files,
    stretch_from: new Date(from || Date.parse(files[files.length - 1]?.at ?? asked.at)).toISOString(),
    stretch_to: asked.at,
    ts: asked.at,
  });
  return true;
}

const ANSWER_SAID = { continue: "yes, continue", steer: "steer", switch: "switch goal" } as const;

/** One answer as the model hears it: who answered, about which limit, and what to do. People's words only quoted. */
function answerContext(a: HotAnswer, goalTitle: string): string {
  const who = `${personName(a.by)}, the owner of goal ${quoted(goalTitle, 100)},`;
  const about = a.limit ? ` about ${LIMIT_WORDS[a.limit.type as Limit["type"]] ?? "Must"} ${quoted(a.limit.text, 160)}` : "";
  const head = `Align: you may have drifted from this goal${about}, so Align asked its owner whether to go on. ${who} answered: ${ANSWER_SAID[a.answer]}.`;
  if (a.answer === "continue") return `${head} Go on with the work as it was.`;
  if (a.answer === "steer") return `${head} Their note, quoted: ${quoted(a.text, 500)}. Follow it from this turn, and tell the user how it changes your plan.`;
  const to = a.target_goal ? ` They say it belongs to goal ${quoted(a.target_goal.title, 100)}.` : "";
  return `${head}${to} Stop the work this limit is about, tell the user, and ask them to pick the goal it belongs to (\`::align bind <goal>\`); do not go on with it toward this goal.`;
}

function answerNotice(a: HotAnswer, goalTitle: string): string {
  const what = a.answer === "steer" ? `steer: ${quoted(a.text, 200)}` : a.answer === "switch" ? `switch goal${a.target_goal ? ` to ${quoted(a.target_goal.title, 80)}` : ""}` : "yes, continue";
  return endSentence(`Align: ${clean(a.by, 40)} answered the agent's question about goal ${quoted(goalTitle, 80)}: ${what}. The agent hears it in this turn`);
}

/**
 * The answers that reached this session and its agent has not heard: each one's context line and user notice, once.
 * Closes the open question (a new stretch starts now) and returns the directive ids to report applied.
 */
export function answerParts(home: string, lid: string, hot: HotState, inj: InjectedState): { context: string[]; notices: string[]; applied: string[] } {
  const out = { context: [] as string[], notices: [] as string[], applied: [] as string[] };
  const told = new Set(inj.answers_told || []);
  const fresh = (hot.answers || []).filter((a) => !told.has(a.directive_id));
  if (!fresh.length) return out;
  const title = hot.goal?.title ?? "this goal";
  for (const a of fresh) {
    out.context.push(answerContext(a, title));
    out.notices.push(answerNotice(a, title));
    out.applied.push(a.directive_id);
    told.add(a.directive_id);
  }
  inj.answers_told = [...told].slice(-50);
  inj.question_stretch_from = new Date().toISOString();
  removeFile(layout.asked(home, lid));
  return out;
}
