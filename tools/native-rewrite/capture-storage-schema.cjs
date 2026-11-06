"use strict";
// Diagnostic baseline only. Neither retained implementation nor SQL history is generation input.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {DatabaseSync} = require("node:sqlite");
const {execFileSync} = require("node:child_process");
const [projectRoot, sourceRevision, outputDirectory] = process.argv.slice(2);
if (!projectRoot || !sourceRevision || !outputDirectory || !/^[0-9a-f]{7,40}$/.test(sourceRevision)) throw Error("Usage: node capture-storage-schema.cjs PROJECT_ROOT SOURCE_REVISION OUTPUT_DIRECTORY");
const root = fs.realpathSync(projectRoot);
const outputRoot = path.resolve(outputDirectory);
const outputParent = fs.realpathSync(path.dirname(outputRoot));
if (outputParent === root || outputParent.startsWith(root + path.sep) || fs.existsSync(outputRoot)) throw Error("Use a new output directory outside the project");
const sourceCommit = execFileSync("git",["-C",root,"rev-parse",sourceRevision+"^{commit}"],{encoding:"utf8"}).trim();
const originalFile = relative => execFileSync("git",["-C",root,"show",sourceCommit+":components/legacy-project-wrapper/implementation/"+relative],{encoding:"utf8",maxBuffer:4*1024*1024});
const ts = require(path.join(root, "components/legacy-project-wrapper/implementation/node_modules/typescript"));
const dbSource = originalFile("lib/v2/db.ts");
const coreSource = originalFile("lib/v2/core.mts");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
if (hash(dbSource) !== "43959ae8034598b41d86cf0d77079654c81957a712b0ad05df537718cdaa8977" || hash(coreSource) !== "aa3ce3dafef8b8ccb6ae18685ef82543a078562036596f3869d0b3dd926f4d06") throw Error("Unexpected baseline source identity");
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const findDeclaration = (source, name) => {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      if (found) throw new Error("Duplicate declaration: " + name);
      found = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw new Error("Missing declaration: " + name);
  return found;
};
const dbAst = parse("db.ts", dbSource);
const coreAst = parse("core.mts", coreSource);
const versionNode = findDeclaration(coreAst, "SCHEMA_VERSION").initializer;
if (!ts.isNumericLiteral(versionNode)) throw new Error("Schema version is not a literal");
const schemaVersion = Number(versionNode.text);
const array = findDeclaration(dbAst, "MIGRATIONS").initializer;
if (!ts.isArrayLiteralExpression(array)) throw new Error("Migrations are not a literal array");
const migrations = array.elements.map((element, index) => {
  if (!ts.isNoSubstitutionTemplateLiteral(element) && !ts.isStringLiteral(element)) {
    throw new Error("Migration contains evaluated code: " + (index + 1));
  }
  return {version: index + 1, sql: element.text, source_line: dbAst.getLineAndCharacterOfPosition(element.getStart(dbAst)).line + 1};
});
if (schemaVersion !== 22 || migrations.length !== schemaVersion) throw new Error("Schema version mismatch");
const identifier = name => '"' + name.replaceAll('"', '""') + '"';
function snapshot(db, version) {
  const tables = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name LIKE 'v2_%' ORDER BY name").all().map(table => ({
    name: table.name,
    sql: table.sql,
    columns: db.prepare(`PRAGMA table_xinfo(${identifier(table.name)})`).all(),
    foreign_keys: db.prepare(`PRAGMA foreign_key_list(${identifier(table.name)})`).all(),
    indexes: db.prepare(`PRAGMA index_list(${identifier(table.name)})`).all().sort((a,b) => a.name.localeCompare(b.name)).map(index => ({
      ...index,
      sql: db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?").get(index.name)?.sql ?? null,
      columns: db.prepare(`PRAGMA index_xinfo(${identifier(index.name)})`).all(),
    })),
    triggers: db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND tbl_name=? ORDER BY name").all(table.name),
  }));
  const userVersion = Number(db.prepare("PRAGMA user_version").get().user_version);
  if (userVersion !== version) throw new Error("Unexpected observed version");
  const foreignKeyViolations = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyViolations.length) throw new Error("Foreign key violation in empty schema history");
  return {version, table_count: tables.length, tables, foreign_key_violations: foreignKeyViolations, identity: "sha256:" + hash(JSON.stringify(tables))};
}
function createSchema() {
  const db = new DatabaseSync(":memory:", {enableForeignKeyConstraints:true});
  // B13 owns the complete auth schema. These explicit empty external-entity fixtures supply only referenced IDs.
  db.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY);");
  db.exec("PRAGMA foreign_keys = OFF");
  return db;
}
function apply(db, migration) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(migration.sql);
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length) throw new Error("Migration has broken references: " + migration.version);
    db.exec(`PRAGMA user_version = ${migration.version}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
const db = createSchema();
let snapshots;
try {
  snapshots = [snapshot(db, 0)];
  for (const migration of migrations) {
    apply(db, migration);
    snapshots.push(snapshot(db, migration.version));
  }
} finally { db.close(); }
const final = snapshots.at(-1);
const convergence = [];
for (let start = 0; start <= schemaVersion; start++) {
  const candidate = createSchema();
  try {
    for (const migration of migrations.slice(0, start)) apply(candidate, migration);
    if (snapshot(candidate, start).identity !== snapshots[start].identity) throw new Error("Prefix mismatch");
    for (const migration of migrations.slice(start)) apply(candidate, migration);
    if (snapshot(candidate, schemaVersion).identity !== final.identity) throw new Error("Final schema differs");
    convergence.push({from_version:start, to_version:schemaVersion, empty_schema_converged:true});
  } finally { candidate.close(); }
}
fs.mkdirSync(outputRoot, {recursive:false,mode:0o700});
const frozen = path.join(outputRoot, "source");
fs.mkdirSync(frozen, {recursive:false});
fs.writeFileSync(path.join(frozen, "db.ts"), dbSource, {flag:"wx"});
fs.writeFileSync(path.join(frozen, "core.mts"), coreSource, {flag:"wx"});
const sqlRoot = path.join(frozen, "migrations"); fs.mkdirSync(sqlRoot);
for (const migration of migrations) fs.writeFileSync(path.join(sqlRoot, String(migration.version).padStart(2,"0") + ".sql"), migration.sql, {flag:"wx"});
const externalReferences = [...new Set(final.tables.flatMap(t => t.foreign_keys.map(f => f.table)).filter(t => !t.startsWith("v2_")))].sort();
const counts = {tables:final.table_count,columns:final.tables.reduce((n,t)=>n+t.columns.length,0),foreign_key_rows:final.tables.reduce((n,t)=>n+t.foreign_keys.length,0),indexes:final.tables.reduce((n,t)=>n+t.indexes.length,0),triggers:final.tables.reduce((n,t)=>n+t.triggers.length,0)};
const result = {schema:"align/storage-schema-inventory@1",source_commit:sourceCommit,schema_version:schemaVersion,baseline_only_not_generation_input:true,source_sha256:{"db.ts":hash(dbSource),"core.mts":hash(coreSource)},runtime:{node:process.version,sqlite:process.versions.sqlite,typescript:ts.version},scope:"SQL schema history only; no original migrate(), stored-data upgrades, filesystem, locks, callbacks or auth-schema qualification claimed",auth_fixtures:{synthetic:true,entities:["ba_user.id","ba_passkey.id"],owner:"B13"},external_references:externalReferences,counts,migrations:migrations.map(m=>({version:m.version,source_line:m.source_line,sql_sha256:hash(m.sql)})),snapshots,empty_schema_convergence:convergence};
const output = path.join(outputRoot,"inventory.json");
fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,schema_version:schemaVersion,history_snapshots:snapshots.length,empty_schema_upgrade_controls:convergence.length,counts,external_references:externalReferences,final_schema_identity:final.identity,runtime:result.runtime,original_runtime_qualification_claimed:false}));
