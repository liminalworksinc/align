#!/usr/bin/env node
// Operator argument tests against test data in a disposable database. No server or installed packages.
// Usage: node scripts/test-admin.mjs   (from the implementation directory)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";
import { SCHEMA_VERSION } from "../lib/v2/core.mts";
import { runRetention } from "../lib/v2/retention-core.mts";

const ROOT = process.cwd();
const NOW = "2026-11-13T12:00:00.000Z";
const OLD = "2026-09-01T12:00:00.000Z";
const WS = "ws_test_due_for_purge";
const testDir = mkdtempSync(path.join(os.tmpdir(), "align-admin-test-"));
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

function migrateFixture(dir, shift = 0) {
  const upgrade = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import path from "node:path";
    import { registerHooks } from "node:module";
    const shifted = process.argv[1] === "1";
    registerHooks({
      resolve(specifier, context, nextResolve) {
        return nextResolve(specifier.startsWith(".") && !path.extname(specifier) ? specifier + ".ts" : specifier, context);
      },
      load(url, context, nextLoad) {
        const result = nextLoad(url, context);
        if (shifted && url.endsWith("/lib/v2/db.ts")) {
          return { ...result, source: String(result.source).replace("const MIGRATIONS: string[] = [", '$& "SELECT 1",') };
        }
        if (shifted && url.endsWith("/lib/v2/core.mts")) {
          return { ...result, source: String(result.source).replace(/export const SCHEMA_VERSION = (\\d+)/,
            (_, version) => "export const SCHEMA_VERSION = " + (Number(version) + 1)) };
        }
        return result;
      },
    });
    const { migrate } = await import("./lib/v2/db.ts");
    migrate();
  `, String(shift)], { cwd: ROOT, env: { ...process.env, ALIGN_DATA_DIR: dir }, encoding: "utf8" });
  if (upgrade.status !== 0) throw new Error(upgrade.error?.message ?? upgrade.stderr);
  return upgrade;
}

function testReadingUpgrade() {
  const dir = path.join(testDir, "schema 27 to 28");
  mkdirSync(path.join(dir, "v2"), { recursive: true });
  const d = new DatabaseSync(path.join(dir, "v2/align.sqlite"));
  try {
    d.exec("PRAGMA foreign_keys = OFF; CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY);");
    for (const sql of migrations.slice(0, 27)) d.exec(sql);
    d.exec(`
      INSERT INTO ba_user (id) VALUES ('u_reader');
      INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES ('ws_read', 'Reading test data', 'u_reader', '${OLD}');
      INSERT INTO v2_goals (id, ws_id, owner_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at)
        VALUES ('g_read', 'ws_read', 'u_reader', 'workspace', 1, 'Old goal', '[]', '{}', 'active', '${OLD}', '${OLD}');
      INSERT INTO v2_measure_readings (id, ws_id, goal_id, measure_id, value_text, value_num, source, observed_at, recorded_by, recorded_at)
        VALUES ('mr_one', 'ws_read', 'g_read', 'm_one', '1', 1, 'self', '${OLD}', 'u_reader', '${OLD}'),
               ('mr_later', 'ws_read', 'g_read', 'm_one', '2', 2, 'self', '${OLD}', 'u_reader', '${OLD}');
      INSERT INTO v2_data_restrictions (ws_id, tier) VALUES ('ws_read', 2);
      PRAGMA user_version = 27;
    `);
    migrateFixture(dir);
    d.exec("PRAGMA foreign_keys = ON;");
    const rows = d.prepare("SELECT id, value_num, source, source_ref, goal_version FROM v2_measure_readings ORDER BY rowid DESC").all();
    const version = d.prepare("PRAGMA user_version").get().user_version;
    const restriction = d.prepare("SELECT tier FROM v2_data_restrictions WHERE ws_id = 'ws_read'").get();
    check("LIM-2524: a schema 27 database upgrades through 28 to 29 and keeps its sharing restrictions",
      version === 29 && restriction?.tier === 2, JSON.stringify({ version, restriction }));
    check("LIM-2524: migration 28 preserves legacy reading order and keeps unknown source details and version",
      rows.map((r) => r.id).join() === "mr_later,mr_one" && rows[0].value_num === 2 &&
      rows.every((r) => r.source === "self" && r.source_ref === null && r.goal_version === null) &&
      d.prepare("PRAGMA foreign_key_check").all().length === 0, JSON.stringify(rows));
    d.exec("DELETE FROM v2_workspaces WHERE id = 'ws_read';");
    check("LIM-2524: upgraded reading rows still follow workspace deletion",
      d.prepare("SELECT COUNT(*) AS n FROM v2_measure_readings").get().n === 0);
  } finally {
    d.close();
  }
}

function testChangeElementUpgrade(name, shift) {
  const legacyDir = path.join(testDir, name);
  mkdirSync(path.join(legacyDir, "v2"), { recursive: true });
  const legacy = new DatabaseSync(path.join(legacyDir, "v2/align.sqlite"));
  try {
    const elementMigration = migrations.findIndex((sql) => /\bv2_change_request_elements_lookup\b/.test(sql));
    if (elementMigration < 0) throw new Error("Missing change request element migration");
    legacy.exec("PRAGMA foreign_keys = OFF; CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY);");
    for (const sql of migrations.slice(0, elementMigration)) legacy.exec(sql);
    legacy.exec(`
      INSERT INTO ba_user (id) VALUES ('u_old');
      INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES ('ws_old', 'Old workspace', 'u_old', '${OLD}');
      INSERT INTO v2_goals (id, ws_id, owner_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at)
        VALUES ('g_old', 'ws_old', 'u_old', 'workspace', 1, 'Old title', '[]', '{}', 'active', '${OLD}', '${OLD}');
      INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, status, content_hash, created_by, created_at)
        VALUES ('ws_old', 'g_old', 1, 'Old title', '[{"id":"m_before","text":"Measure","target":null}]', '{}', 'active', 'old', 'u_old', '${OLD}');
      INSERT INTO v2_change_requests (id, ws_id, goal_id, requester_id, state, revision, base_version, changes_json, reason, created_at, updated_at)
        VALUES ('cr_old', 'ws_old', 'g_old', 'u_old', 'rejected', 2, 1, '{"title":"New title"}', 'New work', '${OLD}', '${OLD}');
      INSERT INTO v2_change_request_revisions (ws_id, change_request_id, revision, base_version, changes_json, author_id, created_at)
        VALUES
          ('ws_old', 'cr_old', 1, 1, '{"measures":[{"id":"m_after","text":"Measure","target":null}],"target_share":15}', 'u_old', '${OLD}'),
          ('ws_old', 'cr_old', 2, 1, '{"title":"New title"}', 'u_old', '${OLD}'),
          ('ws_old', 'cr_old', 3, 2, '{"status":"dropped"}', 'u_old', '${OLD}');
      PRAGMA user_version = ${elementMigration + shift};
    `);
    // Prepend an inert migration to simulate an earlier branch landing first.
    const upgrade = migrateFixture(legacyDir, shift);
    legacy.exec("PRAGMA foreign_keys = ON;");
    const version = legacy.prepare("PRAGMA user_version").get().user_version;
    const keys = legacy.prepare("SELECT ws_id, goal_id, revision, kind, element_key, change FROM v2_change_request_elements ORDER BY revision, element_key").all();
    check(`LIM-2522 (${name}): backfills each revision, counts one missing base and keeps both sides of a measure replacement`,
      elementMigration === 25 && version === SCHEMA_VERSION + shift &&
        upgrade.stderr.includes(`migration ${elementMigration + 1 + shift} skipped 1 change request revision with missing base versions`) &&
        keys.map((k) => Object.values(k).join(":")).join(",") ===
        "ws_old:g_old:1:measure:m_after:added,ws_old:g_old:1:measure:m_before:removed,ws_old:g_old:2:field:title:changed" &&
        legacy.prepare("PRAGMA foreign_key_check").all().length === 0, JSON.stringify({ version, keys, stderr: upgrade.stderr }));
    legacy.exec("DELETE FROM v2_change_request_revisions WHERE revision = 1");
    check(`LIM-2522 (${name}): removing a revision removes its indexed keys`,
      legacy.prepare("SELECT revision FROM v2_change_request_elements").all().map((r) => r.revision).join() === "2");
    const insertEvent = legacy.prepare("INSERT INTO v2_events (name, ws_id, at) VALUES ('first_precedent_shown', 'ws_old', ?) ON CONFLICT DO NOTHING");
    check(`LIM-2522 (${name}): the database enforces one first precedent event per workspace`,
      insertEvent.run(OLD).changes === 1 && insertEvent.run(NOW).changes === 0);
    check(`LIM-2525 (${name}): review migration follows the prior migration even when shifted and starts existing workspaces with empty review state`,
      legacy.prepare("SELECT is_sample FROM v2_workspaces WHERE id = 'ws_old'").get().is_sample === null &&
      legacy.prepare("SELECT COUNT(*) AS n FROM v2_goal_list_reviews").get().n === 0 &&
      legacy.prepare("SELECT COUNT(*) AS n FROM v2_goal_list_snoozes").get().n === 0);
  } finally {
    legacy.close();
  }
}

try {
  testReadingUpgrade();
  testChangeElementUpgrade("schema 25 to 26", 0);
  testChangeElementUpgrade("shifted migration", 1);
  const reviewDir = path.join(testDir, "schema 28 to 29");
  mkdirSync(path.join(reviewDir, "v2"), { recursive: true });
  const reviewUpgrade = new DatabaseSync(path.join(reviewDir, "v2/align.sqlite"));
  try {
    reviewUpgrade.exec("PRAGMA foreign_keys = OFF; CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY);");
    for (const sql of migrations.slice(0, 28)) reviewUpgrade.exec(sql);
    reviewUpgrade.exec(`
      INSERT INTO ba_user (id) VALUES ('u_old');
      INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES ('ws_renamed', 'Renamed space', 'u_old', '${OLD}');
      INSERT INTO v2_events (name, ws_id, at, props) VALUES ('workspace_created', 'ws_renamed', '${OLD}', '{"kind":"sample"}');
      INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES
        ('ws_expired_sample', 'Renamed older space', 'u_old', '2025-06-01T12:00:00.000Z'), ('ws_blank', 'Sample workspace', 'u_old', '${OLD}');
      INSERT INTO v2_events (name, ws_id, at, props) VALUES
        ('workspace_created', 'ws_expired_sample', '2025-06-01T12:00:00.000Z', '{"kind":"sample"}'),
        ('workspace_created', 'ws_blank', '${OLD}', '{"kind":"blank"}');
      INSERT INTO v2_goals (id, ws_id, owner_id, visibility, version, title, measures_json, anchors_json, status, created_at, updated_at)
        VALUES ('g_sample', 'ws_expired_sample', 'u_old', 'workspace', 1, 'Sample fixture goal', '[]', '{}', 'active', '${OLD}', '${OLD}');
      INSERT INTO v2_data_restrictions (ws_id, tier) VALUES ('ws_blank', 2);
      INSERT INTO v2_measure_readings (id, ws_id, goal_id, measure_id, value_text, source, source_ref, goal_version, stale_after, observed_at, recorded_by, recorded_at)
        VALUES ('mr_ci', 'ws_expired_sample', 'g_sample', 'm_sample', '9007199254740993', 'ci', '{"run":"7"}', 1, '${NOW}', '${OLD}', 'u_old', '${OLD}'),
               ('mr_command', 'ws_expired_sample', 'g_sample', 'm_sample', NULL, 'command', '{"exit_status":7}', 1, NULL, '${OLD}', 'u_old', '${OLD}');
      PRAGMA user_version = 28;
    `);
    const legacyDb = {
      all: (sql, ...args) => reviewUpgrade.prepare(sql).all(...args),
      get: (sql, ...args) => reviewUpgrade.prepare(sql).get(...args),
      run: (sql, ...args) => Number(reviewUpgrade.prepare(sql).run(...args).changes),
    };
    await runRetention(legacyDb, (fn) => fn(), new Date(NOW), { secret: "test-data-only-admin-secret" });
    check("LIM-2525: schema 28 retention expires the older sample's creation event",
      !legacyDb.get("SELECT 1 FROM v2_events WHERE ws_id = 'ws_expired_sample'"));
    migrateFixture(reviewDir);
    check("LIM-2525 (schema 28 to 29): backfill preserves a renamed sample's exclusion from the review",
      reviewUpgrade.prepare("SELECT name, is_sample FROM v2_workspaces WHERE id = 'ws_renamed'").get().is_sample === 1);
    check("LIM-2525 (schema 28 to 29): unknown legacy type is ineligible, a recorded blank stays eligible, and sample goals survive",
      legacyDb.get("SELECT is_sample FROM v2_workspaces WHERE id = 'ws_expired_sample'").is_sample === null &&
      legacyDb.get("SELECT is_sample FROM v2_workspaces WHERE id = 'ws_blank'").is_sample === 0 &&
      legacyDb.get("SELECT title FROM v2_goals WHERE id = 'g_sample'").title === "Sample fixture goal");
    const ci = legacyDb.get("SELECT value_text, source, source_ref, stale_after FROM v2_measure_readings WHERE id = 'mr_ci'");
    const command = legacyDb.get("SELECT value_text, source, source_ref FROM v2_measure_readings WHERE id = 'mr_command'");
    check("LIM-2525 (schema 28 to 29): upgrade keeps automated readings and sharing policy with clean foreign keys",
      legacyDb.get("PRAGMA user_version").user_version === 29 &&
      ci?.value_text === "9007199254740993" && ci.source === "ci" && JSON.parse(ci.source_ref).run === "7" && ci.stale_after === NOW &&
      command?.value_text === null && command.source === "command" && JSON.parse(command.source_ref).exit_status === 7 &&
      legacyDb.get("SELECT tier FROM v2_data_restrictions WHERE ws_id = 'ws_blank'")?.tier === 2 &&
      legacyDb.all("PRAGMA foreign_key_check").length === 0);
  } finally {
    reviewUpgrade.close();
  }
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
