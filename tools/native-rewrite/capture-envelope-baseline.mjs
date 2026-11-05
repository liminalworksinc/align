// Capture direct observations before authoring the remaining B10 contracts.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
const h=createRequire(import.meta.url)("./envelope-harness.cjs");
const [sourceArg,output]=process.argv.slice(2),source=path.resolve(sourceArg);
const files=["envelope.ts","ended.ts","types.ts"];
const identities=()=>files.map(name=>({path:name,sha256:createHash("sha256").update(fs.readFileSync(path.join(source,name))).digest("hex")}));
const before=identities(),methods=await h.loadBaseline(source),cases=[],totals={};
for(const op of Object.keys(h.CAPABILITY).sort()){
  totals[op]=h.countVectors(op);
  for(let start=0,batch=0;start<totals[op];start+=65536,batch++){
    const limit=Math.min(65536,totals[op]-start);
    const result=h.runBatch(methods,op,start,limit,true);
    cases.push({case_id:h.CAPABILITY[op]+"-"+String(batch).padStart(3,"0"),capability:h.CAPABILITY[op],arguments:[op,start,limit],expected_result:result});
  }
  process.stderr.write(op+": "+totals[op]+" source observations passed\n");
}
assert(cases.length<=64,"library oracle case bound exceeded");
assert.deepEqual(identities(),before,"source snapshot changed while observed");
cases.sort((a,b)=>a.case_id<b.case_id?-1:a.case_id>b.case_id?1:0);
const observations=Object.values(totals).reduce((a,b)=>a+b,0);
fs.writeFileSync(output,JSON.stringify({schema:"align/agent-envelope-observations@1",source_files:before,observations,totals,cases})+"\n");
console.log(JSON.stringify({cases:cases.length,operations:Object.keys(totals).length,observations,source_unchanged:true}));
