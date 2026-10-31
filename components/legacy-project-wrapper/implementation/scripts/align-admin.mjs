#!/usr/bin/env node
// align-admin: the operator's tool for a v2 server's data directory (the replacement for v1's ws-admin). It runs on the
// server's own machine against ALIGN_DATA_DIR (else ./data), beside the running server:
//   fly ssh console -C "node scripts/align-admin.mjs requests list"      (hosted)
//   npm run admin -- codes create --email someone@example.com            (Mode L, or any checkout)
// It imports only lib/v2/core.mts, lib/v2/retention-core.mts and lib/v2/metrics-core.mts (Node built-ins only), the
// same code the app runs for creation codes, access requests, workspace deletion and purging, product events and the
// retention schedule. It never prints a secret except a creation code it has just made. Run it with the server's environment (fly ssh console has it): the
// retention job reads ALIGN_SESSION_MAX_DAYS as the server does, and hosted the codes need ALIGN_SECRET.
//
//   codes create [--email <address>] [--days <n>] [--count <n>]   new creation codes, each printed once
//   codes list                                                    every code: id, state, binding, dates (no secrets)
//   codes revoke <id>                                             revoke an unused code
//   requests list [--status pending|approved|declined]
//   requests approve <id> [--days <n>] [--print]                  an email-bound code, emailed when email is set up
//   requests decline <id>
//   workspaces list                                               id, name, created, deleted, member and owner counts
//   workspaces delete <id> --yes                                  the app's own deletion path: a soft delete, which
//                                                                 its owners can restore for 30 days
//   workspaces delete <id> --purge --yes                          every row of it, now and for good
//   retention run [--dry-run]                                     the retention schedule now (docs/RETENTION.md), or
//                                                                 what it would do (scripts/retention.mjs is the same)
//   report [--since YYYY-MM-DD] [--json]                          funnel, time to first value, weekly active
//                                                                 workspaces, retention, goal binding, LOIs (no content)
//   events record loi_sent --workspace <id> [--note-ref <ref>]    an LOI sent to that workspace's organisation
//   events record loi_signed --workspace <id> --verified-original [--note-ref <ref>]
//                                                                 a signed LOI, only with the countersigned original in
//                                                                 hand; never inferred from a form or a claim

import { existsSync } from "node:fs";
import path from "node:path";
import {
  CODE_DAYS,
  REQUEST_STATUSES,
  RESTORE_DAYS,
  SCHEMA_VERSION,
  approveAccessRequest,
  codeEmail,
  declineAccessRequest,
  insertCreationCode,
  listAccessRequests,
  listCreationCodes,
  postEmail,
  purgeWorkspace,
  revokeCreationCode,
  serverSecret,
  undoApproval,
  softDeleteWorkspace,
  workspaceSummaries,
} from "../lib/v2/core.mts";
import { describeCounts, retentionNow, runRetention } from "../lib/v2/retention-core.mts";
import { buildReport, formatReport, LOI_EVENTS, recordLoi } from "../lib/v2/metrics-core.mts";

