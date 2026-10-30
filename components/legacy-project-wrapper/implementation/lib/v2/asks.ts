import { all, audit, get, run, tx } from "./db";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso, sha256hex } from "./ids";
import { take } from "./limits";
import { goalObj, goalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName, need } from "./workspaces";
import type { Body } from "./validate";

// Asks (PORT-003): what one team was asked to do by someone else ("Faculty asked Product for SSO by June"), recorded
// by a person from a meeting or by hand, with its history ("came up again", v2_ask_mentions). An ask belongs to the team
// asked (a pod); it is read by the person who recorded it, every member and lead of that team, and workspace owners.
// A lead of the team (or a workspace owner) accepts or declines it, the team marks it done, and the person who recorded
// it may withdraw it. Ask text is people's text: the MCP tools mark it untrusted.
//   open -> accepted | declined | withdrawn;  accepted -> done | withdrawn;  done | declined -> open (reopen)
// Every action is audited (ask.<action>) with the person as actor; viewers read and never act (403 read_only).
// Workspace owners import asks from meeting notes (at most 60 a call); an import appends and merges, never replaces.

export type AskState = "open" | "accepted" | "done" | "declined" | "withdrawn";
export const ASK_STATES: readonly AskState[] = ["open", "accepted", "done", "declined", "withdrawn"];
export const ASK_ACTIONS = ["accept", "decline", "done", "reopen", "withdraw", "mention"] as const;
export type AskAction = (typeof ASK_ACTIONS)[number];

/** Caps (docs/v2/WIRE.md "Asks"). */
export const ASK_TEXT_MAX = 400;
export const ASK_FROM_MAX = 80;
export const ASK_TITLE_MAX = 120;
export const MENTION_TEXT_MAX = 300;
export const MENTIONS_MAX = 10;
export const IMPORT_MAX = 60;
/** Open and accepted asks per workspace. */
export const OPEN_ASKS_MAX = 500;
/** Asks created (recorded or imported) per workspace per hour. */
export const ASKS_PER_HOUR = 60;
/** Ask actions per person per minute. */
export const ASK_ACTIONS_PER_MINUTE = 30;

export interface AskPerson {
  id: string;
  name: string;
}

/** An ask as the routes, the MCP tools and the Asks tab show it. */
export interface AskView {
  id: string;
  state: AskState;
  /** The team asked. */
  team: { id: string; name: string };
  /** The asked team's goal it concerns, or null when there is none or the reader can't read it. */
  goal: { id: string; title: string } | null;
  text: string;
  /** Who asked, as people say it ("Faculty"). */
  from_label: string | null;
  /** The person who recorded it. */
  requester: AskPerson;
  source: { kind: "meeting" | "manual"; title: string | null; date: string };
  mentions: { n: number; date: string; text: string; source_title: string; added_by: AskPerson }[];
  /** The last person who changed its state, and when. */
  decided_by: AskPerson | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  /** Open and the reader can accept it, or accepted and the reader can mark it done. */
  waiting_on_me: boolean;
  can: { accept: boolean; decline: boolean; done: boolean; reopen: boolean; withdraw: boolean; mention: boolean };
}

