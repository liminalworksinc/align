// Caller-owned retention resource bindings and public forwarding.
import { secret } from "../secret";
import { sql, tx } from "./db";
import * as core from "./retention-core.mts";
import { create_retention_runner } from "../native/.bindings/server_retention.js";

// The retention schedule, bound to the app's database (lib/v2/db.ts). The schedule itself is lib/v2/retention-core.mts,
// shared with the operator's `node scripts/align-admin.mjs retention run [--dry-run]`; this module adds the server's own
// runs: at every start and every 24 hours (instrumentation.ts; never during a build).
export { AUDIT_MONTHS, CLOSED_ASK_MONTHS, describeCounts, EVENT_MONTHS, FORMER_MEMBER_DAYS, formerMemberId, INVITE_GRACE_DAYS, PERSON_COLUMNS, personName, RESTORE_DAYS, RETENTION_INTERVAL_MS, retentionNow, SESSION_MONTHS, REQUEST_MONTHS, VALUE_REPORT_MONTHS, type RetentionCounts, } from "./retention-core.mts";
/** Every workspace whose rows name this person (or hold their pending departure). */
export const workspacesNaming = (userId: string) => core.workspacesNaming(sql, userId);
/** A person left or was removed (inside the removal's tx): 30 days later they become a former member there. */
export const noteDeparture = (wsId: string, userId: string, at: string) => core.noteDeparture(sql, wsId, userId, at);
/** A person joined again before being pseudonymised: their pending departure is dropped. */
export const cancelDeparture = (wsId: string, userId: string) => core.cancelDeparture(sql, wsId, userId);
/** "Former member #n" in one workspace's rows, at once (inside a tx, after the membership is gone). */
export const pseudonymise = (wsId: string, userId: string, at: string) => core.pseudonymise(sql, wsId, userId, at, secret());
/** Directives left with no recipient. */
export const deleteOrphanDirectives = () => core.deleteOrphanDirectives(sql);
/** The schedule as of `now` on the app's database (each step in its own tx(); a dry run rolls back). */
export const runRetention = (now: Date, o: {
    dryRun?: boolean;
} = {}) => core.runRetention(sql, tx, now, { ...o, secret: secret() });

interface RetentionRunnerRuntime {
  startRetention: (hosted: boolean) => Promise<void>;
}
const retentionRunner = create_retention_runner({
  core,
  runRetention: (...args: Parameters<typeof runRetention>) => runRetention(...args),
  globalState: globalThis,
  readConsole: () => console,
  readSetInterval: () => setInterval,
}) as unknown as RetentionRunnerRuntime;

/** Run the job now and every 24 hours in this server process (instrumentation.ts; never during a build). */
export async function startRetention(hosted: boolean): Promise<void> {
    return (0, retentionRunner.startRetention)(hosted);
}
