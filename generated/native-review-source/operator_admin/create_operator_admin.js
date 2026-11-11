'use strict';

function create_operator_admin(resources) {
  const { existsSync, readFileSync } = resources.fs;
  const path = resources.path;
  const { CODE_DAYS, REQUEST_STATUSES, V1_CODE_RE, RESTORE_DAYS, SCHEMA_VERSION,
    accessRequest, approveAccessRequest, codeEmail, declineAccessRequest,
    importCreationCodes, insertCreationCode, listAccessRequests, listCreationCodes,
    postEmail, purgeWorkspace, revokeCreationCode, serverSecret, undoApproval,
    softDeleteWorkspace, workspaceSummaries } = resources.core;
  const { describeCounts, retentionNow, runRetention } = resources.retention;
  const { buildReport, formatReport, LOI_EVENTS, recordLoi } = resources.metrics;
  const loadSqlite = resources.loadSqlite;
  const process = resources.process;
  const console = resources.console;
  const Date = resources.Date;
  const URL = resources.URL;

  const USAGE = `Usage: node scripts/align-admin.mjs <command>   (or npm run admin -- <command>)
  codes create [--email <address>] [--days <n>] [--count <n>]
  codes import --file <path> --used <path> --days <n>
  codes list
  codes revoke <id>
  requests list [--status pending|approved|declined]
  requests approve <id> [--days <n>] [--print]
  requests decline <id>
  workspaces list
  workspaces delete <id> --yes            (soft: its owners can restore it for ${RESTORE_DAYS} days)
  workspaces delete <id> --purge --yes    (every row, now and for good)
  retention run [--dry-run]
  report [--since YYYY-MM-DD] [--json]
  events record loi_sent --workspace <id> [--note-ref <ref>]
  events record loi_signed --workspace <id> --verified-original [--note-ref <ref>]
Runs against ALIGN_DATA_DIR (else ./data), with the server's environment.`;
  function fail(message, code = 1) { console.error(message); process.exit(code); }
  function integer(opt, k, fallback, max) {
    if (opt[k] === undefined) return fallback;
    const n = Number(opt[k]);
    if (!Number.isInteger(n) || n < 1 || n > max) fail(`--${k} must be a whole number from 1 to ${max}`, 2);
    return n;
  }
  const day = value => value ? value.slice(0, 10) : '-';
  const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  function table(headings, rows) {
    if (!rows.length) { console.log('(none)'); return; }
    const strings = [headings, ...rows].map(row => row.map(String));
    const widths = headings.map((_, i) => Math.max(...strings.map(row => row[i].length)));
    for (const row of strings) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
  }
  function emailApi() {
    const { ALIGN_EMAIL_API_URL: url, ALIGN_EMAIL_API_KEY: key, ALIGN_EMAIL_FROM: from } = process.env;
    if (!url || !key || !from) return null;
    try { if (new URL(url).protocol !== 'https:') return null; } catch { return null; }
    return { url, key, from };
  }
  function publicLink() {
    if (process.env.ALIGN_PUBLIC_ORIGIN) {
      try {
        const url = new URL(process.env.ALIGN_PUBLIC_ORIGIN);
        if (process.env.HOSTED !== '1' || url.protocol === 'https:') return { origin: url.origin, local: false };
      } catch {}
    }
    return process.env.HOSTED === '1' ? null : { origin: 'http://127.0.0.1:' + (process.env.PORT || '3100'), local: true };
  }
  async function run() {
    const argv = process.argv.slice(2), opt = {}, positional = [];
    const switches = new Set(['print', 'yes', 'purge', 'dry-run', 'help', 'json', 'verified-original']);
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (!a.startsWith('--')) { positional.push(a); continue; }
      const k = a.slice(2);
      if (switches.has(k)) opt[k] = true;
      else {
        if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail(`--${k} needs a value\n\n${USAGE}`, 2);
        opt[k] = argv[++i];
      }
    }
    if (opt.help) { console.error(USAGE); process.exit(0); return; }
    const [group, command, arg] = positional;
    if (positional.length < (group === 'report' ? 1 : 2)) fail(USAGE, 2);
    const warnings = process.listeners('warning');
    process.removeAllListeners('warning');
    process.on('warning', warning => {
      if (warning.name === 'ExperimentalWarning' && /sqlite/i.test(warning.message)) return;
      if (warnings.length) { for (const listener of warnings) listener(warning); }
      else console.warn(String(warning));
    });
    const { DatabaseSync } = await loadSqlite();
    const dataDir = path.resolve(process.env.ALIGN_DATA_DIR || path.join(process.cwd(), 'data'));
    const file = path.join(dataDir, 'v2', 'align.sqlite');
    if (!existsSync(file)) fail(`No Align database at ${file}. Set ALIGN_DATA_DIR, or start the server once to create it.`);
    if (process.env.HOSTED === '1' && process.env.ALIGN_TEST_NOW) fail('ALIGN_TEST_NOW is not allowed when hosted', 2);
    const connection = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
    connection.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    const version = Number(connection.prepare('PRAGMA user_version').get().user_version);
    if (version !== SCHEMA_VERSION) {
      connection.close();
      fail(version < SCHEMA_VERSION ? 'This database has not been migrated by this version of Align. Start the current server once so it migrates the database, then try again.' : 'This database is newer than this script. Run the script from the same version of Align as the server.');
    }
    const db = {
      get(sql, ...args) { return connection.prepare(sql).get(...args); },
      all(sql, ...args) { return connection.prepare(sql).all(...args); },
      run(sql, ...args) { return Number(connection.prepare(sql).run(...args).changes); }
    };
    function tx(operation) {
      connection.exec('BEGIN IMMEDIATE');
      try { const result = operation(); connection.exec('COMMIT'); return result; }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    }
    function secret() {
      if (process.env.HOSTED === '1' && !process.env.ALIGN_SECRET) fail('ALIGN_SECRET is not set in this shell. Run this on the server machine (fly ssh console), where it is.');
      return serverSecret(dataDir);
    }
    const key = `${group} ${command}`;
    try {
      if (key === 'codes create') {
        const email = opt.email ? String(opt.email).trim().toLowerCase() : null;
        if (email !== null && !emailValid(email)) fail('--email must be an email address', 2);
        const days = integer(opt, 'days', CODE_DAYS, 365), count = integer(opt, 'count', 1, 50);
        const s = secret();
        const codes = tx(() => Array.from({ length: count }, () => insertCreationCode(db, s, { email, days })));
        console.log(`Created ${count} creation code${count === 1 ? '' : 's'}. Each is shown only now and creates one workspace:`);
        for (const c of codes) console.log(`${c.code}  (${c.id}, ${c.email ? `only for ${c.email}` : 'anyone'}, until ${day(c.expires_at)})`);
      } else if (key === 'codes import') {
        if (typeof opt.file !== 'string' || typeof opt.used !== 'string' || opt.days === undefined) fail(USAGE, 2);
        const days = integer(opt, 'days', CODE_DAYS, 365);
        function read(f) { try { return readFileSync(f, 'utf8'); } catch { fail(`Nothing imported. Can't read ${f}.`); } }
        const text = read(opt.file);
        let used;
        try { used = JSON.parse(read(opt.used)); } catch { fail(`Nothing imported. ${opt.used} isn't JSON.`); }
        if (!Array.isArray(used) || !used.every(s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s))) fail(`Nothing imported. ${opt.used} isn't v1's list of spent codes.`);
        const records = [], bad = [];
        text.split(/\r?\n/).forEach((line, i) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const fields = trimmed.split(',').map(s => s.trim());
          const code = fields[0], email = fields.length > 1 ? fields[1].toLowerCase() : null;
          if (fields.length > 2 || !V1_CODE_RE.test(code) || (email !== null && !emailValid(email))) bad.push(i + 1);
          else records.push({ code, email });
        });
        if (bad.length) fail(`Nothing imported. Expected a v1 invite code (20 lowercase hex characters), optionally followed by a comma and an email address, on line${bad.length === 1 ? '' : 's'} ${bad.join(', ')}.`, 2);
        if (!records.length) fail('Nothing imported. The file holds no codes.', 2);
        const s = secret(), r = tx(() => importCreationCodes(db, s, records, new Set(used), days));
        console.log(`Imported ${r.imported}, for ${days} days. ${r.present} already here, left as they were (${r.used} of those used). ${r.spentOnV1} spent on v1, skipped.`);
      } else if (key === 'codes list') {
        table(['id', 'state', 'binding', 'created', 'expires', 'used', 'workspace', 'request'], listCreationCodes(db).map(c => [c.id, c.state, c.email ? 'bound' : '(anyone)', day(c.created_at), day(c.expires_at), day(c.redeemed_at), c.ws_id ?? '-', c.request_id ?? '-']));
      } else if (key === 'codes revoke') {
        if (!arg) fail(USAGE, 2);
        if (!tx(() => revokeCreationCode(db, arg))) fail(`No unused, unrevoked code ${arg}.`);
        console.log(`Revoked ${arg}.`);
      } else if (key === 'requests list') {
        if (opt.status !== undefined && !REQUEST_STATUSES.includes(opt.status)) fail(`--status must be one of ${REQUEST_STATUSES.join(', ')}`, 2);
        const rows = listAccessRequests(db, opt.status);
        if (!rows.length) console.log('(none)');
        for (const r of rows) {
          console.log(`${r.id}  ${r.status}  ${day(r.created_at)}  ${r.interest === 'evaluate' ? 'evaluate (asks for a follow-up / non-binding LOI)' : 'try'}`);
          console.log(`  ${r.name} <${r.email}>${r.company ? `, ${r.company}` : ''}${r.team_size ? `, team ${r.team_size}` : ''}`);
          console.log(`  ${r.use_case.replace(/\s+/g, ' ')}`);
          if (r.decided_at) console.log(`  decided ${day(r.decided_at)}${r.code_id ? `, code ${r.code_id}` : ''}`);
        }
      } else if (key === 'requests approve') {
        if (!arg) fail(USAGE, 2);
        const days = integer(opt, 'days', CODE_DAYS, 365);
        const api = opt.print ? null : emailApi(), link = publicLink();
        const found = accessRequest(db, arg);
        if (!found) fail(`No pending request ${arg}: no access request has that id, so nothing was approved. requests list shows them.`);
        if (found.status !== 'pending') fail(`No pending request ${arg}: it was already ${found.status} on ${day(found.decided_at)}, so nothing was approved.`);
        if (api && !link) fail(`ALIGN_PUBLIC_ORIGIN is not set in this shell (or is not an https origin), so the email's sign-in link would point at this machine. Nothing was approved; ${arg} is still pending. Run this on the server machine (fly ssh console), where it is set, or add --print to show the code instead.`);
        const result = tx(() => approveAccessRequest(db, secret(), arg, days));
        if (!result) fail(`No pending request ${arg}.`);
        const { request, code } = result;
        if (!api) {
          console.log(`Approved ${request.id}. Give ${request.email} this creation code (shown only now; it works only for that address until ${day(code.expires_at)}):`);
          console.log(code.code);
        } else {
          try { await postEmail(api, { to: request.email, ...codeEmail(link.origin, request.name, code, { local: link.local }) }, 'Access email'); }
          catch {
            tx(() => undoApproval(db, request.id, code.id));
            fail(`The email to ${request.email} could not be sent, so ${request.id} is still pending. Try again, or add --print to show the code instead.`);
          }
          console.log(`Approved ${request.id}: emailed a creation code (${code.id}, until ${day(code.expires_at)}) to ${request.email}.`);
          if (link.local) console.log(`Its sign-in link is ${link.origin}, this computer's local address: it opens only here, and the email says so. Set ALIGN_PUBLIC_ORIGIN to send a link others can open.`);
        }
      } else if (key === 'requests decline') {
        if (!arg) fail(USAGE, 2);
        if (!tx(() => declineAccessRequest(db, arg))) fail(`No pending request ${arg}.`);
        console.log(`Declined ${arg}. Nothing was sent.`);
      } else if (key === 'workspaces list') {
        table(['id', 'name', 'created', 'deleted', 'members', 'owners'], workspaceSummaries(db).map(w => [w.id, w.name, day(w.created_at), w.deleted_at || '-', w.members, w.owners]));
      } else if (key === 'workspaces delete') {
        if (!arg) fail(USAGE, 2);
        const ws = db.get('SELECT id, name, deleted_at FROM v2_workspaces WHERE id = ?', arg);
        if (!ws) fail(`No workspace ${arg}.`);
        if (opt.purge) {
          if (!opt.yes) fail(`This erases ${ws.id} ("${ws.name}") and everything in it now, for good: it can't be restored. Run it again with --purge --yes to go ahead.`);
          tx(() => purgeWorkspace(db, arg));
          console.log(`Purged ${ws.id} ("${ws.name}"): every row of it is gone.`);
        } else {
          if (ws.deleted_at) fail(`${ws.id} ("${ws.name}") was already deleted at ${ws.deleted_at}. Add --purge --yes to erase it now.`);
          if (!opt.yes) fail(`This deletes ${ws.id} ("${ws.name}") for everyone at once; its owners can restore it for ${RESTORE_DAYS} days, then it is erased. Run it again with --yes to go ahead.`);
          tx(() => softDeleteWorkspace(db, arg, null, new Date().toISOString()));
          console.log(`Deleted ${ws.id} ("${ws.name}"). Its owners can restore it from Your workspaces for ${RESTORE_DAYS} days; then the retention job erases it.`);
        }
      } else if (key === 'retention run') {
        const dryRun = Boolean(opt['dry-run']), now = retentionNow();
        const counts = await runRetention(db, tx, now, { dryRun, secret: secret() });
        console.log(`${dryRun ? 'Would' : 'Did'} (as of ${now.toISOString()}): ${describeCounts(counts)}`);
        console.log(JSON.stringify({ now: now.toISOString(), dry_run: dryRun, ...counts }));
      } else if (group === 'report' && command === undefined) {
        if (opt.since !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(opt.since) || Number.isNaN(Date.parse(opt.since + 'T00:00:00Z')))) fail('--since must be a date, YYYY-MM-DD', 2);
        const report = buildReport(db, { since: opt.since ?? null, now: retentionNow() });
        console.log(opt.json ? JSON.stringify(report, null, 2) : formatReport(report));
      } else if (key === 'events record') {
        if (!LOI_EVENTS.includes(arg)) fail(`events record takes ${LOI_EVENTS.join(' or ')}: every other event is recorded by the app itself\n\n${USAGE}`, 2);
        if (!opt.workspace) fail(`--workspace <id> is required\n\n${USAGE}`, 2);
        if (arg === 'loi_sent' && opt['verified-original']) fail('--verified-original is only for loi_signed', 2);
        const out = tx(() => recordLoi(db, arg, opt.workspace, { noteRef: opt['note-ref'] ?? null, verifiedOriginal: Boolean(opt['verified-original']) }));
        if (!out.ok) {
          if (out.reason === 'verified_original_required') fail('loi_signed needs --verified-original: record a signed LOI only when you hold the countersigned original. A form, an email or a claim is not a signature, so nothing was recorded.', 2);
          if (out.reason === 'bad_note_ref') fail('--note-ref must be your own short reference (letters, digits and . _ : -, up to 64), never an email address, a URL or the document', 2);
          if (out.reason === 'no_workspace') fail(`No workspace ${opt.workspace}.`);
          fail(`${arg} was already recorded for ${opt.workspace} at ${out.at}.`);
        }
        console.log(`Recorded ${arg} for ${opt.workspace} at ${out.at}${arg === 'loi_signed' ? ' (verified original)' : ''}.`);
      } else fail(`Unknown command: ${key}\n\n${USAGE}`, 2);
    } finally { connection.close(); }
  }
  return { run };
}

module.exports = { create_operator_admin };
