// Build adapter for the reviewed, pinned native libraries. No registry downloads.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value, (_, v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function portable(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes(":")) throw new Error("unsafe native path");
  const parts = value.split("/");
  if (parts.some(p => !p || p === "." || p === ".." || /[<>"|?*\x00-\x1f]/.test(p))) throw new Error("unsafe native path");
  return parts;
}
function read(root, relative, observations) {
  let file = root;
  const parts = portable(relative);
  for (const [i, part] of parts.entries()) {
    file = path.join(file, part);
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || (i < parts.length - 1 ? !st.isDirectory() : !st.isFile())) throw new Error("unsafe native input " + relative);
  }
  const bytes = fs.readFileSync(file);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("native input exceeds bound");
  observations.push({root, relative, bytes});
  return bytes;
}
function checked(bytes, expected) {
  if (expected.algorithm !== "sha256" || !hex(expected.digest) || bytes.length !== expected.size || digest(bytes) !== expected.digest) throw new Error("native content digest mismatch");
  return bytes;
}
export function locateNativeCache(implementation, relative) {
  portable(relative);
  const hits = [];
  for (let parent = implementation, i = 0; i < 7; i++) {
    const candidate = path.join(parent, relative, "generated/committed-source-cache");
    if (fs.existsSync(path.join(candidate, "format.json"))) hits.push({parent, relative: relative + "/generated/committed-source-cache"});
    const next = path.dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  if (hits.length !== 1) throw new Error("expected one exact native cache for " + relative);
  return hits[0];
}
function install(outputs) {
  const journal = [];
  try {
    for (const {staging, destination} of outputs) {
      fs.mkdirSync(path.dirname(destination), {recursive: true});
      if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink() || !fs.lstatSync(destination).isDirectory())) throw new Error("unsafe native output");
      const next = fs.mkdtempSync(path.join(path.dirname(destination), ".native-next-"));
      const backup = next + ".prior";
      const prior = fs.existsSync(destination);
      journal.push({destination, next, backup, prior, installed: false});
      fs.cpSync(staging, next, {recursive: true});
      if (prior) fs.renameSync(destination, backup);
      fs.renameSync(next, destination);
      journal.at(-1).installed = true;
    }
  } catch (error) {
    for (const item of journal.reverse()) {
      if (item.installed) fs.rmSync(item.destination, {recursive: true});
      if (fs.existsSync(item.backup)) fs.renameSync(item.backup, item.destination);
      fs.rmSync(item.next, {recursive: true, force: true});
    }
    throw error;
  }
  for (const item of journal) if (item.prior) fs.rmSync(item.backup, {recursive: true});
}

