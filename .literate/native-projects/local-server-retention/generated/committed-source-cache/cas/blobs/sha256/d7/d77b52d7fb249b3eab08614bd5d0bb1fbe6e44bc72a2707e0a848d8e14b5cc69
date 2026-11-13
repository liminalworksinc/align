'use strict';

function create_retention(resources) {
  const { eventActor, purgeWorkspace, RESTORE_DAYS, sessionMaxDays, testIdpEnabled, readDate, readProcessEnv } = resources;
  const FORMER_MEMBER_DAYS = 30, SESSION_MONTHS = 13, AUDIT_MONTHS = 12, INVITE_GRACE_DAYS = 7;
  const ACCESS_REQUEST_MONTHS = 13, EVENT_MONTHS = 13, CLOSED_ASK_MONTHS = 13;
  const VALUE_REPORT_MONTHS = 13, REQUEST_MONTHS = 13, DELETED_SESSION_MONTHS = 13;
  const RETENTION_INTERVAL_MS = 86400000;
  const PERSON_COLUMNS = [
    ['v2_invites','created_by'], ['v2_goals','owner_id'], ['v2_goal_versions','created_by'],
    ['v2_audit','actor_id'], ['v2_audit','object_id'], ['v2_alignments','requester_id'],
    ['v2_alignments','revoked_by'], ['v2_alignment_revisions','author_id'],
    ['v2_alignment_approvals','user_id'], ['v2_sessions','user_id'], ['v2_activity','user_id'],
    ['v2_change_requests','requester_id'], ['v2_change_requests','approved_by'],
    ['v2_change_requests','rejected_by'], ['v2_change_requests','launch_by'],
    ['v2_change_request_revisions','author_id'], ['v2_change_request_revisions','acknowledged_by'],
    ['v2_change_request_evidence','added_by'], ['v2_asks','created_by'], ['v2_asks','decided_by'],
    ['v2_ask_mentions','added_by'], ['v2_value_reports','person_id'], ['v2_requests','sender_id'],
    ['v2_requests','cancelled_by'], ['v2_goal_holds','held_by'], ['v2_reallocations','requester_id'],
    ['v2_reallocations','launch_by'], ['v2_reallocations','decided_by'],
    ['v2_reallocation_revisions','author_id'], ['v2_reallocation_approvals','user_id']
  ];
  const ROLLUP_SUMS = ['requests','input','output','cache_read','cache_write_5m','cache_write_1h','cache_write_unsplit','est_list_usd_micros','unpriced_requests'];
  const rollback = Symbol('dry run');
  function retentionNow(env = readProcessEnv()) {
    if (testIdpEnabled(env) && env.ALIGN_TEST_NOW) {
      const timestamp = readDate().parse(env.ALIGN_TEST_NOW);
      if (Number.isFinite(timestamp)) return new (readDate())(timestamp);
    }
    return new (readDate())();
  }
  function formerMemberId(n) { return `fm_${n}`; }
  function personName(id, name) {
    const match = /^fm_(\d+)$/.exec(id);
    return match ? `Former member #${match[1]}` : name ?? 'Former member';
  }
  function workspacesNaming(db, userId) {
    const parts = PERSON_COLUMNS.map(([table,column]) => `SELECT ws_id FROM ${table} WHERE ${column} = ?1 AND ws_id IS NOT NULL`);
    parts.push('SELECT id AS ws_id FROM v2_workspaces WHERE created_by = ?1',
      'SELECT ws_id FROM v2_former_members WHERE user_id = ?1',
      'SELECT ws_id FROM v2_alignment_revisions WHERE instr(approvers_json, ?1) > 0',
      "SELECT ws_id FROM v2_directives WHERE goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?1",
      "SELECT ws_id FROM v2_directives WHERE hold_json IS NOT NULL AND json_extract(hold_json, '$.by') = ?1",
      'SELECT ws_id FROM v2_invites WHERE accepted_by = ?1');
    return db.all(parts.join(' UNION '), userId).map(row => row.ws_id);
  }
  function noteDeparture(db, wsId, userId, at) {
    db.run('INSERT OR IGNORE INTO v2_former_members (ws_id, user_id, removed_at) VALUES (?, ?, ?)', wsId, userId, at);
  }
  function cancelDeparture(db, wsId, userId) {
    db.run('DELETE FROM v2_former_members WHERE ws_id = ? AND user_id = ? AND n IS NULL', wsId, userId);
  }
  function pseudonymise(db, wsId, userId, at, secret) {
    const n = (db.get('SELECT MAX(n) AS n FROM v2_former_members WHERE ws_id = ?', wsId)?.n ?? 0) + 1;
    const pending = db.get('SELECT rowid AS id, removed_at FROM v2_former_members WHERE ws_id = ? AND user_id = ?', wsId, userId);
    if (pending) db.run('UPDATE v2_former_members SET user_id = NULL, n = ?, pseudonymised_at = ? WHERE rowid = ?', n, at, pending.id);
    else db.run('INSERT INTO v2_former_members (ws_id, user_id, n, removed_at, pseudonymised_at) VALUES (?, NULL, ?, ?, ?)', wsId, n, at, at);
    const pseudonym = formerMemberId(n);
    const email = db.get('SELECT lower(email) AS email FROM ba_user WHERE id = ?', userId)?.email ?? null;
    db.run('DELETE FROM v2_invites WHERE ws_id = ? AND (accepted_by = ? OR (? IS NOT NULL AND lower(email) = ?))', wsId, userId, email, email);
    db.run('UPDATE v2_sessions SET device_id = NULL WHERE ws_id = ? AND user_id = ?', wsId, userId);
    db.run('UPDATE v2_events SET actor = NULL WHERE ws_id = ? AND actor = ?', wsId, eventActor(secret, userId));
    for (const [table,column] of PERSON_COLUMNS) db.run(`UPDATE ${table} SET ${column} = ? WHERE ws_id = ? AND ${column} = ?`, pseudonym, wsId, userId);
    db.run('UPDATE v2_workspaces SET created_by = ? WHERE id = ? AND created_by = ?', pseudonym, wsId, userId);
    db.run('UPDATE v2_alignment_revisions SET approvers_json = replace(approvers_json, ?, ?) WHERE ws_id = ? AND instr(approvers_json, ?) > 0', userId, pseudonym, wsId, userId);
    db.run("UPDATE v2_directives SET goal_json = json_set(goal_json, '$.owner', json_object('id', ?, 'name', ?)) WHERE ws_id = ? AND goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?", pseudonym, personName(pseudonym, null), wsId, userId);
    db.run("UPDATE v2_directives SET hold_json = json_set(hold_json, '$.by', ?) WHERE ws_id = ? AND hold_json IS NOT NULL AND json_extract(hold_json, '$.by') = ?", pseudonym, wsId, userId);
    return pseudonym;
  }
  function deleteOrphanDirectives(db) {
    return db.run('DELETE FROM v2_directives WHERE NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)');
  }
  function daysBefore(now, days) { return new (readDate())(now.getTime() - days * 86400000).toISOString(); }
  function monthsBefore(now, months) {
    const date = new (readDate())(now.getTime());
    date.setUTCMonth(date.getUTCMonth() - months);
    return date.toISOString();
  }
  function tableExists(db, name) { return !!db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", name); }
  function rollUpSession(db, row, counts) {
    const wsId = row.ws_id, key = row.session_key;
    const usage = db.get('SELECT COUNT(*) AS n FROM v2_usage WHERE ws_id = ? AND session_key = ?', wsId, key)?.n ?? 0;
    db.run(`INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, ${ROLLUP_SUMS.join(', ')})
     SELECT u.ws_id, COALESCE(e.goal_id, ''), substr(u.ts, 1, 10), u.model, u.basis,
            COUNT(*), SUM(u.input), SUM(u.output), SUM(u.cache_read), SUM(u.cache_write_5m), SUM(u.cache_write_1h), SUM(u.cache_write_unsplit),
            COALESCE(SUM(u.est_list_usd_micros), 0), SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END)
     FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND u.session_key = ?
     GROUP BY 1, 2, 3, 4, 5
     ON CONFLICT (ws_id, goal_id, day, model, basis) DO UPDATE SET ${ROLLUP_SUMS.map(column => `${column} = ${column} + excluded.${column}`).join(', ')}`, wsId, key);
    db.run('DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?', wsId, key);
    counts.usage_rows_rolled_up += usage;
    counts.sessions_rolled_up++;
  }
  async function runRetention(db, tx, now, { dryRun = false, env = readProcessEnv(), secret }) {
    const counts = { workspaces_purged: 0, sessions_rolled_up: 0, usage_rows_rolled_up: 0, former_members_pseudonymised: 0, audit_rows_deleted: 0, codes_deleted: 0, sign_in_sessions_deleted: 0, activity_deleted: 0, invites_deleted: 0, access_requests_deleted: 0, events_deleted: 0, asks_deleted: 0, value_reports_deleted: 0, requests_deleted: 0, deleted_session_markers_deleted: 0 };
    const steps = [
      () => {
        for (const row of db.all('SELECT id FROM v2_workspaces WHERE deleted_at IS NOT NULL AND deleted_at <= ?', daysBefore(now, RESTORE_DAYS))) {
          purgeWorkspace(db, row.id); counts.workspaces_purged++;
        }
      },
      () => {
        for (const row of db.all('SELECT id FROM v2_requests WHERE created_at < ?', monthsBefore(now, REQUEST_MONTHS))) {
          counts.requests_deleted += db.run('DELETE FROM v2_requests WHERE id = ?', row.id);
          db.run("DELETE FROM v2_directives WHERE kind = 'request' AND json_extract(request_json, '$.request_id') = ?", row.id);
        }
      },
      () => {
        const rows = db.all(`SELECT s.ws_id, s.session_key FROM v2_sessions s
       WHERE COALESCE(s.stopped_at, max(s.updated_at,
               COALESCE((SELECT MAX(u.received_at) FROM v2_usage u WHERE u.ws_id = s.ws_id AND u.session_key = s.session_key), ''),
               COALESCE((SELECT MAX(e.created_at) FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key), ''))) < ?`, monthsBefore(now, SESSION_MONTHS));
        for (const row of rows) rollUpSession(db, row, counts);
        if (rows.length) deleteOrphanDirectives(db);
      },
      () => {
        const at = now.toISOString();
        for (const row of db.all('SELECT ws_id, user_id FROM v2_former_members WHERE user_id IS NOT NULL AND n IS NULL AND removed_at <= ? ORDER BY removed_at, rowid', daysBefore(now, FORMER_MEMBER_DAYS))) {
          if (db.get('SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?', row.ws_id, row.user_id)) cancelDeparture(db, row.ws_id, row.user_id);
          else { pseudonymise(db, row.ws_id, row.user_id, at, secret); counts.former_members_pseudonymised++; }
        }
      },
      () => { counts.audit_rows_deleted += db.run('DELETE FROM v2_audit WHERE at < ?', monthsBefore(now, AUDIT_MONTHS)); },
      () => {
        const at = now.toISOString();
        if (tableExists(db, 'ba_verification')) counts.codes_deleted += db.run('DELETE FROM ba_verification WHERE expiresAt < ?', at);
        if (tableExists(db, 'ba_session')) counts.sign_in_sessions_deleted += db.run('DELETE FROM ba_session WHERE expiresAt < ? OR createdAt < ?', at, daysBefore(now, sessionMaxDays(env)));
        counts.activity_deleted += db.run('DELETE FROM v2_activity WHERE expires_at < ?', at);
        counts.invites_deleted += db.run('DELETE FROM v2_invites WHERE accepted_at IS NULL AND expires_at < ?', daysBefore(now, INVITE_GRACE_DAYS));
      },
      () => {
        const cutoff = monthsBefore(now, ACCESS_REQUEST_MONTHS);
        counts.access_requests_deleted += db.run("DELETE FROM v2_access_requests WHERE (status = 'pending' AND created_at < ?) OR (status <> 'pending' AND COALESCE(decided_at, created_at) < ?)", cutoff, cutoff);
      },
      () => { counts.events_deleted += db.run('DELETE FROM v2_events WHERE at < ?', monthsBefore(now, EVENT_MONTHS)); },
      () => {
        const cutoff = monthsBefore(now, CLOSED_ASK_MONTHS);
        const condition = "state IN ('done','declined','withdrawn') AND updated_at < ?";
        db.run(`DELETE FROM v2_ask_mentions WHERE ask_id IN (SELECT id FROM v2_asks WHERE ${condition})`, cutoff);
        counts.asks_deleted += db.run(`DELETE FROM v2_asks WHERE ${condition}`, cutoff);
      },
      () => { counts.value_reports_deleted += db.run('DELETE FROM v2_value_reports WHERE updated_at < ?', monthsBefore(now, VALUE_REPORT_MONTHS)); },
      () => { if (tableExists(db, 'v2_deleted_sessions')) counts.deleted_session_markers_deleted += db.run('DELETE FROM v2_deleted_sessions WHERE deleted_at < ?', monthsBefore(now, DELETED_SESSION_MONTHS)); }
    ];
    if (dryRun) {
      try { await tx(() => { for (const step of steps) step(); throw rollback; }); }
      catch (error) { if (error !== rollback) throw error; }
    } else { for (const step of steps) await tx(() => step()); }
    return counts;
  }
  function describeCounts(counts) { return Object.entries(counts).map(([name,value]) => `${name.replace(/_/g, ' ')} ${value}`).join(', '); }
  return { RESTORE_DAYS, FORMER_MEMBER_DAYS, SESSION_MONTHS, AUDIT_MONTHS, INVITE_GRACE_DAYS, ACCESS_REQUEST_MONTHS, EVENT_MONTHS, CLOSED_ASK_MONTHS, VALUE_REPORT_MONTHS, REQUEST_MONTHS, DELETED_SESSION_MONTHS, RETENTION_INTERVAL_MS, retentionNow, formerMemberId, personName, PERSON_COLUMNS, workspacesNaming, noteDeparture, cancelDeparture, pseudonymise, deleteOrphanDirectives, runRetention, describeCounts };
}

module.exports = { create_retention };
