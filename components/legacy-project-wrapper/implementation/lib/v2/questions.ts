import { all, audit, get, run, tx } from "./db";
import { V2Error, badRequest, conflict, notFound } from "./errors";
import { goalCore, goalObj, goalRow, type GoalRow } from "./goals";
import { newId, nowIso } from "./ids";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { openEpoch, ownSession } from "./sessions";
import type { DevicePrincipal } from "./devices";
import { writeDirective } from "./directives";
import { memberName, need } from "./workspaces";
import { oneOf, optStr, str, type Body } from "./validate";
import { ID_RE } from "./validate";

// Agent questions (LIM-2505). When a shared session's work drifts from its bound goal (the agent's local word check on a
// limit, packages/align-agent/src/shared/drift.ts), its machine asks the goal's owner one question: may it go on? It
// carries evidence, never the agent's words: the limit (its text is the goal's own, read here, never sent by the device),
// the repo-relative files the session edited while shared in this stretch, and when the stretch ran. The owner answers
// on the web: continue, steer (a note for the agent) or switch goal; the answer reaches only the asking session, as an
// `answer` directive its next prompt puts in the agent's context.
//   one per stretch  a session holds at most one open question: asking again while one is open returns it (no stream).
//   who answers      the goal's owner only (goal.edit): a viewer gets 403 read_only, another member 403 not_goal_owner.
//   who sees it      whoever reads the goal (goal.read); anyone else, or another workspace, 404.

export const ANSWERS = ["continue", "steer", "switch"] as const;
export type Answer = (typeof ANSWERS)[number];

/** Files a question names at most, and each path's length. */
export const QUESTION_FILES = 20;
const PATH_MAX = 200;
const STEER_MAX = 500;

interface QuestionRow {
  id: string;
  ws_id: string;
  session_key: string;
  goal_id: string;
  goal_version: number;
  limit_id: string;
  limit_type: string;
  limit_text: string;
  files_json: string;
  stretch_from: string;
  stretch_to: string;
  asked_by: string;
  client_id: string;
  state: "open" | "answered" | "superseded";
  answer: Answer | null;
  answer_text: string | null;
  target_goal_id: string | null;
  answered_by: string | null;
  answered_at: string | null;
  directive_id: string | null;
  created_at: string;
}

export interface AnswerJson {
  question_id: string;
  answer: Answer;
  text: string | null;
  target_goal_id: string | null;
  by: string;
  at: string;
}

/** What "why they look apart" says, from the limit's type: Align's words, never the agent's. */
const WHY: Record<string, string> = {
  must_not: "The agent's last reply says it will do what this limit rules out.",
  out_of_scope: "The agent's last reply says it will do work this goal leaves out of scope.",
  must: "The agent's last reply says it will do something this limit requires it not to skip.",
};
const why = (type: string) => WHY[type] ?? WHY.must;

/** A repo-relative path as the agent writes it (packages/align-agent/src/hooks/questions.ts): ASCII letters, digits,
 *  `._@+-`, spaces and `/` only, so no drive letter, backslash, `~`, control, bidi-override or zero-width character;
 *  no empty, `.` or `..` segment. */
const PATH_RE = /^[A-Za-z0-9._@+\-][A-Za-z0-9._@+\-/ ]*$/;
export const safePath = (p: unknown): p is string =>
  typeof p === "string" && p.length <= PATH_MAX && PATH_RE.test(p) && p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");

const fileList = (v: unknown): { path: string; at: string }[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw badRequest("files must be a list");
  if (v.length > QUESTION_FILES) throw badRequest(`files has at most ${QUESTION_FILES} entries`);
  return v.map((f) => {
    const p = (f as { path?: unknown })?.path;
    const at = (f as { at?: unknown })?.at;
    if (!safePath(p)) throw badRequest("each file path must be a repo-relative path");
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) throw badRequest("each file needs an ISO time");
    return { path: p, at: new Date(at).toISOString() };
  });
};

const isoOf = (b: Body, k: string): string => {
  const v = b[k];
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw badRequest(`${k} must be an ISO time`);
  return new Date(v).toISOString();
};

