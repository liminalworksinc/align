'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"acd0833e5b963acfdfb7f323c2a4dc32c264781e964f6904b854759d0496b5e5","package":"goal_approval","package_files":["create_approval.js","package.json"],"maximum_cases":5,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixtureModule={exports:{}};
new Function('require','module','exports',"'use strict';\n// Private supplied-query fixture. No approval algorithm is present here.\nconst assert = require('node:assert/strict');\nconst crypto = require('node:crypto');\nconst SQL = Object.freeze({\n  eligible: \"SELECT user_id FROM v2_members WHERE ws_id = ? AND role IN ('owner','member')\",\n  owners: \"SELECT user_id FROM v2_members WHERE ws_id = ? AND role = 'owner' ORDER BY user_id\",\n  leads: \"SELECT user_id FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'\",\n});\nconst operations = ['approvalSet', 'effectiveSet', 'launchSet'];\nfunction fixture(settings = {}) {\n  const trace = [], fault = new Error('owned query or property failure');\n  let queries = 0, reads = 0, rowReads = 0;\n  const rows = settings.rows ?? {eligible:['b','a'], owners:['a'], leads:['b']};\n  function all(sql, ...bindings) {\n    assert.equal(this, undefined);\n    const kind = Object.keys(SQL).find(name => SQL[name] === sql); assert(kind, 'Unexpected query program');\n    assert.deepEqual(bindings, kind === 'leads' ? ['ws','team'] : ['ws']);\n    trace.push(['query',kind,...bindings]);\n    if (++queries === settings.queryFault) throw fault;\n    const values = Array.isArray(rows[kind][0]) ? rows[kind][Math.min(queries-1,rows[kind].length-1)] : rows[kind];\n    return values.map(value => Object.defineProperty({}, 'user_id', {enumerable:true,get(){\n      trace.push(['row',kind,value]);if (++rowReads === settings.rowFault) throw fault;return value;\n    }}));\n  }\n  const data = {id:'goal',ws_id:'ws',owner_id:'a',pod_id:'team',level:'company',...settings.goal};\n  const goal = new Proxy(data,{get(target,key){assert(key !== 'id','Unused identity was read');trace.push(['goal',key]);\n    if (++reads === settings.goalFault) throw fault;return target[key];},ownKeys(){throw new Error('Goal was enumerated');}});\n  return {all,goal,trace,fault,queries:()=>queries,reads:()=>reads,rowReads:()=>rowReads};\n}\nfunction invoke(factory, name, settings = {}, requester = 'a') {\n  const f = fixture(settings), reads=[];\n  const resources = new Proxy({}, {get(_target,key){reads.push(key);assert.equal(key,'all');return f.all;},\n    ownKeys(){throw new Error('Resource container was enumerated');},has(){throw new Error('Resource container was inspected');}});\n  const service = factory(resources);assert.deepEqual(reads,['all']);assert.deepEqual(f.trace,[]);\n  assert.deepEqual(Object.keys(service).sort(),[...operations].sort());\n  for (const [index,key] of operations.entries()) {\n    assert.equal(typeof service[key],'function');assert.equal(service[key].name,key);\n    assert.equal(service[key].length,index === 0 ? 1 : 2);assert.equal(service[key].constructor.name,'Function');\n  }\n  let result,error;\n  try {result = Reflect.apply(service[name],undefined,name==='approvalSet'?[f.goal]:[f.goal,requester]);}\n  catch (e) {assert.equal(e,f.fault);error='owned-fault';}\n  assert.deepEqual(reads,['all']);\n  return {name,requester,result:result === undefined ? null : Array.from(result),error:error??null,trace:f.trace,\n    queries:f.queries(),reads:f.reads(),rowReads:f.rowReads()};\n}\nfunction digest(records) {return {sha256:crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex')};}\nfunction matrix(factory, partition) {\n  assert(Number.isSafeInteger(partition)&&partition>=0&&partition<4);\n  const hash=crypto.createHash('sha256');let count=0;\n  const roles=['absent','owner','member','viewer'];\n  for(let roleCode=partition*4;roleCode<partition*4+4;roleCode++) {\n    const users=[{id:'b',role:roles[roleCode%4]},{id:'a',role:roles[Math.floor(roleCode/4)]}];\n    const owners=users.filter(u=>u.role==='owner').map(u=>u.id).sort();\n    const eligible=users.filter(u=>u.role==='owner'||u.role==='member').map(u=>u.id);\n    for(const owner_id of ['a','b','gone'])for(const pod_id of [null,'team'])for(const level of [undefined,'team','company'])\n      for(let leadMask=0;leadMask<4;leadMask++)for(const requester of ['a','b','gone'])for(const name of operations) {\n        const leads=['b','a'].filter((_u,i)=>leadMask&(1<<i));\n        const value=invoke(factory,name,{rows:{eligible,owners,leads},goal:{owner_id,pod_id,level}},requester);\n        hash.update(JSON.stringify([roleCode,owner_id,pod_id,level??null,leadMask,value])+'\\n');count++;\n      }\n  }\n  assert.equal(count,2592);return {records:count,sha256:hash.digest('hex')};\n}\nfunction edges(factory) {\n  const records=[];\n  for(const name of operations)for(const settings of [\n    {}, {goal:{pod_id:null}}, {goal:{level:'team'}},\n    {rows:{eligible:[],owners:[],leads:[]}},\n    {rows:{eligible:[],owners:['\\uE000','\\u{10000}','a'],leads:[]}},\n    {rows:{eligible:['b','a','a'],owners:['b','b','a'],leads:['a','b','b']}},\n    {rows:{eligible:[['a'],['b'],['a']],owners:[['a'],['b'],['\\uE000','\\u{10000}']],leads:[['b'],['a']]}},\n  ])for(const requester of ['a','b','gone']) {\n    const plain=invoke(factory,name,settings,requester);records.push(plain);\n    for(const [field,maximum] of [['queryFault',plain.queries],['goalFault',plain.reads],['rowFault',plain.rowReads]])\n      for(let index=1;index<=maximum;index++) {const failed=invoke(factory,name,{...settings,[field]:index},requester);assert.equal(failed.error,'owned-fault');records.push(failed);}\n  }\n  const f=fixture(), service=factory({all:f.all});\n  for(const name of operations){const first=Reflect.apply(service[name],undefined,[f.goal,'a']);const expected=Array.from(first);\n    first.push('caller mutation');const second=Reflect.apply(service[name],undefined,[f.goal,'a']);\n    assert.notEqual(first,second);assert.deepEqual(Array.from(second),expected);}\n  const fault=new Error('owned binding failure');let read=0;\n  assert.throws(()=>factory(Object.defineProperty({},'all',{get(){read++;throw fault;}})),error=>error===fault);assert.equal(read,1);\n  return {records:records.length,...digest(records),fresh_arrays_and_same_factory:true,resource_getter_error_identity:true};\n}\nmodule.exports={SQL,operations,fixture,invoke,matrix,edges,digest};\n")(name=>{assert(['node:assert/strict','node:crypto'].includes(name));return require(name);},fixtureModule,fixtureModule.exports);
const fixture=fixtureModule.exports;
const PLANS=[{"kind":"matrix","partition":0,"golden":{"records":2592,"sha256":"cd3c0c133bcebb7b6efd4d558b48baf541b0cf68a498be7202625b8973e73d07"}},{"kind":"matrix","partition":1,"golden":{"records":2592,"sha256":"75a1e445c7f16b87470751352196a8e975f459b77a48892758720a2b42a2215c"}},{"kind":"matrix","partition":2,"golden":{"records":2592,"sha256":"89f18d5a0d2180780c0a42466a485660e558c5a4af6985043cd43d70682c9335"}},{"kind":"matrix","partition":3,"golden":{"records":2592,"sha256":"773ccbcc3553282fbfe0ae84def91939f4318f538eb601aed9f839d6d5810683"}},{"kind":"edges","golden":{"records":1032,"sha256":"540223db10ca5bd2d1afced84d6cea97825e9bcdf2d5b6c1825fb91ab9dc527b","fresh_arrays_and_same_factory":true,"resource_getter_error_identity":true}}],CAPABILITIES=["goal-approval.create-approval"],SYMBOLS=['create_approval'];
const CASE_IDS=PLANS.map((_p,i)=>CAPABILITIES[0]+'-'+String(i+1).padStart(3,'0'));
function factoryAt(root){
 const names=[path.join(root,'goal_approval/create_approval.js'),path.join(root,'source/goal_approval/create_approval.js')];
 const files=names.filter(name=>fs.existsSync(name));assert.equal(files.length,1,'Exact generated module missing or ambiguous');
 const file=files[0];assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());
 const blocked=()=>{throw new Error('Forbidden ambient generated effect');};
 const context=vm.createContext({Date:blocked,fetch:blocked,process:new Proxy({},{get:blocked}),console:new Proxy({},{get:blocked}),setTimeout:blocked,setInterval:blocked,Buffer:undefined},{codeGeneration:{strings:false,wasm:false}});
 new vm.Script('Math.random=()=>{throw new Error("Forbidden ambient randomness")};').runInContext(context,{timeout:1000});
 const script=new vm.Script('(function(exports,module,require){"use strict";\n'+fs.readFileSync(file,'utf8')+'\n})',{filename:'create_approval.js'});
 const module={exports:{}};script.runInContext(context,{timeout:1000})(module.exports,module,blocked);
 assert.deepEqual(Object.keys(module.exports),['create_approval']);
 const factory=module.exports.create_approval;assert.equal(typeof factory,'function');assert.equal(factory.name,'create_approval');assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');return factory;
}
async function runSelected(root,_surface,selected){
 assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
 const indices=selected.map(item=>{assert.equal(item.capability,CAPABILITIES[0]);assert(Array.isArray(item.arguments)&&item.arguments.length===1);const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);return index;});
 assert.equal(new Set(indices).size,indices.length);const factory=factoryAt(root);
 return selected.map((item,i)=>{const plan=PLANS[indices[i]],value=plan.kind==='matrix'?fixture.matrix(factory,plan.partition):fixture.edges(factory);
  assert.deepEqual(value,plan.golden,'Source characterization differs in batch '+indices[i]);return {case_id:item.case_id,capability:item.capability,result:value};});
}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,PLANS,runSelected};
if(require.main===module){assert.equal(process.argv.length,5);runSelected(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4])).then(cases=>console.log(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases}))).catch(error=>{console.error(error.stack);process.exitCode=1;});}
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
