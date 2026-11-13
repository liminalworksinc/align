// Capture the unchanged Home rules and embed their independent verifier.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const h=createRequire(import.meta.url)("./home-harness.cjs");
const [sourceRaw,output,captureOutput]=process.argv.slice(2),source=path.resolve(sourceRaw);
const before=createHash("sha256").update(fs.readFileSync(path.join(source,"home-core.mts"))).digest("hex");
const methods=await h.loadBaseline(source),cases=[],totals={};
for(const op of Object.keys(h.CAPABILITY).sort()) {
  const n=totals[op]=h.countVectors(op);
  for(let start=0,batch=0;start<n;start+=65536,batch++) {
    const limit=Math.min(65536,n-start);
    cases.push({case_id:h.CAPABILITY[op]+"-"+String(batch).padStart(3,"0"),capability:h.CAPABILITY[op],arguments:[op,start,limit],expected_result:h.runBatch(methods,op,start,limit,true)});
  }
}
if(cases.length>64)throw new Error("Home oracle exceeds its case bound");
cases.sort((a,b)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0);
if(createHash("sha256").update(fs.readFileSync(path.join(source,"home-core.mts"))).digest("hex")!==before)throw new Error("Home source changed during capture");
const profile=JSON.parse(fs.readFileSync(path.join(here,"../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"),"utf8"));
const launcher="eval(Buffer.from('"+fs.readFileSync(path.join(here,"home-harness.cjs")).toString("base64")+"','base64').toString())";
profile.profile_id="align-home-attention-host-v1";profile.source_command=["node","-e",launcher,"--","--baseline"];
profile.generated_command=["node","-e",launcher,"--","--generated"];profile.covered_surface_ids=Object.values(h.CAPABILITY).sort();
profile.cases=cases.map(({capability,...c})=>{void capability;return c;});
fs.writeFileSync(output,JSON.stringify(profile)+"\n");
fs.writeFileSync(captureOutput,JSON.stringify({source_hash:before,totals,cases})+"\n");
console.log(JSON.stringify({capabilities:9,cases:cases.length,observations:Object.values(totals).reduce((a,b)=>a+b,0),totals}));