const USAGE = `Usage: node scripts/align-admin.mjs <command>   (or npm run admin -- <command>)
  codes create [--email <address>] [--days <n>] [--count <n>]
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

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

// ---- arguments: positionals, then --flag value / --switch ----
const SWITCHES = new Set(["print", "yes", "purge", "dry-run", "help", "json", "verified-original"]);
const pos = [];
const opt = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) {
    pos.push(a);
    continue;
  }
  const k = a.slice(2);
  if (SWITCHES.has(k)) opt[k] = true;
  else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) opt[k] = argv[++i];
  else fail(`--${k} needs a value\n\n${USAGE}`, 2);
}
if (opt.help || pos.length < (pos[0] === "report" ? 1 : 2)) fail(USAGE, opt.help ? 0 : 2);
const [group, cmd, arg] = pos;
const intOpt = (k, def, max) => {
  if (opt[k] === undefined) return def;
  const n = Number(opt[k]);
  if (!Number.isInteger(n) || n < 1 || n > max) fail(`--${k} must be a whole number from 1 to ${max}`, 2);
  return n;
};

// ---- the database and the server secret, as the server finds them ----
// Node marks node:sqlite experimental and says so on every run; the operator needs every other warning, not that one.
const shown = process.listeners("warning");
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name === "ExperimentalWarning" && /SQLite/i.test(w.message)) return;
  if (shown.length) for (const f of shown) f(w);
  else console.warn(String(w));
});
const { DatabaseSync } = await import("node:sqlite");
const hosted = process.env.HOSTED === "1";
const dataDir = path.resolve(process.env.ALIGN_DATA_DIR || path.join(process.cwd(), "data"));
const file = path.join(dataDir, "v2", "align.sqlite");
if (!existsSync(file)) fail(`No Align database at ${file}. Set ALIGN_DATA_DIR, or start the server once to create it.`);
if (hosted && process.env.ALIGN_TEST_NOW) fail("ALIGN_TEST_NOW is not allowed when hosted", 2);
const d = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
d.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
const version = Number(d.prepare("PRAGMA user_version").get().user_version);
if (version !== SCHEMA_VERSION) {
  d.close();
  fail(
    version < SCHEMA_VERSION
      ? "This database has not been migrated by this version of Align. Start the current server once so it migrates the database, then try again."
      : "This database is newer than this script. Run the script from the same version of Align as the server.",
  );
}
/** The same three helpers lib/v2/db.ts gives the app (lib/v2/core.mts's Sql). */
const db = {
  run: (sql, ...p) => Number(d.prepare(sql).run(...p).changes),
  get: (sql, ...p) => d.prepare(sql).get(...p),
  all: (sql, ...p) => d.prepare(sql).all(...p),
};
function tx(fn) {
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
/** The app's tx() for lib/v2/retention-core.mts: synchronous here (the script has the connection to itself). */
const txAsync = (fn) => tx(fn);
const secret = () => {
  // Hosted, the secret comes from the platform; generating one here would make codes the server can't check.
  if (hosted && !process.env.ALIGN_SECRET) fail("ALIGN_SECRET is not set in this shell. Run this on the server machine (fly ssh console), where it is.");
  return serverSecret(dataDir);
};
const day = (iso) => (iso ? iso.slice(0, 10) : "-");
const table = (rows, cols) => {
  if (!rows.length) return console.log("(none)");
  const w = cols.map(([h, f]) => Math.max(h.length, ...rows.map((r) => String(f(r)).length)));
  console.log(cols.map(([h], i) => h.padEnd(w[i])).join("  "));
  for (const r of rows) console.log(cols.map(([, f], i) => String(f(r)).padEnd(w[i])).join("  "));
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The email API, as lib/v2/config.ts emailApi() reads it: all three settings, https. */
function emailApi() {
  const { ALIGN_EMAIL_API_URL: url, ALIGN_EMAIL_API_KEY: key, ALIGN_EMAIL_FROM: from } = process.env;
  if (!url || !key || !from) return null;
  try {
    return new URL(url).protocol === "https:" ? { url, key, from } : null;
  } catch {
    return null;
  }
}
const origin = () => {
  try {
    if (process.env.ALIGN_PUBLIC_ORIGIN) return new URL(process.env.ALIGN_PUBLIC_ORIGIN).origin;
  } catch {}
  return `http://127.0.0.1:${process.env.PORT || "3100"}`;
};

