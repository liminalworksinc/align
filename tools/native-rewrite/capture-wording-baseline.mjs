// Capture unchanged source; no wording behavior is implemented in this helper.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const h=createRequire(import.meta.url)("./wording-harness.cjs");
const [sourceRaw,output]=process.argv.slice(2),source=path.resolve(sourceRaw);
const hashes=Object.fromEntries(Object.keys(h.MODULES).map(name=>[name,createHash("sha256").update(fs.readFileSync(path.join(source,name))).digest("hex")]));
const methods=await h.loadBaseline(source),cases=[],totals={};
for(const op of Object.keys(h.CAPABILITY).sort()) {
  const n=totals[op]=h.countVectors(op);
  for(let start=0,batch=0;start<n;start+=131072,batch++) {
    const limit=Math.min(131072,n-start);
    cases.push({case_id:h.CAPABILITY[op]+"-"+String(batch).padStart(3,"0"),capability:h.CAPABILITY[op],arguments:[op,start,limit],expected_result:h.runBatch(methods,op,start,limit,true)});
  }
  console.error(JSON.stringify({operation:op,observations:n}));
}
if(cases.length>64)throw new Error("wording oracle exceeds its case bound");
cases.sort((a,b)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0);
for(const [name,hash] of Object.entries(hashes))if(createHash("sha256").update(fs.readFileSync(path.join(source,name))).digest("hex")!==hash)throw new Error("source changed during wording capture");
fs.writeFileSync(output,JSON.stringify({source_hashes:hashes,totals,cases})+"\n");
console.log(JSON.stringify({cases:cases.length,observations:Object.values(totals).reduce((a,b)=>a+b,0),totals}));
