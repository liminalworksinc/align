const test=require("node:test"),assert=require("node:assert/strict"),h=require("./home-harness.cjs");
test("Home observations retain aliases, arrays, function properties and special numbers",()=>{
  const p={id:"p",name:"P"};assert.notDeepEqual(h.encode([p,p]),h.encode([p,{...p}]));
  assert.notDeepEqual(h.encode(-0),h.encode(0));assert.notDeepEqual(h.encode(NaN),h.encode(Infinity));
  const a=[];a.extra=true;assert.notDeepEqual(h.encode(a),h.encode([]));
  const root={p},refs=h.anchors(root),before=h.encode({root,refs});root.p={...p};assert.notDeepEqual(h.encode({root,refs}),before);
});
test("Home callback and result controls detect omissions and mutations",()=>{
  const {args,calls}=h.prepare("appStatusWords",[{approved_at:"a"},"indexed"]);
  assert.equal(args[1]("a"),"1:a");assert.deepEqual(calls,[["string","a"]]);
  const data=()=>({EVIDENCE_CLASSES:[],EVIDENCE_WORDS:{},UNLAUNCHED_STATES:[]});
  // Deliberately wrong implementations are confined to verifier controls.
  const correct={data,appStatusWords:(a,at)=>at(a.approved_at)};
  const extra={data,appStatusWords:(a,at)=>{at(a.approved_at);return at(a.approved_at);}};
  assert.notDeepEqual(h.runBatch(correct,"appStatusWords",0,4),h.runBatch(extra,"appStatusWords",0,4));
  const clonedError={data,appStatusWords:(...args)=>{try{return correct.appStatusWords(...args);}catch(e){throw new Error(e.message);}}};
  assert.notDeepEqual(h.runBatch(correct,"appStatusWords",0,4),h.runBatch(clonedError,"appStatusWords",0,4));
  const mutates={data,appStatusWords:(a,at)=>{a.extra=1;return at(a.approved_at);}};
  assert.throws(()=>h.runBatch(mutates,"appStatusWords",0,1,true),/mutates Home arguments/);
  const alias={data,changeWaits:v=>({waiting_on:v.approvers})};
  const clones={data,changeWaits:v=>({waiting_on:[...v.approvers]})};
  assert.notDeepEqual(h.runBatch(alias,"changeWaits",0,4),h.runBatch(clones,"changeWaits",0,4));
});
test("public Home state probes retain shared identity and restore their edits",()=>{
  const state={EVIDENCE_CLASSES:["receipt"],EVIDENCE_WORDS:{receipt:"Receipt"},UNLAUNCHED_STATES:["pending","not_yet"]};
  const saved=structuredClone(state),methods={data:()=>({...state}),launchWaits:()=>null};
  const result=h.dataProbe(methods,"unlaunched");assert(result.fresh_wrapper);assert.deepEqual(result.shared,[true,true,true]);
  assert.deepEqual(result.data.UNLAUNCHED_STATES,["custom","approved"]);assert.deepEqual(state,saved);
  const detached={data:()=>structuredClone(state),launchWaits:()=>null};
  assert.deepEqual(h.dataProbe(detached,"snapshot").shared,[false,false,false]);
});
test("every Home export is covered within the oracle bound and invalid ranges refuse",()=>{
  assert.equal(Object.keys(h.CAPABILITY).length,9);let cases=0;
  for(const op of Object.keys(h.CAPABILITY)){const n=h.countVectors(op);assert(n>0);cases+=Math.ceil(n/65536);}
  assert(cases<=64);assert.throws(()=>h.runBatch({},"data",-1,1),/invalid home range/);
  assert.throws(()=>h.runBatch({},"data",0,0),/invalid home range/);
  assert.throws(()=>h.runBatch({},"data",5,1),/exceeds matrix/);
});