/** The question as `pp` sees it: null when they may not read its goal. */
function view(pp: PolicyPrincipal, q: QuestionRow, g: GoalRow) {
  if (!canReadGoal(pp, goalObj(g))) return null;
  const target = q.target_goal_id ? goalRow(q.ws_id, q.target_goal_id) : undefined;
  const asker = memberName(q.asked_by);
  return {
    id: q.id,
    state: q.state,
    goal: { id: g.id, title: g.title, version: q.goal_version, owner: { id: g.owner_id, name: memberName(g.owner_id) } },
    session_key: q.asked_by === pp.userId ? q.session_key : null,
    asked_by: { id: q.asked_by, name: asker },
    asked_at: q.created_at,
    evidence: {
      limit: { id: q.limit_id, type: q.limit_type, text: q.limit_text },
      why: why(q.limit_type),
      files: JSON.parse(q.files_json) as { path: string; at: string }[],
      stretch: { from: q.stretch_from, to: q.stretch_to },
      reported_as: "agent-reported" as const,
    },
    answer: q.answer
      ? {
          kind: q.answer,
          text: q.answer_text,
          target_goal: target && canReadGoal(pp, goalObj(target)) ? { id: target.id, title: target.title } : null,
          by: { id: q.answered_by!, name: memberName(q.answered_by!) },
          at: q.answered_at!,
        }
      : null,
    can: { answer: q.state === "open" && authorize(pp, "goal.edit", goalObj(g)).ok },
  };
}
export type QuestionView = NonNullable<ReturnType<typeof view>>;

const rowById = (ws: string, id: string) => get<QuestionRow>("SELECT * FROM v2_agent_questions WHERE ws_id = ? AND id = ?", ws, id);

/**
 * POST .../sessions/:key/questions (Bearer; the device that shared the session). Body {client_id, goal_id, limit_id,
 * files?, stretch_from, stretch_to}. The session must be shared and bound to `goal_id` now, and the limit one of that
 * goal's current limits; the limit's text is read here. A session with an open question gets that one back (fresh false).
 */