export function prepareNative(implementation, destinations, {components, inputDestination} = {}) {
  const observations = [];
  const manifestBytes = read(implementation, "native/libraries.json", observations);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== "align/native-libraries@1" || !Array.isArray(manifest.libraries) || !manifest.libraries.length) throw new Error("invalid native library manifest");
  let libraries = manifest.libraries;
  if (components !== undefined) {
    if (!Array.isArray(components) || !components.length || new Set(components).size !== components.length ||
        components.some(c => libraries.filter(l => l.component === c).length !== 1)) throw new Error("invalid native consumer selection");
    libraries = libraries.filter(l => components.includes(l.component));
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "align-native-"));
  const staging = path.join(temporary, "native");
  const inputs = path.join(temporary, "inputs");
  fs.mkdirSync(staging);
  fs.mkdirSync(inputs);
  const exports = [], symbolOwners = new Map(), packages = new Set();
  let caseTotal = 0;
  try {
    for (const lib of libraries) {
      const bindings = [], packageSymbols = new Set();
      if (!hex(lib.entry) || !hex(lib.source_tree) || !/^[a-z][a-z0-9_]*$/.test(lib.package) || packages.has(lib.package)) throw new Error("invalid native package pin");
      packages.add(lib.package);
      if ("sha256:" + digest(Buffer.from(canonical(lib.lock))) !== lib.lock_identity) throw new Error("native lock pin mismatch");
      const cache = locateNativeCache(implementation, lib.provider);
      // A development checkout also checks live provider heads. The sealed harness
      // receives the reviewed manifest and exact caches, then reruns acceptance.
      if (fs.existsSync(path.join(cache.parent, "literate.project.json"))) {
        const lock = JSON.parse(read(cache.parent, lib.provider + "/components/" + lib.component + "/component.lock.json", observations));
        const head = JSON.parse(read(cache.parent, lib.provider + "/" + lib.authority_head, observations));
        if ("sha256:" + digest(Buffer.from(canonical(lock))) !== lib.lock_identity ||
            head.projection_identity !== lib.qualified_projection ||
            head.component_coordinate !== "component://local/" + lib.component) throw new Error("native provider authority changed");
      }
      const fromCache = rel => read(cache.parent, cache.relative + "/" + rel, observations);
      const start = observations.length;
      fromCache("format.json");
      const entryBytes = fromCache("entries/sha256/" + lib.entry + ".json");
      if (digest(entryBytes) !== lib.entry) throw new Error("native entry digest mismatch");
      const entry = JSON.parse(entryBytes), derivation = entry.derivation;
      if (entry.schema !== "urn:literate-ai:schema:v2:standard-accepted-source-cache-entry" ||
          derivation.component_lock_identity.algorithm + ":" + derivation.component_lock_identity.digest !== lib.lock_identity ||
          derivation.source_tree_identity.digest !== lib.source_tree) throw new Error("native authority pin mismatch");
      const expected = entry.source_files.filter(f => f.path.startsWith("source/" + lib.package + "/"))
        .map(f => ({path: f.path.slice(("source/" + lib.package + "/").length), ...f.blob}));
      assert.deepEqual(lib.files, expected.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const paths = new Set();
      for (const f of lib.files) {
        const relative = portable(f.path).join("/");
        if (!hex(f.digest) || paths.has(relative.toLowerCase())) throw new Error("duplicate or invalid native file");
        paths.add(relative.toLowerCase());
        const bytes = checked(fromCache("cas/blobs/sha256/" + f.digest.slice(0,2) + "/" + f.digest), f);
        const destination = path.join(staging, lib.package, relative);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.writeFileSync(destination, bytes, {flag: "wx"});
      }
      for (const [file, hash] of Object.entries(lib.verification_files)) {
        const bytes = read(implementation, "native/" + portable(file).join("/"), observations);
        if (!hex(hash) || digest(bytes) !== hash) throw new Error("native verifier digest mismatch");
      }
      const oracle = JSON.parse(read(implementation, "native/" + lib.oracle, observations));
      if (oracle.schema !== "literate-ai/library-acceptance-oracle@1" || oracle.harness !== lib.verifier ||
          oracle.harness_identity !== "sha256:" + lib.verification_files[lib.verifier] ||
          lib.surface.package !== lib.package || lib.surface.language !== "javascript" ||
          oracle.import_surface_identity !== "sha256:" + digest(Buffer.from(canonical(lib.surface)))) throw new Error("native import surface mismatch");
      const capabilities = new Set(lib.surface.capabilities.map(c => c.capability));
      if (!capabilities.size || capabilities.size !== lib.surface.capabilities.length || !oracle.cases.length ||
          new Set(oracle.cases.map(c => c.case_id)).size !== oracle.cases.length ||
          oracle.cases.some(c => !capabilities.has(c.capability)) ||
          new Set(oracle.cases.map(c => c.capability)).size !== capabilities.size) throw new Error("native acceptance coverage mismatch");
      for (const item of lib.surface.capabilities) for (const symbol of item.symbols) {
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(symbol) || packageSymbols.has(symbol)) throw new Error("duplicate native symbol");
        packageSymbols.add(symbol);
        const owners = symbolOwners.get(symbol) || [];
        owners.push(lib.package);
        symbolOwners.set(symbol, owners);
        const relative = item.module.slice((lib.package + "/").length);
        const modules = lib.files.filter(f => [relative + ".js", relative + ".mjs", relative + ".cjs"].includes(f.path));
        if (modules.length !== 1 || !item.module.startsWith(lib.package + "/")) throw new Error("native module missing");
        const binding = "m" + bindings.length;
        bindings.push("import * as " + binding + " from " + JSON.stringify("../" + lib.package + "/" + modules[0].path) + ";\n" +
          "export const " + symbol + " = " + binding + "." + symbol + " ?? " + binding + ".default?." + symbol + " ?? " + binding + ".default;\n" +
          "if (typeof " + symbol + " !== 'function') throw new Error('native callable missing');\n");
      }
      fs.mkdirSync(path.join(staging, ".bindings"), {recursive: true});
      fs.writeFileSync(path.join(staging, ".bindings", lib.package + ".js"), bindings.join("\n"));
      fs.writeFileSync(path.join(staging, ".bindings", lib.package + ".d.ts"), [...packageSymbols].sort().map(s =>
        "export declare const " + s + ": (...args: unknown[]) => unknown;\n").join(""));
      exports.push("export * as " + lib.package + " from " + JSON.stringify("./.bindings/" + lib.package + ".js") + ";\n");
      for (const test of oracle.cases) {
        const result = spawnSync(process.execPath, [path.join(implementation, "native", lib.verifier), staging, JSON.stringify(lib.surface), JSON.stringify([test])],
          {encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024});
        if (result.error || result.status !== 0) throw new Error("native acceptance failed: " + test.case_id + " " + (result.stderr || result.error));
        assert.deepEqual(JSON.parse(result.stdout), {schema: "literate-ai/library-acceptance-results@1", cases: [
          {case_id: test.case_id, capability: test.capability, result: test.expected_result}]});
      }
      caseTotal += oracle.cases.length;
      if (inputDestination) for (const observation of observations.slice(start)) {
        if (observation.root !== cache.parent || !observation.relative.startsWith(cache.relative + "/")) continue;
        const file = path.join(inputs, ...portable(observation.relative));
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, observation.bytes);
      }
    }
    // Keep a namespace for every provider. Existing consumers may also use flat
    // aliases, but an overlapping name must never silently select a provider.
    for (const [symbol, owners] of [...symbolOwners].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (owners.length === 1 && !packages.has(symbol)) exports.push("export {" + symbol + "} from " +
        JSON.stringify("./.bindings/" + owners[0] + ".js") + ";\n");
    }
    fs.writeFileSync(path.join(staging, "index.js"), exports.join("\n"));
    fs.writeFileSync(path.join(staging, "index.d.ts"), exports.join("\n"));
    fs.writeFileSync(path.join(staging, "package.json"), '{"type":"module"}\n');
    fs.writeFileSync(path.join(staging, ".literate-native.json"), JSON.stringify({schema: "align/materialized-native@1", manifest: digest(manifestBytes), entries: libraries.map(l => l.entry)}) + "\n");
    for (const old of observations) if (!read(old.root, old.relative, []).equals(old.bytes)) throw new Error("native inputs changed during acceptance");
    install([...destinations.map(destination => ({staging, destination})),
      ...(inputDestination ? [{staging: inputs, destination: inputDestination}] : [])]);
    return {libraries: libraries.length, cases: caseTotal};
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const implementation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const agent = path.join(implementation, "packages/align-agent");
  const consumer = process.argv[2] || "agent";
  if (!["agent", "web", "container"].includes(consumer)) throw new Error("unknown native consumer");
  const web = consumer !== "agent";
  console.log(JSON.stringify(prepareNative(implementation,
    web ? [path.join(implementation, "lib/native")] : [path.join(agent, "src/native"), path.join(agent, "dist/native")],
    {components: web ? ["paste-lines", "policy", "share-again", "home-attention", "trust-markdown", "http-errors", "promise-queues", "wording", "value-rules", "field-validation"] : ["spend-meter", "spend-stream", "spend-rounding", "shell-words", "share-notices", "agent-envelope"],
      inputDestination: consumer === "container" ? path.join(implementation, ".native-inputs") : undefined})));
}
