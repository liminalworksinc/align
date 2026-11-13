// Caller-owned request and hold types and explicit resource bindings.
import { all, audit, get, run, tx } from "./db";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { event } from "./events";
import { newId, nowIso, sha256hex } from "./ids";
import { take } from "./limits";
import { cleanProse, isBlankText } from "./text-core.mts";
import { goalObj, goalRow } from "./goals";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { memberName, need } from "./workspaces";
import type { Body } from "./validate";
import { create_asks } from "../native/.bindings/server_asks.js";

// Asks (PORT-003): what one team was asked to do by someone else ("Faculty asked Product for SSO by June"), recorded
// by a person from a meeting or by hand, with its history ("came up again", v2_ask_mentions). An ask belongs to the team
// asked (a pod); it is read by the person who recorded it, every member and lead of that team, and workspace owners.
// A lead of the team (or a workspace owner) accepts or declines it, the team marks it done, and the person who recorded
// it may withdraw it. Ask text is people's text: the MCP tools mark it untrusted.
//   open -> accepted | declined | withdrawn;  accepted -> done | withdrawn;  done | declined -> open (reopen)
// Every action is audited (ask.<action>) with the person as actor; viewers read and never act (403 read_only).
// Workspace owners import asks from meeting notes (at most 60 a call); an import appends and merges, never replaces.
// A device's asks feed also carries, read-only, the accepted asks of a team whose goal one of that device's live shared
// sessions follows through an approved "work toward" alignment (A1-cross-2), marked `via_alignment: {goal_id}`, so an
// agent working toward another team's goal holds the same team commitments as that team's own sessions. Nothing else
// widens: the browser listing and GET .../asks/{id} keep the read rule above.
export type AskState = "open" | "accepted" | "done" | "declined" | "withdrawn";

export type AskAction = (typeof ASK_ACTIONS)[number];

export interface AskPerson {
    id: string;
    name: string;
}

