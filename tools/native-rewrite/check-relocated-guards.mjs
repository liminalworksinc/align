// Re-run the existing independent acceptance against the readable accepted packages.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const app = path.join(root, "components/legacy-project-wrapper/implementation");
const source = path.join(root, "generated/native-review-source");
const selected = ["field-validation", "storage-runtime", "migration-coordinator", "server-auth",
  "server-workspaces", "limit-suggest", "server-goals", "server-devices", "server-directives"];
const {libraries} = JSON.parse(fs.readFileSync(path.join(app, "native/libraries.json"), "utf8"));
let batches = 0;
for (const component of selected) {
  const library = libraries.find(item => item.component === component);
  assert(library);
  const oracle = JSON.parse(fs.readFileSync(path.join(app, "native", library.oracle), "utf8"));
  const verifier = require(path.join(app, "native", library.verifier));
  let actual;
  if (typeof verifier.runSelected === "function") {
    actual = [];
    // Keep the complete matrix, using bounded requests on two-core CI runners.
    const requestSize = component === "field-validation" ? 4 : oracle.cases.length;
    for (let offset = 0; offset < oracle.cases.length; offset += requestSize) {
      actual.push(...await verifier.runSelected(source, library.surface,
        oracle.cases.slice(offset, offset + requestSize)));
    }
  }
  else if (typeof verifier.runCases === "function") actual = await verifier.runCases(source, library.surface, oracle.cases);
  else {
    assert.equal(component, "migration-coordinator");
    const execute = await verifier.generated(source, library.surface);
    actual = oracle.cases.map(item => ({case_id: item.case_id, capability: item.capability,
      result: verifier.runBatch(execute, ...item.arguments)}));
  }
  assert.deepEqual(actual, oracle.cases.map(item => ({case_id: item.case_id,
    capability: item.capability, result: item.expected_result})), component);
  batches += actual.length;
  console.log(JSON.stringify({component, passed: true, batches: actual.length}));
}
console.log(JSON.stringify({passed: true, components: selected.length, batches,
  operator_security_acceptance: false}));
