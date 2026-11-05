import test, {type TestContext} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath, pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";
import {locateNativeCache, prepareNative} from "../../../scripts/native-libraries.mjs";

const implementation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "align-native-test-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const app = path.join(root, "implementation");
  fs.mkdirSync(app);
  fs.cpSync(path.join(implementation, "native"), path.join(app, "native"), {recursive: true});
  const manifest = JSON.parse(fs.readFileSync(path.join(app, "native/libraries.json"), "utf8"));
  const caches: string[] = [];
  for (const lib of manifest.libraries) {
    const located = locateNativeCache(implementation, lib.provider);
    const source = path.join(located.parent, located.relative);
    const dest = path.join(root, lib.provider, "generated/committed-source-cache");
    const entry = JSON.parse(fs.readFileSync(path.join(source, "entries/sha256/" + lib.entry + ".json"), "utf8"));
    const files = ["format.json", "entries/sha256/" + lib.entry + ".json", ...entry.source_files
      .filter((f: {path: string}) => f.path.startsWith("source/" + lib.package + "/"))
      .map((f: {blob: {digest: string}}) => "cas/blobs/sha256/" + f.blob.digest.slice(0,2) + "/" + f.blob.digest)];
    for (const relative of files) {
      fs.mkdirSync(path.dirname(path.join(dest, relative)), {recursive: true});
      fs.copyFileSync(path.join(source, relative), path.join(dest, relative));
    }
    caches.push(dest);
  }
  const out = path.join(app, "out");
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, "preserve"), "previous build");
  const blob = path.join(caches[0], "cas/blobs/sha256", manifest.libraries[0].files[0].digest.slice(0,2), manifest.libraries[0].files[0].digest);
  return {root, app, manifest, caches, out, blob};
}
function unchanged(out: string) {
  assert.deepEqual(fs.readdirSync(out), ["preserve"]);
  assert.equal(fs.readFileSync(path.join(out, "preserve"), "utf8"), "previous build");
}

// Small, self-contained cache fixtures exercise bindings independently of the
// generated application libraries. Their verifier calls the actual exports.
function overlappingFixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "align-native-overlap-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const app = path.join(root, "implementation"), out = path.join(app, "out");
  fs.mkdirSync(path.join(app, "native"), {recursive: true});
  const canonical = (value: unknown) => JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  const identity = (value: unknown) => ({algorithm: "sha256", digest: hash(Buffer.from(canonical(value)))});
  const verifier = Buffer.from(`
const path = require("node:path");
const {pathToFileURL} = require("node:url");
(async () => {
  const [root, surfaceText, casesText] = process.argv.slice(2);
  const surface = JSON.parse(surfaceText), results = [];
  for (const item of JSON.parse(casesText)) {
    const binding = surface.capabilities.find(c => c.capability === item.capability);
    const module = await import(pathToFileURL(path.join(root, binding.module + ".mjs")).href);
    results.push({case_id: item.case_id, capability: item.capability, result: module[binding.symbols[0]]()});
  }
  process.stdout.write(JSON.stringify({schema: "literate-ai/library-acceptance-results@1", cases: results}));
})().catch(error => { console.error(error); process.exitCode = 1; });
`);
  fs.writeFileSync(path.join(app, "native/fixture-verifier.cjs"), verifier);
  const libraries = ["left", "right"].map(side => {
    const component = "fixture-" + side, packageName = "fixture_" + side;
    const provider = ".literate/native-projects/local-" + component;
    const cache = path.join(root, provider, "generated/committed-source-cache");
    const bytes = Buffer.from(`export const count = () => ${JSON.stringify(side)};\n`);
    const blob = {algorithm: "sha256", digest: hash(bytes), size: bytes.length};
    const blobPath = path.join(cache, "cas/blobs/sha256", blob.digest.slice(0, 2), blob.digest);
    fs.mkdirSync(path.dirname(blobPath), {recursive: true});
    fs.writeFileSync(blobPath, bytes);
    fs.writeFileSync(path.join(cache, "format.json"), "{}");
    const lock = {nodes: []}, lockIdentity = identity(lock), sourceTree = identity(side);
    const entry = {schema: "urn:literate-ai:schema:v2:standard-accepted-source-cache-entry",
      derivation: {component_lock_identity: lockIdentity, source_tree_identity: sourceTree},
      source_files: [{path: "source/" + packageName + "/count.mjs", blob}]};
    const entryBytes = Buffer.from(JSON.stringify(entry)), entryHash = hash(entryBytes);
    fs.mkdirSync(path.join(cache, "entries/sha256"), {recursive: true});
    fs.writeFileSync(path.join(cache, "entries/sha256", entryHash + ".json"), entryBytes);
    const surface = {schema: "urn:literate-ai:schema:v2:library-import-surface@1", language: "javascript", package: packageName,
      capabilities: [{capability: component + ".count", module: packageName + "/count", symbols: ["count"], interface_identity: identity(component)}]};
    const oracleName = component + ".json";
    const oracle = {schema: "literate-ai/library-acceptance-oracle@1", harness: "fixture-verifier.cjs",
      harness_identity: "sha256:" + hash(verifier), import_surface_identity: "sha256:" + identity(surface).digest,
      cases: [{case_id: component + ".count-000", capability: component + ".count", expected_result: side}]};
    const oracleBytes = Buffer.from(JSON.stringify(oracle));
    fs.writeFileSync(path.join(app, "native", oracleName), oracleBytes);
    return {component, package: packageName, provider, lock, lock_identity: "sha256:" + lockIdentity.digest,
      entry: entryHash, source_tree: sourceTree.digest, files: [{path: "count.mjs", ...blob}], surface,
      oracle: oracleName, verifier: "fixture-verifier.cjs",
      verification_files: {[oracleName]: hash(oracleBytes), "fixture-verifier.cjs": hash(verifier)}};
  });
  const save = () => fs.writeFileSync(path.join(app, "native/libraries.json"), JSON.stringify({schema: "align/native-libraries@1", libraries}));
  save();
  return {app, out, libraries, identity, save};
}

