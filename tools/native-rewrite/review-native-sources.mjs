// Readable review copies of accepted source. Runtime builds still use the pinned caches.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const implementation = path.join(root, "components/legacy-project-wrapper/implementation");
const destination = path.join(root, "generated/native-review-source");
const write = process.argv.length === 3 && process.argv[2] === "--write";
assert(process.argv.length === 2 || write, "Usage: node tools/native-rewrite/review-native-sources.mjs [--write]");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function parts(relative) {
  assert(typeof relative === "string" && relative.length > 0, "Empty source path");
  const result = relative.split("/");
  assert(result.every(item => item && item !== "." && item !== ".." && !/[\\:<>\"|?*\x00-\x1f]/.test(item)), "Unsafe source path");
  return result;
}
function read(base, relative) {
  let current = base;
  const segments = parts(relative);
  for (const [index, item] of segments.entries()) {
    current = path.join(current, item);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink() && (index === segments.length - 1 ? stat.isFile() : stat.isDirectory()), "Unsafe source input: " + relative);
  }
  return fs.readFileSync(current);
}
function directory(relative, create) {
  let current = root;
  for (const item of parts(relative)) {
    current = path.join(current, item);
    if (create && !fs.existsSync(current)) fs.mkdirSync(current);
    const stat = fs.lstatSync(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), "Unsafe review directory");
  }
}
const manifestBytes = read(implementation, "native/libraries.json");
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schema, "align/native-libraries@1");
assert(Array.isArray(manifest.libraries) && manifest.libraries.length > 0);
const expected = new Map(), libraries = [];
for (const library of manifest.libraries) {
  assert(/^[a-z][a-z0-9_]*$/.test(library.package) && hex(library.entry) && hex(library.source_tree));
  const cache = parts(library.provider).join("/") + "/generated/committed-source-cache/";
  const entryBytes = read(root, cache + "entries/sha256/" + library.entry + ".json");
  assert.equal(hash(entryBytes), library.entry, "Changed accepted cache entry");
  const entry = JSON.parse(entryBytes);
  assert.equal(entry.schema, "urn:literate-ai:schema:v2:standard-accepted-source-cache-entry");
  assert.equal(entry.derivation.source_tree_identity.digest, library.source_tree);
  assert.equal("sha256:" + hash(Buffer.from(canonical(library.lock))), library.lock_identity);
  assert.equal("sha256:" + entry.derivation.component_lock_identity.digest, library.lock_identity);
  const prefix = "source/" + library.package + "/";
  const accepted = entry.source_files.filter(file => file.path.startsWith(prefix))
    .map(file => ({path: file.path.slice(prefix.length), ...file.blob}))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  assert.deepEqual(library.files, accepted, "Changed source membership");
  for (const file of accepted) {
    assert(file.algorithm === "sha256" && hex(file.digest) && Number.isSafeInteger(file.size) && file.size >= 0);
    const relative = library.package + "/" + parts(file.path).join("/");
    assert(!expected.has(relative), "Duplicate review source");
    const bytes = read(root, cache + "cas/blobs/sha256/" + file.digest.slice(0, 2) + "/" + file.digest);
    assert.equal(hash(bytes), file.digest, "Changed accepted source blob");
    assert.equal(bytes.length, file.size);
    expected.set(relative, bytes);
  }
  libraries.push({component: library.component, package: library.package, provider: library.provider,
    entry: library.entry, source_tree: library.source_tree, lock_identity: library.lock_identity,
    files: accepted});
}
const reviewManifest = {schema: "align/readable-native-source@1", authority: "review-copy-only",
  library_manifest_sha256: hash(manifestBytes), libraries};
expected.set("manifest.json", Buffer.from(JSON.stringify(reviewManifest, null, 2) + "\n"));
function walk(directory, prefix = "") {
  assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
  const found = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const relative = prefix + name, file = path.join(directory, name), stat = fs.lstatSync(file);
    assert(!stat.isSymbolicLink(), "Symlink in review projection: " + relative);
    if (stat.isDirectory()) found.push(...walk(file, relative + "/"));
    else { assert(stat.isFile()); found.push(relative); }
  }
  return found;
}
directory("generated", write);
if (write) {
  if (fs.existsSync(destination)) {
    for (const file of walk(destination)) assert(expected.has(file), "Unexpected review file; inspect before replacing: " + file);
  }
  for (const [relative, bytes] of expected) {
    const file = path.join(destination, relative);
    const parent = relative.split("/").slice(0, -1).join("/");
    directory("generated/native-review-source" + (parent ? "/" + parent : ""), true);
    if (fs.existsSync(file)) assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
    fs.writeFileSync(file, bytes);
  }
}
assert.deepEqual(walk(destination).sort(), [...expected.keys()].sort(), "Review source membership differs");
for (const [relative, bytes] of expected) assert(read(destination, relative).equals(bytes), "Review source bytes differ: " + relative);
console.log(JSON.stringify({passed: true, libraries: libraries.length, source_files: expected.size - 1,
  manifest_sha256: hash(expected.get("manifest.json")), generated_source_modified: false}));
