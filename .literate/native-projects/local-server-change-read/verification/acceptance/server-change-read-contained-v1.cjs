'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"1bcf98fb56def8073ace8dff90f7593585847c29c279ce67c8ec9999c3578d54","package":"server_change_read","package_files":["create_records.js","package.json"],"maximum_cases":4,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixtureModule={exports:{}};
new Function('require','module','exports',"'use strict';\nconst assert=require('node:assert/strict'),crypto=require('node:crypto');\nconst resourceNames=['get','V2Error','requestView','requestViews'];\nconst metadata={CHANGE_REQUEST_STATES:['pending','countered','approved','rejected','withdrawn','superseded'],listChangeRequests:2,getChangeRequest:2};\nconst sql=\"SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'v2_change_requests'\";\nfunction view(extra={}){\n const person={id:'u1',name:'Person'},condition={revision:2,text:'Accept after review',acknowledged_by:person,acknowledged_at:'2026-11-01T12:00:00Z'};\n const evidence=(id,revision)=>({id,revision,kind:'test',url:'https://example.invalid/'+id,label:'Reported result',source:revision===1?'agent':'person',reported_as:revision===1?'agent-reported':'self-reported',added_by:person,added_at:'2026-11-01T12:00:00Z'});\n return {id:'cr1',goal:{id:'g1',title:'Accepted work'},state:'approved',launch:'launched',condition,requester:person,base_version:1,revision:2,reason:'Preserve behavior',revisions:[{revision:1,evidence:[evidence('e1',1)],snapshot:{window:['first','last'],spend:10}},{revision:2,evidence:[evidence('e2',2),evidence('e3',2)],snapshot:{window:['start','end'],spend:null}}],created_at:'2026-11-01T12:00:00Z',updated_at:'2026-11-02T12:00:00Z',diff:{before:{title:'Before',measures:[{id:'m1',text:'Before'}],depends_on:['g2'],status:'active',limits:undefined},after:{title:'After',measures:[{id:'m1',text:'After'}],depends_on:['g3'],status:'achieved',limits:[]},hidden_depends_on:{before:1,after:2}},approved_by:person,rejected_by:{id:'u2',name:'Other'},decision_note:'Reviewed',version:3,launch_decided_by:person,launch_decided_at:'2026-11-02T12:00:00Z',approved_without_evidence:false,decided_at:'2026-11-02T12:00:00Z',...extra};\n}\nfunction normalize(value,seen=new Map()){\n if(value===undefined)return {$undefined:true};\n if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};\n if(value===null||typeof value!=='object')return value;\n if(seen.has(value))return {$ref:seen.get(value)};seen.set(value,seen.size);\n if(Array.isArray(value))return Array.from(value,v=>normalize(v,seen));\n return Object.fromEntries(Object.keys(value).map(k=>[k,normalize(value[k],seen)]));\n}\nfunction fixture(settings={}){\n let active=false,reads=0,effects=0,captures=0;\n const trace=[],wrapped=new WeakMap(),sequences=new Map();\n class V2Error extends Error {constructor(status){super('owned refusal');this.status=status;}}\n const fault=settings.error==='404'?new V2Error(404):settings.error==='403'?new V2Error(403):settings.error==='string404'?new V2Error('404'):settings.error==='foreign404'?Object.assign(new Error('owned refusal'),{status:404}):new Error('owned failure');\n const rawViews=settings.views??[view(),view({id:'cr2',state:'pending',revision:1}),view({id:'cr3',state:'superseded',launch:'superseded'})];\n function quiet(fn){const before=active;active=false;try{return fn();}finally{active=before;}}\n function watch(value,label){\n  if(!value||typeof value!=='object')return value;\n  if(wrapped.has(value))return wrapped.get(value);\n  const result=new Proxy(value,{get(target,key,receiver){\n   let got;\n   if(active&&typeof key==='string'){\n    trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;\n    const name=label+'.'+key,sequence=settings.sequences?.[name];\n    if(sequence){const index=sequences.get(name)??0;sequences.set(name,index+1);got=sequence[Math.min(index,sequence.length-1)];}\n    else got=Reflect.get(target,key,receiver);\n   }else got=Reflect.get(target,key,receiver);\n   return watch(got,label+'.'+String(key));\n  },ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);}});\n  wrapped.set(value,result);return result;\n }\n const views=watch(rawViews,'views'),pp=watch({wsId:'ws1',userId:'u1',wsRole:'owner'},'pp');\n function call(name,fn){return function(...args){assert.equal(this,undefined);trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;return fn(...args);};}\n const supplied={get:call('get',(...args)=>{assert.deepEqual(args,[sql]);return Object.hasOwn(settings,'table')?settings.table:{x:1};}),V2Error,requestView:call('requestView',(principal,id)=>{assert.equal(principal,pp);assert.equal(id,'cr1');return views[0];}),requestViews:call('requestViews',(principal,filter)=>{assert.equal(principal,pp);assert.deepEqual(Object.keys(filter),['state']);assert.equal(filter.state,settings.state??null);return views;})};\n const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw new Error('Resource enumeration forbidden');}});\n function run(factory,mode='get'){\n  let service,result,error;\n  try{service=factory(resources);assert.deepEqual(Object.keys(service),Object.keys(metadata));assert.equal(service.listChangeRequests.name,'listChangeRequests');assert.equal(service.getChangeRequest.name,'getChangeRequest');assert.equal(service.listChangeRequests.length,2);assert.equal(service.getChangeRequest.length,2);assert.deepEqual(Array.from(service.CHANGE_REQUEST_STATES),metadata.CHANGE_REQUEST_STATES);\n   if(settings.mutateStates)service.CHANGE_REQUEST_STATES.push('owned-state');\n   active=true;\n   result=mode==='list'?(settings.omitLimit?service.listChangeRequests(pp,settings.state??null):service.listChangeRequests(pp,settings.state??null,settings.limit)):service.getChangeRequest(pp,'cr1');\n  }catch(e){error=e;}finally{active=false;}\n  let identities=null;\n  if(!error&&result&&((mode==='list'&&result.length)||mode==='get')){\n   const item=mode==='list'?result[0]:result,input=views[0];\n   identities={condition:item.condition===input.condition,requester:item.requested_by===input.requester,goalFresh:item.goal!==input.goal,evidenceFresh:item.evidence!==input.revisions[0]?.evidence,linksFresh:item.evidence.every(link=>!Array.from(input.revisions).some(rev=>Array.from(rev.evidence).includes(link))),addedPeople:item.evidence.every(link=>Array.from(input.revisions).some(rev=>Array.from(rev.evidence).some(e=>e.added_by===link.added_by))),snapshot:input.revisions.some(rev=>rev.snapshot===item.snapshot)||item.snapshot===null};\n   if(mode==='get'&&item.diff){for(const key of ['title','measures','depends_on','status','limits'])if(item.diff[key]){identities['after.'+key]=item.diff[key].after===input.diff.after[key];if(key!=='limits'||input.diff.before.limits!=null)identities['before.'+key]=item.diff[key].before===input.diff.before[key];}if(item.diff.depends_on)identities.hidden=item.diff.depends_on.hidden===input.diff.hidden_depends_on;}\n  }\n  return {result:error?undefined:normalize(result),error:error?{name:error.name,message:error.message,same:error===fault,status:normalize(error.status)}:null,trace,identities,reads,effects,states:service?Array.from(service.CHANGE_REQUEST_STATES):null};\n }\n return {run};\n}\nconst hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');\nmodule.exports={view,fixture,normalize,hash,resourceNames,metadata};\n")(name=>{assert(['node:assert/strict','node:crypto'].includes(name));return require(name);},fixtureModule,fixtureModule.exports);
const corpusModule={exports:{}};
new Function('require','module','exports',"'use strict';\nconst assert=require('node:assert/strict');\nconst {view,fixture,hash}=require('./server-change-read-fixture-draft-v1.cjs');\nfunction entries(index){\n const cases=[];const add=(settings={},mode='get')=>cases.push({settings,mode});\n if(index===0){\n  for(let i=1;i<=4;i++)add({captureFault:i});\n  add({mutateStates:true});add({},'list');add({omitLimit:true},'list');\n  for(const table of [undefined,null,false,0,'',1,{x:1}])for(const mode of ['get','list'])add({table},mode);\n  for(const state of [null,'pending','countered','approved','rejected','withdrawn','superseded'])for(const limit of [undefined,-Infinity,-1,-0,0,0.9,1,1.9,2,100,Infinity,NaN])add({state,limit},'list');\n }else if(index===1){\n  for(const state of ['pending','countered','approved','rejected','withdrawn','superseded'])for(const approved_by of [null,{id:'u1',name:'Approved'}])for(const launch of [null,'pending','not_yet','launched','superseded'])for(const version of [null,3])add({views:[view({state,approved_by,launch,version})]});\n  for(const revision of [0,1,2,3])for(const snapshot of [undefined,null,{window:['a','b'],spend:0}]){\n   const v=view({revision});v.revisions[1].snapshot=snapshot;add({views:[v]});add({views:[v]},'list');\n  }\n  for(const key of ['title','measures','depends_on','status','limits'])for(const value of [undefined,...(key==='title'?['','After']:key==='status'?['active','achieved']:[[]])]){\n   const v=view();v.diff.after[key]=value;add({views:[v]});\n  }\n  for(const value of [undefined,null,[],['l1']]){const v=view();v.diff.before.limits=value;add({views:[v]});}\n }else if(index===2){\n  for(const mode of ['get','list'])for(const error of ['plain','404','403','string404','foreign404'])for(const effectFault of [1,2,3])add({error,effectFault},mode);\n  for(const mode of ['get','list'])for(const error of ['plain','404','403','string404','foreign404']){\n   for(let propertyFault=1;propertyFault<=originalReadCounts[mode];propertyFault++)add({error,propertyFault},mode);\n  }\n }else if(index===3){\n  for(const states of [['approved','pending'],['rejected','approved'],['superseded','superseded','approved'],['pending','rejected','superseded','approved']])add({sequences:{'views.0.state':states}});\n  for(const revisions of [[2,1],[3,2],[1,3],[9,9]]){add({sequences:{'views.0.revision':revisions}});add({sequences:{'views.0.revision':revisions}},'list');}\n  add({views:[]},'list');\n  for(const views of [[view({revisions:[]})],[view({diff:{before:{},after:{},hidden_depends_on:null}})]]){add({views});add({views},'list');}\n }else throw Error('Invalid batch');\n return cases;\n}\n// Read counts are supplied by the original characterization before enumerating\n// the exhaustive property-failure positions. They are not runtime expectations.\nconst originalReadCounts={get:95,list:195};\nasync function run(factory,index){\n const cases=entries(index),records=[];\n for(const {settings,mode}of cases)records.push(fixture(settings).run(factory,mode));\n assert(records.length>0);\n return {batch:index,records:records.length,sha256:hash(records)};\n}\nmodule.exports={run,entries};\n")(name=>{if(name==='./server-change-read-fixture-draft-v1.cjs')return fixtureModule.exports;assert(['node:assert/strict','node:crypto'].includes(name));return require(name);},corpusModule,corpusModule.exports);
const corpus=corpusModule.exports,PLANS=[{"index":0,"golden":{"batch":0,"records":105,"sha256":"07d91c99500d922bcc9c8dd757858368c3752a0ac433f8020463c47d38a142a1"}},{"index":1,"golden":{"batch":1,"records":160,"sha256":"5d05e88d44bc413013251669867a27df36ec0e758dbd47da012a98667958af74"}},{"index":2,"golden":{"batch":2,"records":1480,"sha256":"9369f8da7ae45f10b247f2d60abfebc08ebacad16567dba9971386f0070e5c57"}},{"index":3,"golden":{"batch":3,"records":17,"sha256":"e1bf620d4dbfbf60ce101f9674c0b967da62c522eaf0f686cd91be04d85af53a"}}],CAPABILITIES=["server-change-read.create-records"],SYMBOLS=['create_records'];
const CASE_IDS=PLANS.map((_p,i)=>CAPABILITIES[0]+'-'+String(i+1).padStart(3,'0'));
function factoryAt(root){
 const files=[path.join(root,'server_change_read/create_records.js'),path.join(root,'source/server_change_read/create_records.js')].filter(name=>fs.existsSync(name));
 assert.equal(files.length,1,'Exact generated module missing or ambiguous');const file=files[0];assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());
 const pkg=path.dirname(file),directory=fs.lstatSync(pkg);
 assert(directory.isDirectory()&&!directory.isSymbolicLink(),'Native package directory must be regular');
 assert.deepEqual(fs.readdirSync(pkg).sort(),['create_records.js','package.json'],'Exact native package members');
 for(const name of ['create_records.js','package.json']){const stat=fs.lstatSync(path.join(pkg,name));assert(stat.isFile()&&!stat.isSymbolicLink(),'Native package members must be regular files');}
 const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8'));
 assert.equal(manifest.name,'server_change_read');assert.equal(manifest.type,'commonjs');
 assert.deepEqual(manifest.exports,{'./create_records':'./create_records.js'});
 const blocked=()=>{throw Error('Forbidden ambient generated effect');};
 const context=vm.createContext({Date:blocked,fetch:blocked,process:new Proxy({},{get:blocked}),console:new Proxy({},{get:blocked}),setTimeout:blocked,setInterval:blocked,Buffer:undefined},{codeGeneration:{strings:false,wasm:false}});
 new vm.Script('Math.random=()=>{throw Error("Forbidden ambient randomness")};').runInContext(context,{timeout:1000});
 const module={exports:{}};
 new vm.Script('(function(exports,module,require){"use strict";\n'+fs.readFileSync(file,'utf8')+'\n})',{filename:'create_records.js'}).runInContext(context,{timeout:1000})(module.exports,module,blocked);
 assert.deepEqual(Object.keys(module.exports),['create_records']);const factory=module.exports.create_records;
 assert.equal(typeof factory,'function');assert.equal(factory.name,'create_records');assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');return factory;
}
async function runSelected(root,_surface,selected){
 assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
 const indices=selected.map(item=>{assert.equal(item.capability,CAPABILITIES[0]);assert(Array.isArray(item.arguments)&&item.arguments.length===1);const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);return index;});
 assert.equal(new Set(indices).size,indices.length);const factory=factoryAt(root),results=[];
 for(let i=0;i<selected.length;i++){const item=selected[i],plan=PLANS[indices[i]],value=await corpus.run(factory,plan.index);assert.deepEqual(value,plan.golden,'Source characterization differs in batch '+plan.index);results.push({case_id:item.case_id,capability:item.capability,result:value});}
 return results;
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
