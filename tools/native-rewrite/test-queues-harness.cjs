"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process");
const h=require("./queues-harness.cjs");
function fixture(fault){
  const queue=new Map();globalThis.__alignLocks=queue;
  function run(key,fn){
    const previous=fault==="overlap"?Promise.resolve():queue.get(key)??Promise.resolve();
    let release;const gate=new Promise(resolve=>{release=resolve;}),tail=previous.then(()=>gate);queue.set(key,tail);
    return previous.catch(()=>undefined).then(async()=>{
      try{
        let value;
        try{value=await(fault==="receiver"?fn.call({unexpected:true},"argument"):fn());}
        catch(error){if(fault==="error-copy")throw {...error};throw error;}
        return fault==="result-copy"?structuredClone(value):value;
      }finally{release();if(fault==="clear-all")queue.clear();else if(queue.get(key)===tail)queue.delete(key);}
    });
  }
  return {primary:run,secondary:run,queue,initial:{fixture:true}};
}
const fingerprint=async(api,vector)=>h.encode(await h.observe(api,vector));

test("queue matrix includes key identity, rejection, cross-module and existing-tail scenarios",()=>{
  assert.equal(h.countVectors(),2645);
  const kinds=new Set([...h.vectors()].map(v=>v.kind));
  for(const kind of ["fifo","pair","predecessor","replacement","nested-other","nested-same","payload","invalid","thenable-error"])assert(kinds.has(kind));
  assert(h.KEYS.some(Number.isNaN));assert(h.KEYS.some(v=>Object.is(v,-0)));assert(h.KEYS.some(v=>typeof v==="symbol"));
});

test("queue fingerprints detect same-key overlap and foreign callback arguments or receivers",async()=>{
  const vector={kind:"pair",a:1,b:1,outcome:"value"};
  const good=await fingerprint(fixture(),vector);
  assert.notDeepEqual(good,await fingerprint(fixture("overlap"),vector));
  assert.notDeepEqual(good,await fingerprint(fixture("receiver"),vector));
});

test("queue fingerprints preserve returned aliases and original thrown objects",async()=>{
  const vector={kind:"pair",a:1,b:2,outcome:"value"};
  assert.notDeepEqual(await fingerprint(fixture(),vector),await fingerprint(fixture("result-copy"),vector));
  const throwing={...vector,outcome:"object-error"};
  assert.notDeepEqual(await fingerprint(fixture(),throwing),await fingerprint(fixture("error-copy"),throwing));
});

test("queue fingerprints detect deleting a later request or another active key",async()=>{
  const vector={kind:"replacement",a:1};
  assert.notDeepEqual(await fingerprint(fixture(),vector),await fingerprint(fixture("clear-all"),vector));
});

test("queue observations preserve undefined results and refuse invalid ranges",async()=>{
  const observation=await h.observe(fixture(),{kind:"payload",a:1,payload:0},true);
  assert.equal(observation.jobs[0].status,"resolved");assert.equal(observation.jobs[0].result,undefined);
  for(const [start,limit] of [[-1,1],[0,0],[0,1.5],[0.5,1]])await assert.rejects(h.runBatch(fixture(),start,limit));
  await assert.rejects(h.runBatch(fixture(),h.countVectors(),1),/exceeds matrix/);
  // The packaged verifier must preserve the frozen command's callback context.
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"queue-launcher-control-"));
  try{
    const packageRoot=path.join(temporary,"promise_queues");fs.mkdirSync(packageRoot);
    fs.writeFileSync(path.join(packageRoot,"with_lock.cjs"),'"use strict";\nconst api=('+fixture.toString()+')();\nmodule.exports={with_lock:api.primary};\n');
    const api=await h.loadGenerated(temporary,"absent"),expected=await h.runBatch(api,0,1,true);
    const surface={capabilities:[{capability:h.CAPABILITY,module:"promise_queues/with_lock",symbols:[h.SYMBOL]}]};
    const cases=[{case_id:"launcher-control",capability:h.CAPABILITY,arguments:["withLock",0,1,"absent"],expected_result:expected}];
    const result=spawnSync(process.execPath,[path.join(__dirname,"queues-harness.cjs"),temporary,JSON.stringify(surface),JSON.stringify(cases)],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout).cases[0].result,expected);
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
