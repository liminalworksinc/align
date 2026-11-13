// Caller-owned public types and explicit resource bindings.
import { eventActor, purgeWorkspace, RESTORE_DAYS as providedRestoreDays, sessionMaxDays, testIdpEnabled, type Sql } from "./core.mts";
import { create_retention } from "../native/.bindings/server_retention.js";

export interface RetentionCounts {
    workspaces_purged: number;
    sessions_rolled_up: number;
    usage_rows_rolled_up: number;
    former_members_pseudonymised: number;
    audit_rows_deleted: number;
    codes_deleted: number;
    sign_in_sessions_deleted: number;
    activity_deleted: number;
    invites_deleted: number;
    access_requests_deleted: number;
    events_deleted: number;
    asks_deleted: number;
    value_reports_deleted: number;
    requests_deleted: number;
    deleted_session_markers_deleted: number;
}

interface StepOptions {
    env: NodeJS.ProcessEnv;
    /** ALIGN_SECRET: the key of the product events' actor hash (lib/v2/core.mts eventActor). */
    secret: string;
}

/** A transaction runner: lib/v2/db.ts's tx() in the app, a BEGIN IMMEDIATE wrapper in the operator script. */
export type Tx = <T>(fn: () => T) => T | Promise<T>;

interface RetentionRuntime {
  retentionNow: (env?: NodeJS.ProcessEnv) => Date;
  personName: (id: string, name: string | null | undefined) => string;
  workspacesNaming: (db: Sql, userId: string) => string[];
  noteDeparture: (db: Sql, wsId: string, userId: string, at: string) => void;
  cancelDeparture: (db: Sql, wsId: string, userId: string) => void;
  pseudonymise: (db: Sql, wsId: string, userId: string, at: string, secret: string) => string;
  runRetention: (db: Sql, tx: Tx, now: Date, { dryRun, env, secret }: { dryRun?: boolean; env?: NodeJS.ProcessEnv; secret: string; }) => Promise<RetentionCounts>;
  describeCounts: (c: RetentionCounts) => string;
  RESTORE_DAYS: 30;
  FORMER_MEMBER_DAYS: 30;
  SESSION_MONTHS: 13;
  AUDIT_MONTHS: 12;
  INVITE_GRACE_DAYS: 7;
  ACCESS_REQUEST_MONTHS: 13;
  EVENT_MONTHS: 13;
  CLOSED_ASK_MONTHS: 13;
  VALUE_REPORT_MONTHS: 13;
  REQUEST_MONTHS: 13;
  DELETED_SESSION_MONTHS: 13;
  RETENTION_INTERVAL_MS: number;
  formerMemberId: (n: number) => string;
  PERSON_COLUMNS: readonly (readonly [table: string, column: string])[];
  deleteOrphanDirectives: (db: Sql) => number;
}
const retentionService = create_retention({
  eventActor: (...args: Parameters<typeof eventActor>) => eventActor(...args),
  purgeWorkspace: (...args: Parameters<typeof purgeWorkspace>) => purgeWorkspace(...args),
  RESTORE_DAYS: providedRestoreDays,
  sessionMaxDays: (...args: Parameters<typeof sessionMaxDays>) => sessionMaxDays(...args),
  testIdpEnabled: (...args: Parameters<typeof testIdpEnabled>) => testIdpEnabled(...args),
  readDate: () => Date,
  readProcessEnv: () => process.env,
}) as unknown as RetentionRuntime;

/** The time the job runs at: now, or ALIGN_TEST_NOW for tests (only with ALIGN_TEST_IDP=1, never hosted). */
export function retentionNow(env: NodeJS.ProcessEnv = process.env): Date {
    return (0, retentionService.retentionNow)(env);
}
/** The name to show for a person id in a workspace's rows: "Former member #n" for a pseudonym, `name` when the
 *  account exists, else "Former member". */
export function personName(id: string, name: string | null | undefined): string {
    return (0, retentionService.personName)(id, name);
}
/** Every workspace whose rows name this person (or hold their pending departure). */
export function workspacesNaming(db: Sql, userId: string): string[] {
    return (0, retentionService.workspacesNaming)(db, userId);
}
/** Note that a person left or was removed (call inside the removal's tx): 30 days later they become a former member
 *  in this workspace's rows. Leaving again before then keeps the first date. */
export function noteDeparture(db: Sql, wsId: string, userId: string, at: string): void {
    return (0, retentionService.noteDeparture)(db, wsId, userId, at);
}
/** A person joined again before being pseudonymised: their pending departure is dropped. */
export function cancelDeparture(db: Sql, wsId: string, userId: string): void {
    return (0, retentionService.cancelDeparture)(db, wsId, userId);
}
/** Replace a person's identity in one workspace's rows with "Former member #n" (n stable in that workspace), clear
 *  their sessions' device, drop their email from the workspace (invites to or accepted by them), and clear their
 *  actor (the keyed hash of their id, under `secret`, ALIGN_SECRET) from that workspace's product events. Call inside
 *  a tx, after the person's membership is gone. Returns the pseudonym. */
export function pseudonymise(db: Sql, wsId: string, userId: string, at: string, secret: string): string {
    return (0, retentionService.pseudonymise)(db, wsId, userId, at, secret);
}
/** Apply the schedule as of `now`. Each step is one transaction; a dry run does every step in one transaction and
 *  rolls it back, so its counts are exactly what a real run would do. Running it again changes nothing. `env` gives
 *  ALIGN_SESSION_MAX_DAYS, read as the server reads it; `secret` is ALIGN_SECRET, which keys the product events'
 *  actor hash (cleared for a person who becomes a former member). */
export async function runRetention(db: Sql, tx: Tx, now: Date, { dryRun = false, env = process.env, secret }: {
    dryRun?: boolean;
    env?: NodeJS.ProcessEnv;
    secret: string;
}): Promise<RetentionCounts> {
    return (0, retentionService.runRetention)(db, tx, now, { dryRun, env, secret });
}
/** One line for the log: counts only, never a name, email or id. */
export function describeCounts(c: RetentionCounts): string {
    return (0, retentionService.describeCounts)(c);
}
export const RESTORE_DAYS = retentionService.RESTORE_DAYS;
export const FORMER_MEMBER_DAYS = retentionService.FORMER_MEMBER_DAYS;
export const SESSION_MONTHS = retentionService.SESSION_MONTHS;
export const AUDIT_MONTHS = retentionService.AUDIT_MONTHS;
export const INVITE_GRACE_DAYS = retentionService.INVITE_GRACE_DAYS;
export const ACCESS_REQUEST_MONTHS = retentionService.ACCESS_REQUEST_MONTHS;
export const EVENT_MONTHS = retentionService.EVENT_MONTHS;
export const CLOSED_ASK_MONTHS = retentionService.CLOSED_ASK_MONTHS;
export const VALUE_REPORT_MONTHS = retentionService.VALUE_REPORT_MONTHS;
export const REQUEST_MONTHS = retentionService.REQUEST_MONTHS;
export const DELETED_SESSION_MONTHS = retentionService.DELETED_SESSION_MONTHS;
export const RETENTION_INTERVAL_MS = retentionService.RETENTION_INTERVAL_MS;
export const formerMemberId = (n: number): string => (0, retentionService.formerMemberId)(n);
export const PERSON_COLUMNS = retentionService.PERSON_COLUMNS;
export const deleteOrphanDirectives = (db: Sql): number => (0, retentionService.deleteOrphanDirectives)(db);
