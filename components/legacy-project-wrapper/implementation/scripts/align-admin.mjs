#!/usr/bin/env node
// align-admin: the operator's tool for a v2 server's data directory (the replacement for v1's ws-admin). It runs on the
// server's own machine against ALIGN_DATA_DIR (else ./data), beside the running server:
//   fly ssh console -C "node scripts/align-admin.mjs requests list"      (hosted)
//   npm run admin -- codes create --email someone@example.com            (Mode L, or any checkout)
// It imports only lib/v2/core.mts (Node built-ins only), the same code the app runs for creation codes, access
// requests and workspace deletion. It never prints a secret except a creation code it has just made.
//
//   codes create [--email <address>] [--days <n>] [--count <n>]   new creation codes, each printed once
//   codes list                                                    every code: id, state, binding, dates (no secrets)
//   codes revoke <id>                                             revoke an unused code
//   requests list [--status pending|approved|declined]
//   requests approve <id> [--days <n>] [--print]                  an email-bound code, emailed when email is set up
//   requests decline <id>
//   workspaces list                                               id, name, created, member and owner counts
//   workspaces delete <id> --yes                                  the app's own deletion path

import { existsSync } from "node:fs";
import path from "node:path";
import {
  CODE_DAYS,
  REQUEST_STATUSES,
  approveAccessRequest,
  codeEmail,
  declineAccessRequest,
  insertCreationCode,
  listAccessRequests,
  listCreationCodes,
  postEmail,
  removeWorkspace,
  revokeCreationCode,
  serverSecret,
  workspaceSummaries,
} from "../lib/v2/core.mts";

const USAGE = `Usage: node scripts/align-admin.mjs <command>   (or npm run admin -- <command>)
  codes create [--email <address>] [--days <n>] [--count <n>]
  codes list
  codes revoke <id>
  requests list [--status pending|approved|declined]
  requests approve <id> [--days <n>] [--print]
  requests decline <id>
  workspaces list
  workspaces delete <id> --yes
Runs against ALIGN_DATA_DIR (else ./data).`;

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

// ---- arguments: positionals, then --flag value / --switch ----
const SWITCHES = new Set(["print", "yes", "help"]);
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
if (opt.help || pos.length < 2) fail(USAGE, opt.help ? 0 : 2);
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
const d = new DatabaseSync(file, { enableForeignKeyConstraints: true, timeout: 5000 });
d.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
if (!d.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'v2_creation_codes'").get()) {
  fail("This database predates creation codes. Start the current server once so it migrates the database, then try again.");
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
      tx(() => {
        revokeCreationCode(db, code.id);
        db.run("UPDATE v2_access_requests SET status = 'pending', decided_at = NULL, code_id = NULL WHERE id = ?", request.id);
      });
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
      ["members", (r) => r.members],
      ["owners", (r) => r.owners],
    ]);
    return;
  }
  if (key === "workspaces delete") {
    if (!arg) fail(USAGE, 2);
    const ws = db.get("SELECT id, name FROM v2_workspaces WHERE id = ?", arg);
    if (!ws) fail(`No workspace ${arg}.`);
    if (!opt.yes) fail(`This deletes ${ws.id} ("${ws.name}") and everything in it, for good. Run it again with --yes to go ahead.`);
    tx(() => removeWorkspace(db, arg));
    console.log(`Deleted ${ws.id} ("${ws.name}") and everything in it.`);
    return;
  }
  fail(`Unknown command: ${key}\n\n${USAGE}`, 2);
}

try {
  await main();
} finally {
  d.close();
}
