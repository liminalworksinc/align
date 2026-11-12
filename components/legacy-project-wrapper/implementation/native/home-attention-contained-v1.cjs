'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"24929b9fb07453616f658ba629a042f4a9c80572c0cc346cfaaebe2d7181e098","package":"home_attention","package_files":["activity_evidence.js","alignment_waits.js","answer_evidence.js","app_evidence.js","app_status_words.js","change_waits.js","data.js","launch_waits.js","package.json","receipt_evidence.js"],"maximum_cases":9,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Independent Home rule observations, including caller aliases and public state.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {pathToFileURL}=require("node:url"),{createHash}=require("node:crypto");
const FUNCTIONS=["appEvidence","activityEvidence","answerEvidence","receiptEvidence","appStatusWords","changeWaits","alignmentWaits","launchWaits"];
const DATA=["EVIDENCE_CLASSES","EVIDENCE_WORDS","UNLAUNCHED_STATES"];
const SYMBOL=Object.fromEntries([...FUNCTIONS,"data"].map(n=>[n,n.replace(/[A-Z]/g,c=>"_"+c.toLowerCase())]));
const CAPABILITY=Object.fromEntries(Object.entries(SYMBOL).map(([n,s])=>[n,"home-attention."+s.replace(/_/g,"-")]));
const TEXTS=["","a","A","__proto__","constructor","東京","é","e\u0301","a\nb","x".repeat(100)];
const NUMBERS=[-Infinity,-Number.MAX_SAFE_INTEGER,-1,-0,0,Number.MIN_VALUE,0.5,1,2,Number.MAX_SAFE_INTEGER,Infinity,NaN];
const STATES=["pending","countered","approved","rejected","withdrawn","accepted","received","declined","expired","sent","launched","not_yet","superseded","custom","",undefined];
const TIMES=[null,undefined,...TEXTS];
const PEOPLE=TEXTS.map((name,i)=>({id:["a","b","__proto__","constructor"][i%4],name,extra:i}));
const LISTS=[[],...[0,1,2,3,4].map(i=>[PEOPLE[i]]),[PEOPLE[0],PEOPLE[1]],[PEOPLE[1],PEOPLE[0]],PEOPLE,[PEOPLE[0],PEOPLE[0]],
  [PEOPLE[0],{id:PEOPLE[0].id,name:"last duplicate",extra:99}]];
