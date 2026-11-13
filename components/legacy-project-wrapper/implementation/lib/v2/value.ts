// Caller-owned value types and explicit resource bindings.
import { appsSentGoalVersion } from "../oauth/grants";
import { ESTIMATES } from "./core.mts";
import { getChangeRequest as diffOf, type ChangeDiff } from "./changes-read";
import { getChangeRequest, type LaunchState } from "./changes";
import { all, get, run, tx } from "./db";
import { badRequest, conflict } from "./errors";
import { event } from "./events";
import { goalObj, goalRow, parentIds } from "./goals";
import { newId, nowIso } from "./ids";
import { take } from "./limits";
import { canReadGoal, type PolicyPrincipal } from "./policy";
import { oneOf, type Body } from "./validate";
import { memberName } from "./workspaces";
import { cleanValueText, ESTIMATE_WORDS, followUpUrl, loiUrlOk, spanWords, VALUE_EDIT_DAYS, VALUE_NOTE_MAX } from "./value-core.mts";
import { create_value } from "../native/.bindings/server_value.js";

export type Estimate = (typeof ESTIMATES)[number];

/** One person's value report on an approved change request. */
export interface ValueReport {
    id: string;
    person: {
        id: string;
        name: string;
    };
    estimate: Estimate;
    note: string | null;
    created_at: string;
    updated_at: string;
    /** The reader wrote it and it is less than 7 days old. */
    can_edit: boolean;
}

/** GET .../goals/{goal}/change-requests/{id}/value. */
export interface ValueView {
    change_request_id: string;
    /** version: the goal version the launch created, null until launched (agents stay on base_version until then). */
    goal: {
        id: string;
        title: string;
        version: number | null;
        base_version: number;
        team: {
            id: string;
            name: string;
        } | null;
    };
    /** pending | not_yet | launched (an approved request is never superseded: that is another state). */
    launch: LaunchState;
    launched_at: string | null;
    diff: ChangeDiff;
    approved_by: {
        id: string;
        name: string;
    };
    decided_at: string;
    created_at: string;
    approved_without_evidence: boolean | null;
    /** Readable goals only. */
    affected: {
        parents: {
            id: string;
            title: string;
        }[];
        dependents: {
            id: string;
            title: string;
        }[];
    };
    /** The launch's goal_version directive: its target sessions, and those with a received or applied receipt; null
     *  before the launch, or when it reached no session. */
    delivery: {
        sessions: number;
        received: number;
        applied: number;
    } | null;
    /** The connected apps (a workspace owner's: every one; anyone else's: their own) that an MCP goal read sent the
     *  launched version, with when Align first sent it; null before the launch. */
    apps: {
        everyone: boolean;
        items: {
            id: string;
            name: string;
            connected_by: {
                id: string;
                name: string;
            };
            sent_at: string;
        }[];
    } | null;
    /** decision_to_launch and decision_to_first_applied (the launch directive's first applied receipt) are null until
     *  they happened. */
    measured: {
        proposal_to_decision: string;
        decision_to_launch: string | null;
        decision_to_first_applied: string | null;
    };
    /** The reader's own report, if any. */
    my_report: ValueReport | null;
    /** Every report, for the request's participants and approvers and workspace owners; else only the reader's own. */
    reports: ValueReport[];
    /** True when `reports` holds everyone's (the reader is a participant, an approver or a workspace owner). */
    sees_all_reports: boolean;
    follow_up_url: string | null;
}

