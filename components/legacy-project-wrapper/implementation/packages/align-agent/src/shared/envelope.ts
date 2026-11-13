// Typed public names for the independently qualified envelope library.
import * as native from "../native/.bindings/agent_envelope.js";
// The only text Align ever adds to model context. Fixed wording; the interpolated fields are ratified goal fields
// (including the limits a goal version carries), the accepted asks of the bound goal's team (quoted, with who asked
// and who accepted them; owner decision D3), file paths, task labels and commit subjects recorded by the user's own
// sessions on this machine, and, from other machines, only a person's first name (letters only) and repo-relative
// paths made of path characters. Other people's free text (task labels, commit subjects, claim reasons, open asks)
// reaches the user through `align team` and `align asks`, never through hooks. Requests (REQ-002) are Align-written
// sentences, fixed per type, naming the sender and quoting their note as data; goal holds are tool-deny reasons.
// Budgets (plan rev 2): envelope <= 1,200 chars (target 1,000), or 1,800 when the goal has limits; the accepted-asks
// block <= 2,200 more; delta <= 300 chars (target 250), card <= 300 chars.
import type { AcceptedAsk, ContextGoal, GoalSnapshot, HoldLatch, HotRequest, Limit, Measure, TeamAsks } from "./types.ts";

export type DeltaKind = "bound" | "updated" | "unbound";
/** Limits a delta names: added (new id, or reworded) and removed, against the ones last put into context. */
export interface LimitChange {
    added: Limit[];
    removed: {
        id: string;
        text: string;
    }[];
}
export interface SiblingSummary {
    harness: "claude-code" | "codex";
    id: string;
    minutes_ago: number;
    files: string[];
    commits: string[];
    /** Another person: "Yoonseo (6 sessions)". Absent for this machine's own sessions. */
    who?: string;
    /** Set for work from another machine. Decides what reaches the model, whatever `who` holds. */
    remote?: boolean;
    /** Files this session also touched recently, listed first. */
    overlap?: string[];
    /** The other side's own label for its work (`::align task`, or its branch). */
    task?: string;
    /** Set when the other work is toward a related goal rather than this one. */
    goal?: string;
    /** Edits whose file names were not shared (the other person did not turn on work signals). */
    unnamed?: number;
    /** Another person's session count. */
    sessions?: number;
    /** Files the other side claimed and still holds. */
    claims?: string[];
}

const values = native.envelope_data() as {
    ENVELOPE_MAX: 1200;
    ENVELOPE_MAX_WITH_LIMITS: 1800;
    ASKS_MAX: 2200;
    ASK_TEXT_MAX: 280;
    ASKS_SHOWN: 5;
    DELTA_MAX: 300;
    LIMIT_WORDS: Record<Limit["type"], string>;
    CARD_MAX: 300;
    CARD_MAX_BOTH: 450;
    TEAM_POINTER: "The user can type `::align team` for details.";
    SELF_ELSEWHERE: "You, on another machine";
    NAME_NOT_SHARED: "a file (name not shared)";
    SAFE_REQUESTS: Set<string>;
    GOAL_MARKS: "* = you can bind a session to it now.";
    HELD_MARK: "h = on hold: all agents on it were paused from its Align workspace, so a session bound to it has its tools blocked until the hold is released.";
};

export const ENVELOPE_MAX = values.ENVELOPE_MAX;
export const ENVELOPE_MAX_WITH_LIMITS = values.ENVELOPE_MAX_WITH_LIMITS;
export const ASKS_MAX = values.ASKS_MAX;
export const ASK_TEXT_MAX = values.ASK_TEXT_MAX;
export const ASKS_SHOWN = values.ASKS_SHOWN;
export const DELTA_MAX = values.DELTA_MAX;
export const LIMIT_WORDS = values.LIMIT_WORDS;
export const CARD_MAX = values.CARD_MAX;
export const CARD_MAX_BOTH = values.CARD_MAX_BOTH;
export const TEAM_POINTER = values.TEAM_POINTER;
export const SELF_ELSEWHERE = values.SELF_ELSEWHERE;
export const NAME_NOT_SHARED = values.NAME_NOT_SHARED;
export const SAFE_REQUESTS = values.SAFE_REQUESTS;
export const GOAL_MARKS = values.GOAL_MARKS;
export const HELD_MARK = values.HELD_MARK;

