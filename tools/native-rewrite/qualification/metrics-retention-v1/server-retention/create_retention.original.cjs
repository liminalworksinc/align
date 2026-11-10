"use strict";
// Derived original test adapter. Never a generation input.
function create_retention(resources) {
const {eventActor,purgeWorkspace,RESTORE_DAYS,sessionMaxDays,testIdpEnabled,readDate,readProcessEnv} = resources;
const FORMER_MEMBER_DAYS = 30;
const SESSION_MONTHS = 13;
const AUDIT_MONTHS = 12;
const INVITE_GRACE_DAYS = 7;
const ACCESS_REQUEST_MONTHS = 13;
const EVENT_MONTHS = 13;
const CLOSED_ASK_MONTHS = 13;
const VALUE_REPORT_MONTHS = 13;
const REQUEST_MONTHS = 13;
const DELETED_SESSION_MONTHS = 13;
const RETENTION_INTERVAL_MS = 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const daysBefore = (now, days) => new (readDate())(now.getTime() - days * DAY_MS).toISOString();
const monthsBefore = (now, months) => {
    const d = new (readDate())(now.getTime());
    d.setUTCMonth(d.getUTCMonth() - months);
    return d.toISOString();
};
/** The time the job runs at: now, or ALIGN_TEST_NOW for tests (only with ALIGN_TEST_IDP=1, never hosted). */
function retentionNow(env = readProcessEnv()) {
    if (testIdpEnabled(env) && env.ALIGN_TEST_NOW) {
        const t = readDate().parse(env.ALIGN_TEST_NOW);
        if (Number.isFinite(t))
            return new (readDate())(t);
    }
    return new (readDate())();
}
// ---- former members ----
/** A pseudonymised person in one workspace: fm_<n>, shown as "Former member #n". */
const FORMER = /^fm_(\d+)$/;
const formerMemberId = (n) => `fm_${n}`;
/** The name to show for a person id in a workspace's rows: "Former member #n" for a pseudonym, `name` when the
 *  account exists, else "Former member". */
function personName(id, name) {
    const m = FORMER.exec(id);
    if (m)
        return `Former member #${m[1]}`;
    return name ?? "Former member";
}
/** Columns that name a person in a workspace's rows (ws_id names the workspace). Pseudonymisation rewrites each. */
const PERSON_COLUMNS = [
    ["v2_invites", "created_by"],
    ["v2_goals", "owner_id"],
    ["v2_goal_versions", "created_by"],
    ["v2_audit", "actor_id"],
    ["v2_audit", "object_id"],
    ["v2_alignments", "requester_id"],
    ["v2_alignments", "revoked_by"],
    ["v2_alignment_revisions", "author_id"],
    ["v2_alignment_approvals", "user_id"],
    ["v2_sessions", "user_id"],
    ["v2_activity", "user_id"],
    ["v2_change_requests", "requester_id"],
    ["v2_change_requests", "approved_by"],
    ["v2_change_requests", "rejected_by"],
    ["v2_change_requests", "launch_by"],
    ["v2_change_request_revisions", "author_id"],
    ["v2_change_request_revisions", "acknowledged_by"],
    ["v2_change_request_evidence", "added_by"],
    ["v2_asks", "created_by"],
    ["v2_asks", "decided_by"],
    ["v2_ask_mentions", "added_by"],
    ["v2_value_reports", "person_id"],
    ["v2_requests", "sender_id"],
    ["v2_requests", "cancelled_by"],
    ["v2_goal_holds", "held_by"],
    ["v2_reallocations", "requester_id"],
    ["v2_reallocations", "launch_by"],
    ["v2_reallocations", "decided_by"],
    ["v2_reallocation_revisions", "author_id"],
    ["v2_reallocation_approvals", "user_id"],
];
/** Every workspace whose rows name this person (or hold their pending departure). */
function workspacesNaming(db, userId) {
    const parts = PERSON_COLUMNS.map(([t, c]) => `SELECT ws_id FROM ${t} WHERE ${c} = ?1 AND ws_id IS NOT NULL`);
    parts.push("SELECT id AS ws_id FROM v2_workspaces WHERE created_by = ?1");
    parts.push("SELECT ws_id FROM v2_former_members WHERE user_id = ?1");
    parts.push("SELECT ws_id FROM v2_alignment_revisions WHERE instr(approvers_json, ?1) > 0");
    parts.push("SELECT ws_id FROM v2_directives WHERE goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?1");
    parts.push("SELECT ws_id FROM v2_directives WHERE hold_json IS NOT NULL AND json_extract(hold_json, '$.by') = ?1");
    parts.push("SELECT ws_id FROM v2_invites WHERE accepted_by = ?1");
    return db.all(parts.join(" UNION "), userId).map((r) => r.ws_id);
}
/** Note that a person left or was removed (call inside the removal's tx): 30 days later they become a former member
 *  in this workspace's rows. Leaving again before then keeps the first date. */
function noteDeparture(db, wsId, userId, at) {
    db.run("INSERT OR IGNORE INTO v2_former_members (ws_id, user_id, removed_at) VALUES (?, ?, ?)", wsId, userId, at);
}
/** A person joined again before being pseudonymised: their pending departure is dropped. */
function cancelDeparture(db, wsId, userId) {
    db.run("DELETE FROM v2_former_members WHERE ws_id = ? AND user_id = ? AND n IS NULL", wsId, userId);
}
/** Replace a person's identity in one workspace's rows with "Former member #n" (n stable in that workspace), clear
 *  their sessions' device, drop their email from the workspace (invites to or accepted by them), and clear their
 *  actor (the keyed hash of their id, under `secret`, ALIGN_SECRET) from that workspace's product events. Call inside
 *  a tx, after the person's membership is gone. Returns the pseudonym. */
function pseudonymise(db, wsId, userId, at, secret) {
    const n = (db.get("SELECT MAX(n) AS n FROM v2_former_members WHERE ws_id = ?", wsId)?.n ?? 0) + 1;
    const pending = db.get("SELECT rowid AS id, removed_at FROM v2_former_members WHERE ws_id = ? AND user_id = ?", wsId, userId);
    if (pending)
        db.run("UPDATE v2_former_members SET user_id = NULL, n = ?, pseudonymised_at = ? WHERE rowid = ?", n, at, pending.id);
    else
        db.run("INSERT INTO v2_former_members (ws_id, user_id, n, removed_at, pseudonymised_at) VALUES (?, NULL, ?, ?, ?)", wsId, n, at, at);
    const pid = formerMemberId(n);
    const email = db.get("SELECT lower(email) AS email FROM ba_user WHERE id = ?", userId)?.email ?? null;
    db.run("DELETE FROM v2_invites WHERE ws_id = ? AND (accepted_by = ? OR (? IS NOT NULL AND lower(email) = ?))", wsId, userId, email, email);
    db.run("UPDATE v2_sessions SET device_id = NULL WHERE ws_id = ? AND user_id = ?", wsId, userId);
    db.run("UPDATE v2_events SET actor = NULL WHERE ws_id = ? AND actor = ?", wsId, eventActor(secret, userId));
    for (const [t, c] of PERSON_COLUMNS)
        db.run(`UPDATE ${t} SET ${c} = ? WHERE ws_id = ? AND ${c} = ?`, pid, wsId, userId);
    db.run("UPDATE v2_workspaces SET created_by = ? WHERE id = ? AND created_by = ?", pid, wsId, userId);
    // Approval requirements (sets, approved_by, "sessions:<user id>") hold ids inside JSON; ids are 24 random
    // characters, so a plain replacement touches nothing else.
    db.run("UPDATE v2_alignment_revisions SET approvers_json = replace(approvers_json, ?, ?) WHERE ws_id = ? AND instr(approvers_json, ?) > 0", userId, pid, wsId, userId);
    // A directive's goal snapshot names the goal's owner.
    db.run("UPDATE v2_directives SET goal_json = json_set(goal_json, '$.owner', json_object('id', ?, 'name', ?)) WHERE ws_id = ? AND goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?", pid, personName(pid, null), wsId, userId);
    // A hold or release directive names who held or released the goal.
    db.run("UPDATE v2_directives SET hold_json = json_set(hold_json, '$.by', ?) WHERE ws_id = ? AND hold_json IS NOT NULL AND json_extract(hold_json, '$.by') = ?", pid, wsId, userId);
    return pid;
}
// ---- roll-up and trims (purging a workspace is purgeWorkspace in lib/v2/core.mts) ----
/** Directives left with no recipient (their sessions were deleted or rolled up). */
const deleteOrphanDirectives = (db) => db.run("DELETE FROM v2_directives WHERE NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)");
const ROLLUP_SUMS = ["requests", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "est_list_usd_micros", "unpriced_requests"];
/** Add one session's usage to the roll-ups, then delete the session (its epochs, usage, deliveries and receipts
 *  cascade). Returns the number of usage rows rolled up. */
function rollUpSession(db, wsId, key) {
    const rows = db.get("SELECT COUNT(*) AS n FROM v2_usage WHERE ws_id = ? AND session_key = ?", wsId, key)?.n ?? 0;
    db.run(`INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, ${ROLLUP_SUMS.join(", ")})
     SELECT u.ws_id, COALESCE(e.goal_id, ''), substr(u.ts, 1, 10), u.model, u.basis,
            COUNT(*), SUM(u.input), SUM(u.output), SUM(u.cache_read), SUM(u.cache_write_5m), SUM(u.cache_write_1h), SUM(u.cache_write_unsplit),
            COALESCE(SUM(u.est_list_usd_micros), 0), SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END)
     FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND u.session_key = ?
     GROUP BY 1, 2, 3, 4, 5
     ON CONFLICT (ws_id, goal_id, day, model, basis) DO UPDATE SET ${ROLLUP_SUMS.map((k) => `${k} = ${k} + excluded.${k}`).join(", ")}`, wsId, key);
    db.run("DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?", wsId, key);
    return rows;
}
const tableExists = (db, name) => !!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", name);
const STEPS = [
    // 1. Deleted workspaces past the restore window.
    (db, now, c) => {
        for (const w of db.all("SELECT id FROM v2_workspaces WHERE deleted_at IS NOT NULL AND deleted_at <= ?", daysBefore(now, RESTORE_DAYS))) {
            purgeWorkspace(db, w.id);
            c.workspaces_purged++;
        }
    },
    // 10. Requests keep 13 months after they were sent; their targets and the directives that carried them (the request
    //     and its cancellation) go with them. Run before the roll-up, which would otherwise take a request with the last
    //     directive that reached a session.
    (db, now, c) => {
        const old = db.all("SELECT id FROM v2_requests WHERE created_at < ?", monthsBefore(now, REQUEST_MONTHS));
        for (const r of old) {
            c.requests_deleted += db.run("DELETE FROM v2_requests WHERE id = ?", r.id);
            db.run("DELETE FROM v2_directives WHERE kind = 'request' AND json_extract(request_json, '$.request_id') = ?", r.id);
        }
    },
    // 2. Sessions whose end (stop, else last activity: the row, its last upload or epoch) is 13 months old.
    (db, now, c) => {
        const old = db.all(`SELECT s.ws_id, s.session_key FROM v2_sessions s
       WHERE COALESCE(s.stopped_at, max(s.updated_at,
               COALESCE((SELECT MAX(u.received_at) FROM v2_usage u WHERE u.ws_id = s.ws_id AND u.session_key = s.session_key), ''),
               COALESCE((SELECT MAX(e.created_at) FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key), ''))) < ?`, monthsBefore(now, SESSION_MONTHS));
        for (const s of old) {
            c.usage_rows_rolled_up += rollUpSession(db, s.ws_id, s.session_key);
            c.sessions_rolled_up++;
        }
        if (old.length)
            deleteOrphanDirectives(db);
    },
    // 3. People who left or were removed 30 days ago (unless they are members again).
    (db, now, c, o) => {
        const at = now.toISOString();
        for (const f of db.all("SELECT ws_id, user_id FROM v2_former_members WHERE user_id IS NOT NULL AND n IS NULL AND removed_at <= ? ORDER BY removed_at, rowid", daysBefore(now, FORMER_MEMBER_DAYS))) {
            if (db.get("SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?", f.ws_id, f.user_id))
                cancelDeparture(db, f.ws_id, f.user_id);
            else {
                pseudonymise(db, f.ws_id, f.user_id, at, o.secret);
                c.former_members_pseudonymised++;
            }
        }
    },
    // 4. The audit log keeps 1 year.
    (db, now, c) => {
        c.audit_rows_deleted += db.run("DELETE FROM v2_audit WHERE at < ?", monthsBefore(now, AUDIT_MONTHS));
    },
    // 5. Expired codes, sign-in sessions (expired, or past the absolute cap) and activity signals; invites 7 days after
    //    they expire.
    (db, now, c, { env }) => {
        const at = now.toISOString();
        if (tableExists(db, "ba_verification"))
            c.codes_deleted += db.run("DELETE FROM ba_verification WHERE expiresAt < ?", at);
        if (tableExists(db, "ba_session"))
            c.sign_in_sessions_deleted += db.run("DELETE FROM ba_session WHERE expiresAt < ? OR createdAt < ?", at, daysBefore(now, sessionMaxDays(env)));
        c.activity_deleted += db.run("DELETE FROM v2_activity WHERE expires_at < ?", at);
        c.invites_deleted += db.run("DELETE FROM v2_invites WHERE accepted_at IS NULL AND expires_at < ?", daysBefore(now, INVITE_GRACE_DAYS));
    },
    // 6. Access requests: 13 months after the decision, or after the request while it is still pending.
    (db, now, c) => {
        const before = monthsBefore(now, ACCESS_REQUEST_MONTHS);
        c.access_requests_deleted += db.run("DELETE FROM v2_access_requests WHERE (status = 'pending' AND created_at < ?) OR (status <> 'pending' AND COALESCE(decided_at, created_at) < ?)", before, before);
    },
    // 7. Product events keep 13 months.
    (db, now, c) => {
        c.events_deleted += db.run("DELETE FROM v2_events WHERE at < ?", monthsBefore(now, EVENT_MONTHS));
    },
    // 8. Closed asks keep 13 months after their last change (state change or mention); their mentions go with them.
    (db, now, c) => {
        const before = monthsBefore(now, CLOSED_ASK_MONTHS);
        const closed = "state IN ('done','declined','withdrawn') AND updated_at < ?";
        db.run(`DELETE FROM v2_ask_mentions WHERE ask_id IN (SELECT id FROM v2_asks WHERE ${closed})`, before);
        c.asks_deleted += db.run(`DELETE FROM v2_asks WHERE ${closed}`, before);
    },
    // 9. Value reports keep 13 months after their last change.
    (db, now, c) => {
        c.value_reports_deleted += db.run("DELETE FROM v2_value_reports WHERE updated_at < ?", monthsBefore(now, VALUE_REPORT_MONTHS));
    },
    // 10. The markers deleted sessions leave (lib/v2/sessions.ts deleteSession) keep 13 months.
    (db, now, c) => {
        if (tableExists(db, "v2_deleted_sessions"))
            c.deleted_session_markers_deleted += db.run("DELETE FROM v2_deleted_sessions WHERE deleted_at < ?", monthsBefore(now, DELETED_SESSION_MONTHS));
    },
];
const ROLLBACK = Symbol("dry run");
/** Apply the schedule as of `now`. Each step is one transaction; a dry run does every step in one transaction and
 *  rolls it back, so its counts are exactly what a real run would do. Running it again changes nothing. `env` gives
 *  ALIGN_SESSION_MAX_DAYS, read as the server reads it; `secret` is ALIGN_SECRET, which keys the product events'
 *  actor hash (cleared for a person who becomes a former member). */
async function runRetention(db, tx, now, { dryRun = false, env = readProcessEnv(), secret }) {
    const c = {
        workspaces_purged: 0,
        sessions_rolled_up: 0,
        usage_rows_rolled_up: 0,
        former_members_pseudonymised: 0,
        audit_rows_deleted: 0,
        codes_deleted: 0,
        sign_in_sessions_deleted: 0,
        activity_deleted: 0,
        invites_deleted: 0,
        access_requests_deleted: 0,
        events_deleted: 0,
        asks_deleted: 0,
        value_reports_deleted: 0,
        requests_deleted: 0,
        deleted_session_markers_deleted: 0,
    };
    if (dryRun) {
        try {
            await tx(() => {
                for (const s of STEPS)
                    s(db, now, c, { env, secret });
                throw ROLLBACK;
            });
        }
        catch (e) {
            if (e !== ROLLBACK)
                throw e;
        }
        return c;
    }
    for (const s of STEPS)
        await tx(() => s(db, now, c, { env, secret }));
    return c;
}
/** One line for the log: counts only, never a name, email or id. */
function describeCounts(c) {
    return Object.entries(c)
        .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
        .join(", ");
}

return {RESTORE_DAYS,FORMER_MEMBER_DAYS,SESSION_MONTHS,AUDIT_MONTHS,INVITE_GRACE_DAYS,ACCESS_REQUEST_MONTHS,EVENT_MONTHS,CLOSED_ASK_MONTHS,VALUE_REPORT_MONTHS,REQUEST_MONTHS,DELETED_SESSION_MONTHS,RETENTION_INTERVAL_MS,retentionNow,formerMemberId,personName,PERSON_COLUMNS,workspacesNaming,noteDeparture,cancelDeparture,pseudonymise,deleteOrphanDirectives,runRetention,describeCounts};
}
module.exports = {create_retention};
