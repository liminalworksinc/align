'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"d0a44ae42b1775e94dc2e5496f53a148bf14d2372b20861c9f0e0359ed72c546","package":"http_errors","package_files":["bad_request.js","conflict.js","data.js","forbidden.js","not_found.js","package.json"],"maximum_cases":9,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{pathToFileURL}=require("node:url");
const {createHash}=require("node:crypto"),assert=require("node:assert/strict");
const FUNCTIONS=["notFound","badRequest","forbidden","conflict","data"];
const SYMBOL={notFound:"not_found",badRequest:"bad_request",forbidden:"forbidden",conflict:"conflict",data:"data"};
const CAPABILITY=Object.fromEntries(FUNCTIONS.map(op=>[op,"http-errors."+SYMBOL[op].replaceAll("_","-")]));
const VALUES=[undefined,null,"","message","code","bad_request","not_found","line\nnext","\0","<tag>","é","🙂",0,-0,1,-1,400,NaN,Infinity,false,true,12n,Symbol.for("shared"),{probe:"symbol"},{probe:"object"},{probe:"array"},{probe:"null-object"},{probe:"coerce",value:"coerced"},{probe:"coerce",value:42},{probe:"coerce",value:null},{probe:"coerce-throw"}];
const STATUSES=[undefined,null,0,400,404,409,-1,"400",{probe:"object"}];
const CODES=[undefined,null,"","bad_request","opaque",0,false,{probe:"object"},{probe:"coerce",value:"coerced"},{probe:"coerce-throw"}];
const EXTRAS=[undefined,null,{probe:"object"},{probe:"array"},{probe:"null-object"},{probe:"shared-graph"}];
function* vectors(op){
  if(op==="notFound"){
    yield {args:[]};for(const v of VALUES)yield {args:[v]};yield {args:["ignored",null,1]};return;
  }
  if(["badRequest","forbidden","conflict"].includes(op)){
    yield {args:[]};for(const a of VALUES){yield {args:[a]};for(const b of VALUES)yield {args:[a,b]};}
    yield {mode:"fresh",args:["same","same"]};return;
  }
  assert.equal(op,"data","unknown HTTP error operation");
  for(const mode of ["metadata","fresh-metadata","prototype-mutation","constructor-mutation","subclass","call-without-new"])yield {mode};
  for(const status of STATUSES){
    for(const code of CODES){
      for(const message of VALUES){
        for(const extra of EXTRAS)yield {mode:"construct",ctor:"V2Error",args:[status,code,message,extra]};
      }
    }
    for(const message of VALUES)for(const code of CODES)yield {mode:"construct",ctor:"HttpError",args:[status,message,code]};
  }
  for(const ctor of ["V2Error","HttpError"]){
    yield {mode:"construct",ctor,args:[]};
    for(const value of VALUES)yield {mode:"construct",ctor,args:[value]};
  }
  for(const mode of ["assignment-setter","assignment-readonly","assignment-throw"])yield {mode};
}
function prepare(vector){
  const calls=[],thrown={sentinel:"original-coercion-error"};
  function revive(value){
    if(!value||typeof value!=="object")return value;
    if(value.probe==="symbol")return Symbol("local");
    if(value.probe==="object")return {nested:{value:"kept"},missing:undefined};
    if(value.probe==="array")return ["extra",{nested:"kept"}];
    if(value.probe==="null-object")return Object.assign(Object.create(null),{value:"kept"});
    if(value.probe==="shared-graph"){const shared={value:"kept"},root={left:shared,right:shared};root.self=root;return root;}
    if(value.probe==="coerce"||value.probe==="coerce-throw")return {
      [Symbol.toPrimitive](hint){calls.push(hint);if(value.probe==="coerce-throw")throw thrown;return value.value;}
    };
    throw new Error("unknown HTTP error value recipe");
  }
  return {args:(vector.args??[]).map(revive),calls,thrown};
}
function keyName(key){return typeof key==="symbol"?["symbol",Symbol.keyFor(key)??null,key.description??null]:["string",key];}
function encode(value,seen=new Map()){
  if(value===null)return ["null"];
  const type=typeof value;
  if(type==="undefined")return [type];
  if(type==="number")return [type,Object.is(value,-0)?"-0":String(value)];
  if(type==="bigint")return [type,String(value)];
  if(type==="string"||type==="boolean")return [type,value];
  // Preserve intrinsic identity without inspecting host-owned static properties.
  if(value===Error)return ["builtin","Error"];
  if(value===Object.prototype)return ["builtin","Object.prototype"];
  if(value===Error.prototype)return ["builtin","Error.prototype"];
  if(value===Function.prototype)return ["builtin","Function.prototype"];
  if(value===Array.prototype)return ["builtin","Array.prototype"];
  if(seen.has(value))return ["ref",seen.get(value)];
  const id=seen.size;seen.set(value,id);
  if(type==="symbol")return [type,id,Symbol.keyFor(value)??null,value.description??null];
  const fields=Reflect.ownKeys(value).map(key=>{
    const d=Object.getOwnPropertyDescriptor(value,key),flags={enumerable:d.enumerable,configurable:d.configurable};
    if("value" in d){flags.writable=d.writable;flags.value=encode(d.value,seen);}
    else{flags.get=typeof d.get;flags.set=typeof d.set;}
    if(key==="stack"&&value instanceof Error){
      // Physical stack frames depend on the temporary source and generated paths.
      flags.firstLine=typeof value.stack==="string"?value.stack.split("\n")[0]:typeof value.stack;
      if("value" in flags)delete flags.value;
    }
    return [keyName(key),flags];
  });
  return [type,id,encode(Object.getPrototypeOf(value),seen),fields];
}
function invoke(fn,args,thrown){
  try{return {kind:"return",value:fn(...args)};}
  catch(error){return {kind:"throw",error,original:error===thrown};}
}
function metadata(methods){
  const first=methods.data(),second=methods.data();
  assert(first&&second&&typeof first==="object"&&typeof second==="object","error metadata is not an object");
  return {first,second,ordinary:Object.getPrototypeOf(first)===Object.prototype,keys:Reflect.ownKeys(first),same_wrapper:first===second,same_v2:first.V2Error===second.V2Error,same_http:first.HttpError===second.HttpError};
}
function observe(methods,op,vector,pure=false){
  const {args,calls,thrown}=prepare(vector),before=encode(args);
  if(op!=="data"){
    const classes=methods.data(),outcome=invoke(methods[op],args,thrown);
    const result={args,calls,outcome};
    if(outcome.kind==="return"){
      result.is_v2=outcome.value instanceof classes.V2Error;result.is_http=outcome.value instanceof classes.HttpError;
      result.error_prototype=Object.getPrototypeOf(outcome.value)===classes.V2Error.prototype;
      if(vector.mode==="fresh")result.second=invoke(methods[op],args,thrown);
    }
    if(pure)assert.deepEqual(encode(args),before,"baseline mutates error arguments");
    return result;
  }
  const classes=methods.data();let result;
  if(vector.mode==="construct")result={args,calls,outcome:invoke((...values)=>new classes[vector.ctor](...values),args,thrown)};
  else if(vector.mode==="metadata"||vector.mode==="fresh-metadata")result=metadata(methods);
  else if(vector.mode==="prototype-mutation"){
    const marker={marker:"shared prototype"},proto=classes.V2Error.prototype;
    assert(!Object.hasOwn(proto,"probe_marker"));
    try{proto.probe_marker=marker;const value=methods.badRequest("message");result={same:methods.data().V2Error.prototype===proto,inherited:value.probe_marker===marker,own:Object.hasOwn(value,"probe_marker")};}
    finally{delete proto.probe_marker;}
  }else if(vector.mode==="constructor-mutation"){
    const marker={marker:"shared constructor"};assert(!Object.hasOwn(classes.HttpError,"probe_marker"));
    try{classes.HttpError.probe_marker=marker;result={same:methods.data().HttpError.probe_marker===marker};}
    finally{delete classes.HttpError.probe_marker;}
  }else if(vector.mode==="subclass"){
    result=[];
    for(const name of ["V2Error","HttpError"]){
      const Parent=classes[name];class Child extends Parent{}
      const value=name==="V2Error"?new Child(409,"conflict","message"):new Child(400,"message","opaque");
      result.push({parent:name,value,is_child:value instanceof Child,is_parent:value instanceof Parent,is_error:value instanceof Error,prototype:Object.getPrototypeOf(value)===Child.prototype});
    }
  }else if(vector.mode==="call-without-new")result=[invoke(classes.V2Error,[400,"code","message"],thrown),invoke(classes.HttpError,[400,"message"],thrown)];
  else if(vector.mode.startsWith("assignment-")){
    const assignmentCalls=[],extra={nested:{value:"kept"}},prototypes=[classes.V2Error.prototype,classes.HttpError.prototype];
    const keys=vector.mode==="assignment-setter"?["status","code","extra"]:["status"];
    for(const proto of prototypes)for(const key of keys)assert(!Object.hasOwn(proto,key));
    try{
      for(const proto of prototypes)for(const key of keys){
        const descriptor=vector.mode==="assignment-readonly"?{configurable:true,writable:false,value:123}:
          {configurable:true,set(value){assignmentCalls.push([key,value]);if(vector.mode==="assignment-throw")throw thrown;}};
        Object.defineProperty(proto,key,descriptor);
      }
      result={extra,assignmentCalls,v2:invoke((...values)=>new classes.V2Error(...values),[409,"code","message",extra],thrown),http:invoke((...values)=>new classes.HttpError(...values),[400,"message","code"],thrown),factory:invoke(methods.badRequest,["message"],thrown)};
    }finally{for(const proto of prototypes)for(const key of keys)delete proto[key];}
  }
  else throw new Error("unknown HTTP error metadata probe");
  if(pure)assert.deepEqual(encode(args),before,"baseline mutates constructor arguments");
  return result;
}
function runBatch(methods,op,start,limit,pure=false){
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid HTTP error range");
  const hash=createHash("sha256");let index=0,count=0;
  for(const vector of vectors(op)){if(index++<start)continue;if(count===limit)break;hash.update(JSON.stringify(encode(observe(methods,op,vector,pure)))+"\n");count++;}
  assert.equal(count,limit,"HTTP error range exceeds matrix");return {observations:count,sha256:hash.digest("hex")};
}
const countVectors=op=>{let count=0;for(const value of vectors(op)){void value;count++;}return count;};
async function loadBaseline(root){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"http-errors-baseline-"));
  try{
    const version=spawnSync("tsc",["--version"],{encoding:"utf8",timeout:20000,maxBuffer:1024*1024});
    if(version.error)throw version.error;
    assert.equal(version.status,0,"TypeScript source compiler is unavailable");
    assert.equal(version.stdout.trim(),"Version 5.9.3","source observations require the retained TypeScript 5.9.3 compiler");
    const build=spawnSync("tsc",["--target","ES2017","--module","ESNext","--skipLibCheck","--strict","--outDir",temporary,"lib/errors.ts","lib/v2/errors.ts"],{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:1024*1024});
    if(build.error)throw build.error;
    assert.equal(build.status,0,"TypeScript source compilation failed: "+build.stdout+build.stderr);
    fs.writeFileSync(path.join(temporary,"package.json"),'{"type":"module"}\n');
    const http=await import(pathToFileURL(path.join(temporary,"errors.js")).href),v2=await import(pathToFileURL(path.join(temporary,"v2/errors.js")).href);
    assert.deepEqual(Object.keys(http),["HttpError"]);
    assert.deepEqual(Object.keys(v2).sort(),["V2Error","badRequest","conflict","forbidden","notFound"].sort());
    return {...Object.fromEntries(FUNCTIONS.filter(op=>op!=="data").map(op=>[op,v2[op]])),data:()=>({HttpError:http.HttpError,V2Error:v2.V2Error})};
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
async function loadGenerated(root,surface){
  const files=[],methods={};
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith(".")||e.name==="node_modules")continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(p)))files.push(p);}}
  walk(root);
  for(const op of FUNCTIONS){
    const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY[op]);
    if(surface&&(!binding||!binding.symbols.includes(SYMBOL[op])))throw new Error("missing HTTP error capability");
    const modulePath=binding?.module||"http_errors/"+SYMBOL[op];
    const hits=files.filter(file=>{const relative=path.relative(root,file).split(path.sep).join("/");return [".js",".mjs",".cjs"].some(ext=>relative===modulePath+ext||relative.endsWith("/"+modulePath+ext));});
    assert.equal(hits.length,1,"expected one HTTP error module");const loaded=await import(pathToFileURL(hits[0]).href);methods[op]=loaded[SYMBOL[op]]??loaded.default?.[SYMBOL[op]]??loaded.default;assert.equal(typeof methods[op],"function","missing HTTP error callable");
  }
  return methods;
}
async function main(){
  if(["--baseline","--generated"].includes(process.argv[1])){
    const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw),methods=mode==="--baseline"?await loadBaseline(process.cwd()):await loadGenerated(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode==="--baseline"))+"\n");
  }else{
    const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),methods=await loadGenerated(root,surface),cases=[];
    for(const c of JSON.parse(casesRaw)){const [op,start,limit]=c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed HTTP error capability batch");cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});}
    process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");
  }
}
module.exports={FUNCTIONS,SYMBOL,CAPABILITY,VALUES,STATUSES,CODES,EXTRAS,vectors,countVectors,prepare,encode,invoke,metadata,observe,runBatch,loadBaseline,loadGenerated};
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