// ---- commands ----
async function main() {
  const key = `${group} ${cmd}`;
  if (key === "codes create") {
    const email = opt.email ? String(opt.email).trim().toLowerCase() : null;
    if (email !== null && !EMAIL.test(email)) fail("--email must be an email address", 2);
    const days = intOpt("days", CODE_DAYS, 365);
    const count = intOpt("count", 1, 50);
    const s = secret();
    const made = tx(() => Array.from({ length: count }, () => insertCreationCode(db, s, { email, days })));
    console.log(`Created ${count} creation code${count === 1 ? "" : "s"}. Each is shown only now and creates one workspace:`);
    for (const c of made) console.log(`${c.code}  (${c.id}, ${c.email ? `only for ${c.email}` : "anyone"}, until ${day(c.expires_at)})`);
    return;
  }
  if (key === "codes list") {
    table(listCreationCodes(db), [
      ["id", (r) => r.id],
      ["state", (r) => r.state],
      ["email", (r) => r.email ?? "(anyone)"],
      ["created", (r) => day(r.created_at)],
      ["expires", (r) => day(r.expires_at)],
      ["used", (r) => day(r.redeemed_at)],
      ["workspace", (r) => r.ws_id ?? "-"],
      ["request", (r) => r.request_id ?? "-"],
    ]);
    return;
  }
  if (key === "codes revoke") {
    if (!arg) fail(USAGE, 2);
    if (!tx(() => revokeCreationCode(db, arg))) fail(`No unused, unrevoked code ${arg}.`);
    console.log(`Revoked ${arg}.`);
    return;
  }
  if (key === "requests list") {
    if (opt.status !== undefined && !REQUEST_STATUSES.includes(opt.status)) fail(`--status must be one of ${REQUEST_STATUSES.join(", ")}`, 2);
    const rows = listAccessRequests(db, opt.status);
    if (!rows.length) return console.log("(none)");
    for (const r of rows) {
      console.log(`${r.id}  ${r.status}  ${day(r.created_at)}  ${r.interest === "evaluate" ? "evaluate (asks for a follow-up / non-binding LOI)" : "try"}`);
      console.log(`  ${r.name} <${r.email}>${r.company ? `, ${r.company}` : ""}${r.team_size ? `, team ${r.team_size}` : ""}`);
      console.log(`  ${r.use_case.replace(/\s+/g, " ")}`);
      if (r.decided_at) console.log(`  decided ${day(r.decided_at)}${r.code_id ? `, code ${r.code_id}` : ""}`);
    }
    return;
  }
  if (key === "requests approve") {
    if (!arg) fail(USAGE, 2);
    const days = intOpt("days", CODE_DAYS, 365);
    const api = opt.print ? null : emailApi();
    const out = tx(() => approveAccessRequest(db, secret(), arg, days));
    if (!out) fail(`No pending request ${arg}.`);
    const { request, code } = out;
    if (!api) {
      console.log(`Approved ${request.id}. Give ${request.email} this creation code (shown only now; it works only for that address until ${day(code.expires_at)}):`);
      console.log(code.code);
      return;
    }
    try {
      await postEmail(api, { to: request.email, ...codeEmail(origin(), request.name, code) }, "Access email");
    } catch {
      // Nothing half-done: the code is revoked and the request is pending again.
      tx(() => undoApproval(db, request.id, code.id));
      fail(`The email to ${request.email} could not be sent, so ${request.id} is still pending. Try again, or add --print to show the code instead.`);
    }
    console.log(`Approved ${request.id}: emailed a creation code (${code.id}, until ${day(code.expires_at)}) to ${request.email}.`);
    return;
  }
  if (key === "requests decline") {
    if (!arg) fail(USAGE, 2);
    if (!tx(() => declineAccessRequest(db, arg))) fail(`No pending request ${arg}.`);
    console.log(`Declined ${arg}. Nothing was sent.`);
    return;
  }
  if (key === "workspaces list") {
    table(workspaceSummaries(db), [
      ["id", (r) => r.id],
      ["name", (r) => r.name],
      ["created", (r) => day(r.created_at)],
      ["deleted", (r) => (r.deleted_at ? r.deleted_at : "-")],
      ["members", (r) => r.members],
      ["owners", (r) => r.owners],
    ]);
    return;
  }
  if (key === "workspaces delete") {
    if (!arg) fail(USAGE, 2);
    const ws = db.get("SELECT id, name, deleted_at FROM v2_workspaces WHERE id = ?", arg);
    if (!ws) fail(`No workspace ${arg}.`);
    if (opt.purge) {
      if (!opt.yes) fail(`This erases ${ws.id} ("${ws.name}") and everything in it now, for good: it can't be restored. Run it again with --purge --yes to go ahead.`);
      tx(() => purgeWorkspace(db, arg));
      console.log(`Purged ${ws.id} ("${ws.name}"): every row of it is gone.`);
      return;
    }
    if (ws.deleted_at) fail(`${ws.id} ("${ws.name}") was already deleted at ${ws.deleted_at}. Add --purge --yes to erase it now.`);
    if (!opt.yes) fail(`This deletes ${ws.id} ("${ws.name}") for everyone at once; its owners can restore it for ${RESTORE_DAYS} days, then it is erased. Run it again with --yes to go ahead.`);
    tx(() => softDeleteWorkspace(db, arg, null, new Date().toISOString()));
    console.log(`Deleted ${ws.id} ("${ws.name}"). Its owners can restore it from Your workspaces for ${RESTORE_DAYS} days; then the retention job erases it.`);
    return;
  }
  if (key === "retention run") {
    // The schedule as of now (or ALIGN_TEST_NOW, only with ALIGN_TEST_IDP=1, for tests), each step one short
    // transaction, safe beside the running server. A dry run does it all in one transaction and rolls it back.
    const dryRun = !!opt["dry-run"];
    const now = retentionNow();
    // ALIGN_SECRET keys the product events' actor hash, cleared for anyone the job makes a former member.
    const counts = await runRetention(db, txAsync, now, { dryRun, secret: secret() });
    console.log(`${dryRun ? "Would" : "Did"} (as of ${now.toISOString()}): ${describeCounts(counts)}`);
    console.log(JSON.stringify({ now: now.toISOString(), dry_run: dryRun, ...counts }));
    return;
  }
  if (group === "report" && cmd === undefined) {
    const since = opt.since;
    if (since !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(since) && !Number.isNaN(Date.parse(`${since}T00:00:00Z`)))) fail("--since must be a date, YYYY-MM-DD", 2);
    const report = buildReport(db, { since: since ?? null, now: retentionNow() });
    console.log(opt.json ? JSON.stringify(report, null, 2) : formatReport(report));
    return;
  }
  if (key === "events record") {
    if (!LOI_EVENTS.includes(arg)) fail(`events record takes ${LOI_EVENTS.join(" or ")}: every other event is recorded by the app itself\n\n${USAGE}`, 2);
    if (!opt.workspace) fail(`--workspace <id> is required\n\n${USAGE}`, 2);
    if (arg === "loi_sent" && opt["verified-original"]) fail("--verified-original is only for loi_signed", 2);
    const out = tx(() => recordLoi(db, arg, opt.workspace, { noteRef: opt["note-ref"] ?? null, verifiedOriginal: !!opt["verified-original"] }));
    if (!out.ok) {
      if (out.reason === "verified_original_required") {
        fail("loi_signed needs --verified-original: record a signed LOI only when you hold the countersigned original. A form, an email or a claim is not a signature, so nothing was recorded.", 2);
      }
      if (out.reason === "bad_note_ref") fail("--note-ref must be your own short reference (letters, digits and . _ : -, up to 64), never an email address, a URL or the document", 2);
      if (out.reason === "no_workspace") fail(`No workspace ${opt.workspace}.`);
      fail(`${arg} was already recorded for ${opt.workspace} at ${out.at}.`);
    }
    console.log(`Recorded ${arg} for ${opt.workspace} at ${out.at}${arg === "loi_signed" ? " (verified original)" : ""}.`);
    return;
  }
  fail(`Unknown command: ${key}\n\n${USAGE}`, 2);
}

try {
  await main();
} finally {
  d.close();
}
