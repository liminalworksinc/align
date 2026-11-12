// Verify the host-accepted native bundle against a digest supplied outside the build context.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const preparedSchema = "align/container-native-inputs@1";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

export function preparedFiles(root) {
  const files = [];
  let total = 0;
  function visit(directory, prefix = "") {
    assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink(), "Unsafe prepared directory");
    for (const name of fs.readdirSync(directory).sort()) {
      assert(/^[A-Za-z0-9_.-]+$/.test(name) && name !== "." && name !== "..", "Unsafe prepared member");
      const file = path.join(directory, name), relative = prefix + name, stat = fs.lstatSync(file);
      assert(relative.length <= 512 && relative.split("/").length <= 16, "Prepared path exceeds bounds");
      assert(!stat.isSymbolicLink(), "Prepared symlinks are forbidden");
      if (stat.isDirectory()) visit(file, relative + "/");
      else {
        assert(stat.isFile() && stat.size <= 8 * 1024 * 1024, "Unsafe prepared file");
        const bytes = fs.readFileSync(file);
        total += bytes.length;
        assert(files.length < 4097 && total <= 64 * 1024 * 1024, "Prepared bundle exceeds bounds");
        files.push({path: relative, mode: stat.mode & 0o777, size: bytes.length, sha256: hash(bytes)});
      }
    }
  }
  visit(root);
  return files;
}

export function verifyPrepared(implementation, expectedDigest) {
  assert(/^[a-f0-9]{64}$/.test(expectedDigest || ""), "Host acceptance digest is required; use scripts/build-container.mjs");
  const root = path.join(implementation, ".native-prepared");
  const all = preparedFiles(root);
  const manifestPath = path.join(root, "manifest.json"), bytes = fs.readFileSync(manifestPath);
  assert(bytes.length <= 4 * 1024 * 1024 && hash(bytes) === expectedDigest, "Prepared acceptance seal changed");
  const manifest = JSON.parse(bytes);
  assert(manifest.schema === preparedSchema && Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 4096, "Invalid prepared acceptance manifest");
  assert.deepEqual(all.filter(item => item.path !== "manifest.json"), manifest.files, "Prepared file bytes, modes or membership changed");
  assert(manifest.files.every(item => item.path.startsWith("web/") || item.path.startsWith("operator/")), "Unexpected prepared destination");
  const nativeBytes = fs.readFileSync(path.join(implementation, "native/libraries.json"));
  assert(hash(nativeBytes) === manifest.native_manifest_sha256, "Native authority changed after host acceptance");
  const libraries = JSON.parse(nativeBytes).libraries;
  const files = new Map(manifest.files.map(item => [item.path, item]));
  for (const [kind, prefix] of [["web", "web/"], ["operator", "operator/lib/native/"]]) {
    const components = manifest[kind].components;
    assert(Array.isArray(components) && components.length > 0 && new Set(components).size === components.length, "Invalid prepared consumer");
    const selected = libraries.filter(item => components.includes(item.component));
    assert(selected.length === components.length && new Set(selected.map(item => item.component)).size === selected.length,
      "Prepared consumer has an unknown or duplicate provider");
    const materialized = JSON.parse(fs.readFileSync(path.join(root, prefix, ".literate-native.json")));
    assert(materialized.schema === "align/materialized-native@1" && materialized.manifest === manifest.native_manifest_sha256, "Prepared materialization authority changed");
    assert.deepEqual(materialized.entries, selected.map(item => item.entry), "Prepared provider entries changed");
    for (const library of selected) for (const member of library.files) {
      const item = files.get(prefix + library.package + "/" + member.path);
      assert(item && item.sha256 === member.digest && item.size === member.size, "Prepared runtime differs from the admitted package");
    }
  }
  return manifest;
}

export function consumePrepared(implementation, expectedDigest) {
  const manifest = verifyPrepared(implementation, expectedDigest);
  const targets = [["web", "lib/native"], ["operator", ".operator-runtime"]];
  for (const [, destination] of targets) {
    const parts = destination.split("/");
    let at = implementation;
    for (let index = 0; index < parts.length; index++) {
      at = path.join(at, parts[index]);
      let stat;
      try { stat = fs.lstatSync(at); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (index === parts.length - 1) assert(!stat, "Prepared output must be new");
      else assert(stat && stat.isDirectory() && !stat.isSymbolicLink(), "Unsafe prepared output parent");
    }
  }
  const staging = fs.mkdtempSync(path.join(implementation, ".native-consume-"));
  const installed = [];
  try {
    for (const [source] of targets) fs.mkdirSync(path.join(staging, source));
    for (const item of manifest.files) {
      const input = path.join(implementation, ".native-prepared", item.path), target = path.join(staging, item.path);
      const bytes = fs.readFileSync(input);
      assert(bytes.length === item.size && hash(bytes) === item.sha256, "Prepared input changed during consumption");
      fs.mkdirSync(path.dirname(target), {recursive: true, mode: 0o755});
      fs.writeFileSync(target, bytes, {flag: "wx", mode: item.mode});
      fs.chmodSync(target, item.mode);
    }
    verifyPrepared(implementation, expectedDigest);
    for (const [source, destination] of targets) {
      const target = path.join(implementation, destination);
      fs.renameSync(path.join(staging, source), target);
      installed.push(target);
    }
    return {web_libraries: manifest.web.components.length, operator_libraries: manifest.operator.components.length, files: manifest.files.length};
  } catch (error) {
    for (const target of installed.reverse()) fs.rmSync(target, {recursive: true, force: true});
    throw error;
  } finally {
    fs.rmSync(staging, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 3, "Expected the host acceptance digest");
  console.log(JSON.stringify(consumePrepared(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), process.argv[2])));
}
