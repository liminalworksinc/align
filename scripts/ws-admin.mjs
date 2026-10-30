#!/usr/bin/env node
// Operator tool for custom workspaces (go-C condition 4). Run on the server, e.g. inside `fly ssh console`:
//   node scripts/ws-admin.mjs list
//   node scripts/ws-admin.mjs funnel [--with-feedback]   (funnel events per workspace and totals; free text only with the flag)
//   node scripts/ws-admin.mjs delete <workspace id>
//   node scripts/ws-admin.mjs delete --all --yes      (every workspace: the end-of-test purge)
// Reads ALIGN_DATA_DIR (workspaces live in <ALIGN_DATA_DIR>/workspaces). Deletes the way the app does: rename the
// folder aside, remove it, then append a "deleted" row to _events.jsonl. Safe while the server runs: a request
// in flight for that workspace gets 404, and the app never recreates a missing workspace. Volume snapshots are
// separate: see docs/HOSTING.md.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const WS_ID = /^w_[a-z2-7]{12}$/; // lib/workspace.ts CustomWsId
const dataDir = process.env.ALIGN_DATA_DIR;
if (!dataDir || !path.isAbsolute(dataDir)) {
  console.error("ws-admin: set ALIGN_DATA_DIR to the absolute data directory (on the server: /data)");
  process.exit(2);
}
const root = path.join(dataDir, "workspaces");
const [cmd, arg, confirm] = process.argv.slice(2);

const ids = () => (existsSync(root) ? readdirSync(root).filter((n) => WS_ID.test(n)) : []).sort();
function meta(id) {
  try {
    return JSON.parse(readFileSync(path.join(root, id, "workspace.json"), "utf8"));
  } catch {
    return {};
  }
}
function remove(id) {
  const aside = path.join(root, `.deleting-${id}`);
  renameSync(path.join(root, id), aside); // atomic: from here every request for it is 404
  rmSync(aside, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  appendFileSync(path.join(root, "_events.jsonl"), JSON.stringify({ ts: new Date().toISOString(), event: "deleted", id, by: "ws-admin" }) + "\n", { mode: 0o600 });
  console.log(`deleted ${id}`);
}

if (cmd === "list") {
  const all = ids();
  for (const id of all) {
    const m = meta(id);
    let changed = "";
    try {
      changed = statSync(path.join(root, id, "state.json")).mtime.toISOString();
    } catch {}
    console.log(`${id}  created ${m.created_at ?? "?"}  last change ${changed || "?"}  ${m.name ?? ""}`);
  }
  console.log(`${all.length} workspace(s)`);
} else if (cmd === "delete" && arg === "--all") {
  if (confirm !== "--yes") {
    console.error(`ws-admin: this deletes all ${ids().length} workspaces. Run again with: delete --all --yes`);
    process.exit(2);
  }
  for (const id of ids()) remove(id);
  // AI apps that registered themselves (names and redirect URIs, lib/oauth/clients.ts) go with the workspaces.
  if (existsSync(path.join(root, "_oauth_clients.json"))) {
    rmSync(path.join(root, "_oauth_clients.json"), { force: true });
    console.log("removed _oauth_clients.json");
  }
  // Crash leftovers hold tester data too (.tmp-<id>: state and passcode hashes; .deleting-<id>: a whole workspace).
  for (const n of existsSync(root) ? readdirSync(root) : []) {
    if (/^\.(tmp|deleting)-w_[a-z2-7]{12}$/.test(n)) {
      rmSync(path.join(root, n), { recursive: true, force: true });
      console.log(`removed leftover ${n}`);
    }
  }
} else if (cmd === "delete" && arg) {
  if (!WS_ID.test(arg)) {
    console.error(`ws-admin: not a workspace id: ${arg}`);
    process.exit(2);
  }
  if (!existsSync(path.join(root, arg))) {
    console.error(`ws-admin: no workspace ${arg}`);
    process.exit(1);
  }
  remove(arg);
} else if (cmd === "funnel") {
  // Issue #30 item 5: per workspace, the funnel from existing data plus the decision value card's events (state.funnel,
  // role and time only). Never prints names, passcodes or codes; free text only with --with-feedback.
  // invited = invite codes issued (outside the app); accepted = workspace created; started = first signed-in action
  // (a sign-in itself isn't logged); finished = a proposal RATIFIED.
  const withFeedback = process.argv.slice(3).includes("--with-feedback");
  const all = ids();
  const totals = { workspaces: all.length, started: 0, finished: 0 };
  const counts = {}; // event name -> { events, workspaces }
  const bump = (name, n = 1) => {
    counts[name] ??= { events: 0, workspaces: 0 };
    counts[name].events += n;
    counts[name].workspaces += 1;
  };
  for (const id of all) {
    let s = {};
    try {
      s = JSON.parse(readFileSync(path.join(root, id, "state.json"), "utf8"));
    } catch {
      console.log(`${id}  state unreadable`);
      continue;
    }
    const rows = [];
    const created = meta(id).created_at;
    if (created) rows.push([created, "accepted (workspace created)", ""]);
    const acts = [...(s.audit ?? []).map((a) => a.at), ...(s.timer?.touchpoints ?? []).map((t) => t.at), ...(s.funnel?.events ?? []).map((e) => e.at)].filter(Boolean).sort();
    if (acts.length) {
      rows.push([acts[0], "started (first signed-in action)", ""]);
      totals.started++;
    }
    // From the audit log, which Restart keeps (the acceptances themselves are rebuilt away).
    const audit = s.audit ?? [];
    const ratified = [...audit.filter((a) => /^ratify/.test(a.action)).map((a) => a.at), ...(s.acceptances ?? []).map((a) => a.ratified_at)].filter(Boolean).sort();
    if (ratified.length) {
      rows.push([ratified[0], "finished (proposal ratified)", ""]);
      totals.finished++;
    }
    for (const a of audit) if (a.action === "launch_approved" || a.action === "launch_not_yet") rows.push([a.at, a.action, "leadership"]);
    const seen = new Set();
    for (const e of s.funnel?.events ?? []) {
      rows.push([e.at, e.action, e.role]);
      if (!seen.has(e.action)) {
        seen.add(e.action);
        bump(e.action, (s.funnel.events ?? []).filter((x) => x.action === e.action).length);
      }
    }
    for (const r of s.funnel?.reports ?? []) rows.push([r.at, `  estimate: ${r.estimate}`, r.role, withFeedback && r.text ? `  text: ${JSON.stringify(r.text)}` : ""]);
    console.log(id);
    for (const [at, name, role, extra] of rows.sort((x, y) => String(x[0]).localeCompare(String(y[0])))) console.log(`  ${at}  ${name}${role ? `  ${role}` : ""}${extra ?? ""}`);
  }
  console.log("totals");
  console.log(`  invited: outside the app (invite codes issued)`);
  console.log(`  accepted: ${totals.workspaces} workspace(s)`);
  console.log(`  started: ${totals.started}`);
  console.log(`  finished: ${totals.finished}`);
  for (const name of ["value_card_viewed", "value_reported", "waitlist_clicked", "loi_cta_clicked"]) {
    const c = counts[name] ?? { events: 0, workspaces: 0 };
    console.log(`  ${name}: ${c.events} event(s) in ${c.workspaces} workspace(s)`);
  }
  console.log("  not recorded here: waitlist submitted, LOI requested, LOI sent, signed LOI (the founder verifies these at the source)");
} else {
  console.error("usage: node scripts/ws-admin.mjs list | funnel [--with-feedback] | delete <id> | delete --all --yes");
  process.exit(2);
}
