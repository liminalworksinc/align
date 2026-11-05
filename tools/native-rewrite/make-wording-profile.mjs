// Bind complete captured ranges to an ordinary self-contained SDK profile.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const here=path.dirname(fileURLToPath(import.meta.url));
const h=createRequire(import.meta.url)("./wording-harness.cjs");
const [capturePath,output]=process.argv.slice(2),capture=JSON.parse(fs.readFileSync(capturePath,"utf8"));
for(const [op,capability] of Object.entries(h.CAPABILITY)) {
  let end=0;
  for(const c of capture.cases.filter(c=>c.capability===capability).sort((a,b)=>a.arguments[1]-b.arguments[1])) {
    assert.equal(c.arguments[0],op);assert.equal(c.arguments[1],end);
    assert(c.arguments[2]>0);assert.equal(c.expected_result.observations,c.arguments[2]);end+=c.arguments[2];
  }
  assert.equal(end,h.countVectors(op),"incomplete wording coverage");
}
assert(capture.cases.length<=64);assert.equal(new Set(capture.cases.map(c=>c.case_id)).size,capture.cases.length);
assert(capture.cases.every(c=>Object.values(h.CAPABILITY).includes(c.capability)));
const profile=JSON.parse(fs.readFileSync(path.join(here,"../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"),"utf8"));
const launcher="eval(Buffer.from('"+fs.readFileSync(path.join(here,"wording-harness.cjs")).toString("base64")+"','base64').toString())";
profile.profile_id="align-wording-host-v1";
profile.source_command=["node","-e",launcher,"--","--baseline"];
profile.generated_command=["node","-e",launcher,"--","--generated"];
profile.covered_surface_ids=Object.values(h.CAPABILITY).sort();
profile.cases=capture.cases.map(({capability,...c})=>{void capability;return c;});
fs.writeFileSync(output,JSON.stringify(profile)+"\n");
console.log(JSON.stringify({capabilities:profile.covered_surface_ids.length,cases:profile.cases.length}));
