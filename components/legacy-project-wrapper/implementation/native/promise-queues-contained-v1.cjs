'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"aba07dc3343e8b8cb40a6353477ea0d8a94214936e88cee244614cec1be4fb54","package":"promise_queues","package_files":["package.json","with_lock.js"],"maximum_cases":22,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url"),{createHash}=require("node:crypto"),{spawnSync}=require("node:child_process");
const CAPABILITY="promise-queues.with-lock",SYMBOL="with_lock";
const KEYS=["","a","b","__proto__","constructor","prototype","toString","[object Object]","\0","a\nb","é","e\u0301","🙂","A"," a ",0,-0,1,NaN,undefined,null,{key:1},{key:2},Symbol.for("queue-one"),Symbol.for("queue-two")];
const PAYLOADS=[undefined,null,"",0,-0,NaN,Infinity,false,true,12n,Symbol.for("queue-value"),"opaque","line\nnext"];
function* vectors(){
  for(let a=0;a<KEYS.length;a++)for(let b=0;b<KEYS.length;b++)for(const outcome of ["value","object-error","error","primitive-error"])yield {kind:"pair",a,b,outcome};
  for(let key=0;key<KEYS.length;key++){
    yield {kind:"fifo",a:key};yield {kind:"predecessor",a:key};yield {kind:"replacement",a:key};yield {kind:"nested-other",a:key};yield {kind:"nested-same",a:key};
  }
  for(let payload=0;payload<PAYLOADS.length;payload++)yield {kind:"payload",a:1,payload};
  for(const callback of [null,undefined,0,"callback",{}])yield {kind:"invalid",a:1,callback};
  yield {kind:"thenable",a:1};yield {kind:"thenable-error",a:1};
}
const countVectors=()=>{let n=0;for(const v of vectors()){void v;n++;}return n;};
function encode(value,seen=new Map()){
  if(value===null)return ["null"];
  const type=typeof value;
  if(type==="undefined")return [type];
  if(type==="number")return [type,Object.is(value,-0)?"-0":String(value)];
  if(type==="bigint")return [type,String(value)];
  if(type==="string"||type==="boolean")return [type,value];
  for(const [object,name] of [[Error,"Error"],[Error.prototype,"Error.prototype"],[Object.prototype,"Object.prototype"],[Function.prototype,"Function.prototype"],[Array.prototype,"Array.prototype"]])if(value===object)return ["builtin",name];
  if(seen.has(value))return ["ref",seen.get(value)];const id=seen.size;seen.set(value,id);
  if(type==="symbol")return [type,id,Symbol.keyFor(value)??null,value.description??null];
  const fields=Reflect.ownKeys(value).map(key=>{
    const d=Object.getOwnPropertyDescriptor(value,key),flags={enumerable:d.enumerable,configurable:d.configurable};
    if("value" in d){flags.writable=d.writable;flags.value=encode(d.value,seen);}else{flags.get=typeof d.get;flags.set=typeof d.set;}
    if(key==="stack"&&value instanceof Error){delete flags.value;flags.firstLine=typeof value.stack==="string"?value.stack.split("\n")[0]:typeof value.stack;}
    return [[typeof key==="symbol"?"symbol":"string",typeof key==="symbol"?key.description:key],flags];
  });
  return [type,id,encode(Object.getPrototypeOf(value),seen),fields];
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>undefined);return {promise,resolve,reject};};
async function drain(n=64){for(let i=0;i<n;i++)await Promise.resolve();}
function prepareImport(mode){
  assert(["absent","existing"].includes(mode),"unknown queue import mode");
  let seed;if(mode==="existing"){seed=new Map([["preexisting",Promise.resolve("seed")]]);globalThis.__alignLocks=seed;}else delete globalThis.__alignLocks;
  return seed;
}
function importObservation(mode,seed,first){
  const queue=globalThis.__alignLocks,d=Object.getOwnPropertyDescriptor(globalThis,"__alignLocks");
  return {queue,initial:{mode,is_map:queue instanceof Map,same_map_after_second:first===queue,seed_retained:mode==="existing"?seed===queue:true,initial_keys:queue instanceof Map?[...queue.keys()]:null,property:d?{enumerable:d.enumerable,configurable:d.configurable,writable:d.writable}:null}};
}
let serial=0;
async function loadBaseline(root,mode){
  const seed=prepareImport(mode),url=pathToFileURL(path.join(root,"locks.ts")).href,token=++serial;
  const primary=await import(url+"?queues-primary="+token),first=globalThis.__alignLocks,secondary=await import(url+"?queues-secondary="+token);
  assert.deepEqual(Object.keys(primary),["withLock"],"unobserved queue runtime export");
  return {primary:primary.withLock,secondary:secondary.withLock,...importObservation(mode,seed,first)};
}
async function loadGenerated(root,mode){
  const seed=prepareImport(mode),files=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith(".")||e.name==="node_modules")continue;const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(file)))files.push(file);}}
  walk(root);const matches=files.filter(file=>[".js",".mjs",".cjs"].some(ext=>path.relative(root,file).split(path.sep).join("/").endsWith("promise_queues/with_lock"+ext)));
  assert.equal(matches.length,1,"expected one queue module");const url=pathToFileURL(matches[0]).href,token=++serial;
  const firstModule=await import(url+"?queues-primary="+token),first=globalThis.__alignLocks,secondModule=await import(url+"?queues-secondary="+token);
  const pick=loaded=>loaded[SYMBOL]??loaded.default?.[SYMBOL]??loaded.default;
  assert.equal(typeof pick(firstModule),"function");assert.equal(typeof pick(secondModule),"function");
  return {primary:pick(firstModule),secondary:pick(secondModule),...importObservation(mode,seed,first)};
}
async function observe(api,vector,pure=false){
  assert(api.queue instanceof Map,"queue module did not create or reuse its global Map");api.queue.clear();
  const keys=KEYS.map(k=>k&&typeof k==="object"?{...k}:k),before=encode(keys),jobs=[],trace=[],snapshots=[];
  const state=label=>snapshots.push({label,global_same:globalThis.__alignLocks===api.queue,keys:[...api.queue.keys()],jobs:jobs.map(j=>({id:j.id,entered:j.entered,status:j.status,promise:j.promise instanceof Promise,same_callback_promise:j.promise===j.callbackPromise,tail_is_current:api.queue.get(j.key)===j.tail}))});
  function call(id,key,behavior="held",secondary=false,payload){
    const gate=deferred(),extra={id,nested:{value:"kept"}},failure=behavior==="error"?new Error("callback "+id):behavior==="primitive-error"?"callback failure "+id:{original_error:id};
    const value=behavior==="payload"?payload:extra,job={id,key,gate,value,failure,entered:false,status:"pending",callbackPromise:undefined,promise:undefined,tail:undefined};jobs.push(job);
    const callback=function(...args){
      job.entered=true;trace.push(["enter",id,this===undefined,args]);
      if(behavior==="invalid")throw new Error("verifier invoked an invalid fixture callback");
      if(behavior==="value"||behavior==="payload")return value;
      if(["error","object-error","primitive-error"].includes(behavior))throw failure;
      if(behavior==="thenable"||behavior==="thenable-error")return {then(resolve,reject){trace.push(["then",id,typeof resolve,typeof reject]);if(behavior==="thenable-error")reject(failure);else resolve(value);}};
      if(behavior==="nested-other"||behavior==="nested-same"){
        const nestedKey=behavior==="nested-same"?key:{nested:id};
        call(id+"-nested",nestedKey,"value",true);return value;
      }
      job.callbackPromise=gate.promise.then(result=>{trace.push(["callback-finish",id]);return result;},error=>{trace.push(["callback-error",id]);throw error;});
      return job.callbackPromise;
    };
    job.callback=callback;
    try{
      job.promise=(secondary?api.secondary:api.primary)(key,behavior==="invalid"?vector.callback:callback);
      Promise.resolve(job.promise).then(result=>{job.status="resolved";job.result=result;trace.push(["resolve",id,result]);},error=>{job.status="rejected";job.result=error;trace.push(["reject",id,error,error===failure]);});
    }catch(error){job.status="synchronous-throw";job.result=error;trace.push(["synchronous-throw",id,error,error===failure]);}
    job.tail=api.queue.get(key);state("call "+id);return job;
  }
  const flush=async label=>{await drain();state(label);};
  const release=(job,reject=false)=>{trace.push([reject?"release-error":"release",job.id]);if(reject)job.gate.reject(job.failure);else job.gate.resolve(job.value);};
  if(vector.kind==="pair"){
    const a=call("a",keys[vector.a]);await flush("a running");call("b",keys[vector.b],vector.outcome,true);await flush("b scheduled");release(a);await flush("a released");
  }else if(vector.kind==="fifo"){
    const batch=[];for(let i=0;i<6;i++)batch.push(call("q"+i,keys[vector.a],"held",i%2===1));
    await flush("fifo scheduled");for(let i=0;i<batch.length;i++){release(batch[i],i===2);await flush("fifo release "+i);}
  }else if(vector.kind==="predecessor"){
    const previous=deferred();api.queue.set(keys[vector.a],previous.promise);state("predecessor installed");call("a",keys[vector.a],"value");await flush("predecessor waiting");previous.resolve();await flush("predecessor released");
  }else if(vector.kind==="replacement"){
    const a=call("a",keys[vector.a]);await flush("replacement running");const replacement=deferred();api.queue.set(keys[vector.a],replacement.promise);state("replacement installed");release(a);await flush("older request released");call("b",keys[vector.a],"value",true);await flush("replacement waiting");replacement.resolve();await flush("replacement released");
  }else{
    call("a",keys[vector.a],vector.kind,false,vector.kind==="payload"?PAYLOADS[vector.payload]:undefined);await flush("single scheduled");
  }
  await drain(256);state("final");
  if(pure){assert(jobs.every(j=>j.status!=="pending"),"baseline queue did not settle");assert.deepEqual(encode(keys),before,"baseline mutated queue keys");}
  return {keys,jobs:jobs.map(j=>({id:j.id,key:j.key,input_value:j.value,input_error:j.failure,callback:j.callback,status:j.status,result:j.result})),trace,snapshots};
}
async function runBatch(api,start,limit,pure=false){
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid queue range");const hash=createHash("sha256");hash.update(JSON.stringify(encode(api.initial))+"\n");let index=0,count=0;
  for(const vector of vectors()){if(index++<start)continue;if(count===limit)break;hash.update(JSON.stringify(encode(await observe(api,vector,pure)))+"\n");count++;}
  assert.equal(count,limit,"queue range exceeds matrix");return {observations:count,sha256:hash.digest("hex")};
}
async function main(){
  if(["--baseline","--generated"].includes(process.argv[1])){
    const [mode,raw]=process.argv.slice(1),[op,start,limit,importMode]=JSON.parse(raw);assert.equal(op,"withLock");const api=mode==="--baseline"?await loadBaseline(process.cwd(),importMode):await loadGenerated(process.cwd(),importMode);process.stdout.write(JSON.stringify(await runBatch(api,start,limit,mode==="--baseline"))+"\n");
  }else{
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),binding=surface.capabilities.find(c=>c.capability===CAPABILITY);assert(binding&&binding.module==="promise_queues/with_lock"&&binding.symbols.includes(SYMBOL),"queue import surface mismatch");const cases=[];
    // Match the frozen qualification command's execution context exactly.
    const launcher="eval(Buffer.from('"+fs.readFileSync(__filename).toString("base64")+"','base64').toString())";
    for(const c of JSON.parse(casesRaw)){
      assert.equal(c.capability,CAPABILITY);const worker=spawnSync(process.execPath,["-e",launcher,"--","--generated",JSON.stringify(c.arguments)],{cwd:root,encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
      if(worker.error)throw worker.error;assert.equal(worker.status,0,worker.stderr);cases.push({case_id:c.case_id,capability:c.capability,result:JSON.parse(worker.stdout)});
    }
    process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");
  }
}
module.exports={CAPABILITY,SYMBOL,KEYS,PAYLOADS,vectors,countVectors,encode,deferred,drain,loadBaseline,loadGenerated,observe,runBatch};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
}