export const clean = native.clean as (text: unknown, max: number) => string;
export const endSentence = native.end_sentence as (text: string) => string;
export const quoted = native.quoted as (text: unknown, max: number) => string;
export const boundLimits = native.bound_limits as (goal: GoalSnapshot) => string | null;
export const renderEnvelope = native.render_envelope as (goal: GoalSnapshot, context?: ContextGoal[], asks?: TeamAsks | null) => string;
export const asksBlock = native.asks_block as (ta: TeamAsks | null | undefined) => string | null;
export const limitsSeen = native.limits_seen as (goal: GoalSnapshot | null) => {
    id: string;
    text: string;
}[];
export const limitChange = native.limit_change as (goal: GoalSnapshot, seen: {
    id: string;
    text: string;
}[] | undefined) => LimitChange | null;
export const renderDelta = native.render_delta as (kind: DeltaKind, goal: GoalSnapshot | null, limits?: LimitChange | null) => string;
export const renderAsksDelta = native.render_asks_delta as (ta: TeamAsks, added: AcceptedAsk[], removed: number) => string;
export const renderAsksGone = native.render_asks_gone as (ta: TeamAsks) => string;
export const renderFollowedAsksEnded = native.render_followed_asks_ended as (team: string) => string;
export const measureKey = native.measure_key as (m: Measure) => string;
export const renderContextDelta = native.render_context_delta as (c: ContextGoal, before?: string[]) => string;
export const personName = native.person_name as (name: unknown) => string;
export const remotePath = native.remote_path as (p: unknown) => string;
export const shortId = native.short_id as (harness: SiblingSummary["harness"], id: string) => string;
export const sendersWords = native.senders_words as (sibs: SiblingSummary[], more?: string) => string;
export const renderCard = native.render_card as (sibs: SiblingSummary[]) => string | null;
export const crossNote = native.cross_note as (who: string, file: string, minutesAgo: number, opts?: {
    goal?: string | null;
    claimUntil?: string | null;
    task?: string | null;
    remote?: boolean;
}) => string;
export const collisionReason = native.collision_reason as (harness: SiblingSummary["harness"], id: string, file: string, minutesAgo: number) => string;
export const collisionsReason = native.collisions_reason as (hits: {
    harness: SiblingSummary["harness"];
    id: string;
    file: string;
    minutesAgo: number;
}[]) => string;
export const siblingChangeNote = native.sibling_change_note as (harness: SiblingSummary["harness"], id: string, file: string, minutesAgo: number) => string;
export const boundContextNote = native.bound_context_note as (context: ContextGoal[]) => string | null;
export const requestShortId = native.request_short_id as (id: string) => string;
export const requestWhat = native.request_what as (r: HotRequest) => string;
export const requestNotice = native.request_notice as (r: HotRequest) => string;
export const requestContext = native.request_context as (r: HotRequest, boundGoalId: string | null) => string;
export const requestAnswerLine = native.request_answer_line as (r: HotRequest, answer: "accepted" | "declined") => string;
export const requestWithdrawnNotice = native.request_withdrawn_notice as (r: HotRequest) => string;
export const holdReason = native.hold_reason as (latch: HoldLatch | null) => string;
export const stoppedForGoodWords = native.stopped_for_good_words as (lid: string, then: string) => string;
export const goalMark = native.goal_mark as (g: {
    bindable?: boolean;
    allocation?: {
        held?: boolean;
    } | null;
}) => string;
export const outOfReachWords = native.out_of_reach_words as (ws: string, lid: string, latched: boolean, stopped?: boolean) => string;
export const otherWorkspaceWords = native.other_workspace_words as (ws: string, other: string) => string;
export const expiredWhy = native.expired_why as (q: {
    expired_reason?: unknown;
    refused_answer?: unknown;
    refused_error?: unknown;
} | null | undefined) => string;
export const releaseNotice = native.release_notice as (by: string, title: string) => string;
export const keptHoldsNote = native.kept_holds_note as (titles: string[]) => string;
