import { secret } from "../secret";
import { get, sql, tx } from "./db";
import { deleteExpiredExcerpts } from "./excerpt-retention.mts";
import * as core from "./retention-core.mts";

// The retention schedule, bound to the app's database (lib/v2/db.ts). The schedule itself is lib/v2/retention-core.mts,
// shared with the operator's `node scripts/align-admin.mjs retention run [--dry-run]`; this module adds the server's own
// runs: at every start and every 24 hours (instrumentation.ts; never during a build).

export {
  AUDIT_MONTHS,
  CLOSED_ASK_MONTHS,
  describeCounts,
  EVENT_MONTHS,
  FORMER_MEMBER_DAYS,
  formerMemberId,
  INVITE_GRACE_DAYS,
  PERSON_COLUMNS,
  personName,
  RESTORE_DAYS,
  RETENTION_INTERVAL_MS,
  retentionNow,
  SESSION_MONTHS,
  REQUEST_MONTHS,
  VALUE_REPORT_MONTHS,
  type RetentionCounts,
} from "./retention-core.mts";

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
export const runRetention = (now: Date, o: { dryRun?: boolean } = {}) => core.runRetention(sql, tx, now, { ...o, secret: secret() });

const g = globalThis as unknown as { __alignRetention?: ReturnType<typeof setInterval> };

const optionalExpiry = globalThis as typeof globalThis & { alignOptionalExpiry?: ReturnType<typeof setTimeout> };

function nextOptionalSessionExpiry() {
  const { turn, receipt, excerpt } = get<{ turn: string | null; receipt: string | null; excerpt: string | null }>(`
    SELECT (SELECT MIN(turn_started_at) FROM v2_analysis_findings) AS turn,
      (SELECT MIN(received_at) FROM v2_analysis_findings) AS receipt,
      (SELECT MIN(expires_at) FROM v2_session_excerpts) AS excerpt`)!;
  return Math.min(...[turn, receipt].map((at) => at ? Date.parse(at) + core.FINDING_RETENTION_MS : Infinity),
    excerpt ? Date.parse(excerpt) : Infinity);
}

export async function expireOptionalSessionData() {
  if (nextOptionalSessionExpiry() > Date.now()) return;
  await tx(() => {
    const now = new Date();
    core.deleteExpiredFindings(sql, now);
    deleteExpiredExcerpts(sql, now.toISOString());
  });
}

export function scheduleOptionalSessionExpiry(afterFailure = false) {
  clearTimeout(optionalExpiry.alignOptionalExpiry);
  optionalExpiry.alignOptionalExpiry = undefined;
  const next = nextOptionalSessionExpiry();
  if (!Number.isFinite(next)) return;
  optionalExpiry.alignOptionalExpiry = setTimeout(async () => {
    try {
      await expireOptionalSessionData();
      scheduleOptionalSessionExpiry();
    } catch {
      scheduleOptionalSessionExpiry(true);
    }
  }, Math.max(afterFailure ? 1000 : 1, Math.min(2 ** 31 - 1, next - Date.now())));
  optionalExpiry.alignOptionalExpiry.unref();
}

async function runLogged(hosted: boolean) {
  try {
    const c = await runRetention(core.retentionNow());
    if (Object.values(c).some((v) => v > 0)) console.log(`Align retention: ${core.describeCounts(c)}`);
  } catch (e) {
    console.error("Align retention failed:", hosted ? ((e as Error)?.name ?? "unknown") : e);
  }
}

/** Run the job now and every 24 hours in this server process (instrumentation.ts; never during a build). */
export async function startRetention(hosted: boolean) {
  await runLogged(hosted);
  scheduleOptionalSessionExpiry();
  if (g.__alignRetention) return;
  g.__alignRetention = setInterval(() => void runLogged(hosted), core.RETENTION_INTERVAL_MS);
  g.__alignRetention.unref?.();
}
