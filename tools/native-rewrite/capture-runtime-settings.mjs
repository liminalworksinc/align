#!/usr/bin/env node
// Capture retained settings authority without the unrelated core implementation.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [implementation, destination, evidence] = process.argv.slice(2);
assert(implementation && destination && evidence, "Expected IMPLEMENTATION SNAPSHOT RECORD_JSON");
const root = fs.realpathSync(implementation);
const output = path.resolve(destination);
const record = path.resolve(evidence);
assert(!fs.existsSync(output), "Snapshot destination must be absent");
assert(!fs.existsSync(record), "Evidence destination must be absent");
assert(record !== output && !record.startsWith(output + path.sep), "Keep evidence outside the source snapshot");
assert(output !== root && !output.startsWith(root + path.sep), "Keep snapshots outside retained source");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "node_modules/typescript"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const expected = {
  "lib/config.ts": "77f863f64159431a36fc40a617e7befcacf2720e6da42b1df48c0391ec7f1184",
  "lib/v2/config.ts": "a2eb85abb9ed2b0267084b66ffabf96c6787e24eb683a7e6effb5ca33a290f3a",
  "lib/v2/core.mts": "aa3ce3dafef8b8ccb6ae18685ef82543a078562036596f3869d0b3dd926f4d06",
};
const wanted = {
  "lib/config.ts": ["Config", "LOOPBACK", "config", "hostName", "hostAllowed", "hostedProblems", "startupProblems", "assertStartupConfig"],
  "lib/v2/config.ts": ["sessionMaxDays", "testIdpEnabled", "testOAuthUrl", "googleConfigured", "githubConfigured", "emailApi", "emailSignInEnabled", "localOwnerEmail", "RECENT_SIGN_IN_MS", "localCodesPerHour", "CreationMode", "Caps", "creationMode", "caps", "turnstile", "v2Warnings", "v2Problems", "publicOrigin"],
};
const selected = ["hostedEnv", "testIdpEnabled", "SESSION_MAX_DAYS", "validMaxDays", "sessionMaxDays"];
const names = (statement) => {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map((d) => d.name.getText());
  return statement.name ? [statement.name.getText()] : [];
};
const isExported = (statement) => statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const files = [];
const inputs = [];
for (const [name, digest] of Object.entries(expected)) {
  const filename = fs.realpathSync(path.join(root, name));
  assert(filename === path.join(root, name), "Retained input must not resolve through a symlink");
  const raw = fs.readFileSync(filename, "utf8");
  assert.equal(hash(raw), digest, `Unreviewed retained source: ${name}`);
  const ast = ts.createSourceFile(name, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length, 0, `Cannot parse ${name}`);
  let content = raw;
  const selections = [];
  if (wanted[name]) {
    const exports = ast.statements.flatMap((statement) => {
      if (ts.isExportDeclaration(statement)) {
        assert(statement.exportClause && ts.isNamedExports(statement.exportClause), "Unexpected export form");
        return statement.exportClause.elements.map((item) => item.name.text);
      }
      return isExported(statement) ? names(statement) : [];
    });
    assert.deepEqual(exports.slice().sort(), wanted[name].slice().sort(), `Public surface changed: ${name}`);
  } else {
    const statements = ast.statements.filter((statement) => names(statement).some((name) => selected.includes(name)));
    assert.deepEqual(statements.flatMap(names), selected, "Settings declarations changed");
    const first = ast.statements.indexOf(statements[0]);
    assert.deepEqual(ast.statements.slice(first, first + selected.length), statements, "Settings declarations are no longer contiguous");
    content = raw.slice(statements[0].getStart(ast), statements.at(-1).getEnd()) + "\n";
    for (const statement of statements) {
      const start = statement.getStart(ast), end = statement.getEnd();
      selections.push({
        declarations: names(statement),
        start_line: ast.getLineAndCharacterOfPosition(start).line + 1,
        end_line: ast.getLineAndCharacterOfPosition(end).line + 1,
        sha256: hash(raw.slice(start, end)),
      });
    }
    assert(!content.includes("SCHEMA_VERSION") && !content.includes("node:crypto") && !content.includes("node:fs"), "Unrelated core authority entered the snapshot");
  }
  files.push({ path: name, content });
  inputs.push({ path: name, retained_sha256: digest, snapshot_sha256: hash(content), bytes: Buffer.byteLength(content), selection: name.endsWith("core.mts") ? "five exact contiguous settings declarations" : "complete original module", declarations: selections });
}

// Perform every input and shape check before creating either output.
fs.mkdirSync(output, { recursive: true });
for (const file of files) {
  const filename = path.join(output, file.path);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, file.content, { flag: "wx" });
}
const result = {
  schema: "align/runtime-settings-source-capture@1",
  owning_work: "ADOPT-002",
  source_prerequisite: "CONFIG-001",
  retained_source_remains_release_authority: true,
  native_qualified: false,
  inputs,
  unresolved_external_import: {
    module: "./value-core.mts",
    from: "lib/v2/config.ts",
    symbol: "followUpProblem",
    contract: "value.follow-up-problem",
    disposition: "Bind the existing qualified public dependency; its algorithm is outside this source snapshot.",
  },
  excluded: ["core schema version", "cryptography", "secret persistence", "database operations", "creation-code storage", "events", "email delivery"],
};
fs.writeFileSync(record, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ files: files.length, bytes: inputs.reduce((n, item) => n + item.bytes, 0), record_sha256: hash(fs.readFileSync(record)), native_qualified: false }));