function verifierBytes() {
  const text = historicalVerifier.toString();
  const bytes = Buffer.from(text.slice(text.indexOf('{') + 1, -1));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), SETTINGS.inner_sha256,
    'Historical verifier bytes changed');
  return bytes;
}

function directFile(directory, name) {
  assert(/^[a-zA-Z0-9_.-]+$/.test(name) && name !== '.' && name !== '..');
  const file = path.join(directory, name);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    assert(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Unsafe candidate member');
    return fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

async function runSelected(root, surface, selected) {
  assert(Array.isArray(selected) && selected.length > 0 && selected.length <= SETTINGS.maximum_cases);
  const input = JSON.stringify({surface, selected});
  assert(Buffer.byteLength(input) <= 256 * 1024, 'Oversized oracle request');
  assert(Buffer.byteLength(JSON.stringify(surface)) <= 64 * 1024 &&
    Buffer.byteLength(JSON.stringify(selected)) <= 64 * 1024, 'Oracle argument exceeds portable CLI bound');
  const source = fs.realpathSync(root);
  const candidates = [path.join(source, SETTINGS.package), path.join(source, 'source', SETTINGS.package)]
    .filter(file => fs.existsSync(file));
  assert.equal(candidates.length, 1, 'Expected one candidate package');
  const candidate = candidates[0];
  // Reject symlinks below the resolved caller root, including an intermediate source directory.
  let at = source;
  for (const part of path.relative(source, candidate).split(path.sep)) {
    at = path.join(at, part);
    assert(fs.lstatSync(at).isDirectory() && !fs.lstatSync(at).isSymbolicLink());
  }
  assert.deepEqual(fs.readdirSync(candidate).sort(), [...SETTINGS.package_files].sort());
  // Desktop Docker shares the home directory. Its VM need not share the OS temporary directory.
  const cache = path.join(os.homedir(), '.cache', 'align-native-oracles');
  fs.mkdirSync(cache, {recursive: true, mode: 0o700});
  const snapshot = fs.mkdtempSync(path.join(fs.realpathSync(cache), 'evaluation-'));
  const name = 'align-oracle-' + crypto.randomUUID();
  assert(!/[\r\n,]/.test(snapshot), 'Unsupported mount path');
  let started = false;
  const dockerEnvironment = {...process.env};
  // Host-side executable configuration must not load application-supplied Node preload hooks.
  delete dockerEnvironment.NODE_OPTIONS;
  delete dockerEnvironment.NODE_PATH;
  try {
    const packageRoot = path.join(snapshot, 'source', SETTINGS.package);
    fs.mkdirSync(packageRoot, {recursive: true, mode: 0o755});
    fs.chmodSync(path.join(snapshot, 'source'), 0o755);
    fs.chmodSync(packageRoot, 0o755);
    for (const file of SETTINGS.package_files) {
      fs.writeFileSync(path.join(packageRoot, file), directFile(candidate, file), {mode: 0o444});
    }
    fs.writeFileSync(path.join(snapshot, 'oracle.cjs'), verifierBytes(), {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'request.json'), input, {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'execute.cjs'), [
      "'use strict';",
      "const input=require('./request.json');",
      "const cp=require('node:child_process');",
      "const result=cp.spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules','--max-old-space-size=512','/inputs/oracle.cjs','/inputs/source',JSON.stringify(input.surface),JSON.stringify(input.selected)],{encoding:'utf8',timeout:130000,maxBuffer:4*1024*1024});",
      "if(result.error||result.status!==0){console.error(result.error?.code||result.status,result.stderr);process.exitCode=1;}else process.stdout.write(result.stdout);",
    ].join('\n'), {mode: 0o444});
    // Do not depend on the caller's umask for container readability.
    for (const file of SETTINGS.package_files) fs.chmodSync(path.join(packageRoot, file), 0o444);
    for (const file of ['oracle.cjs', 'request.json', 'execute.cjs']) {
      fs.chmodSync(path.join(snapshot, file), 0o444);
    }
    fs.chmodSync(snapshot, 0o755);
    const info=cp.spawnSync('docker',['info','--format','{{.NCPU}}'],{env:dockerEnvironment,encoding:'utf8',timeout:10000});
    if(info.error||info.status!==0)throw Error('Docker runtime unavailable: '+(info.error?.code||info.status));
    const available=Number(info.stdout.trim());
    assert(Number.isInteger(available)&&available>=1&&available<=512,'Invalid Docker CPU capacity');
    const cpus=Math.min(SETTINGS.cpus,available);
    const argv = ['run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
      '--user=65532:65532', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=' + SETTINGS.memory_mib + 'm', '--cpus=' + cpus,
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=128m', '--env=HOME=/tmp',
      '--mount', `type=bind,source=${snapshot},target=/inputs,readonly`,
      '--workdir=/inputs', '--entrypoint=/usr/bin/timeout', SETTINGS.image,
      '--signal=KILL', SETTINGS.worker_seconds + 's', 'node', '--no-warnings', '--max-old-space-size=512', '/inputs/execute.cjs'];
    started = true;
    const result = cp.spawnSync('docker', argv, {env: dockerEnvironment, encoding: 'utf8',
      timeout: 150000, maxBuffer: 4 * 1024 * 1024});
    if (result.error || result.status !== 0) {
      throw Error('Contained oracle failed: ' + (result.error?.code || result.status) + '\n' +
        String(result.stderr || '').slice(0, 1600));
    }
    const value = JSON.parse(result.stdout);
    assert.equal(value.schema, 'literate-ai/library-acceptance-results@1');
    assert(Array.isArray(value.cases) && value.cases.length === selected.length);
    assert.deepEqual(value.cases.map(item => [item.case_id, item.capability]),
      selected.map(item => [item.case_id, item.capability]));
    return value.cases;
  } finally {
    if (started) cp.spawnSync('docker', ['rm', '--force', name], {
      env: dockerEnvironment, stdio: 'ignore', timeout: 10000});
    fs.rmSync(snapshot, {recursive: true, force: true});
  }
}

module.exports = {runSelected};
if (require.main === module) {
  assert.equal(process.argv.length, 5);
  runSelected(process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4]))
    .then(cases => process.stdout.write(JSON.stringify({schema: 'literate-ai/library-acceptance-results@1', cases}) + '\n'))
    .catch(error => {console.error(error.stack); process.exitCode = 1;});
}
