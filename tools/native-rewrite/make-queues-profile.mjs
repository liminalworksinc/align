// Capture keyed callback ordering from the immutable original module.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),h=createRequire(import.meta.url)("./queues-harness.cjs");
const [sourceRaw,output,captureOutput]=process.argv.slice(2),source=path.resolve(sourceRaw);
if(fs.existsSync(output)||fs.existsSync(captureOutput))throw new Error("refuse an existing queue capture");
const digest=bytes=>createHash("sha256").update(bytes).digest("hex"),before=digest(fs.readFileSync(path.join(source,"locks.ts"))),total=h.countVectors(),cases=[];
for(const mode of ["absent","existing"]){
  const api=await h.loadBaseline(source,mode);
  for(let start=0,batch=0;start<total;start+=256,batch++){
    const limit=Math.min(256,total-start);
    cases.push({case_id:h.CAPABILITY+"-"+mode+"-"+String(batch).padStart(3,"0"),capability:h.CAPABILITY,arguments:["withLock",start,limit,mode],expected_result:await h.runBatch(api,start,limit,true)});
  }
}
if(cases.length>64)throw new Error("queue oracle exceeds case bound");
if(digest(fs.readFileSync(path.join(source,"locks.ts")))!==before)throw new Error("queue source changed during capture");
const profile=JSON.parse(fs.readFileSync(path.join(here,"../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"),"utf8"));
const launcher="eval(Buffer.from('"+fs.readFileSync(path.join(here,"queues-harness.cjs")).toString("base64")+"','base64').toString())";
profile.profile_id="align-promise-queues-host-v1";profile.source_command=["node","-e",launcher,"--","--baseline"];profile.generated_command=["node","-e",launcher,"--","--generated"];profile.covered_surface_ids=[h.CAPABILITY];profile.cases=cases.map(({capability,...c})=>{void capability;return c;});
fs.writeFileSync(output,JSON.stringify(profile)+"\n");fs.writeFileSync(captureOutput,JSON.stringify({source_hash:before,import_modes:["absent","existing"],scenarios_per_mode:total,cases})+"\n");
console.log(JSON.stringify({capabilities:1,cases:cases.length,observations:total*2,scenarios_per_mode:total}));
