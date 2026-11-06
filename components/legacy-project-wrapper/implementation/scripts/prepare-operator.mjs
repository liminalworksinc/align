// Assemble the exact Node-only operator runtime from retained commands and qualified packages.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { prepareNative } from "./native-libraries.mjs";

const sources = [
  ["scripts/align-admin-main.mjs", "scripts/align-admin.mjs"],
  ["lib/v2/core.mts", "lib/v2/core.mts"],
  ["lib/v2/retention-core.mts", "lib/v2/retention-core.mts"],
  ["lib/v2/metrics-core.mts", "lib/v2/metrics-core.mts"],
  ["lib/runtime-settings.mts", "lib/runtime-settings.mts"],
];

export function operatorFiles(root) {
  const files = [];
  function visit(directory, prefix = "") {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name), relative = prefix + name;
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(file, relative + "/");
      else if (stat.isFile()) files.push({path:relative, mode:stat.mode & 0o777, sha256:crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")});
      else throw new Error("Operator runtime contains an unsupported file: " + relative);
    }
  }
  visit(root);
  return files;
}

function runtimePermissions(directory) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isDirectory()) runtimePermissions(file);
    else if (stat.isFile()) fs.chmodSync(file, 0o644);
    else throw new Error("Operator runtime contains an unsupported file");
  }
  fs.chmodSync(directory, 0o755);
}

export function prepareOperator(implementation, destination) {
  implementation = path.resolve(implementation);
  destination = path.resolve(destination);
  if (fs.existsSync(destination)) throw new Error("Operator destination must be new");
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), ".operator-next-"));
  try {
    const observations = [];
    for (const [source, target] of sources) {
      const original = path.join(implementation, source);
      // Every source is an explicitly named retained file, never a directory copy.
      let current = implementation;
      for (const part of source.split("/")) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Operator input must not be a symlink");
      }
      if (!fs.lstatSync(original).isFile()) throw new Error("Operator input must be a file");
      const bytes = fs.readFileSync(original), output = path.join(staging, target);
      observations.push({original, bytes});
      fs.mkdirSync(path.dirname(output), {recursive:true});
      fs.writeFileSync(output, bytes, {flag:"wx"});
    }
    const native = prepareNative(implementation, [path.join(staging, "lib/native")],
      {components:["runtime-settings", "value-rules"]});
    for (const {original,bytes} of observations) {
      if (!fs.readFileSync(original).equals(bytes)) throw new Error("Operator inputs changed during preparation");
    }
    // The build may run as root, while the packaged command runs as the node user.
    // Normalize only this owned code tree; the launcher's outer temporary directory stays private.
    runtimePermissions(staging);
    const manifest = {schema:"align/operator-runtime@1", libraries:["runtime-settings", "value-rules"], files:operatorFiles(staging)};
    const manifestPath = path.join(staging, ".operator-manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest)+"\n", {flag:"wx"});
    fs.chmodSync(manifestPath, 0o644);
    fs.renameSync(staging, destination);
    return {native, manifest};
  } finally {
    fs.rmSync(staging, {recursive:true, force:true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/prepare-operator.mjs NEW_DESTINATION");
  const implementation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = prepareOperator(implementation, process.argv[2]);
  console.log(JSON.stringify({libraries:result.native.libraries, cases:result.native.cases, files:result.manifest.files.length}));
}
