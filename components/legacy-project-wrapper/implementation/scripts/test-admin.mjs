#!/usr/bin/env node
// Operator argument tests against test data in a disposable database. No server or installed packages.
// Usage: node scripts/test-admin.mjs   (from the implementation directory)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { SCHEMA_VERSION } from "../lib/v2/core.mts";

const ROOT = process.cwd();
const NOW = "2026-11-13T12:00:00.000Z";
const OLD = "2026-09-01T12:00:00.000Z";
const WS = "ws_test_due_for_purge";
const dataRoot = path.join(ROOT, "data");
mkdirSync(dataRoot, { recursive: true });
const testDir = mkdtempSync(path.join(dataRoot, "admin-test-"));
// Use the application's domain migrations. The referenced account tables are test fixtures.
const source = readFileSync(path.join(ROOT, "lib/v2/db.ts"), "utf8");
const migrations = runInNewContext(/const MIGRATIONS: string\[\] = (\[[\s\S]*?\n\]);/.exec(source)[1]);
if (migrations.length !== SCHEMA_VERSION) throw new Error("Test migrations do not match the operator schema version");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${String(detail).slice(0, 600)}`}`);
}

function fixture(name, fn) {
  const dir = path.join(testDir, name);
  mkdirSync(path.join(dir, "v2"), { recursive: true });
  const d = new DatabaseSync(path.join(dir, "v2/align.sqlite"));
  try {
    d.exec("PRAGMA foreign_keys = OFF; CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY);");
    for (const sql of migrations) d.exec(sql);
    d.exec(`PRAGMA user_version = ${SCHEMA_VERSION}; PRAGMA foreign_keys = ON;`);
    d.prepare("INSERT INTO ba_user (id) VALUES (?)").run("test_owner");
    for (const [id, deleted] of [[WS, OLD], ["ws_test_live", null]]) {
      d.prepare("INSERT INTO v2_workspaces (id, name, created_by, created_at, deleted_at) VALUES (?, 'Test data workspace', 'test_owner', ?, ?)").run(id, OLD, deleted);
      d.prepare("INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, 'test_owner', 'owner', ?)").run(id, OLD);
      d.prepare("INSERT INTO v2_audit (ws_id, actor_id, action, object_id, at) VALUES (?, 'test_owner', 'test.data', ?, ?)").run(id, id, OLD);
      d.prepare("INSERT INTO v2_events (name, ws_id, at) VALUES ('workspace_created', ?, ?)").run(id, OLD);
    }
    check(`${name}: test data has no broken foreign keys`, d.prepare("PRAGMA foreign_key_check").all().length === 0);
    fn(dir, d);
  } finally {
    d.close();
  }
}

function snapshot(d) {
  return JSON.stringify(d.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map(({ name }) =>
    [name, d.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
}

function admin(args, dir, { script = "align-admin.mjs", preload } = {}) {
  const r = spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), `scripts/${script}`, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
    env: { PATH: process.env.PATH, ALIGN_DATA_DIR: dir, ALIGN_SECRET: "test-data-only-admin-secret", ALIGN_TEST_IDP: "1", ALIGN_TEST_NOW: NOW },
  });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "", error: r.error };
}