function* requirements() {
  yield [];
  for(const approvers of LISTS)for(const approved_by of [null,undefined,PEOPLE[2]])yield [{approvers,approved_by}];
  for(const a of LISTS)for(const b of LISTS)for(const done of [false,true])
    yield [{approvers:a,approved_by:null},{approvers:b,approved_by:done?PEOPLE[0]:null}];
  yield [{approvers:PEOPLE,approved_by:null},{approvers:PEOPLE.toReversed(),approved_by:null}];
}
function* vectors(op) {
  assert(Object.hasOwn(CAPABILITY,op),"unknown home operation");
  if(op==="data")for(const mode of ["snapshot","classes","labels","unlaunched","empty"])yield [mode];
  else if(op==="appEvidence")for(const value of [...TIMES,...NUMBERS,false,true,{},[]])yield [value];
  else if(op==="activityEvidence")for(const sessions of NUMBERS)for(const last_activity_at of TIMES)yield [{sessions,last_activity_at}];
  else if(op==="answerEvidence")for(const state of [...STATES,...TEXTS]) {
    yield [state];yield [state,undefined];yield [state,false];yield [state,true];
  }
  else if(op==="receiptEvidence")for(const value of NUMBERS)yield [value];
  else if(op==="appStatusWords")for(const approved_at of TEXTS)for(const last_used_at of TIMES)for(const last_read_at of TIMES)
    for(const callback of ["wrap","identity","indexed","throw"])yield [{approved_at,last_used_at,last_read_at},callback];
  else if(op==="changeWaits")for(const state of STATES)for(const behind of [false,true,undefined])for(const dependency_loop of [null,undefined,"","loop","__proto__"])
    for(const requester of PEOPLE.slice(0,5))for(const approvers of LISTS)yield [{state,behind,dependency_loop,requester,approvers}];
  else if(op==="alignmentWaits")for(const state of STATES)for(const requester of PEOPLE.slice(0,5))for(const r of requirements())yield [{state,requester,requirements:r}];
  else if(op==="launchWaits") {
    for(const v of [undefined,null,false,true,"",...NUMBERS,"approved"])yield [v];
    const lists=[undefined,null,"old",{},...LISTS,[{},null,{id:"a"},{name:"A"},{id:1,name:"A"},{id:"a",name:1},...PEOPLE]];
    for(const state of STATES)for(const launch of [...STATES,null,0])for(const can of [undefined,null,false,true,{}, {launch:true},{launch:false},{launch:1},{launch:"true"}])
      for(const launchers of lists)yield [{state,launch,can,launchers}];
    const personArray=[];personArray.id="array-id";personArray.name="Array person";
    const can=[];can.launch=true;
    yield [{state:"approved",launch:"pending",can,launchers:[personArray]}];
    const value=[];Object.assign(value,{state:"approved",launch:"not_yet",can:{launch:true},launchers:[PEOPLE[0]]});yield [value];
  }
}
function encode(value,seen=new Map()) {
  if(value===null)return["null"];
  const type=typeof value;
  if(type==="undefined")return["undefined"];
  if(type==="number")return["number",Object.is(value,-0)?"-0":String(value)];
  if(type==="string"||type==="boolean")return[type,value];
  if(type!=="object"&&type!=="function")return[type,String(value)];
  if(seen.has(value))return["ref",seen.get(value)];
  const id=seen.size;seen.set(value,id);
  const keys=Object.keys(value).sort().map(k=>[k,encode(value[k],seen)]);
  if(type==="function")return["function",id,value.name,value.length,keys];
  return Array.isArray(value)?["array",id,value.length,keys]:["object",id,Object.getPrototypeOf(value)===Object.prototype?"plain":Object.getPrototypeOf(value)===null?"null":"other",keys];
}
function anchors(value,seen=new Set(),result=[]) {
  if(value===null||!["object","function"].includes(typeof value)||seen.has(value))return result;
  seen.add(value);result.push(value);for(const k of Object.keys(value))anchors(value[k],seen,result);return result;
}
function prepare(op,vector) {
  const args=structuredClone(vector),calls=[],errors=[];
  if(op==="appStatusWords") {
    const mode=args.pop(),refused=mode==="throw"?new Error("time formatter refused"):null;
    if(refused)errors.push(refused);
    args.push(function at(value) {
      calls.push(encode(value));if(refused)throw refused;
      return mode==="identity"?value:mode==="indexed"?calls.length+":"+String(value):"[at:"+String(value)+"]";
    });
  }return{args,calls,errors};
}
function dataProbe(methods,mode) {
  const a=methods.data(),b=methods.data(),classes=a.EVIDENCE_CLASSES,labels=a.EVIDENCE_WORDS,states=a.UNLAUNCHED_STATES;
  const oldClasses=[...classes],oldLabels={...labels},oldStates=[...states];
  try {
    if(mode==="classes")classes.splice(0,classes.length,"custom","delivery_receipt");
    else if(mode==="labels"){delete labels.delivery_receipt;labels.custom="Custom";labels.agent_reported="Reported differently";}
    else if(mode==="unlaunched")states.splice(0,states.length,"custom","approved");
    else if(mode==="empty"){classes.length=0;states.length=0;for(const k of Object.keys(labels))delete labels[k];}
    else assert.equal(mode,"snapshot");
    return {fresh_wrapper:a!==b,shared:DATA.map(k=>a[k]===b[k]),data:structuredClone(methods.data()),launches:["pending","not_yet","custom","approved","launched"].map(launch=>methods.launchWaits({state:"approved",launch,can:{launch:true},launchers:structuredClone(PEOPLE.slice(0,2))}))};
  }finally {
    classes.splice(0,classes.length,...oldClasses);states.splice(0,states.length,...oldStates);
    for(const k of Object.keys(labels))delete labels[k];Object.assign(labels,oldLabels);
  }
}
function runBatch(methods,op,start,limit,pureBaseline=false) {
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0,"invalid home range");
  const hash=createHash("sha256");let index=0,count=0;
  for(const vector of vectors(op)) {
    if(index++<start)continue;if(count===limit)break;
    const {args,calls,errors}=prepare(op,vector),refs=anchors(args),before=encode({arguments:args,anchors:refs}),publicBefore=encode(methods.data());let outcome;
    try{outcome=["return",op==="data"?dataProbe(methods,...args):methods[op](...args)];}catch(e){outcome=["throw",e?.name,e?.message,errors.includes(e)];}
    if(pureBaseline){assert.deepEqual(encode({arguments:args,anchors:refs}),before,"baseline mutates Home arguments");assert.deepEqual(encode(methods.data()),publicBefore,"Home observation leaves public state changed");}
    hash.update(JSON.stringify(encode({arguments:args,anchors:refs,calls,outcome,public_state:methods.data()}))+"\n");count++;
  }
  assert.equal(count,limit,"home range exceeds matrix");return{observations:count,sha256:hash.digest("hex")};
}
async function loadBaseline(root) {
  const m=await import(pathToFileURL(path.join(root,"home-core.mts")).href),methods={};
  assert.deepEqual(Object.keys(m).filter(k=>typeof m[k]==="function").sort(),[...FUNCTIONS].sort(),"unobserved Home functions");
  assert.deepEqual(Object.keys(m).filter(k=>typeof m[k]!=="function").sort(),[...DATA].sort(),"unobserved Home data");
  for(const name of FUNCTIONS)methods[name]=m[name];methods.data=()=>Object.fromEntries(DATA.map(k=>[k,m[k]]));return methods;
}
async function loadGenerated(root,surface) {
  const files=[],methods={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith(".")||e.name==="node_modules")continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&[".js",".mjs",".cjs"].includes(path.extname(p)))files.push(p);}}walk(root);
  for(const op of Object.keys(CAPABILITY)) {
    const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY[op]);if(surface&&(!binding||!binding.symbols.includes(SYMBOL[op])))throw new Error("missing Home capability");
    const modulePath=binding?.module||"home_attention/"+SYMBOL[op],hits=files.filter(f=>{const r=path.relative(root,f).split(path.sep).join("/");return [".js",".mjs",".cjs"].some(ext=>r===modulePath+ext||r.endsWith("/"+modulePath+ext));});
    assert.equal(hits.length,1,"expected one Home module");const m=await import(pathToFileURL(hits[0]).href);methods[op]=m[SYMBOL[op]]??m.default?.[SYMBOL[op]]??m.default;assert.equal(typeof methods[op],"function","missing Home callable");
  }return methods;
}
const countVectors=op=>{let n=0;for(const ignored of vectors(op)){void ignored;n++;}return n;};
async function main() {
  if(["--baseline","--generated"].includes(process.argv[1])){const [mode,raw]=process.argv.slice(1),[op,start,limit]=JSON.parse(raw);const methods=mode==="--baseline"?await loadBaseline(process.cwd()):await loadGenerated(process.cwd());process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode==="--baseline"))+"\n");}
  else {const [root,surfaceRaw,casesRaw]=process.argv.slice(2),surface=JSON.parse(surfaceRaw),cases=[],methods=await loadGenerated(root,surface);for(const c of JSON.parse(casesRaw)){const [op,start,limit]=c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed Home batch");cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});}process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");}
}
module.exports={FUNCTIONS,DATA,SYMBOL,CAPABILITY,PEOPLE,NUMBERS,vectors,countVectors,encode,anchors,prepare,dataProbe,runBatch,loadBaseline};
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
