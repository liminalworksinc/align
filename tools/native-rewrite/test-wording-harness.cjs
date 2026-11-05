const test=require("node:test");
const assert=require("node:assert/strict");
const h=require("./wording-harness.cjs");
test("wording observations preserve special values, aliases and function properties",()=>{
  assert.notDeepEqual(h.encode(undefined),h.encode(null));
  assert.notDeepEqual(h.encode(NaN),h.encode(Infinity));
  assert.notDeepEqual(h.encode(0),h.encode(-0));
  const shared={};assert.notDeepEqual(h.encode([shared,shared]),h.encode([{},{}]));
  const a=[];a.extra=1;assert.notDeepEqual(h.encode(a),h.encode([]));
  const f=function observed(){};const first=h.encode(f);f.extra=1;assert.notDeepEqual(first,h.encode(f));
});
test("callback observations retain order, arguments, defaults and thrown errors",()=>{
  const {args,calls}=h.prepare("changeWords",["title",{before:"a",after:"b"},"indexed"]);
  assert.equal(args[2].q("first"),"q1:first");
  assert.equal(args[2].title("second"),"title2:second");
  assert.deepEqual(calls,[["q",["string","first"]],["title",["string","second"]]]);
  assert.equal(args[2].arrow," => ");
  assert.equal(h.prepare("count",[1,"one","many","omitted"]).args.length,3);
  const undef=h.prepare("count",[1,"one","many","undefined"]).args;
  assert.equal(undef.length,4);assert.equal(undef[3],undefined);
  const refused=h.prepare("count",[1,"one","many","throw"]);
  assert.throws(()=>refused.args[3](1),/callback fmt refused/);
  assert.equal(refused.calls.length,1);
});
test("wording fingerprints detect result, argument and callback trace changes",()=>{
  // Deliberately wrong fixture implementations test the verifier, never the app.
  const correct={count:(n,one,many,fmt=String)=>String(fmt(n))+" "+(n===1?one:many??one+"s")};
  const wrong={count:()=>"wrong"};
  assert.notDeepEqual(h.runBatch(correct,"count",0,80),h.runBatch(wrong,"count",0,80));
  const extra={count:(n,one,many,fmt=String)=>{fmt(n);return correct.count(n,one,many,fmt);}};
  assert.notDeepEqual(h.runBatch(correct,"count",0,80),h.runBatch(extra,"count",0,80));
  const clonedError={count:(...args)=>{try{return correct.count(...args);}catch(e){throw new Error(e.message);}}};
  assert.notDeepEqual(h.runBatch(correct,"count",0,80),h.runBatch(clonedError,"count",0,80));
  const a={changeWords:()=>[]},b={changeWords:(_field,diff)=>{diff.extra="changed";return[];}};
  assert.notDeepEqual(h.runBatch(a,"changeWords",0,6),h.runBatch(b,"changeWords",0,6));
  assert.throws(()=>h.runBatch(b,"changeWords",0,6,true),/mutates wording arguments/);
  const clone={changeWords:(_field,diff)=>{diff.before={...diff.before};return[];}};
  const firstArray=[...h.vectors("changeWords")].findIndex(v=>Array.isArray(v[1].before));
  assert(firstArray>=0);
  assert.throws(()=>h.runBatch(clone,"changeWords",firstArray,1,true),/mutates wording arguments/);
  const original={x:{}};const anchors=h.referenceAnchors(original);
  const before=h.encode({original,anchors});original.x={};
  assert.notDeepEqual(h.encode({original,anchors}),before,"identical replacement must be visible");
  assert.throws(()=>h.runBatch(correct,"count",-1,1),/invalid wording range/);
  assert.throws(()=>h.runBatch(correct,"count",0,0),/invalid wording range/);
  assert.throws(()=>h.runBatch({},"wordingData",2,1),/exceeds matrix/);
  const data={BLANK_FILLERS:"blank",DEPENDS_ON_MAX:5,COUNTER_SAME_AS_PROPOSAL:"words"};
  const fresh={wordingData:()=>({...data})},shared={wordingData:()=>data};
  assert.notDeepEqual(h.runBatch(fresh,"wordingData",0,2),h.runBatch(shared,"wordingData",0,2));
  assert.deepEqual(data,{BLANK_FILLERS:"blank",DEPENDS_ON_MAX:5,COUNTER_SAME_AS_PROPOSAL:"words"});
});
test("Unicode coverage is exhaustive and all capabilities fit the case bound",()=>{
  assert.equal(Object.keys(h.CAPABILITY).length,17);
  let cases=0;
  for(const op of Object.keys(h.CAPABILITY)) {
    const n=h.countVectors(op);assert(n>0);
    if(h.MODULES["text-core.mts"].includes(op))assert.equal(n,0x110000+h.TEXTS.length*25);
    cases+=Math.ceil(n/131072);
  }
  assert(cases<=64,"wording oracle exceeds its case bound");
});
