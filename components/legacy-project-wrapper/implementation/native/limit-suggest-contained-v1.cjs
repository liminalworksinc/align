'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"90203467fadc38d2d88fdf0db97d44cad01f5e1f4bac5e162b52e9e3dc1c91ab","package":"limit_suggest","package_files":["create_suggestions.js","package.json"],"maximum_cases":5,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixtureModule={exports:{}};
new Function('require','module','exports',"'use strict';\n// Private supplied-service fixture and input corpus. No suggestion algorithm.\nconst assert=require('node:assert/strict'),crypto=require('node:crypto');\nconst resources=['badRequest','forbidden','V2Error','cleanText','isDay','limitsOf','LIMIT_SOURCE_TITLE_MAX','LIMIT_TEXT_MAX','goalObj','goalRow','visibleGoals','takeAll','isBlankText','canReadGoal'];\nconst metadata={NOTES_MAX:20000,sentences:1,limitType:1,keyWords:1,sameAs:2,goalFor:3,suggestLimits:2};\nfunction goal(id,title,owner_id='u1',measures=['GPU latency'],status='active'){\n return {id,ws_id:'ws1',owner_id,pod_id:null,visibility:'workspace',version:2,title,measures_json:JSON.stringify(measures.map((text,i)=>({id:'m'+i,text,target:null}))),anchors_json:'{\"repos\":[],\"branch_patterns\":[],\"issues\":[]}',depends_on_json:'[]',limits_json:'[]',status,level:'team',target_share:null,created_at:'2026-01-02T00:00:00.000Z',updated_at:'2026-01-02T00:00:00.000Z'};\n}\nfunction normal(value,seen=new Map()){\n if(value===undefined)return {$undefined:true};if(value===null||typeof value!=='object')return value;\n if(seen.has(value))return {$ref:seen.get(value)};seen.set(value,seen.size);\n const kind=Object.prototype.toString.call(value);\n if(kind==='[object Set]')return {$set:Array.from(value,x=>normal(x,seen))};\n if(kind==='[object Map]')return {$map:Array.from(value,([k,v])=>[normal(k,seen),normal(v,seen)])};\n if(Array.isArray(value))return value.map(v=>normal(v,seen));\n return Object.fromEntries(Object.keys(value).map(k=>[k,normal(value[k],seen)]));\n}\nfunction fixture(settings={}){\n let active=false,effects=0,reads=0;const trace=[],fault=new Error('owned suggestion failure'),wrapped=new WeakMap();\n const pause=fn=>{const before=active;active=false;try{return fn();}finally{active=before;}};\n function watch(value,label){\n  if(!value||typeof value!=='object'||value instanceof Map||value instanceof Set)return value;\n  if(wrapped.has(value))return wrapped.get(value);\n  const proxy=new Proxy(value,{get(target,key,receiver){if(active&&typeof key==='string'){trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;}const item=Reflect.get(target,key,receiver);return typeof item==='object'&&item!==null?watch(item,label+'.'+String(key)):item;},ownKeys(target){if(active)throw new Error('Caller input was enumerated');return Reflect.ownKeys(target);}});wrapped.set(value,proxy);return proxy;\n }\n function note(name,args){trace.push(['service',name,pause(()=>normal(args))]);if(++effects===settings.effectFault)throw fault;}\n const call=(name,fn)=>function(...args){assert.equal(this,undefined);note(name,args);return fn(...args);};\n class OwnedError extends Error{constructor(status,code,message){super(message);note('V2Error',[status,code,message]);Object.assign(this,{ownedRefusal:true,status,code});}}\n const pool=watch(structuredClone(settings.goals??[goal('gpu','GPU model latency'),goal('docs','Documentation review','u2',['Written guides'])]),'pool');\n const providers={\n  badRequest:call('badRequest',(message,code='bad_request')=>({ownedRefusal:true,status:400,code,message})),\n  forbidden:call('forbidden',(code,message)=>({ownedRefusal:true,status:403,code,message})),\n  V2Error:OwnedError,\n  cleanText:call('cleanText',text=>settings.cleanResult??text.replace(/\\s+/g,' ').trim()),\n  isDay:call('isDay',text=>['2026-01-02','2024-02-29'].includes(text)),\n  limitsOf:call('limitsOf',row=>JSON.parse(row.limits_json||'[]')),\n  LIMIT_SOURCE_TITLE_MAX:120,LIMIT_TEXT_MAX:160,\n  goalObj:call('goalObj',g=>({kind:'goal',ownerId:g.owner_id,visibility:g.visibility,podId:g.pod_id})),\n  goalRow:call('goalRow',(_ws,id)=>pool.find(g=>g.id===id)),\n  visibleGoals:call('visibleGoals',()=>pool),\n  takeAll:call('takeAll',()=>settings.quota??true),\n  isBlankText:call('isBlankText',text=>settings.blank??!text.trim()),\n  canReadGoal:call('canReadGoal',()=>settings.readable??true),\n };\n return {trace,fault,providers,watch,pause,pool,begin(){active=true;},end(){active=false;},effects:()=>effects,reads:()=>reads};\n}\nfunction service(factory,f){\n const captures=[];const supplied=new Proxy({},{get(_t,key){captures.push(key);assert(resources.includes(key));return f.providers[key];},ownKeys(){throw new Error('Resource enumeration');}});\n const value=factory(supplied);assert.deepEqual(captures,resources);assert.deepEqual(f.trace,[]);assert.deepEqual(Object.keys(value),Object.keys(metadata));\n for(const [name,expected]of Object.entries(metadata)){if(name==='NOTES_MAX')assert.equal(value[name],expected);else{assert.equal(typeof value[name],'function');assert.equal(value[name].name,name);assert.equal(value[name].length,expected);assert.equal(value[name].constructor.name,'Function');}}\n return {value,captures};\n}\nfunction invoke(factory,name,args,settings={}){\n const f=fixture(settings),{value,captures}=service(factory,f),copy=structuredClone(args);\n const actual=settings.watch?copy.map((x,i)=>f.watch(x,'arg'+i)):copy;\n const before=JSON.stringify(actual);let result,error;f.begin();\n try{result=Reflect.apply(value[name],undefined,actual);}catch(e){\n  f.end();if(e===f.fault)error={ownedFault:true};else if(e?.ownedRefusal)error={status:e.status,code:e.code,message:e.message};else error={name:e.name,message:e.message};\n }finally{f.end();}\n assert.deepEqual(captures,resources);assert.equal(JSON.stringify(actual),before);\n let reference=null;\n if(name==='goalFor'||name==='sameAs')reference=result==null?null:actual[0].indexOf(result);\n if(name==='suggestLimits'&&result){const sources=result.suggestions.flatMap(g=>g.limits.map(l=>l.source));assert(sources.every(x=>x===sources[0]));assert(sources.every(x=>x!==actual[1].source));}\n return {name,result:normal(result),error:normal(error),reference,trace:f.trace,effects:f.effects(),property_reads:f.reads()};\n}\nconst pp={userId:'u1',wsId:'ws1',wsRole:'owner',pods:new Map()};\nconst body=(notes,extra={})=>({notes,source:{title:'Meeting',date:'2026-01-02'},...extra});\nconst phrases=[\n 'out of scope','out-of-scope','not in scope','outside the scope','outside our scope','outside this scope','not part of the goal','not part of this project','not part of our demo',\n 'ensure','make sure','target','aim for','must not','mustn\\'t','must never','should not','shouldn\\'t','should never','may not','not allowed to','never','do not','don\\'t','cannot all','cannot be','cannot exceed','cannot go','cannot use','cannot run','can not all','can not be','no more than','at most',\n 'must','has to','have to','needs to','need to','should','is required to','are required to','at least','only use','can\\'t','will','review','must never be out of scope','ensure models must not','make sure GPU cannot exceed',\n];\nfunction* textCases(){\n const splits=['','   ','One. Two! Three? Four','One. lower case. Another','e.g. a GPU; next','vs. A model','1. GPU must fit. 2) GPU must wait','- GPU must fit\\n* GPU must wait','A GPU must fit • A model must wait','A GPU must fit - A model must wait','GPU. 2 models','GPU. “Models','GPU. (Models','GPU. \"Models','GPU. Ångstrom','A; B;C','one\\n\\n two\\r\\nthree','... 123) GPU must fit','GPU must fit.\\n','  GPU must fit  '];\n for(const text of splits)yield ['sentences',[text],{}];\n for(const text of splits.slice(1,8))yield ['sentences',[text],{cleanResult:' supplied result '}];\n for(const phrase of phrases)for(const count of [3,4,5,44,45,46])for(const question of [false,true]){\n  const used=phrase.split(/\\s+/).length,words=Array(Math.max(0,count-used)).fill('GPU');\n  const sentence=[phrase,...words].join(' ')+(question?'?':'');yield ['limitType',[sentence],{}];\n }\n for(const text of ['GPU fit model models specs spec gpus gpu','abc ABC Abc x12 12 123 ab12 _word foo-bar','éclair GPU 中文 alpha βeta','the and all any are but can for from has have its may must need needs not nor our out own should that the their them then there this those was were what when which who will with would you your never only use used using scope part goal work team than more most least once also into onto been being does did don','', 'a ab abc abcd abc','a'.repeat(250),'GPU\\nDOCS\\tCPU'])yield ['keyWords',[text],{}];\n}\nfunction* matchingCases(){\n const texts=['GPU model latency','GPU models must fit','models fit latency memory','Documentation guide review','alpha beta gamma delta epsilon','alpha beta gamma zeta theta','alpha beta gamma','alpha beta','alpha','the and must',''];\n for(const a of texts)for(const b of texts)for(const c of texts.slice(0,5))yield ['sameAs',[[{id:'first',text:a},{id:'second',text:b}],c],{}];\n const configurations=[[],[goal('a','GPU','u1',[])],[goal('gpu','GPU models', 'u1',[])],[goal('a','Alpha beta','u1',[]),goal('b','Alpha gamma','u2',[])],\n  [goal('a','GPU model fit','u1',['GPU memory']),goal('b','GPU model fit','u2',['GPU memory'])],\n  [goal('a','Spec models','u1',[]),goal('b','GPU models','u2',[])],\n  [goal('a','Alpha beta','u1',[]),goal('b','Alpha gamma','u2',[]),goal('c','Alpha delta','u1',[])]];\n for(const goals of configurations)for(const sentence of texts.concat(['GPU models must fit','Specs should preserve model memory','Gpus must preserve model memory','Gpus must stay contained','Alpha beta gamma must match']))for(const prefer of [null,'a','b','missing',''])yield ['goalFor',[goals,sentence,prefer],{}];\n const shared=goal('a','Alpha GPU','u1',[]);yield ['goalFor',[[shared,shared,goal('b','Beta GPU','u2',[])],'Alpha GPU models must fit','b'],{}];\n}\nfunction* suggestionCases(){\n const notes=['GPU models must fit on the machine.','Ensure all three models don\\'t fit on the GPU.','I can\\'t find the GPU node logs.','GPU model fit?','GPU must fit','GPU models must fit?','Goal: GPU models must fit on one machine.','Next steps: Documentation review must keep written guides.','GPU models must fit. Documentation review must retain written guides.','No matching terms must stay contained.','GPU models must fit.\\nGPU models must fit.','GPU models must fit; GPU model latency must be low'];\n for(const text of notes)for(const role of ['owner','member','viewer'])for(const prefer of [undefined,'gpu','docs'])yield ['suggestLimits',[{...pp,wsRole:role},body(text,prefer===undefined?{}:{prefer_goal_id:prefer})],{}];\n for(const text of notes.slice(0,4))for(const settings of [{quota:false},{readable:false},{blank:true},{goals:[]},{goals:[goal('gpu','GPU models','u1',[],'achieved'),goal('docs','GPU models','u2',[],'dropped')]}])yield ['suggestLimits',[pp,body(text,{prefer_goal_id:'gpu'})],settings];\n for(const notes of [undefined,null,1,false,'',' ','x'.repeat(20000),'x'.repeat(20001)])yield ['suggestLimits',[pp,body(notes)],{}];\n for(const source of [undefined,null,[],false,1,'',{}, {title:1,date:'2026-01-02'},{title:null,date:'2026-01-02'},{title:'x'.repeat(120),date:'2026-01-02'},{title:'x'.repeat(121),date:'2026-01-02'},{date:'bad'},{date:'2024-02-29'}])yield ['suggestLimits',[pp,body(notes[0],{source})],{}];\n for(const prefer_goal_id of [null,0,false,{},[],'','missing'])yield ['suggestLimits',[pp,body(notes[0],{prefer_goal_id})],{}];\n const g=goal('gpu','GPU','u2',[]);g.limits_json=JSON.stringify([{id:'existing',text:'All three models must not fit on one GPU',type:'must_not',source:null}]);\n yield ['suggestLimits',[pp,body(\"Ensure all three models don't fit on the GPU.\",{prefer_goal_id:'gpu'})],{goals:[g]}];\n for(const length of [9,10,11,199,200,201]){\n  const lines=Array.from({length},(_,i)=>'GPU models must preserve memory variant'+i+'.');yield ['suggestLimits',[pp,body(lines.join('\\n'))],{}];\n }\n const distinct=Array.from({length:11},(_,i)=>'GPU '+('a'+i).repeat(40)+' must '+('b'+i).repeat(40)+' preserve '+('c'+i).repeat(40)+'.');\n yield ['suggestLimits',[pp,body(distinct.join('\\n'))],{goals:[goal('gpu','GPU','u1',[])]}];\n for(const heading of ['A'.repeat(24),'A'.repeat(25),'A'.repeat(26),'1Heading','Heading_name'])yield ['suggestLimits',[pp,body(heading+': GPU models must preserve memory.')],{}];\n yield ['suggestLimits',[pp,body('Unrelated work must remain contained.',{prefer_goal_id:'gpu'})],{}];\n yield ['suggestLimits',[pp,body('Unrelated work must remain contained. Unrelated details must remain contained.',{prefer_goal_id:'gpu'})],{}];\n}\nfunction stream(records){const hash=crypto.createHash('sha256');let count=0;for(const value of records){hash.update(JSON.stringify(value)+'\\n');count++;}return {records:count,sha256:hash.digest('hex')};}\nfunction basic(factory,kind){const list=kind==='text'?textCases():kind==='matching'?matchingCases():suggestionCases();return stream(Array.from(list,([name,args,settings])=>invoke(factory,name,args,settings)));}\nfunction adaptive(factory,properties){\n const cases=[['sentences',['1. GPU models must fit. Next models must wait.']],['goalFor',[[goal('a','GPU model'),goal('b','GPU model')],'GPU models must fit','b']],['sameAs',[[{id:'x',text:'GPU models fit'},{id:'y',text:'Memory latency'}],'GPU model must fit']],\n  ['suggestLimits',[pp,body('GPU models must fit. Documentation review must retain written guides.',{prefer_goal_id:'gpu'})]],['suggestLimits',[pp,body('Missing words must be kept.',{prefer_goal_id:'docs'})]],['suggestLimits',[pp,body('GPU models must fit.',{prefer_goal_id:'missing'})]],['suggestLimits',[pp,body('GPU models must fit.',{source:{title:1,date:'2026-01-02'}})]],['suggestLimits',[{...pp,wsRole:'viewer'},{}]]];\n const records=[];\n for(const [name,args]of cases){const settings={watch:properties},plain=invoke(factory,name,args,settings);records.push(plain);const maximum=properties?plain.property_reads:plain.effects;\n  for(let i=1;i<=maximum;i++){const failed=invoke(factory,name,args,{...settings,[properties?'propertyFault':'effectFault']:i});assert(failed.error.ownedFault);records.push(failed);}\n }\n for(let i=0;i<resources.length;i++){\n  const fault=new Error('owned resource capture'),reads=[];\n  assert.throws(()=>factory(new Proxy({},{get(_t,key){reads.push(key);if(key===resources[i])throw fault;return ()=>{};}})),e=>e===fault);\n  assert.deepEqual(reads,resources.slice(0,i+1));records.push({capture_failure:i+1,reads,identity_preserved:true});\n }\n return stream(records);\n}\nfunction run(factory,index){if(index<3)return basic(factory,['text','matching','suggestions'][index]);if(index===3)return adaptive(factory,false);assert.equal(index,4);return adaptive(factory,true);}\nmodule.exports={resources,metadata,goal,normal,fixture,service,invoke,run};\n")(name=>{assert(['node:assert/strict','node:crypto'].includes(name));return require(name);},fixtureModule,fixtureModule.exports);
const fixture=fixtureModule.exports;
const PLANS=[{"index":0,"golden":{"records":635,"sha256":"89a4ced3388dca6360d42c127a6911f40194b2a44eed43252bd491412d02dbda"}},{"index":1,"golden":{"records":1166,"sha256":"dc5770467b0a042c36cb8dafce5687eb095fee79d61b6f79c0edfec450a4aea3"}},{"index":2,"golden":{"records":171,"sha256":"a65437069953998e30519969ae633a35ef8edbe3512b1760fd1d46e510275240"}},{"index":3,"golden":{"records":55,"sha256":"a0f17bb6f6db58fb7040d160e1dee56bbd75e3e41b6ade230243b8d2373b4704"}},{"index":4,"golden":{"records":178,"sha256":"e552035e691e09ee01bdbb399d0a148060deb907ae34c05fa99d169a84f6a503"}}],CAPABILITIES=["limit-suggest.create-suggestions"],SYMBOLS=['create_suggestions'];
const CASE_IDS=PLANS.map((_p,i)=>CAPABILITIES[0]+'-'+String(i+1).padStart(3,'0'));
function factoryAt(root){
 const names=[path.join(root,'limit_suggest/create_suggestions.js'),path.join(root,'source/limit_suggest/create_suggestions.js')];
 const files=names.filter(name=>fs.existsSync(name));assert.equal(files.length,1,'Exact generated module missing or ambiguous');
 const file=files[0];assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());
 const blocked=()=>{throw new Error('Forbidden ambient generated effect');};
 const context=vm.createContext({Date:blocked,fetch:blocked,process:new Proxy({},{get:blocked}),console:new Proxy({},{get:blocked}),setTimeout:blocked,setInterval:blocked,Buffer:undefined},{codeGeneration:{strings:false,wasm:false}});
 new vm.Script('Math.random=()=>{throw new Error("Forbidden ambient randomness")};').runInContext(context,{timeout:1000});
 const script=new vm.Script('(function(exports,module,require){"use strict";\n'+fs.readFileSync(file,'utf8')+'\n})',{filename:'create_suggestions.js'});
 const module={exports:{}};script.runInContext(context,{timeout:1000})(module.exports,module,blocked);
 assert.deepEqual(Object.keys(module.exports),['create_suggestions']);
 const factory=module.exports.create_suggestions;assert.equal(typeof factory,'function');assert.equal(factory.name,'create_suggestions');assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');return factory;
}
async function runSelected(root,_surface,selected){
 assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
 const indices=selected.map(item=>{assert.equal(item.capability,CAPABILITIES[0]);assert(Array.isArray(item.arguments)&&item.arguments.length===1);const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);return index;});
 assert.equal(new Set(indices).size,indices.length);const factory=factoryAt(root);
 return selected.map((item,i)=>{const plan=PLANS[indices[i]],value=fixture.run(factory,plan.index);
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