/** An ask as the routes, the MCP tools and the Asks tab show it. */
export interface AskView {
    id: string;
    state: AskState;
    /** The team asked. */
    team: {
        id: string;
        name: string;
    };
    /** The asked team's goal it concerns, or null when there is none or the reader can't read it. */
    goal: {
        id: string;
        title: string;
    } | null;
    text: string;
    /** Who asked, as people say it ("Faculty"). */
    from_label: string | null;
    /** The person who recorded it. */
    requester: AskPerson;
    source: {
        kind: "meeting" | "manual";
        title: string | null;
        date: string;
    };
    mentions: {
        n: number;
        date: string;
        text: string;
        source_title: string;
        added_by: AskPerson;
    }[];
    /** The last person who changed its state, and when. */
    decided_by: AskPerson | null;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
    /** Open and the reader can accept it, or accepted and the reader can mark it done. */
    waiting_on_me: boolean;
    can: {
        accept: boolean;
        decline: boolean;
        done: boolean;
        reopen: boolean;
        withdraw: boolean;
        mention: boolean;
    };
    /** Only on the device feed, for an accepted ask this person reads only because one of the device's live shared
     *  sessions follows `goal_id`, the asked team's goal, through an approved "work toward" alignment. */
    via_alignment?: {
        goal_id: string;
    };
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

interface AskInput {
    teamId: string;
    goalId: string | null;
    text: string;
    fromLabel: string | null;
    source: {
        kind: "meeting" | "manual";
        title: string | null;
        date: string;
    };
}

interface MentionInput {
    date: string;
    text: string;
    source_title: string;
}

interface AsksRuntime {
  ASK_STATES: readonly AskState[];
  ASK_ACTIONS: readonly ["accept", "decline", "done", "reopen", "withdraw", "mention"];
  ASK_TEXT_MAX: 400;
  ASK_FROM_MAX: 80;
  ASK_TITLE_MAX: 120;
  MENTION_TEXT_MAX: 300;
  MENTIONS_MAX: 10;
  IMPORT_MAX: 60;
  OPEN_ASKS_MAX: 500;
  ASKS_PER_HOUR: 60;
  ASK_ACTIONS_PER_MINUTE: 30;
  canReadAsk: (pp: PolicyPrincipal, a: { created_by: string; team_id: string; }) => boolean;
  alignedTeams: (pp: PolicyPrincipal, deviceId: string) => Map<string, string>;
  getAsk: (pp: PolicyPrincipal, id: string) => AskView;
  listAsks: (pp: PolicyPrincipal, o?: { states?: readonly AskState[]; teamId?: string; limit?: number; followed?: ReadonlyMap<string, string>; }) => AskView[];
  readableAsks: (pp: PolicyPrincipal, o?: { state?: AskState; teamId?: string; limit?: number; }) => AskView[];
  asksFeed: (pp: PolicyPrincipal, q: { state?: string | null; teamId?: string | null; limit?: string | null; }, deviceId?: string | null) => { version: string; asks: AskView[]; };
  asksForBrief: (pp: PolicyPrincipal) => { asks: AskView[]; more: number; };
  createAsk: (pp: PolicyPrincipal, b: Body) => Promise<AskView>;
  importAsks: (pp: PolicyPrincipal, b: Body) => Promise<{ created: number; merged: number; unchanged: number; }>;
  actOnAsk: (pp: PolicyPrincipal, id: string, action: AskAction, b: Body) => Promise<AskView>;
  assertAskAction: (a: string) => AskAction;
}
const asksService = create_asks({
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  V2Error,
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  forbidden: (...args: Parameters<typeof forbidden>) => forbidden(...args),
  notFound: (...args: Parameters<typeof notFound>) => notFound(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  sha256hex: (...args: Parameters<typeof sha256hex>) => sha256hex(...args),
  take: (...args: Parameters<typeof take>) => take(...args),
  cleanProse: (...args: Parameters<typeof cleanProse>) => cleanProse(...args),
  isBlankText: (...args: Parameters<typeof isBlankText>) => isBlankText(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  memberName: (...args: Parameters<typeof memberName>) => memberName(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
  readDate: () => Date,
}) as unknown as AsksRuntime;

export const ASK_STATES = asksService.ASK_STATES;
export const ASK_ACTIONS = asksService.ASK_ACTIONS;
export const ASK_TEXT_MAX = asksService.ASK_TEXT_MAX;
export const ASK_FROM_MAX = asksService.ASK_FROM_MAX;
export const ASK_TITLE_MAX = asksService.ASK_TITLE_MAX;
export const MENTION_TEXT_MAX = asksService.MENTION_TEXT_MAX;
export const MENTIONS_MAX = asksService.MENTIONS_MAX;
export const IMPORT_MAX = asksService.IMPORT_MAX;
export const OPEN_ASKS_MAX = asksService.OPEN_ASKS_MAX;
export const ASKS_PER_HOUR = asksService.ASKS_PER_HOUR;
export const ASK_ACTIONS_PER_MINUTE = asksService.ASK_ACTIONS_PER_MINUTE;
export const canReadAsk = (pp: PolicyPrincipal, a: {
    created_by: string;
    team_id: string;
}): boolean => (0, asksService.canReadAsk)(pp, a);
/** The teams whose accepted asks a device also reads (A1-cross-2): for each live shared session of this person on this
 *  device that follows a goal through an approved "work toward" alignment (its governing goal is that alignment's
 *  target), the goal's team, with the goal followed. A revoked or declined alignment, a session no longer shared (or
 *  suspended), one moved off the goal and a contribution-only alignment (which governs nothing) give nothing. */
export function alignedTeams(pp: PolicyPrincipal, deviceId: string): Map<string, string> {
    return (0, asksService.alignedTeams)(pp, deviceId);
}
export function getAsk(pp: PolicyPrincipal, id: string): AskView {
    return (0, asksService.getAsk)(pp, id);
}
/** Readable asks, filtered: the reader's own (their teams' and those they recorded) first, then open, accepted and
 *  closed, then the newest source date, then the newest recorded; at most `limit` (default all). */
export function listAsks(pp: PolicyPrincipal, o: {
    states?: readonly AskState[];
    teamId?: string;
    limit?: number;
    followed?: ReadonlyMap<string, string>;
} = {}): AskView[] {
    return (0, asksService.listAsks)(pp, o);
}
/** The asks this person can read, filtered by state and team: their own teams' (and the asks they recorded) first,
 *  then open, accepted and closed, then the newest source date; at most `limit`. */
export function readableAsks(pp: PolicyPrincipal, o: {
    state?: AskState;
    teamId?: string;
    limit?: number;
} = {}): AskView[] {
    return (0, asksService.readableAsks)(pp, o);
}
/** The asks feed (GET .../asks, browser or device): readable asks, filtered, with a short version hash for ETag /
 *  If-None-Match. `state` may list several states, comma-separated. 400 for an unknown state. A device (`deviceId`)
 *  also gets the accepted asks of the teams its sessions follow through an approved alignment (alignedTeams). */
export function asksFeed(pp: PolicyPrincipal, q: {
    state?: string | null;
    teamId?: string | null;
    limit?: string | null;
}, deviceId: string | null = null): { version: string; asks: AskView[]; } {
    return (0, asksService.asksFeed)(pp, q, deviceId);
}
/** The open and accepted asks of the person's teams for align_get_brief: open first, then most mentions, then newest;
 *  at most 5, and how many more there are. */
export function asksForBrief(pp: PolicyPrincipal): {
    asks: AskView[];
    more: number;
} {
    return (0, asksService.asksForBrief)(pp);
}
/** POST .../asks: an owner or member records what a team was asked. */
export async function createAsk(pp: PolicyPrincipal, b: Body): Promise<AskView> {
    return (0, asksService.createAsk)(pp, b);
}
/** POST .../asks/import {asks:[…]}: a workspace owner imports up to 60 asks (all valid or none stored). Each item is
 *  an ask (team_id, text, from_label, goal_id, source) with an optional state (open, accepted, done, declined: the
 *  importer records it) and up to 10 earlier mentions. It appends and merges, never replaces: an item whose team, text
 *  and source date match an existing ask changes nothing; one whose team and text match an open or accepted ask with
 *  another date adds a mention to it ("came up again"); anything else is created. */
export async function importAsks(pp: PolicyPrincipal, b: Body): Promise<{ created: number; merged: number; unchanged: number; }> {
    return (0, asksService.importAsks)(pp, b);
}
/** POST .../asks/{id}/{action}. Unreadable: 404. Viewers: 403 read_only. Then who: accept, decline and reopen need a
 *  lead of the team asked or a workspace owner (403 not_team_lead); done any member of the team or a workspace owner
 *  (403 not_in_team); withdraw the person who recorded it (403 not_requester). Then the state (409 wrong_state). */
export async function actOnAsk(pp: PolicyPrincipal, id: string, action: AskAction, b: Body): Promise<AskView> {
    return (0, asksService.actOnAsk)(pp, id, action, b);
}
export function assertAskAction(a: string): AskAction {
    return (0, asksService.assertAskAction)(a);
}