interface AskRow {
  id: string;
  ws_id: string;
  team_id: string;
  goal_id: string | null;
  text: string;
  from_label: string | null;
  created_by: string;
  source_kind: "meeting" | "manual";
  source_title: string | null;
  source_date: string;
  state: AskState;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MentionRow {
  ask_id: string;
  n: number;
  date: string;
  text: string;
  source_title: string;
  added_by: string;
  added_at: string;
}

// ---- input ----

/** People's text: control characters become spaces (as v1 did), then trimmed and bounded. */
function text(v: unknown, field: string, max: number, { optional = false } = {}): string | null {
  if (v === undefined || v === null || (optional && v === "")) {
    if (optional) return null;
    throw badRequest(`${field} is required`);
  }
  if (typeof v !== "string") throw badRequest(`${field} must be a string`);
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim();
  if (!t) {
    if (optional) return null;
    throw badRequest(`${field} is required`);
  }
  if (t.length > max) throw badRequest(`${field} is too long (max ${max} characters)`);
  return t;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function day(v: unknown, field: string): string {
  if (typeof v !== "string" || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw badRequest(`${field} must be a date like 2026-10-26`);
  }
  return v;
}

const obj = (v: unknown, field: string): Body => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest(`${field} must be an object`);
  return v as Body;
};

interface AskInput {
  teamId: string;
  goalId: string | null;
  text: string;
  fromLabel: string | null;
  source: { kind: "meeting" | "manual"; title: string | null; date: string };
}

/** A new ask's fields. The team must exist (404); a goal must be readable (404) and the asked team's own (400). */
function askIn(pp: PolicyPrincipal, b: Body, prefix = ""): AskInput {
  const teamId = text(b.team_id, `${prefix}team_id`, 64)!;
  if (!get("SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, teamId)) throw notFound();
  const goalId = text(b.goal_id, `${prefix}goal_id`, 64, { optional: true });
  if (goalId) {
    const g = goalRow(pp.wsId, goalId);
    if (!g || !canReadGoal(pp, goalObj(g))) throw notFound();
    if (g.pod_id !== teamId) throw badRequest(`${prefix}goal_id must be a goal of the team asked`);
  }
  const s = obj(b.source, `${prefix}source`);
  const kind = s.kind === "meeting" || s.kind === "manual" ? s.kind : null;
  if (!kind) throw badRequest(`${prefix}source.kind must be meeting or manual`);
  const title = text(s.title, `${prefix}source.title`, ASK_TITLE_MAX, { optional: kind === "manual" });
  return {
    teamId,
    goalId,
    text: text(b.text, `${prefix}text`, ASK_TEXT_MAX)!,
    fromLabel: text(b.from_label, `${prefix}from_label`, ASK_FROM_MAX, { optional: true }),
    source: { kind, title, date: day(s.date, `${prefix}source.date`) },
  };
}

interface MentionInput {
  date: string;
  text: string;
  source_title: string;
}
const mentionIn = (b: Body, prefix = ""): MentionInput => ({
  date: day(b.date, `${prefix}date`),
  text: text(b.text, `${prefix}text`, MENTION_TEXT_MAX)!,
  source_title: text(b.source_title, `${prefix}source_title`, ASK_TITLE_MAX)!,
});

// ---- who may do what ----

const isOwner = (pp: PolicyPrincipal) => pp.wsRole === "owner";
const inTeam = (pp: PolicyPrincipal, a: AskRow) => pp.pods.has(a.team_id);
const leads = (pp: PolicyPrincipal, a: AskRow) => pp.pods.get(a.team_id) === "lead";
const writer = (pp: PolicyPrincipal) => pp.wsRole === "owner" || pp.wsRole === "member";

/** The requester, every member and lead of the asked team, and workspace owners. */
export const canReadAsk = (pp: PolicyPrincipal, a: { created_by: string; team_id: string }) =>
  !!pp.wsRole && (a.created_by === pp.userId || pp.pods.has(a.team_id) || pp.wsRole === "owner");

function canFlags(pp: PolicyPrincipal, a: AskRow): AskView["can"] {
  if (!writer(pp)) return { accept: false, decline: false, done: false, reopen: false, withdraw: false, mention: false };
  const decide = leads(pp, a) || isOwner(pp);
  return {
    accept: a.state === "open" && decide,
    decline: a.state === "open" && decide,
    done: a.state === "accepted" && (inTeam(pp, a) || isOwner(pp)),
    reopen: (a.state === "done" || a.state === "declined") && decide,
    withdraw: (a.state === "open" || a.state === "accepted") && a.created_by === pp.userId,
    mention: a.state === "open" || a.state === "accepted",
  };
}

/** Waiting on this reader: an open ask of a team they lead, or an accepted ask of a team they are in. A workspace owner
 *  outside the team is waited on only when the team has nobody who could (no lead to decide; nobody to finish it). */
function waitingOn(pp: PolicyPrincipal, a: AskRow, can: AskView["can"]): boolean {
  if (can.accept) return leads(pp, a) || !get("SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'", a.ws_id, a.team_id);
  if (can.done) return inTeam(pp, a) || !get("SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND pod_id = ?", a.ws_id, a.team_id);
  return false;
}

// ---- reading ----

const askRow = (ws: string, id: string) => get<AskRow>("SELECT * FROM v2_asks WHERE ws_id = ? AND id = ?", ws, id);

function visibleAsk(pp: PolicyPrincipal, id: string): AskRow {
  need(pp, "workspace.read");
  const a = askRow(pp.wsId, id);
  if (!a || !canReadAsk(pp, a)) throw notFound();
  return a;
}

/** Names and titles looked up once per listing. */
function viewer(pp: PolicyPrincipal) {
  const people = new Map<string, AskPerson>();
  const teams = new Map<string, { id: string; name: string }>();
  const goals = new Map<string, { id: string; title: string } | null>();
  const person = (id: string): AskPerson => {
    if (!people.has(id)) people.set(id, { id, name: memberName(id) });
    return people.get(id)!;
  };
  const team = (id: string) => {
    if (!teams.has(id)) teams.set(id, { id, name: get<{ name: string }>("SELECT name FROM v2_pods WHERE ws_id = ? AND id = ?", pp.wsId, id)?.name ?? "" });
    return teams.get(id)!;
  };
  const goal = (id: string | null) => {
    if (!id) return null;
    if (!goals.has(id)) {
      const g = goalRow(pp.wsId, id);
      goals.set(id, g && canReadGoal(pp, goalObj(g)) ? { id: g.id, title: g.title } : null);
    }
    return goals.get(id)!;
  };
  return (a: AskRow, mentions: MentionRow[]): AskView => {
    const can = canFlags(pp, a);
    return {
      id: a.id,
      state: a.state,
      team: team(a.team_id),
      goal: goal(a.goal_id),
      text: a.text,
      from_label: a.from_label,
      requester: person(a.created_by),
      source: { kind: a.source_kind, title: a.source_title, date: a.source_date },
      mentions: mentions.map((m) => ({ n: m.n, date: m.date, text: m.text, source_title: m.source_title, added_by: person(m.added_by) })),
      decided_by: a.decided_by ? person(a.decided_by) : null,
      decided_at: a.decided_at,
      created_at: a.created_at,
      updated_at: a.updated_at,
      waiting_on_me: waitingOn(pp, a, can),
      can,
    };
  };
}

const mentionsOf = (askId: string) => all<MentionRow>("SELECT * FROM v2_ask_mentions WHERE ask_id = ? ORDER BY n", askId);

export function getAsk(pp: PolicyPrincipal, id: string): AskView {
  const a = visibleAsk(pp, id);
  return viewer(pp)(a, mentionsOf(a.id));
}

const STATE_ORDER: Record<AskState, number> = { open: 0, accepted: 1, done: 2, declined: 2, withdrawn: 2 };

/** Readable asks, filtered: the reader's own (their teams' and those they recorded) first, then open, accepted and
 *  closed, then the newest source date, then the newest recorded; at most `limit` (default all). */
export function listAsks(pp: PolicyPrincipal, o: { states?: readonly AskState[]; teamId?: string; limit?: number } = {}): AskView[] {
  need(pp, "workspace.read");
  const where = ["ws_id = ?"];
  const params: string[] = [pp.wsId];
  if (o.states?.length) {
    where.push(`state IN (${o.states.map(() => "?").join(", ")})`);
    params.push(...o.states);
  }
  if (o.teamId) {
    where.push("team_id = ?");
    params.push(o.teamId);
  }
  const mine = (a: AskRow) => (pp.pods.has(a.team_id) || a.created_by === pp.userId ? 0 : 1);
  const rows = all<AskRow>(`SELECT * FROM v2_asks WHERE ${where.join(" AND ")}`, ...params)
    .filter((a) => canReadAsk(pp, a))
    .sort(
      (a, b) =>
        mine(a) - mine(b) ||
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        b.source_date.localeCompare(a.source_date) ||
        b.created_at.localeCompare(a.created_at) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, o.limit ?? Infinity);
  const byAsk = new Map<string, MentionRow[]>();
  if (rows.length) {
    for (const m of all<MentionRow>("SELECT * FROM v2_ask_mentions WHERE ws_id = ? ORDER BY ask_id, n", pp.wsId)) {
      if (!byAsk.has(m.ask_id)) byAsk.set(m.ask_id, []);
      byAsk.get(m.ask_id)!.push(m);
    }
  }
  const view = viewer(pp);
  return rows.map((a) => view(a, byAsk.get(a.id) ?? []));
}

/** The asks this person can read, filtered by state and team: their own teams' (and the asks they recorded) first,
 *  then open, accepted and closed, then the newest source date; at most `limit`. */
export function readableAsks(pp: PolicyPrincipal, o: { state?: AskState; teamId?: string; limit?: number } = {}): AskView[] {
  return listAsks(pp, { states: o.state ? [o.state] : undefined, teamId: o.teamId, limit: o.limit });
}

/** The asks feed (GET .../asks, browser or device): readable asks, filtered, with a short version hash for ETag /
 *  If-None-Match. `state` may list several states, comma-separated. 400 for an unknown state. */
export function asksFeed(pp: PolicyPrincipal, q: { state?: string | null; teamId?: string | null; limit?: string | null }) {
  const states = q.state ? q.state.split(",").map((s) => s.trim()) : [];
  if (states.some((s) => !(ASK_STATES as readonly string[]).includes(s))) throw badRequest(`state must be one or more of ${ASK_STATES.join(", ")}`);
  if (q.teamId && !/^pod_[A-Za-z0-9_-]{8,64}$/.test(q.teamId)) throw badRequest("team_id must be a team id");
  const limit = q.limit ? Number(q.limit) : FEED_MAX;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > FEED_MAX) throw badRequest(`limit must be 1 to ${FEED_MAX}`);
  const asks = listAsks(pp, { states: states as AskState[], teamId: q.teamId ?? undefined, limit });
  return { version: sha256hex(JSON.stringify(asks)).slice(0, 16), asks };
}
const FEED_MAX = 500;

/** The open and accepted asks of the person's teams for align_get_brief: open first, then most mentions, then newest;
 *  at most 5, and how many more there are. */
export function asksForBrief(pp: PolicyPrincipal): { asks: AskView[]; more: number } {
  const list = listAsks(pp, { states: ["open", "accepted"] })
    .filter((a) => pp.pods.has(a.team.id))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.mentions.length - a.mentions.length || b.source.date.localeCompare(a.source.date) || b.created_at.localeCompare(a.created_at));
  return { asks: list.slice(0, 5), more: Math.max(0, list.length - 5) };
}

// ---- writing ----

function requireWriter(pp: PolicyPrincipal) {
  need(pp, "workspace.read");
  if (!writer(pp)) throw forbidden("read_only", "Viewers can look but not change anything");
}

const openCount = (ws: string) => get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_asks WHERE ws_id = ? AND state IN ('open','accepted')", ws)?.n ?? 0;
const createdLastHour = (ws: string) => get<{ n: number }>("SELECT COUNT(*) AS n FROM v2_asks WHERE ws_id = ? AND created_at > ?", ws, new Date(Date.now() - 3600_000).toISOString())?.n ?? 0;

/** Inside a tx: refuse `adding` more asks when the workspace is at its caps (409 too_many_asks, 429 rate_limited). */
function checkCaps(ws: string, adding: number) {
  if (openCount(ws) + adding > OPEN_ASKS_MAX) throw conflict("too_many_asks", `A workspace can have at most ${OPEN_ASKS_MAX} open or accepted asks; close some first`);
  if (createdLastHour(ws) + adding > ASKS_PER_HOUR) throw new V2Error(429, "rate_limited", "Too many asks recorded in the last hour, try again later");
}

function insertAsk(pp: PolicyPrincipal, f: AskInput, state: AskState, at: string): string {
  const id = newId("ask");
  const decided = state === "open" ? null : pp.userId;
  run(
    `INSERT INTO v2_asks (id, ws_id, team_id, goal_id, text, from_label, created_by, source_kind, source_title, source_date, state, decided_by, decided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    pp.wsId,
    f.teamId,
    f.goalId,
    f.text,
    f.fromLabel,
    pp.userId,
    f.source.kind,
    f.source.title,
    f.source.date,
    state,
    decided,
    decided ? at : null,
    at,
    at,
  );
  return id;
}

function addMention(pp: PolicyPrincipal, a: AskRow, m: MentionInput, at: string) {
  const n = (get<{ n: number | null }>("SELECT MAX(n) AS n FROM v2_ask_mentions WHERE ask_id = ?", a.id)?.n ?? 0) + 1;
  if (n > MENTIONS_MAX) throw conflict("too_many_mentions", `An ask keeps at most ${MENTIONS_MAX} mentions`);
  run("INSERT INTO v2_ask_mentions (ws_id, ask_id, n, date, text, source_title, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", a.ws_id, a.id, n, m.date, m.text, m.source_title, pp.userId, at);
  run("UPDATE v2_asks SET updated_at = ? WHERE id = ?", at, a.id);
}

/** POST .../asks: an owner or member records what a team was asked. */
export async function createAsk(pp: PolicyPrincipal, b: Body): Promise<AskView> {
  requireWriter(pp);
  const f = askIn(pp, b);
  const at = nowIso();
  const id = await tx(() => {
    checkCaps(pp.wsId, 1);
    const id = insertAsk(pp, f, "open", at);
    audit(pp.wsId, pp.userId, "ask.created", id, at);
    event("first_ask", { ws: pp.wsId, user: pp.userId, at });
    return id;
  });
  return getAsk(pp, id);
}

/** Text compared for the import merge: case and runs of spaces ignored. */
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

const IMPORT_STATES: readonly AskState[] = ["open", "accepted", "done", "declined"];

/** POST .../asks/import {asks:[…]}: a workspace owner imports up to 60 asks (all valid or none stored). Each item is
 *  an ask (team_id, text, from_label, goal_id, source) with an optional state (open, accepted, done, declined: the
 *  importer records it) and up to 10 earlier mentions. It appends and merges, never replaces: an item whose team, text
 *  and source date match an existing ask changes nothing; one whose team and text match an open or accepted ask with
 *  another date adds a mention to it ("came up again"); anything else is created. */
export async function importAsks(pp: PolicyPrincipal, b: Body) {
  need(pp, "workspace.manage");
  take(`ask-import:${pp.wsId}`, 10, 60_000);
  if (!Array.isArray(b.asks)) throw badRequest("Send {asks: [...]}");
  if (b.asks.length > IMPORT_MAX) throw badRequest(`asks: at most ${IMPORT_MAX} per import`);
  const items = b.asks.map((raw, i) => {
    const p = `asks[${i}].`;
    const it = obj(raw, `asks[${i}]`);
    const state = it.state === undefined || it.state === null ? "open" : (it.state as AskState);
    if (!IMPORT_STATES.includes(state)) throw badRequest(`${p}state must be open, accepted, done or declined`);
    const ms = it.mentions ?? [];
    if (!Array.isArray(ms)) throw badRequest(`${p}mentions must be a list`);
    if (ms.length > MENTIONS_MAX) throw badRequest(`${p}mentions: at most ${MENTIONS_MAX}`);
    return { ask: askIn(pp, it, p), state, mentions: ms.map((m, j) => mentionIn(obj(m, `${p}mentions[${j}]`), `${p}mentions[${j}].`)) };
  });
  const at = nowIso();
  return tx(() => {
    let created = 0;
    let merged = 0;
    let unchanged = 0;
    for (const it of items) {
      const same = all<AskRow>("SELECT * FROM v2_asks WHERE ws_id = ? AND team_id = ?", pp.wsId, it.ask.teamId).filter((a) => norm(a.text) === norm(it.ask.text));
      if (same.some((a) => a.source_date === it.ask.source.date)) {
        unchanged++;
        continue;
      }
      const live = same.find((a) => a.state === "open" || a.state === "accepted");
      if (live) {
        const title = it.ask.source.title ?? "Recorded by hand";
        const ms = mentionsOf(live.id);
        if (ms.length >= MENTIONS_MAX || ms.some((m) => m.date === it.ask.source.date && m.source_title === title)) unchanged++;
        else {
          addMention(pp, live, { date: it.ask.source.date, text: it.ask.text, source_title: title }, at);
          merged++;
        }
        continue;
      }
      const id = insertAsk(pp, it.ask, it.state, at);
      const a = askRow(pp.wsId, id)!;
      for (const m of it.mentions) addMention(pp, a, m, at);
      created++;
    }
    checkCaps(pp.wsId, 0);
    if (createdLastHour(pp.wsId) > ASKS_PER_HOUR) throw new V2Error(429, "rate_limited", "Too many asks recorded in the last hour, try again later");
    audit(pp.wsId, pp.userId, "ask.imported", String(created + merged), at);
    if (created) event("first_ask", { ws: pp.wsId, user: pp.userId, at });
    return { created, merged, unchanged };
  });
}

const AUDIT: Record<AskAction, string> = {
  accept: "ask.accepted",
  decline: "ask.declined",
  done: "ask.done",
  reopen: "ask.reopened",
  withdraw: "ask.withdrawn",
  mention: "ask.mentioned",
};
const NEXT: Partial<Record<AskAction, AskState>> = { accept: "accepted", decline: "declined", done: "done", reopen: "open", withdraw: "withdrawn" };
const FROM: Record<AskAction, readonly AskState[]> = {
  accept: ["open"],
  decline: ["open"],
  done: ["accepted"],
  reopen: ["done", "declined"],
  withdraw: ["open", "accepted"],
  mention: ["open", "accepted"],
};

/** POST .../asks/{id}/{action}. Unreadable: 404. Viewers: 403 read_only. Then who: accept, decline and reopen need a
 *  lead of the team asked or a workspace owner (403 not_team_lead); done any member of the team or a workspace owner
 *  (403 not_in_team); withdraw the person who recorded it (403 not_requester). Then the state (409 wrong_state). */
export async function actOnAsk(pp: PolicyPrincipal, id: string, action: AskAction, b: Body): Promise<AskView> {
  visibleAsk(pp, id);
  requireWriter(pp);
  take(`ask-action:${pp.userId}`, ASK_ACTIONS_PER_MINUTE, 60_000);
  const mention = action === "mention" ? mentionIn(b) : null;
  const at = nowIso();
  await tx(() => {
    const a = askRow(pp.wsId, id)!; // re-read inside the transaction
    if ((action === "accept" || action === "decline" || action === "reopen") && !leads(pp, a) && !isOwner(pp)) throw forbidden("not_team_lead", "Only a lead of the team asked, or a workspace owner, can do this");
    if (action === "done" && !inTeam(pp, a) && !isOwner(pp)) throw forbidden("not_in_team", "Only the team asked, or a workspace owner, can mark it done");
    if (action === "withdraw" && a.created_by !== pp.userId) throw forbidden("not_requester", "Only the person who recorded this ask can withdraw it");
    if (!FROM[action].includes(a.state)) throw conflict("wrong_state", `This ask is ${a.state}`);
    if (mention) addMention(pp, a, mention, at);
    else run("UPDATE v2_asks SET state = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?", NEXT[action]!, pp.userId, at, at, a.id);
    audit(pp.wsId, pp.userId, AUDIT[action], a.id, at);
  });
  return getAsk(pp, id);
}

export function assertAskAction(a: string): AskAction {
  if (!(ASK_ACTIONS as readonly string[]).includes(a)) throw notFound();
  return a as AskAction;
}