// The decision value card on an approved change request (PORT-004): what was decided, who approved it, which goals it
// touches, whether it is launched and agents have the new version (the launch's goal_version directive and its
// receipts, LAUNCH-001), how long the decision and the launch took as Align measured them, and the value reports
// of the people involved (an estimate of how long it would have taken without Align, with an optional note; one per
// person per request, editable by its author for 7 days, stored in v2_value_reports). The content-free product events
// (value_card_viewed, value_reported with the estimate only, follow_up_clicked) are recorded once per person per
// workspace. The follow-up link (ALIGN_FOLLOW_UP_URL) is validated and hidden when it is unsafe. The plain rules (the
// answers, note cleaning, spans, the link check) are in lib/v2/value-core.mts, which the web app's card loads too.
// Who reads: every reader of the request (its goal's readers, viewers included) sees the card and records the events,
// and may save their own report; every report is shown to the request's participants (the requester, revision
// authors, the approver and the goal's approval set for it) and to workspace owners, anyone else sees only their own.
// Reports are retained and pseudonymised by the retention job (PERSON_COLUMNS) and deleted with the request.
// Once launched, the card also names the connected AI apps Align sent the new version to (main #56: an MCP goal read
// served it, lib/oauth/grants.ts appsSentGoalVersion), each with when Align first sent it; the reader sees the apps
// they could see on the Apps tab. It says what Align sent, never what an app did with it.
export { ESTIMATES, followUpUrl, loiUrlOk, spanWords, VALUE_EDIT_DAYS, VALUE_NOTE_MAX };
// The card's words and the event's allowed values are the same five ids, in the same order.
const sameEstimates: (typeof ESTIMATE_WORDS)[number]["id"] extends Estimate ? (Estimate extends (typeof ESTIMATE_WORDS)[number]["id"] ? true : never) : never = true;
void sameEstimates;
interface ValueRuntime {
  valueView: (pp: PolicyPrincipal, goalId: string, requestId: string) => ValueView;
  VALUE_ACTIONS: readonly ["viewed", "reported", "follow_up"];
  recordValue: (pp: PolicyPrincipal, goalId: string, requestId: string, b: Body) => Promise<{ recorded: boolean; report: ValueReport | null; }>;
}
const valueService = create_value({
  appsSentGoalVersion: (...args: Parameters<typeof appsSentGoalVersion>) => appsSentGoalVersion(...args),
  ESTIMATES,
  diffOf: (...args: Parameters<typeof diffOf>) => diffOf(...args),
  getChangeRequest: (...args: Parameters<typeof getChangeRequest>) => getChangeRequest(...args),
  all: (...args: Parameters<typeof all>) => all(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  conflict: (...args: Parameters<typeof conflict>) => conflict(...args),
  event: (...args: Parameters<typeof event>) => event(...args),
  goalObj: (...args: Parameters<typeof goalObj>) => goalObj(...args),
  goalRow: (...args: Parameters<typeof goalRow>) => goalRow(...args),
  parentIds: (...args: Parameters<typeof parentIds>) => parentIds(...args),
  newId: (...args: Parameters<typeof newId>) => newId(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  take: (...args: Parameters<typeof take>) => take(...args),
  canReadGoal: (...args: Parameters<typeof canReadGoal>) => canReadGoal(...args),
  oneOf: (...args: Parameters<typeof oneOf>) => oneOf(...args),
  memberName: (...args: Parameters<typeof memberName>) => memberName(...args),
  cleanValueText: (...args: Parameters<typeof cleanValueText>) => cleanValueText(...args),
  followUpUrl: (...args: Parameters<typeof followUpUrl>) => followUpUrl(...args),
  spanWords: (...args: Parameters<typeof spanWords>) => spanWords(...args),
  VALUE_EDIT_DAYS,
  VALUE_NOTE_MAX,
  readDate: () => Date,
}) as unknown as ValueRuntime;

/** The value card of an approved change request, for a reader of it (404 when unreadable, 409 not_approved). */
export function valueView(pp: PolicyPrincipal, goalId: string, requestId: string): ValueView {
    return (0, valueService.valueView)(pp, goalId, requestId);
}
export const VALUE_ACTIONS = valueService.VALUE_ACTIONS;
/** POST .../value {action: "viewed" | "reported" | "follow_up", estimate?, note?}: records the event (and, for
 *  "reported", saves or edits the reader's value report). `recorded` is false when the event was already there. */
export async function recordValue(pp: PolicyPrincipal, goalId: string, requestId: string, b: Body): Promise<{
    recorded: boolean;
    report: ValueReport | null;
}> {
    return (0, valueService.recordValue)(pp, goalId, requestId, b);
}