export async function askQuestion(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) {
  const s = ownSession(pp, dev, key);
  need(pp, "session.share");
  if (s.state !== "shared") throw conflict("sharing_stopped", "This session is not shared, so it can't ask its goal's owner.");
  const clientId = str(b, "client_id", 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) throw badRequest("client_id must be 8 to 64 letters, digits, _ or -");
  const goalId = str(b, "goal_id", 80);
  if (!ID_RE.test(goalId)) throw badRequest("goal_id is not an id");
  const limitId = str(b, "limit_id", 80);
  const files = fileList(b.files);
  const from = isoOf(b, "stretch_from");
  const to = isoOf(b, "stretch_to");
  if (Date.parse(from) > Date.parse(to)) throw badRequest("stretch_from is after stretch_to");
  const g = goalRow(pp.wsId, goalId);
  if (!g || !canReadGoal(pp, goalObj(g))) throw notFound();
  if (openEpoch(pp.wsId, key)?.goal_id !== goalId) throw conflict("not_bound", "This session does not count toward that goal now.");
  if (g.status !== "active") throw conflict("goal_closed", "That goal is achieved or dropped.");
  const limit = goalCore(g).limits.find((l) => l.id === limitId);
  if (!limit) throw badRequest("limit_id is not one of the goal's limits");
  return tx(() => {
    const same = get<QuestionRow>("SELECT * FROM v2_agent_questions WHERE ws_id = ? AND session_key = ? AND client_id = ?", pp.wsId, key, clientId);
    if (same) return { question: view(pp, same, goalRow(pp.wsId, same.goal_id)!), fresh: false };
    const at = nowIso();
    const open = get<QuestionRow>("SELECT * FROM v2_agent_questions WHERE ws_id = ? AND session_key = ? AND state = 'open'", pp.wsId, key);
    // One open question per session, on the goal it counts toward now: one left open on a goal the session has moved
    // from no longer stands for this stretch, so it is superseded (never answerable again) and this one is asked.
    if (open && open.goal_id === goalId) return { question: view(pp, open, goalRow(pp.wsId, open.goal_id)!), fresh: false };
    if (open) {
      run("UPDATE v2_agent_questions SET state = 'superseded' WHERE ws_id = ? AND id = ?", pp.wsId, open.id);
      audit(pp.wsId, pp.userId, "question.superseded", open.id, at);
    }
    const id = newId("aq");
    run(
      `INSERT INTO v2_agent_questions (id, ws_id, session_key, goal_id, goal_version, limit_id, limit_type, limit_text, files_json, stretch_from, stretch_to,
         asked_by, client_id, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      id,
      pp.wsId,
      key,
      goalId,
      g.version,
      limit.id,
      limit.type,
      limit.text,
      JSON.stringify(files),
      from,
      to,
      s.user_id,
      clientId,
      at,
    );
    audit(pp.wsId, pp.userId, "question.asked", id, at);
    return { question: view(pp, rowById(pp.wsId, id)!, g)!, fresh: true };
  });
}

/** GET .../questions (cookie or Bearer): the questions on goals the caller reads, open first, newest first, at most 200. */
export function listQuestions(pp: PolicyPrincipal) {
  need(pp, "workspace.read");
  const rows = all<QuestionRow>("SELECT * FROM v2_agent_questions WHERE ws_id = ? ORDER BY state = 'open' DESC, created_at DESC LIMIT 500", pp.wsId);
  const goals = new Map<string, GoalRow | undefined>();
  const out: QuestionView[] = [];
  for (const q of rows) {
    if (!goals.has(q.goal_id)) goals.set(q.goal_id, goalRow(pp.wsId, q.goal_id));
    const g = goals.get(q.goal_id);
    const v = g ? view(pp, q, g) : null;
    if (v) out.push(v);
    if (out.length >= 200) break;
  }
  return { questions: out };
}

/** GET .../questions/:id: one question, 404 unless the caller reads its goal. */
export function getQuestion(pp: PolicyPrincipal, id: string) {
  need(pp, "workspace.read");
  const q = rowById(pp.wsId, id);
  const g = q ? goalRow(pp.wsId, q.goal_id) : undefined;
  const v = q && g ? view(pp, q, g) : null;
  if (!v) throw notFound();
  return { question: v };
}

/**
 * POST .../questions/:id/answer (cookie): {answer: continue|steer|switch, text? (steer: required, at most 500),
 * goal_id? (switch: an active goal the asker can read, not this one)}. The goal's owner only. Writes one `answer`
 * directive to the asking session (none when its sharing has stopped: the answer is still recorded).
 */
export async function answerQuestion(pp: PolicyPrincipal, id: string, b: Body) {
  const q = rowById(pp.wsId, id);
  const g = q ? goalRow(pp.wsId, q.goal_id) : undefined;
  if (!q || !g) throw notFound();
  need(pp, "goal.edit", goalObj(g));
  const answer = oneOf(b, "answer", ANSWERS);
  const text = answer === "steer" ? str(b, "text", STEER_MAX) : null;
  if (answer !== "steer" && b.text !== undefined && b.text !== null && b.text !== "") throw badRequest("text goes only with steer");
  let target: GoalRow | undefined;
  const targetId = optStr(b, "goal_id", 80);
  if (targetId) {
    if (answer !== "switch") throw badRequest("goal_id goes only with switch");
    target = goalRow(pp.wsId, targetId);
    if (!target || !canReadGoal(pp, goalObj(target))) throw notFound();
    if (target.id === g.id) throw badRequest("Pick a goal other than this one");
    if (target.status !== "active") throw conflict("goal_closed", "That goal is achieved or dropped.");
  }
  return tx(() => {
    const cur = rowById(pp.wsId, id)!;
    if (cur.state === "superseded") throw new V2Error(409, "question_superseded", "This question is closed: the session moved to another goal.");
    if (cur.state !== "open") throw new V2Error(409, "already_answered", "This question was already answered.");
    const at = nowIso();
    const live = get<{ state: string }>("SELECT state FROM v2_sessions WHERE ws_id = ? AND session_key = ?", pp.wsId, cur.session_key);
    const json: AnswerJson = { question_id: id, answer, text, target_goal_id: target?.id ?? null, by: pp.userId, at };
    const dir = live && live.state !== "stopped" ? writeDirective(pp.wsId, "answer", [cur.session_key], null, null, { goalId: g.id, answer: json }) : null;
    run(
      "UPDATE v2_agent_questions SET state = 'answered', answer = ?, answer_text = ?, target_goal_id = ?, answered_by = ?, answered_at = ?, directive_id = ? WHERE ws_id = ? AND id = ?",
      answer,
      text,
      target?.id ?? null,
      pp.userId,
      at,
      dir,
      pp.wsId,
      id,
    );
    audit(pp.wsId, pp.userId, "question.answered", id, at);
    return { question: view(pp, rowById(pp.wsId, id)!, g)!, delivered: !!dir };
  });
}
