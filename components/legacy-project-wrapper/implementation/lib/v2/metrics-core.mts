// Caller-owned public types and explicit resource bindings.
import { ESTIMATES, NOTE_REF_RE, recordEvent, type Sql } from "./core.mts";
import { create_metrics } from "../native/.bindings/server_metrics.js";

export type LoiEvent = (typeof LOI_EVENTS)[number];

export type LoiResult = {
    ok: true;
    at: string;
} | {
    ok: false;
    reason: "no_workspace" | "verified_original_required" | "bad_note_ref" | "already_recorded";
    at?: string;
};

interface Timing {
    workspaces: number;
    median_minutes: number | null;
    p75_minutes: number | null;
}

export interface Report {
    generated_at: string;
    since: string | null;
    access: {
        requested: number;
        requested_try: number;
        requested_evaluate: number;
        approved: number;
        declined: number;
        codes_created: number;
        codes_from_requests: number;
        codes_redeemed: number;
    };
    funnel: {
        step: string;
        workspaces: number;
        of_previous: number | null;
        of_created: number | null;
    }[];
    other: {
        sample_workspaces_created: number;
        invites_sent: number;
        invites_accepted: number;
        people_with_a_first_session: number;
    };
    time_to_first_value: {
        from_workspace_created: Timing;
        from_code_redeemed: Timing;
    };
    weekly_active_workspaces: {
        week: string;
        active: number;
        growth: number | null;
        complete: boolean;
    }[];
    retention: {
        cohort: string;
        workspaces: number;
        week1: number | null;
        week1_share: number | null;
        week4: number | null;
        week4_share: number | null;
    }[];
    goal_binding: {
        sessions: number;
        bound_sessions: number;
        sessions_share: number | null;
        requests: number;
        bound_requests: number;
        requests_share: number | null;
        est_list_usd_micros: number;
        bound_est_list_usd_micros: number;
        spend_share: number | null;
    };
    lois: {
        sent: number;
        signed: number;
        workspaces: {
            ws_id: string;
            sent_at: string | null;
            signed_at: string | null;
        }[];
    };
    value: {
        workspaces_with_approved_request: number;
        viewed: {
            people: number;
            workspaces: number;
        };
        reported: {
            people: number;
            by_estimate: Record<(typeof ESTIMATES)[number], number>;
        };
        follow_up_clicked: number;
        access_from_value_card: {
            try: number;
            evaluate: number;
        };
        first_ask: number;
        first_limit: number;
    };
}

interface MetricsRuntime {
  weekStart: (t: number) => number;
  percentile: (values: number[], p: number) => number | null;
  recordLoi: (db: Sql, name: LoiEvent, wsId: string, o: { noteRef?: string | null; verifiedOriginal?: boolean; }, now?: number) => LoiResult;
  buildReport: (db: Sql, { since, now }?: { since?: string | null; now?: Date; }) => Report;
  formatReport: (r: Report) => string;
  LOI_EVENTS: readonly ["loi_sent", "loi_signed"];
  FUNNEL: readonly { step: string; events: readonly string[]; }[];
  WAW_WEEKS: 8;
}
const metricsService = create_metrics({
  ESTIMATES,
  NOTE_REF_RE,
  recordEvent: (...args: Parameters<typeof recordEvent>) => recordEvent(...args),
  readDate: () => Date,
}) as unknown as MetricsRuntime;

/** Monday 00:00 UTC of the week holding `t`. */
export function weekStart(t: number): number {
    return (0, metricsService.weekStart)(t);
}
/** The nearest-rank percentile (p from 0 to 1) of numbers; null for none. */
export function percentile(values: number[], p: number): number | null {
    return (0, metricsService.percentile)(values, p);
}
/** Record that an LOI was sent to, or signed by, a workspace's organisation (inside the caller's transaction). Only the
 *  operator does this; nothing in the app asserts it. `loi_signed` needs `verifiedOriginal`: the operator has the
 *  countersigned original in hand, so a form or a claim never counts as signed. Once per workspace each. `noteRef` is
 *  the operator's own opaque reference (NOTE_REF_RE), never the document itself. */
export function recordLoi(db: Sql, name: LoiEvent, wsId: string, o: {
    noteRef?: string | null;
    verifiedOriginal?: boolean;
}, now = Date.now()): LoiResult {
    return (0, metricsService.recordLoi)(db, name, wsId, o, now);
}
/** The report as of `now`, from `since` (YYYY-MM-DD, UTC) when given. Reads only. */
export function buildReport(db: Sql, { since = null, now = new Date() }: {
    since?: string | null;
    now?: Date;
} = {}): Report {
    return (0, metricsService.buildReport)(db, { since, now });
}
/** The report as plain text tables. */
export function formatReport(r: Report): string {
    return (0, metricsService.formatReport)(r);
}
export const LOI_EVENTS = metricsService.LOI_EVENTS;
export const FUNNEL = metricsService.FUNNEL;
export const WAW_WEEKS = metricsService.WAW_WEEKS;
