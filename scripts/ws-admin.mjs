#!/usr/bin/env node
// Operator tool for custom workspaces (go-C condition 4). Run on the server, e.g. inside `fly ssh console`:
//   node scripts/ws-admin.mjs list
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
} else {
  console.error("usage: node scripts/ws-admin.mjs list | delete <id> | delete --all --yes");
  process.exit(2);
}
