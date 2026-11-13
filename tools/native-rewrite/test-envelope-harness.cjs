const test=require("node:test");
const assert=require("node:assert/strict");
const h=require("./envelope-harness.cjs");
test("envelope fingerprints preserve aliases, Sets, unusual numbers and array properties",()=>{
  const shared={text:"same"};
  assert.notDeepEqual(h.encode({arguments:[shared],outcome:shared}),h.encode({arguments:[shared],outcome:{...shared}}));
  assert.notDeepEqual(h.encode(new Set(["a","b"])),h.encode(new Set(["b","a"])));
  for(const value of [undefined,NaN,Infinity,-0])assert.notDeepEqual(h.encode(value),h.encode(null));
  const a=["text"],b=["text"];b.extra=undefined;
  assert.notDeepEqual(h.encode(a),h.encode(b));
});
test("envelope matrix covers every public callable and all state axes within the oracle bound",()=>{
  let batches=0;
  assert.equal(Object.keys(h.CAPABILITY).length,51);
  for(const op of Object.keys(h.CAPABILITY)){
    const n=h.countVectors(op);assert(n>0,op);batches+=Math.ceil(n/65536);
  }
  assert(h.countVectors("shareNotice")>500000);
  assert(h.countVectors("renderEnvelope")>7000);
  assert(batches<=64,"independent library oracle bound");
  assert(h.STATES.some(s=>s.login===true&&s.release?.stopped));
  assert(h.FACTS.some(f=>f.unsent&&f.via==="login"&&f.out_since));
  assert([...h.vectors("renderAsksDelta")].some(([ta,added,removed])=>ta.team.name.length>40&&added.length===1&&added[0].text.length>300&&added[0].asked_by.length>50&&removed>0),"single-ask clipping retains attribution and closing-count coverage");
});
test("envelope observations refuse argument mutation and invalid ranges",()=>{
  const methods={envelopeData:()=>({}),endedData:()=>({}),clean:v=>{if(v&&typeof v==="object")v.changed=true;return"";}};
  const index=[...h.vectors("clean")].findIndex(([v])=>v&&typeof v==="object"&&!Array.isArray(v));
  assert.throws(()=>h.runBatch(methods,"clean",index,1,true),/mutates envelope arguments/);
  for(const args of [[-1,1],[0,0],[0,1.5]])assert.throws(()=>h.runBatch(methods,"clean",...args),/range/);
  assert.throws(()=>h.runBatch(methods,"clean",100000,1),/exceeds matrix/);
});
test("public envelope probes detect detached metadata and restore shared state",()=>{
  const labels={must:"Must",must_not:"Must not",out_of_scope:"Out of scope"},safe=new Set(["checkpoint","replan"]);
  const linked={envelopeData:()=>({LIMIT_WORDS:labels,SAFE_REQUESTS:safe}),boundLimits:()=>labels.must,renderEnvelope:()=>labels.must};
  const before=h.encode(linked.envelopeData());
  const result=h.dataProbe(linked,"changed-labels");
  assert.equal(result.shared_labels,true);assert.equal(result.limit_words,"Custom must");
  assert.deepEqual(h.encode(linked.envelopeData()),before);
  const detached={...linked,envelopeData:()=>({LIMIT_WORDS:{...labels},SAFE_REQUESTS:new Set(safe)})};
  const failed=h.dataProbe(detached,"changed-labels");
  assert.equal(failed.shared_labels,false);assert.equal(failed.shared_safe,false);assert.equal(failed.limit_words,"Must");
  assert.deepEqual(h.encode(linked.envelopeData()),before);
});
