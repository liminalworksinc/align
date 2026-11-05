const test=require("node:test");
const assert=require("node:assert/strict");
const h=require("./value-rules-harness.cjs");
test("value fingerprints distinguish special numbers and shared references",()=>{
  assert.notDeepEqual(h.encode(undefined),h.encode(null));
  assert.notDeepEqual(h.encode(NaN),h.encode(Infinity));
  assert.notDeepEqual(h.encode(0),h.encode(-0));
  const shared={};assert.notDeepEqual(h.encode([shared,shared]),h.encode([{},{}]));
});
test("environment defaults receive controlled values and restore all named fields",()=>{
  const keys=h.ENV_KEYS,saved=keys.map(k=>[k,process.env[k]]);
  try {
    for(const key of keys)process.env[key]="before";
    assert.throws(()=>h.withEnvironment({HOSTED:"1"},()=>{
      assert.equal(process.env.HOSTED,"1");
      assert.equal(process.env.ALIGN_FOLLOW_UP_URL,undefined);
      assert.equal(process.env.ALIGN_PUBLIC_ORIGIN,undefined);
      throw new Error("controlled failure");
    }),/controlled failure/);
    for(const key of keys)assert.equal(process.env[key],"before");
  } finally {for(const [k,v]of saved)if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test("value fingerprints detect incorrect results, input writes and stale defaults",()=>{
  // Deliberately incorrect test functions exercise the observer itself.
  assert.notDeepEqual(h.runBatch({estimateSaid:x=>x},"estimateSaid",0,8),h.runBatch({estimateSaid:()=>"wrong"},"estimateSaid",0,8));
  const pure={followUpProblem:()=>null},mutating={followUpProblem:env=>{env.HOSTED="changed";return null;}};
  assert.notDeepEqual(h.runBatch(pure,"followUpProblem",0,5),h.runBatch(mutating,"followUpProblem",0,5));
  assert.throws(()=>h.runBatch(mutating,"followUpProblem",0,1,true),/mutates value arguments/);
  const vectors=[...h.vectors("followUpUrl")],firstDefault=vectors.findIndex(v=>v[0]==="omitted"&&v[1].HOSTED==="1");
  assert(firstDefault>0);
  const dynamic={followUpUrl:(env=process.env)=>env.HOSTED};
  const stale={followUpUrl:(env={})=>env.HOSTED};
  assert.notDeepEqual(h.runBatch(dynamic,"followUpUrl",firstDefault,1),h.runBatch(stale,"followUpUrl",firstDefault,1));
  assert.throws(()=>h.runBatch(pure,"followUpProblem",-1,1),/invalid value range/);
  assert.throws(()=>h.runBatch(pure,"valueData",2,1),/exceeds matrix/);
});
test("metadata probing observes shared mutable estimates and restores them",()=>{
  const rows=[{id:"same_day",label:"Same day",said:"same day"}];
  const data={ESTIMATE_WORDS:rows,VALUE_QUESTION:"Question",VALUE_NOTE_MAX:500,VALUE_EDIT_DAYS:7};
  const correct={valueData:()=>({...data}),estimateSaid:id=>rows.find(row=>row.id===id)?.said??id};
  const copied={...correct,valueData:()=>({...data,ESTIMATE_WORDS:structuredClone(rows)})};
  const fixed={...correct,estimateSaid:id=>id==="same_day"?"same day":id};
  const expected=h.runBatch(correct,"valueData",0,2);
  assert.notDeepEqual(expected,h.runBatch(copied,"valueData",0,2));
  assert.notDeepEqual(expected,h.runBatch(fixed,"valueData",0,2));
  assert.deepEqual(rows,[{id:"same_day",label:"Same day",said:"same day"}]);
});
test("all eight capabilities have bounded complete observation ranges",()=>{
  assert.equal(Object.keys(h.CAPABILITY).length,8);
  assert.equal(h.countVectors("cleanValueText"),0x110000+h.TEXTS.length*25);
  let batches=0;
  for(const op of Object.keys(h.CAPABILITY)){const n=h.countVectors(op);assert(n>0);batches+=Math.ceil(n/131072);}
  assert(batches<=64);
});
