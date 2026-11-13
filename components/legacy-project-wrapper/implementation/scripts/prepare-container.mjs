// Run independent acceptance on the owning host, then seal portable build inputs.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {nativeComponents, prepareNative} from "./native-libraries.mjs";
import {prepareOperator} from "./prepare-operator.mjs";
import {preparedFiles, preparedSchema, verifyPrepared} from "./consume-container-inputs.mjs";

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function readable(directory) {
  fs.chmodSync(directory, 0o755);
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), "Prepared source must not be a symlink");
    if (stat.isDirectory()) readable(file);
    else { assert(stat.isFile()); fs.chmodSync(file, 0o644); }
  }
}

export function prepareContainer(implementation) {
  implementation = path.resolve(implementation);
  const destination = path.join(implementation, ".native-prepared");
  if (fs.existsSync(destination)) {
    assert(!fs.lstatSync(destination).isSymbolicLink() && fs.lstatSync(destination).isDirectory(), "Preserve unrelated prepared-input path");
    assert(JSON.parse(fs.readFileSync(path.join(destination, "manifest.json"))).schema === preparedSchema, "Preserve unrelated prepared-input directory");
  }
  const manifestBefore = fs.readFileSync(path.join(implementation, "native/libraries.json"));
  const staging = fs.mkdtempSync(path.join(implementation, ".native-prepare-"));
  const backup = staging + ".previous";
  let previous = false, installed = false;
  try {
    const components = nativeComponents("web");
    const web = prepareNative(implementation, [path.join(staging, "web")], {components, batchCases: true});
    const operator = prepareOperator(implementation, path.join(staging, "operator"));
    assert(fs.readFileSync(path.join(implementation, "native/libraries.json")).equals(manifestBefore), "Native authority changed during preparation");
    readable(staging);
    const manifest = {schema: preparedSchema, native_manifest_sha256: hash(manifestBefore),
      web: {...web, components}, operator: {...operator.native, components: operator.manifest.libraries}, files: preparedFiles(staging)};
    const bytes = Buffer.from(JSON.stringify(manifest) + "\n"), digest = hash(bytes);
    fs.writeFileSync(path.join(staging, "manifest.json"), bytes, {flag: "wx", mode: 0o644});
    if (fs.existsSync(destination)) { fs.renameSync(destination, backup); previous = true; }
    fs.renameSync(staging, destination); installed = true;
    verifyPrepared(implementation, digest);
    if (previous) fs.rmSync(backup, {recursive: true, force: true});
    return {schema: preparedSchema, digest, web, operator: operator.native, files: manifest.files.length};
  } catch (error) {
    if (installed) fs.rmSync(destination, {recursive: true, force: true});
    if (previous) fs.renameSync(backup, destination);
    throw error;
  } finally { fs.rmSync(staging, {recursive: true, force: true}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 2, "No preparation arguments are supported");
  console.log(JSON.stringify(prepareContainer(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."))));
}
