// Capture a reviewed source snapshot with a self-contained observation program.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),h=createRequire(import.meta.url)("./markdown-harness.cjs");
const [sourceRaw,output,captureOutput]=process.argv.slice(2),source=path.resolve(sourceRaw);
if(fs.existsSync(output)||fs.existsSync(captureOutput))throw new Error("refuse an existing Markdown capture");
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const before=digest(fs.readFileSync(path.join(source,"markdown.mts"))),methods=await h.loadBaseline(source),cases=[],totals={};
for(const op of Object.keys(h.CAPABILITY).sort()){
  const total=totals[op]=h.countVectors(op),width=op==="slug"?131072:4096;
  for(let start=0,batch=0;start<total;start+=width,batch++){
    const limit=Math.min(width,total-start);
    cases.push({case_id:h.CAPABILITY[op]+"-"+String(batch).padStart(3,"0"),capability:h.CAPABILITY[op],arguments:[op,start,limit],expected_result:h.runBatch(methods,op,start,limit,true)});
  }
}
if(cases.length>64)throw new Error("Markdown oracle exceeds case bound");
cases.sort((a,b)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0);
if(digest(fs.readFileSync(path.join(source,"markdown.mts")))!==before)throw new Error("Markdown source changed during capture");
const profile=JSON.parse(fs.readFileSync(path.join(here,"../../.literate/native-projects/local-spend-stream/components/spend-stream/qualification/profile.json"),"utf8"));
const launcher="eval(Buffer.from('"+fs.readFileSync(path.join(here,"markdown-harness.cjs")).toString("base64")+"','base64').toString())";
profile.profile_id="align-trust-markdown-host-v1";profile.source_command=["node","-e",launcher,"--","--baseline"];
profile.generated_command=["node","-e",launcher,"--","--generated"];profile.covered_surface_ids=Object.values(h.CAPABILITY).sort();
profile.cases=cases.map(({capability,...c})=>{void capability;return c;});
fs.writeFileSync(output,JSON.stringify(profile)+"\n");
fs.writeFileSync(captureOutput,JSON.stringify({source_hash:before,documents:h.DOCUMENTS.map(({file,sha256})=>({file,sha256})),totals,cases})+"\n");
console.log(JSON.stringify({capabilities:h.FUNCTIONS.length,cases:cases.length,observations:Object.values(totals).reduce((a,b)=>a+b,0),totals}));