test("overlapping exports keep both provider namespaces and omit the ambiguous flat alias", async t => {
  const f = overlappingFixture(t);
  assert.deepEqual(prepareNative(f.app, [f.out]), {libraries: 2, cases: 2});
  const both = await import(pathToFileURL(path.join(f.out, "index.js")).href);
  assert.equal(both.fixture_left.count(), "left");
  assert.equal(both.fixture_right.count(), "right");
  assert.equal("count" in both, false);
  assert.match(fs.readFileSync(path.join(f.out, "index.d.ts"), "utf8"), /export \* as fixture_left/);
  assert.doesNotMatch(fs.readFileSync(path.join(f.out, "index.d.ts"), "utf8"), /export \{count\}/);
  const singleOut = path.join(f.app, "single");
  assert.deepEqual(prepareNative(f.app, [singleOut], {components: ["fixture-left"]}), {libraries: 1, cases: 1});
  const single = await import(pathToFileURL(path.join(singleOut, "index.js")).href);
  assert.equal(single.count(), "left");
  assert.equal(single.fixture_left.count(), "left");
});

test("duplicate names within one provider still refuse before replacing a build", t => {
  const f = overlappingFixture(t), lib = f.libraries[0];
  const duplicate = {...lib.surface.capabilities[0], capability: "fixture-left.again"};
  lib.surface.capabilities.push(duplicate);
  const oraclePath = path.join(f.app, "native", lib.oracle);
  const oracle = JSON.parse(fs.readFileSync(oraclePath, "utf8"));
  oracle.import_surface_identity = "sha256:" + f.identity(lib.surface).digest;
  oracle.cases.push({case_id: "fixture-left.again-000", capability: duplicate.capability, expected_result: "left"});
  fs.writeFileSync(oraclePath, JSON.stringify(oracle));
  lib.verification_files[lib.oracle] = hash(fs.readFileSync(oraclePath));
  f.save();
  fs.mkdirSync(f.out);
  fs.writeFileSync(path.join(f.out, "preserve"), "previous build");
  assert.throws(() => prepareNative(f.app, [f.out]), /duplicate native symbol/);
  unchanged(f.out);
});

