const test=require("node:test"),assert=require("node:assert/strict");
const h=require("./http-errors-harness.cjs");
function fixture(){
  class V2Error extends Error{constructor(status,code,message,extra){super(message??code);this.status=status;this.code=code;this.extra=extra;}}
  class HttpError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code;}}
  return {data:()=>({HttpError,V2Error}),badRequest:(message,code="bad_request")=>new V2Error(400,code,message)};
}
const fingerprint=(methods,op,vector)=>h.encode(h.observe(methods,op,vector));

test("error vectors distinguish omission, nullish fallback, coercion and constructor metadata",()=>{
  for(const op of h.FUNCTIONS)assert(h.countVectors(op)>0);
  assert(h.VALUES.some(v=>v?.probe==="coerce-throw"));
  assert(h.EXTRAS.some(v=>v?.probe==="shared-graph"));
  const modes=new Set([...h.vectors("data")].map(v=>v.mode));
  for(const mode of ["subclass","prototype-mutation","constructor-mutation","call-without-new","assignment-setter","assignment-readonly","assignment-throw"])assert(modes.has(mode));
  const methods=fixture();
  assert.notDeepEqual(fingerprint(methods,"badRequest",{args:["x"]}),fingerprint(methods,"badRequest",{args:["x",null]}));
});

test("error fingerprints detect omitted undefined fields and descriptor changes",()=>{
  const good=fixture(),missing={...good,badRequest:(...args)=>{const error=good.badRequest(...args);delete error.extra;return error;}};
  const descriptor={...good,badRequest:(...args)=>{const error=good.badRequest(...args);Object.defineProperty(error,"code",{enumerable:false});return error;}};
  const vector={args:["message"]};
  assert.notDeepEqual(fingerprint(good,"badRequest",vector),fingerprint(missing,"badRequest",vector));
  assert.notDeepEqual(fingerprint(good,"badRequest",vector),fingerprint(descriptor,"badRequest",vector));
});

test("error fingerprints preserve caller aliases and original coercion errors",()=>{
  const methods=fixture(),vector={mode:"construct",ctor:"V2Error",args:[400,"code","message",{probe:"shared-graph"}]};
  const original=methods.data().V2Error;
  class Cloned extends original{constructor(status,code,message,extra){super(status,code,message,structuredClone(extra));}}
  const copied={...methods,data:()=>({...methods.data(),V2Error:Cloned})};
  assert.notDeepEqual(fingerprint(methods,"data",vector),fingerprint(copied,"data",vector));
  const wrong={...methods,badRequest:(...args)=>{try{return methods.badRequest(...args);}catch(error){throw {...error};}}};
  const throwing={args:[{probe:"coerce-throw"}]};
  assert.notDeepEqual(fingerprint(methods,"badRequest",throwing),fingerprint(wrong,"badRequest",throwing));
});

test("metadata probes detect detached constructors and shared wrappers",()=>{
  const good=fixture(),fixed=good.data(),shared={...good,data:()=>fixed};
  assert.notDeepEqual(fingerprint(good,"data",{mode:"fresh-metadata"}),fingerprint(shared,"data",{mode:"fresh-metadata"}));
  const detached={...good,data:()=>fixture().data()};
  assert.notDeepEqual(fingerprint(good,"data",{mode:"prototype-mutation"}),fingerprint(detached,"data",{mode:"prototype-mutation"}));
  assert.notDeepEqual(fingerprint(good,"data",{mode:"constructor-mutation"}),fingerprint(detached,"data",{mode:"constructor-mutation"}));
  assert(!Object.hasOwn(good.data().V2Error.prototype,"probe_marker"));
});

test("error observations refuse empty, invalid and out-of-range batches",()=>{
  const methods=fixture();
  for(const [start,limit] of [[-1,1],[0,0],[0,1.5],[0.5,1]])assert.throws(()=>h.runBatch(methods,"data",start,limit));
  assert.throws(()=>h.runBatch(methods,"unknown",0,1),/unknown HTTP error operation/);
  assert.throws(()=>h.runBatch(methods,"data",h.countVectors("data"),1),/exceeds matrix/);
});
