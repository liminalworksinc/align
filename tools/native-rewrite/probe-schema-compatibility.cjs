"use strict";
// Baseline observations in memory only. No candidate or application implementation.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), {DatabaseSync} = require("node:sqlite");
const [inventoryPath, sqlDirectory, reportPath] = process.argv.slice(2);
if (!inventoryPath || !sqlDirectory || !reportPath) throw Error("Usage: node probe-schema-compatibility.cjs INVENTORY SQL_DIRECTORY REPORT");
const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
assert.equal(inventory.schema, "align/storage-schema-inventory@1");
const {seed, identifier:q, T} = require("./storage-seed-fixture.cjs")(inventory);
const db = new DatabaseSync(":memory:"), cases = [];
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function trial(name, fn) {
  db.exec("SAVEPOINT compatibility_trial");
  try {cases.push({name, value:fn() ?? null, passed:true});}
  finally {db.exec("ROLLBACK TO compatibility_trial; RELEASE compatibility_trial");}
}
function rejected(fn, errcode) {
  let error;
  try {fn();} catch (e) {error=e;}
  assert(error, "Expected a constraint error");
  assert.equal(error.errcode, errcode);
  return error.errcode;
}
function clone(table, change, omit=[]) {
  const value = {...db.prepare(`SELECT * FROM ${q(table)} LIMIT 1`).get(), ...change};
  const keys = Object.keys(value).filter(key => !omit.includes(key));
  return db.prepare(`INSERT INTO ${q(table)} (${keys.map(q).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`).run(...keys.map(key=>value[key]));
}
try {
  db.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY); PRAGMA foreign_keys=OFF;");
  for (const migration of inventory.migrations) {
    const sql = fs.readFileSync(path.join(sqlDirectory, String(migration.version).padStart(2,"0")+".sql"), "utf8");
    assert.equal(hash(sql), migration.sql_sha256);
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(sql);assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);db.exec(`PRAGMA user_version=${migration.version}; COMMIT`);}
    catch(error){db.exec("ROLLBACK");throw error;}
  }
  db.exec("PRAGMA foreign_keys=ON");
  seed(db,22);
  trial("nullable-text-primary-key-is-not-strengthened",()=>{
    clone("v2_workspaces",{id:null});clone("v2_workspaces",{id:null});
    const n=db.prepare("SELECT count(*) AS n FROM v2_workspaces WHERE id IS NULL").get().n;assert.equal(n,2);return n;
  });
  trial("explicit-non-null-primary-key-field",()=>rejected(()=>clone("v2_members",{user_id:null}),1299));
  trial("integer-affinity-is-not-strict-typing",()=>{
    for(const value of ["13",1.25,"opaque"])db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-affinity',?)").run(value);
    const rows=db.prepare("SELECT at,typeof(at) AS type FROM v2_rate_hits WHERE key='fixture-affinity' ORDER BY rowid").all();
    assert.deepEqual(rows.map(row=>[row.at,row.type]),[[13,"integer"],[1.25,"real"],["opaque","text"]]);return rows.map(row=>row.type);
  });
  trial("repeated-rate-hits-remain-separate",()=>{
    const insert=db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-duplicate',13)");insert.run();insert.run();
    const n=db.prepare("SELECT count(*) AS n FROM v2_rate_hits WHERE key='fixture-duplicate'").get().n;assert.equal(n,2);return n;
  });
  trial("nullable-enum-check-retains-null",()=>{
    db.prepare("UPDATE v2_invites SET team_role=NULL WHERE id='fixture-invite-a'").run();
    assert.equal(db.prepare("SELECT team_role FROM v2_invites WHERE id='fixture-invite-a'").get().team_role,null);return true;
  });
  trial("optional-composite-reference-retains-null",()=>{
    db.prepare("UPDATE v2_goals SET pod_id=NULL,visibility='workspace' WHERE id='fixture-goal-a'").run();
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return true;
  });
  trial("historical-actors-do-not-require-current-membership",()=>{
    for(const [table,column] of [["v2_goals","owner_id"],["v2_alignments","requester_id"],["v2_sessions","user_id"]]) {
      const result=db.prepare(`UPDATE ${q(table)} SET ${q(column)}='fixture-departed-label' WHERE ws_id='fixture-ws-a'`).run();assert(result.changes>0);
    }
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return 3;
  });
  trial("historical-labels-are-not-new-foreign-keys",()=>{
    db.prepare("UPDATE v2_creation_codes SET request_id='fixture-gone-request',ws_id='fixture-gone-workspace' WHERE id='fixture-code-a'").run();
    db.prepare("UPDATE v2_goal_holds SET directive_id='fixture-gone-directive' WHERE goal_id='fixture-goal-a'").run();
    db.prepare("UPDATE v2_audit SET actor_id='fixture-gone-person',object_id='fixture-gone-object',ws_id='fixture-gone-workspace' WHERE seq=11").run();
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return true;
  });
  trial("reallocation-approval-retains-declared-reference-scope",()=>{
    clone("v2_reallocation_approvals",{revision:999,goal_id:"fixture-gone-goal",user_id:"fixture-gone-person"});
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return true;
  });
  trial("unicode-length-uses-code-points",()=>{
    const update=db.prepare("UPDATE v2_value_reports SET note=? WHERE id='fixture-value-report-a'");
    update.run("\u{1f642}".repeat(500));
    assert.equal(db.prepare("SELECT length(note) AS n FROM v2_value_reports WHERE id='fixture-value-report-a'").get().n,500);
    return rejected(()=>update.run("\u{1f642}".repeat(501)),275);
  });
  trial("null-workspace-exempts-workspace-once-index",()=>{
    clone("v2_events",{name:"workspace_created",ws_id:null},["id"]);clone("v2_events",{name:"workspace_created",ws_id:null},["id"]);
    const n=db.prepare("SELECT count(*) AS n FROM v2_events WHERE name='workspace_created' AND ws_id IS NULL").get().n;assert.equal(n,2);return n;
  });
  trial("null-actor-exempts-person-once-index",()=>{
    clone("v2_events",{name:"value_card_viewed",actor:null},["id"]);clone("v2_events",{name:"value_card_viewed",actor:null},["id"]);
    const n=db.prepare("SELECT count(*) AS n FROM v2_events WHERE name='value_card_viewed' AND actor IS NULL").get().n;assert.equal(n,2);return n;
  });
  trial("event-no-op-update-still-aborts",()=>rejected(()=>db.prepare("UPDATE v2_events SET name=name WHERE id=11").run(),1811));
  trial("constraint-failure-aborts-statement-not-outer-transaction",()=>{
    db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-outer',1)").run();
    rejected(()=>db.prepare("INSERT INTO v2_members(ws_id,user_id,role,created_at) VALUES('fixture-ws-a','fixture-absent-account','member',?)").run(T),787);
    db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-outer',2)").run();
    const n=db.prepare("SELECT count(*) AS n FROM v2_rate_hits WHERE key='fixture-outer'").get().n;assert.equal(n,2);return n;
  });
  trial("binary-unique-key-collation",()=>{
    clone("v2_creation_codes",{id:"fixture-case-code-1",code_hash:"fixture-CaSe"});
    clone("v2_creation_codes",{id:"fixture-case-code-2",code_hash:"fixture-case"});
    const n=db.prepare("SELECT count(*) AS n FROM v2_creation_codes WHERE code_hash='fixture-case'").get().n;assert.equal(n,1);return n;
  });
  for(const table of ["v2_audit","v2_activity","v2_directives"])trial("deleted-high-sequence/"+table,()=>{
    const previous=db.prepare("SELECT seq FROM sqlite_sequence WHERE name=?").get(table).seq;assert.equal(previous,9000000);
    const change=table==="v2_directives"?{id:"fixture-next-directive"}:{};clone(table,change,["seq"]);
    const next=db.prepare(`SELECT max(seq) AS n FROM ${q(table)}`).get().n;assert.equal(next,9000001);return next;
  });
  trial("event-rowid-has-no-nonreuse-promise",()=>{
    clone("v2_events",{id:9000000,name:"fixture-temporary-event"});db.prepare("DELETE FROM v2_events WHERE id=9000000").run();
    clone("v2_events",{name:"fixture-next-event"},["id"]);
    const id=db.prepare("SELECT id FROM v2_events WHERE name='fixture-next-event'").get().id;assert(id<9000000);return id;
  });
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
  const report={schema:"align/storage-target-compatibility@1",passed:true,runtime:{node:process.version,sqlite:process.versions.sqlite},cases,
    source_sha256:inventory.source_sha256,synthetic_fixtures_only:true,in_memory_only:true,
    scope:"Observed physical compatibility of the unchanged frozen schema. These cases do not authorize invalid business operations, qualify full authentication or transfer native authority.",native_qualification_claimed:false};
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({report:reportPath,passed:true,cases:cases.length,runtime:report.runtime}));
} finally {db.close();}