test("native package content substitution refuses before replacing a build", t => {
  const f = fixture(t);
  fs.appendFileSync(f.blob, "tampered");
  assert.throws(() => prepareNative(f.app, [f.out]), /digest mismatch/);
  unchanged(f.out);
});
test("native entry substitution refuses before replacing a build", t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.caches[0], "entries/sha256/" + f.manifest.libraries[0].entry + ".json"), " ");
  assert.throws(() => prepareNative(f.app, [f.out]), /entry digest mismatch/);
  unchanged(f.out);
});
test("a development checkout refuses a changed provider authority head", t => {
  const f = fixture(t), lib = f.manifest.libraries[0];
  fs.writeFileSync(path.join(f.root, "literate.project.json"), "{}");
  const provider = path.join(f.root, lib.provider);
  const lock = "components/" + lib.component + "/component.lock.json";
  fs.mkdirSync(path.dirname(path.join(provider, lock)), {recursive: true});
  fs.writeFileSync(path.join(provider, lock), JSON.stringify(lib.lock));
  fs.mkdirSync(path.dirname(path.join(provider, lib.authority_head)), {recursive: true});
  fs.writeFileSync(path.join(provider, lib.authority_head), JSON.stringify({component_coordinate: "component://local/" + lib.component, projection_identity: "sha256:" + "0".repeat(64)}));
  assert.throws(() => prepareNative(f.app, [f.out]), /provider authority changed/);
  unchanged(f.out);
});
test("native inputs cannot replace a content blob with a symlink", t => {
  const f = fixture(t), target = path.join(f.root, "blob");
  fs.renameSync(f.blob, target);
  fs.symlinkSync(target, f.blob);
  assert.throws(() => prepareNative(f.app, [f.out]), /unsafe native input/);
  unchanged(f.out);
});
test("native package omissions refuse even when consumer metadata is edited", t => {
  const f = fixture(t);
  f.manifest.libraries[0].files.pop();
  fs.writeFileSync(path.join(f.app, "native/libraries.json"), JSON.stringify(f.manifest));
  assert.throws(() => prepareNative(f.app, [f.out]));
  unchanged(f.out);
});
test("independent acceptance remains required for hash-consistent verifier inputs", t => {
  const f = fixture(t), lib = f.manifest.libraries[0];
  const oraclePath = path.join(f.app, "native", lib.oracle);
  const oracle = JSON.parse(fs.readFileSync(oraclePath, "utf8"));
  oracle.cases[0].expected_result = {incorrect: true};
  fs.writeFileSync(oraclePath, JSON.stringify(oracle));
  lib.verification_files[lib.oracle] = hash(fs.readFileSync(oraclePath));
  fs.writeFileSync(path.join(f.app, "native/libraries.json"), JSON.stringify(f.manifest));
  assert.throws(() => prepareNative(f.app, [f.out]));
  unchanged(f.out);
});
test("a failed second output restores the first output and keeps the conflicting file", t => {
  const f = fixture(t), conflict = path.join(f.app, "conflict");
  fs.writeFileSync(conflict, "unrelated file");
  assert.throws(() => prepareNative(f.app, [f.out, conflict]), /unsafe native output/);
  unchanged(f.out);
  assert.equal(fs.readFileSync(conflict, "utf8"), "unrelated file");
});
test("native package data changes the shipped agent build identity", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "align-build-test-"));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, "dist/native"), {recursive: true});
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(path.join(implementation, "packages/align-agent/scripts/postbuild.mjs"), path.join(root, "scripts/postbuild.mjs"));
  fs.writeFileSync(path.join(root, "package.json"), '{"version":"test","type":"module"}');
  for (const file of ["cli.js", "hook.js"]) fs.writeFileSync(path.join(root, "dist", file), "");
  fs.writeFileSync(path.join(root, "dist/build.js"), "export const WRITER_GEN = 1;");
  const data = path.join(root, "dist/native/package.json");
  const build = () => {
    const r = spawnSync(process.execPath, [path.join(root, "scripts/postbuild.mjs")], {encoding: "utf8"});
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(fs.readFileSync(path.join(root, "dist/build.json"), "utf8")).build;
  };
  fs.writeFileSync(data, '{"type":"module"}');
  const before = build();
  assert.equal(build(), before);
  fs.writeFileSync(data, '{"type":"commonjs"}');
  assert.notEqual(build(), before);
});

test("a single-library selection exports only its inputs and rebuilds them in isolation", t => {
  const f = fixture(t), inputs = path.join(f.app, "inputs");
  assert.deepEqual(prepareNative(f.app, [f.out], {components: ["paste-lines"], inputDestination: inputs}),
    {libraries: 1, cases: 49});
  assert.deepEqual(fs.readdirSync(f.out).sort(), [".bindings", ".literate-native.json", "index.d.ts", "index.js", "package.json", "paste_lines"]);
  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "align-native-container-"));
  t.after(() => fs.rmSync(isolated, {recursive: true, force: true}));
  fs.cpSync(inputs, isolated, {recursive: true});
  const app = path.join(isolated, "app");
  fs.mkdirSync(app);
  fs.cpSync(path.join(f.app, "native"), path.join(app, "native"), {recursive: true});
  const rebuilt = path.join(app, "out");
  assert.deepEqual(prepareNative(app, [rebuilt], {components: ["paste-lines"]}), {libraries: 1, cases: 49});
  for (const file of fs.readdirSync(path.join(f.out, "paste_lines"))) {
    assert.deepEqual(fs.readFileSync(path.join(rebuilt, "paste_lines", file)), fs.readFileSync(path.join(f.out, "paste_lines", file)));
  }
  assert.deepEqual(fs.readdirSync(path.join(isolated, ".literate/native-projects")), ["local-paste-lines"]);
});

test("the browser paste binding loads independently of the server policy package", async t => {
  const f = fixture(t);
  assert.deepEqual(prepareNative(f.app, [f.out], {components: ["paste-lines", "policy"]}),
    {libraries: 2, cases: 92});
  fs.rmSync(path.join(f.out, "policy"), {recursive: true});
  const paste = await import(pathToFileURL(path.join(f.out, ".bindings/paste_lines.js")).href);
  assert.equal(paste.shq("one'two"), "'one'\\''two'");
  assert.equal(paste.safe_mcp_url("https://align.example/api/mcp"), "https://align.example/api/mcp");
  assert.equal(typeof paste.codex_line("https://align.example/api/mcp"), "string");
});

test("a consumer selection cannot omit every library or name an unknown provider", t => {
  const f = fixture(t);
  for (const components of [[], ["missing"], ["paste-lines", "paste-lines"]]) {
    assert.throws(() => prepareNative(f.app, [f.out], {components}), /consumer selection/);
    unchanged(f.out);
  }
});