try {
  for (const [name, args] of [
    ["retention typo", ["retention", "run", "--dryrun", "true"]],
    ["purge dry-run", ["workspaces", "delete", WS, "--purge", "--yes", "--dry-run"]],
  ]) fixture(name, (dir, d) => {
    const before = snapshot(d);
    const r = admin(args, dir);
    const unchanged = before === snapshot(d);
    const workspacePresent = !!d.prepare("SELECT id FROM v2_workspaces WHERE id = ?").get(WS);
    check(`${args.join(" ")}: exit 2, usage, every table unchanged`, r.status === 2 && /Usage:/.test(r.err) && unchanged,
      `status=${r.status}, unchanged=${unchanged}, workspace_present=${workspacePresent}, stdout=${r.out}, stderr=${r.err}`);
  });

  fixture("argument contracts", (dir, d) => {
    const preload = path.join(testDir, "refuse-database.mjs");
    writeFileSync(preload, `// Test data: fail if argument validation loads the database module.
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "node:sqlite") throw new Error("Database loaded before argument validation");
  return nextResolve(specifier, context);
} });
`);
    const contracts = [
      { args: ["codes", "create"], values: ["email", "days", "count"], switches: [] },
      { args: ["codes", "import"], values: ["file", "used", "days"], switches: [] },
      { args: ["codes", "list"], values: [], switches: [] },
      { args: ["codes", "revoke", "test_code"], values: [], switches: [] },
      { args: ["requests", "list"], values: ["status"], switches: [] },
      { args: ["requests", "approve", "test_request"], values: ["days"], switches: ["print"] },
      { args: ["requests", "decline", "test_request"], values: [], switches: [] },
      { args: ["workspaces", "list"], values: [], switches: [] },
      { args: ["workspaces", "delete", WS], values: [], switches: ["purge", "yes"] },
      { args: ["retention", "run"], values: [], switches: ["dry-run"] },
      { args: ["report"], values: ["since"], switches: ["json"] },
      { args: ["events", "record", "loi_sent"], values: ["workspace", "note-ref"], switches: [] },
      { args: ["events", "record", "loi_signed"], values: ["workspace", "note-ref"], switches: ["verified-original"] },
    ];
    const switches = ["print", "yes", "purge", "dry-run", "json", "verified-original"];
    const values = ["email", "days", "count", "file", "used", "status", "since", "workspace", "note-ref"];
    const before = snapshot(d);
    for (const c of contracts) {
      const invalid = [
        [...c.args, "--dryrun", "true"],
        [...c.args, "--unknown"],
        [...c.args, "--unknown", "test-data"],
        [...c.args, "--constructor", "test-data"],
        [...c.args, "--__proto__", "test-data"],
        [...c.args, "extra"],
        [...c.args, "extra", "--help"],
        ...c.values.flatMap((k) => [[...c.args, `--${k}`], [...c.args, `--${k}`, "--help"]]),
        ...c.switches.map((k) => [...c.args, `--${k}`, "true"]),
        ...switches.filter((k) => !c.switches.includes(k)).map((k) => [...c.args, `--${k}`]),
        ...values.filter((k) => !c.values.includes(k)).map((k) => [...c.args, `--${k}`, "test-data"]),
      ];
      if (c.args.length === 3) invalid.push(c.args.slice(0, 2));
      if (c.args[0] === "workspaces" && c.args[1] === "delete") invalid.push([...c.args, "--purge", "--yes", "--dry-run"]);
      const rejected = invalid.map((args) => ({ args, ...admin(args, dir, { preload }) }));
      const bad = rejected.filter((r) => {
        const message = c.args[2] === "loi_sent" && r.args.includes("--verified-original")
          ? "--verified-original is only for loi_signed"
          : "Usage:";
        return r.status !== 2 || !r.err.includes(message) || /Database loaded before argument validation/.test(r.err);
      });
      check(`${c.args.join(" ")}: ${invalid.length} invalid argument lists exit 2 before loading the database`, bad.length === 0, JSON.stringify(bad));
      const help = admin([...c.args, ...c.values.flatMap((k) => [`--${k}`, "test-data"]), ...c.switches.map((k) => `--${k}`), "--help"], dir, { preload });
      check(`${c.args.join(" ")}: supported options and help exit 0 before loading the database`, help.status === 0 && /Usage:/.test(help.err), `${help.status} ${help.err}`);
    }
    for (const [args, message] of [
      [["events", "record", "loi_sent", "--workspace", "ws_test_live", "--verified-original"], "--verified-original is only for loi_signed"],
      [["events", "record", "unknown_event", "--workspace", "ws_test_live"], "events record takes loi_sent or loi_signed: every other event is recorded by the app itself"],
    ]) {
      for (const help of [[], ["--help"]]) {
        const invocation = [...args, ...help];
        const r = admin(invocation, dir, { preload });
        check(`${invocation.join(" ")}: exit 2 with the existing error before loading the database`,
          r.status === 2 && r.err.split("\n")[0] === message && !/Database loaded before argument validation/.test(r.err), `${r.status} ${r.err}`);
      }
    }
    for (const args of [[], ["unknown", "command"], ["retention"], ["retention", "unknown"], ["codes", "constructor"]]) {
      const r = admin(args, dir, { preload });
      check(`${JSON.stringify(args)}: invalid command exits 2 with usage before loading the database`, r.status === 2 && /Usage:/.test(r.err), `${r.status} ${r.err}`);
    }
    for (const args of [["--help"], ["codes", "--help"], ["requests", "--help"], ["workspaces", "--help"], ["retention", "--help"], ["events", "--help"], ["events", "record", "--help"]]) {
      const r = admin(args, dir, { preload });
      check(`${args.join(" ")}: help exits 0 without a database`, r.status === 0 && /Usage:/.test(r.err), `${r.status} ${r.err}`);
    }
    const typo = admin(["--dryrun", "true"], dir, { script: "retention.mjs", preload });
    check("retention.mjs: typo exits 2 before loading the database", typo.status === 2 && /usage:/.test(typo.err), `${typo.status} ${typo.err}`);
    check("invalid arguments and help leave every table unchanged", snapshot(d) === before);
  });

  fixture("valid commands", (dir, d) => {
    for (const script of ["align-admin.mjs", "retention.mjs"]) {
      const before = snapshot(d);
      const r = admin(script === "retention.mjs" ? ["--dry-run"] : ["retention", "run", "--dry-run"], dir, { script });
      const counts = JSON.parse(r.out.trim().split("\n").at(-1) || "null");
      check(`${script}: dry run exits 0, counts one purge, rolls back every table`, r.status === 0 && counts?.dry_run === true && counts.workspaces_purged === 1 && snapshot(d) === before, `${r.status} ${r.err} ${r.out}`);
    }
    for (const args of [
      ["codes", "create", "--email", "test-data@example.test", "--days", "3", "--count", "1"],
      ["codes", "list"],
      ["requests", "list", "--status", "pending"],
      ["workspaces", "list"],
      ["report", "--since", "2026-01-01", "--json"],
      ["report"],
      ["events", "record", "loi_sent", "--workspace", "ws_test_live", "--note-ref", "test-data"],
      ["events", "record", "loi_signed", "--workspace", "ws_test_live", "--verified-original"],
    ]) {
      const r = admin(args, dir);
      check(`${args.join(" ")}: exits 0`, r.status === 0, `${r.status} ${r.err}`);
    }
    const r = admin(["retention", "run"], dir);
    check("retention run: real run exits 0 and purges the due workspace", r.status === 0 && !d.prepare("SELECT id FROM v2_workspaces WHERE id = ?").get(WS), `${r.status} ${r.err}`);
    const alias = admin([], dir, { script: "retention.mjs" });
    check("retention.mjs: real run exits 0 after the due workspace was purged", alias.status === 0 && /"dry_run":false,"workspaces_purged":0/.test(alias.out), `${alias.status} ${alias.err} ${alias.out}`);
  });
} finally {
  rmSync(testDir, { recursive: true, force: true });
}

console.log(`test-admin: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
