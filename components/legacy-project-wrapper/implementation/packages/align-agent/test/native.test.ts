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
