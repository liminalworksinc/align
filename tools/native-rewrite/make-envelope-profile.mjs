// Package captured source observations with a self-contained independent verifier.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
const dir=path.dirname(fileURLToPath(import.meta.url)),h=createRequire(import.meta.url)("./envelope-harness.cjs");
const [capturePath,output]=process.argv.slice(2),capture=JSON.parse(fs.readFileSync(capturePath,"utf8"));
assert.equal(capture.schema,"align/agent-envelope-observations@1");
assert(capture.cases.length>0&&capture.cases.length<=64);
const profile=JSON.parse(fs.readFileSync(path.resolve(dir,"../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"),"utf8"));
const launcher="eval(Buffer.from('"+fs.readFileSync(path.join(dir,"envelope-harness.cjs")).toString("base64")+"','base64').toString())";
profile.profile_id="align-agent-envelope-host-v1";
profile.source_command=["node","-e",launcher,"--","--baseline"];
profile.generated_command=["node","-e",launcher,"--","--generated"];
profile.covered_surface_ids=Object.values(h.CAPABILITY).sort();
profile.cases=capture.cases.map(c=>{
  const [op,start,limit]=c.arguments;
  assert.equal(c.capability,h.CAPABILITY[op]);assert.equal(c.expected_result.observations,limit);
  assert(start>=0&&limit>0&&start+limit<=h.countVectors(op));
  return {case_id:c.case_id,arguments:c.arguments,expected_result:c.expected_result};
}).sort((a,b)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0);
assert.deepEqual([...new Set(capture.cases.map(c=>c.capability))].sort(),profile.covered_surface_ids);
for(const op of Object.keys(h.CAPABILITY)){
  const spans=capture.cases.filter(c=>c.arguments[0]===op).sort((a,b)=>a.arguments[1]-b.arguments[1]);let end=0;
  for(const c of spans){assert.equal(c.arguments[1],end);end+=c.arguments[2];}assert.equal(end,h.countVectors(op));
}
fs.writeFileSync(output,JSON.stringify(profile)+"\n");
console.log(JSON.stringify({cases:profile.cases.length,capabilities:profile.covered_surface_ids.length,observations:capture.observations}));
