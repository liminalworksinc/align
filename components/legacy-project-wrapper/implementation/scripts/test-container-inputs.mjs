// Exercise the actual accepted bundle, including mutations with recomputed metadata.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {consumePrepared, verifyPrepared} from "./consume-container-inputs.mjs";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
export function testPreparedInputs(implementation, digest) {
  const accepted = verifyPrepared(implementation, digest);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "align-container-input-controls-"));
  const passed = [];
  function copy(name) {
    const target = path.join(root, name);
    fs.mkdirSync(path.join(target, "native"), {recursive: true});
    fs.mkdirSync(path.join(target, "lib"));
    fs.copyFileSync(path.join(implementation, "native/libraries.json"), path.join(target, "native/libraries.json"));
    fs.cpSync(path.join(implementation, ".native-prepared"), path.join(target, ".native-prepared"), {recursive: true});
    return target;
  }
  function refused(name, change, expected) {
    const target = copy(name);
    const alteredDigest = change(target);
    assert.throws(() => consumePrepared(target, alteredDigest ?? digest), expected);
    assert(!fs.existsSync(path.join(target, ".operator-runtime")), "A refused bundle installed an operator output");
    passed.push(name);
  }
  const metadata = root => path.join(root, ".native-prepared/manifest.json");
  const first = accepted.files.find(item => item.path.startsWith("web/") && item.path.endsWith(".js"));
  assert(first);
  try {
    const target = copy("accepted");
    const result = consumePrepared(target, digest);
    assert(result.web_libraries === accepted.web.components.length && result.operator_libraries === accepted.operator.components.length);
    for (const item of accepted.files) {
      const destination = item.path.startsWith("web/") ? "lib/native/" + item.path.slice(4) : ".operator-runtime/" + item.path.slice(9);
      const file = path.join(target, destination);
      assert(fs.lstatSync(file).isFile() && hash(fs.readFileSync(file)) === item.sha256);
    }
    passed.push("accepted-exact-files");
    refused("missing-seal", () => "", /Host acceptance digest is required/);
    refused("changed-file", root => { fs.appendFileSync(path.join(root, ".native-prepared", first.path), "changed"); }, /Prepared file bytes/);
    refused("extra-file", root => { fs.writeFileSync(path.join(root, ".native-prepared/web/unexpected"), "owned canary"); }, /Prepared file bytes/);
    refused("symlink", root => {
      const file = path.join(root, ".native-prepared", first.path), canary = path.join(root, "public-canary");
      fs.writeFileSync(canary, "owned public canary"); fs.unlinkSync(file); fs.symlinkSync(canary, file);
    }, /Prepared symlinks/);
    refused("changed-authority", root => { fs.appendFileSync(path.join(root, "native/libraries.json"), " "); }, /Native authority changed/);
    refused("changed-seal-manifest", root => { fs.appendFileSync(metadata(root), " "); }, /Prepared acceptance seal changed/);
    refused("recomputed-seal-with-unadmitted-source", root => {
      const native = JSON.parse(fs.readFileSync(path.join(root, "native/libraries.json")));
      const library = native.libraries.find(item => accepted.web.components.includes(item.component));
      const member = library.files[0], relative = "web/" + library.package + "/" + member.path;
      const file = path.join(root, ".native-prepared", relative); fs.appendFileSync(file, "\nchanged\n");
      const manifest = JSON.parse(fs.readFileSync(metadata(root))), entry = manifest.files.find(item => item.path === relative);
      const bytes = fs.readFileSync(file); entry.sha256 = hash(bytes); entry.size = bytes.length;
      const encoded = Buffer.from(JSON.stringify(manifest) + "\n"); fs.writeFileSync(metadata(root), encoded);
      return hash(encoded);
    }, /Prepared runtime differs from the admitted package/);
    const conflict = copy("output-conflict"), existing = path.join(conflict, "lib/native");
    fs.writeFileSync(existing, "unrelated output");
    assert.throws(() => consumePrepared(conflict, digest), /Prepared output must be new/);
    assert(fs.readFileSync(existing, "utf8") === "unrelated output");
    passed.push("output-conflict-preserved");
    const linked = copy("output-parent-link"), outside = path.join(root, "owned-outside");
    fs.mkdirSync(outside); fs.rmdirSync(path.join(linked, "lib")); fs.symlinkSync(outside, path.join(linked, "lib"));
    assert.throws(() => consumePrepared(linked, digest), /Unsafe prepared output parent/);
    assert.deepEqual(fs.readdirSync(outside), []);
    passed.push("output-parent-link-refused");
    verifyPrepared(implementation, digest);
    return {passed: passed.length, cases: passed, accepted_package_files_unchanged: true};
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}
