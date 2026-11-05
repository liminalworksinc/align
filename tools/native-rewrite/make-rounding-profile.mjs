// Capture the unchanged rounding helper and its exact native interface.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const dir = path.dirname(fileURLToPath(import.meta.url));
const {load} = createRequire(import.meta.url)("./rounding-harness.cjs");
const [source, profileOutput, contractsOutput] = process.argv.slice(2);
const fn = await load(path.resolve(source), true);
const values = new Set();
for (const center of [0n, 500000n, 1000000n, 1500000n, 9007199254740991000000n]) {
  for (const delta of [-1n, 0n, 1n]) {
    values.add(String(center + delta)); values.add(String(-center + delta));
  }
}
for (const value of [10n ** 40n, -(10n ** 40n), 10n ** 400n, -(10n ** 400n)]) values.add(String(value));
const template = path.resolve(dir, "../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json");
const profile = JSON.parse(fs.readFileSync(template, "utf8"));
const launcher = "eval(Buffer.from('" + fs.readFileSync(path.join(dir, "rounding-harness.cjs")).toString("base64") + "','base64').toString())";
profile.profile_id = "align-spend-rounding-host-v1";
profile.source_command = ["node", "-e", launcher, "--", "--baseline"];
profile.generated_command = ["node", "-e", launcher, "--", "--generated"];
// Decimal text preserves every input bit through the JSON transport.
profile.cases = [...values].map((v, i) => ({case_id: "rounding-" + String(i).padStart(3, "0"),
  arguments: [v], expected_result: String(fn(BigInt(v)))}));
profile.covered_surface_ids = ["spend-rounding.pico-to-micros"];
fs.writeFileSync(profileOutput, JSON.stringify(profile) + "\n");
fs.writeFileSync(contractsOutput, JSON.stringify({kind: "library", capabilities: {
  "spend-rounding.pico-to-micros": "JavaScript module spend_rounding/pico_to_micros exports pico_to_micros(pico). The input is any JavaScript bigint. Return Number((pico + 500000n) / 1000000n), preserving ECMAScript BigInt division truncation toward zero and conversion to Number. This includes negative inputs, integers beyond Number's safe range and magnitudes that convert to positive or negative Infinity. Do not coerce pico through Number before the integer addition and division, clamp it, reject negatives, or use floating-point division. No side effects."
}}, null, 2) + "\n");
console.log(JSON.stringify({cases: profile.cases.length}));
