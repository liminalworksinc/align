'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"32da61104b38cb3d84042cefc85640a5346effa085204f247c823529ae679234","package":"server_steering","package_files":["create_steering.js","package.json"],"maximum_cases":10,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixtureModule={exports:{}};
new Function('require','module','exports',"'use strict';\n// Labeled synthetic service-port controls with actual isolated SQLite tables.\nconst assert = require('node:assert/strict');\nconst {DatabaseSync} = require('node:sqlite');\nconst resourceNames = ['all','audit','get','run','tx','badRequest','nowIso','need','ID_RE','SESSION_KEY_RE','readDate'];\nconst metadata = {workspaceSteering:1,writeSteering:3,ingestSteering:3,steeringCounts:3};\nconst now = Date.parse('2026-11-09T12:00:00.000Z');\nconst recorded = '2026-11-09T12:00:01.000Z';\nconst sessionKey = 'a'.repeat(43), goalId = 'g_' + 'a'.repeat(24), suggestedId = 'g_' + 'b'.repeat(24);\nfunction normalize(value, seen = new Map()) {\n  if (value === undefined) return {$undefined:true};\n  if (typeof value === 'function') return {$function:true};\n  if (typeof value === 'bigint') return {$bigint:String(value)};\n  if (typeof value === 'number' && !Number.isFinite(value)) return {$number:String(value)};\n  if (value === null || typeof value !== 'object') return value;\n  if (seen.has(value)) return {$ref:seen.get(value)};\n  seen.set(value, seen.size);\n  if (Array.isArray(value)) return Array.from(value, item => normalize(item, seen));\n  return Object.fromEntries(Object.keys(value).map(key => [key, normalize(value[key], seen)]));\n}\nfunction fixture(settings = {}) {\n  const db = new DatabaseSync(':memory:');\n  db.exec(`CREATE TABLE v2_workspaces(id TEXT PRIMARY KEY,steering TEXT);\n    CREATE TABLE v2_sessions(ws_id TEXT,session_key TEXT,device_id TEXT,user_id TEXT,state TEXT,PRIMARY KEY(ws_id,session_key));\n    CREATE TABLE v2_steering_events(ws_id TEXT,session_key TEXT,goal_id TEXT,suggested_goal_id TEXT,share INTEGER,target INTEGER,at TEXT,recorded_at TEXT,UNIQUE(ws_id,session_key,at));\n    CREATE TABLE v2_audit(ws_id TEXT,actor_id TEXT,action TEXT,object_id TEXT,at TEXT);`);\n  function insert(table, row) {\n    const keys = Object.keys(row);\n    db.prepare('INSERT INTO ' + table + ' (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')')\n      .run(...keys.map(key => row[key]));\n  }\n  if (!settings.missingWorkspace) insert('v2_workspaces', {id:'ws1',steering:settings.steering ?? 'off'});\n  insert('v2_workspaces', {id:'ws2',steering:'on'});\n  if (!settings.missingSession) insert('v2_sessions', {ws_id:'ws1',session_key:sessionKey,device_id:'dv1',user_id:'u1',state:'shared',...(settings.session ?? {})});\n  for (const row of settings.existingEvents ?? []) insert('v2_steering_events', {\n    ws_id:'ws1',session_key:sessionKey,goal_id:goalId,suggested_goal_id:suggestedId,share:60,target:20,\n    at:new Date(now).toISOString(),recorded_at:recorded,...row,\n  });\n  let active = false, reads = 0, effects = 0, captures = 0;\n  let transactions = 0, commits = 0, rollbacks = 0, lastRefusal;\n  const trace = [], fault = new Error('owned steering failure');\n  const wrapped = new WeakMap(), unwrapped = new WeakMap(), sequences = new Map();\n  function quiet(fn) { const prior = active; active = false; try { return fn(); } finally { active = prior; } }\n  function effect(name, args) {\n    if (!active) return;\n    trace.push(['service',name,quiet(() => normalize(args))]);\n    if (++effects === settings.effectFault) throw fault;\n  }\n  function watch(value, label) {\n    if (!value || typeof value !== 'object') return value;\n    if (wrapped.has(value)) return wrapped.get(value);\n    const proxy = new Proxy(value, {\n      get(target, key, receiver) {\n        let got;\n        if (active && typeof key === 'string') {\n          trace.push(['get',label,key]);\n          if (++reads === settings.propertyFault) throw fault;\n          const list = settings.sequences?.[label + '.' + key];\n          if (list) {\n            const index = sequences.get(label + '.' + key) ?? 0;\n            sequences.set(label + '.' + key, index + 1);\n            got = list[Math.min(index,list.length - 1)];\n          } else got = Reflect.get(target,key,receiver);\n        } else got = Reflect.get(target,key,receiver);\n        return watch(got,label + '.' + String(key));\n      },\n      ownKeys(target) { if (active) trace.push(['keys',label]); return Reflect.ownKeys(target); },\n    });\n    wrapped.set(value,proxy); unwrapped.set(proxy,value); return proxy;\n  }\n  const raw = value => unwrapped.get(value) ?? value;\n  const refusal = (status, code, message) => lastRefusal = Object.assign(new Error(message), {status,code});\n  const call = (name, fn) => function(...args) {\n    assert.equal(this,undefined); effect(name,args); return quiet(() => fn(...args));\n  };\n  const principal = watch({wsId:'ws1',userId:'u1',wsRole:'member',...(settings.principal ?? {})},'pp');\n  const device = watch({deviceId:'dv1',user:{id:'u1'},...(settings.device ?? {})},'dev');\n  const event = {session_key:sessionKey,goal_id:goalId,suggested_goal_id:suggestedId,share:60,target:20,at:new Date(now).toISOString()};\n  const body = watch(settings.bodyUndefined ? undefined : Object.hasOwn(settings,'body') ? settings.body : {events:[event]},'body');\n  class ControlledDate extends Date { static now() { return settings.now ?? now; } }\n  const supplied = {\n    all:call('all',(sql,...args) => watch(db.prepare(sql).all(...args),'all.' + sql)),\n    audit:call('audit',(...args) => insert('v2_audit',Object.fromEntries(['ws_id','actor_id','action','object_id','at'].map((key,i) => [key,args[i]])))),\n    get:call('get',(sql,...args) => watch(db.prepare(sql).get(...args),'get.' + sql)),\n    run:call('run',(sql,...args) => Number(db.prepare(sql).run(...args).changes)),\n    tx:async function(fn) {\n      assert.equal(this,undefined); effect('tx',[]); transactions++;\n      db.exec('SAVEPOINT fixture_tx');\n      try { const value = fn(); assert(!value || typeof value.then !== 'function'); db.exec('RELEASE fixture_tx'); commits++; return value; }\n      catch (error) { db.exec('ROLLBACK TO fixture_tx; RELEASE fixture_tx'); rollbacks++; throw error; }\n    },\n    badRequest:call('badRequest',message => {\n      if (Object.hasOwn(settings,'refusalValue')) return lastRefusal = settings.refusalValue;\n      return refusal(400,'bad_request',message);\n    }),\n    nowIso:call('nowIso',() => recorded),\n    need:call('need',(pp,action) => {\n      assert.equal(pp,principal); assert(['session.share','spend.read'].includes(action));\n      if (settings.denyNeed) throw refusal(403,'owned_denial','Permission denied');\n    }),\n    ID_RE:/^g_[a-z2-7]{24}$/,\n    SESSION_KEY_RE:/^[A-Za-z0-9_-]{43}$/,\n    readDate:call('readDate',() => ControlledDate),\n  };\n  const resources = new Proxy(supplied, {\n    get(target,key) { trace.push(['capture',String(key)]); if (++captures === settings.captureFault) throw fault; return target[key]; },\n    ownKeys() { throw Error('Resource enumeration forbidden'); },\n  });\n  async function run(factory, operation = 'ingest') {\n    let result, caught, didThrow = false;\n    try {\n      const api = factory(resources);\n      assert.deepEqual(Object.keys(api),Object.keys(metadata));\n      for (const [key,length] of Object.entries(metadata)) {\n        assert.equal(api[key].name,key); assert.equal(api[key].length,length);\n        assert.equal(api[key].constructor.name,key === 'ingestSteering' ? 'AsyncFunction' : 'Function');\n      }\n      active = true;\n      if (operation === 'workspace') result = api.workspaceSteering(settings.ws ?? 'ws1');\n      else if (operation === 'write') result = api.writeSteering(principal,settings.valueUndefined ? undefined : Object.hasOwn(settings,'value') ? settings.value : 'on',recorded);\n      else if (operation === 'write-in-tx') { const tx = supplied.tx; result = await tx(() => api.writeSteering(principal,settings.valueUndefined ? undefined : Object.hasOwn(settings,'value') ? settings.value : 'on',recorded)); }\n      else if (operation === 'ingest') result = await api.ingestSteering(principal,device,body);\n      else if (operation === 'counts') result = api.steeringCounts(principal,settings.from ?? null,settings.to ?? null);\n      else throw Error('Unknown operation');\n    } catch (error) { caught = error; didThrow = true; }\n    active = false;\n    const output = {result:normalize(result),error:didThrow ? {\n      thrown:normalize(caught),name:caught?.name,message:caught?.message,code:normalize(caught?.code),status:normalize(caught?.status),\n      sameFault:caught === fault,sameRefusal:caught === lastRefusal,\n    } : null,trace,reads,effects,captures,transactions,commits,rollbacks,\n    tables:Object.fromEntries(['v2_workspaces','v2_sessions','v2_steering_events','v2_audit'].map(table => [table,db.prepare('SELECT * FROM ' + table + ' ORDER BY rowid').all()]))};\n    db.close(); return output;\n  }\n  return {run};\n}\nmodule.exports = {fixture,normalize,resourceNames,metadata,now,recorded,sessionKey,goalId,suggestedId};\n")(name=>{assert(['node:assert/strict','node:crypto','node:sqlite'].includes(name));return require(name);},fixtureModule,fixtureModule.exports);
const semanticModule={exports:{}};
new Function('require','module','exports',"'use strict';\n// Labeled synthetic acceptance controls. No production observations are invented.\nconst {now,sessionKey,goalId,suggestedId} = require('./server-steering-fixture-draft-v2.cjs');\nconst baseEvent = {session_key:sessionKey,goal_id:goalId,suggested_goal_id:suggestedId,share:60,target:20,at:new Date(now).toISOString()};\nconst entry = (operation,settings = {}) => ({operation,settings});\nfunction semanticBatches() {\n  const batches = Array.from({length:6},() => []);\n  for (const steering of ['on','off','ON','',null,0]) {\n    for (const ws of ['ws1','ws2','absent']) batches[0].push(entry('workspace',{steering,ws}));\n    for (const value of ['on','off','ON','',null,0,1,false,true,[],{}]) {\n      for (const operation of ['write','write-in-tx']) batches[0].push(entry(operation,{steering,value}));\n    }\n  }\n  for (const missingWorkspace of [false,true]) {\n    for (const value of ['on','off']) batches[0].push(entry('write',{missingWorkspace,value}));\n    batches[0].push(entry('write',{missingWorkspace,valueUndefined:true}));\n  }\n  batches[1].push(entry('ingest'),entry('ingest',{bodyUndefined:true}));\n  for (const body of [null,false,0,'',[],{}, {events:null},{events:false},{events:0},{events:{}},{events:[]},{events:'events'}]) batches[1].push(entry('ingest',{body}));\n  for (const raw of [null,false,0,'event',[],{},baseEvent]) batches[1].push(entry('ingest',{body:{events:[raw]}}));\n  for (const key of Object.keys(baseEvent)) {\n    for (const value of [null,false,true,0,1,-1,0.5,'',[],{},'bad',101,100]) {\n      batches[1].push(entry('ingest',{body:{events:[{...baseEvent,[key]:value}]}}));\n    }\n    const missing = {...baseEvent}; delete missing[key];\n    batches[1].push(entry('ingest',{body:{events:[missing]}}));\n  }\n  for (const n of [0,1,2,99,100,101]) batches[1].push(entry('ingest',{body:{events:Array.from({length:n},() => ({...baseEvent}))}}));\n  for (const delta of [-14*86400000-1,-14*86400000,-14*86400000+1,-86400000,-1,0,1,300000-1,300000,300000+1]) {\n    for (const session of [{},{device_id:'other'},{user_id:'other'},{state:'stopped'},{state:'suspended'},{ws_id:'ws2'}]) {\n      batches[2].push(entry('ingest',{session,body:{events:[{...baseEvent,at:new Date(now+delta).toISOString()}]}}));\n    }\n  }\n  for (const missingSession of [false,true]) {\n    for (const device of [{},{deviceId:'other'},{user:{id:'other'}}]) batches[2].push(entry('ingest',{missingSession,device}));\n  }\n  for (const share of [0,1,20,99,100]) for (const target of [0,1,20,99,100]) {\n    batches[2].push(entry('ingest',{body:{events:[{...baseEvent,share,target}]}}));\n  }\n  const old = {...baseEvent,at:new Date(now-14*86400000-1).toISOString()};\n  const future = {...baseEvent,at:new Date(now+300001).toISOString()};\n  const unknown = {...baseEvent,session_key:'b'.repeat(43)};\n  for (const events of [[baseEvent,baseEvent],[old,baseEvent,future,unknown],[unknown,old,future],[],[baseEvent,{...baseEvent,at:new Date(now+1).toISOString()}]]) {\n    for (const existingEvents of [[],[{}]]) batches[2].push(entry('ingest',{body:{events},existingEvents}));\n  }\n  const existingEvents = [\n    {at:'2026-11-07T00:00:00.000Z'}, {at:'2026-11-08T23:59:59.999Z'},\n    {at:'2026-11-09T00:00:00.000Z'}, {at:'2026-11-09T12:00:00.000Z'},\n    {ws_id:'ws2',at:'2026-11-09T13:00:00.000Z'},\n  ];\n  for (const from of [null,'2026-11-07T00:00:00.000Z','2026-11-09T00:00:00.000Z','2026-11-10T00:00:00.000Z','']) {\n    for (const to of [null,'2026-11-08T23:59:59.999Z','2026-11-09T12:00:00.000Z','2026-11-10T00:00:00.000Z','']) {\n      for (const steering of ['on','off']) batches[3].push(entry('counts',{from,to,steering,existingEvents}));\n    }\n  }\n  for (const operation of ['workspace','write','write-in-tx','ingest','counts']) {\n    for (const captureFault of [1,5,11]) batches[4].push(entry(operation,{captureFault}));\n  }\n  for (const operation of ['write','write-in-tx','ingest','counts']) {\n    for (const principal of [{wsId:'ws2'},{userId:'other'},{wsRole:'viewer'}]) batches[4].push(entry(operation,{principal}));\n  }\n  for (const operation of ['ingest','counts']) batches[4].push(entry(operation,{denyNeed:true}));\n  for (const refusalValue of [null,false,0,'owned refusal']) {\n    batches[4].push(entry('write',{value:'bad',refusalValue}));\n    batches[4].push(entry('ingest',{body:{events:null},refusalValue}));\n  }\n  for (const sequence of [['on','off'],['off','on'],['on','on'],[null,'off']]) {\n    batches[5].push(entry('write',{sequences:{'pp.wsId':sequence.map(value => value === 'on' ? 'ws1' : 'ws2')}}));\n  }\n  for (const user of ['u1','other']) for (const state of ['shared','suspended','stopped']) {\n    batches[5].push(entry('ingest',{session:{user_id:user,state},body:{events:[baseEvent,old,future,{...baseEvent,at:new Date(now+1).toISOString()}]}}));\n  }\n  for (const n of [0,1,100]) batches[5].push(entry('ingest',{body:{events:Array.from({length:n},(_,i) => ({...baseEvent,at:new Date(now+i).toISOString()}))}}));\n  batches[5].push(entry('ingest',{now:1e20,body:{events:[]}}));\n  return batches;\n}\nconst faultPaths = [\n  entry('write'),entry('write-in-tx'),entry('ingest'),entry('counts',{\n    existingEvents:[{at:'2026-11-08T12:00:00.000Z'},{at:'2026-11-09T12:00:00.000Z'}],\n  }),\n  entry('ingest',{body:{events:[baseEvent,baseEvent]}}),\n  entry('ingest',{body:{events:[baseEvent,{...baseEvent,at:new Date(now+1).toISOString()}]}}),\n  entry('ingest',{session:{device_id:'other'}}),\n];\nmodule.exports = {semanticBatches,faultPaths,baseEvent};\n")(name=>{if(name==='./server-steering-fixture-draft-v2.cjs')return fixtureModule.exports;throw Error('Unexpected semantic dependency '+name);},semanticModule,semanticModule.exports);
const corpusModule={exports:{}};
new Function('require','module','exports',"'use strict';\nconst crypto = require('node:crypto');\nconst {fixture} = require('./server-steering-fixture-draft-v2.cjs');\nconst {semanticBatches} = require('./server-steering-cases-draft-v1.cjs');\nconst plan = require('./server-steering-fault-plan-draft-v1.json');\nfunction entries(batch) {\n  if (batch < 6) return semanticBatches()[batch];\n  const rows = [];\n  const paths = plan.paths.filter((_,i) => (batch === 6 || batch === 8) ? i < 4 : i >= 4);\n  const field = batch < 8 ? 'propertyFault' : 'effectFault';\n  const count = batch < 8 ? 'reads' : 'effects';\n  for (const path of paths) for (let i = 1; i <= path[count]; i++) {\n    rows.push({operation:path.operation,settings:{...path.settings,[field]:i}});\n  }\n  if (batch === 9) for (let captureFault = 1; captureFault <= 11; captureFault++) {\n    rows.push({operation:'ingest',settings:{captureFault}});\n  }\n  return rows;\n}\nasync function run(factory,batch) {\n  const cases = entries(batch), observations = [];\n  for (const item of cases) observations.push(await fixture(item.settings).run(factory,item.operation));\n  return {batch,records:cases.length,sha256:crypto.createHash('sha256').update(JSON.stringify(observations)).digest('hex')};\n}\nmodule.exports = {entries,run};\n")(name=>{if(name==='./server-steering-fixture-draft-v2.cjs')return fixtureModule.exports;if(name==='./server-steering-cases-draft-v1.cjs')return semanticModule.exports;if(name==='./server-steering-fault-plan-draft-v1.json')return {"schema":"align/steering-private-original-fault-plan@1","observed_utc":"2026-11-09T15:11:45.590886+00:00","basis":"server-steering.characterization-bootstrap-macos-v1.json","source_and_AST_facade_equal_before_freeze":true,"paths":[{"operation":"write","settings":{},"reads":6,"effects":3,"captures":11},{"operation":"write-in-tx","settings":{},"reads":6,"effects":4,"captures":11},{"operation":"ingest","settings":{},"reads":29,"effects":9,"captures":11},{"operation":"counts","settings":{"existingEvents":[{"at":"2026-11-08T12:00:00.000Z"},{"at":"2026-11-09T12:00:00.000Z"}]},"reads":9,"effects":3,"captures":11},{"operation":"ingest","settings":{"body":{"events":[{"session_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","goal_id":"g_aaaaaaaaaaaaaaaaaaaaaaaa","suggested_goal_id":"g_bbbbbbbbbbbbbbbbbbbbbbbb","share":60,"target":20,"at":"2026-11-09T12:00:00.000Z"},{"session_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","goal_id":"g_aaaaaaaaaaaaaaaaaaaaaaaa","suggested_goal_id":"g_bbbbbbbbbbbbbbbbbbbbbbbb","share":60,"target":20,"at":"2026-11-09T12:00:00.000Z"}]}},"reads":53,"effects":13,"captures":11},{"operation":"ingest","settings":{"body":{"events":[{"session_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","goal_id":"g_aaaaaaaaaaaaaaaaaaaaaaaa","suggested_goal_id":"g_bbbbbbbbbbbbbbbbbbbbbbbb","share":60,"target":20,"at":"2026-11-09T12:00:00.000Z"},{"session_key":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","goal_id":"g_aaaaaaaaaaaaaaaaaaaaaaaa","suggested_goal_id":"g_bbbbbbbbbbbbbbbbbbbbbbbb","share":60,"target":20,"at":"2026-11-09T12:00:00.001Z"}]}},"reads":53,"effects":13,"captures":11},{"operation":"ingest","settings":{"session":{"device_id":"other"}},"reads":24,"effects":7,"captures":11}],"synthetic_controls_labeled":true,"source_authority_transferred":false};assert(['node:assert/strict','node:crypto','node:sqlite'].includes(name));return require(name);},corpusModule,corpusModule.exports);
const corpus=corpusModule.exports,PLANS=[{"index":0,"golden":{"batch":0,"records":156,"sha256":"69c2719e22cd0a8acb502394c088f09fc9960c33f658e6f843c9cffce3b142e2"}},{"index":1,"golden":{"batch":1,"records":111,"sha256":"9b5254e80e44d199ef440bad718bcfd923807c84350cdf2057806754f80f275d"}},{"index":2,"golden":{"batch":2,"records":101,"sha256":"f8e238f8d89bde36ee6b669da1309d017ee9a5c99d9241ea398a0569bf250560"}},{"index":3,"golden":{"batch":3,"records":50,"sha256":"6d0646d724aabeb21d4acea3a7042c86439f01d8b922536f1f7b884c1bbc087b"}},{"index":4,"golden":{"batch":4,"records":37,"sha256":"19380cbc489b0f4007e7f261e663f4b2d61b76ca4dfbd60341637ebcf53c64ae"}},{"index":5,"golden":{"batch":5,"records":14,"sha256":"a2a0fd3e94f4ae92b9efc1651ad50ce7f0666bd97c273f83f108217ad9d91ae5"}},{"index":6,"golden":{"batch":6,"records":50,"sha256":"389a232e78bd19a280ff22e7c7ebb518e3cb8b8b8529d272a299d0b65aa495f7"}},{"index":7,"golden":{"batch":7,"records":130,"sha256":"7bb3956717d30827f54de48504cf7176ac735cc0c7d232dbe453e0e951cd7148"}},{"index":8,"golden":{"batch":8,"records":19,"sha256":"0059d34fb60c0f966c4505d3a0116a78670508830c564a00ccb5bc4c91245e59"}},{"index":9,"golden":{"batch":9,"records":44,"sha256":"5834dab1983735198470ee6606bbd08fe4d34a6e7db7c37219c31fa481302426"}}],CAPABILITIES=["server-steering.create-steering"],SYMBOLS=['create_steering'];
const CASE_IDS=PLANS.map((_p,i)=>CAPABILITIES[0]+'-'+String(i+1).padStart(3,'0'));
function factoryAt(root){
 const files=[path.join(root,'server_steering/create_steering.js'),path.join(root,'source/server_steering/create_steering.js')].filter(name=>fs.existsSync(name));
 assert.equal(files.length,1,'Exact generated module missing or ambiguous');const file=files[0];assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());
 const pkg=path.dirname(file),directory=fs.lstatSync(pkg);
 assert(directory.isDirectory()&&!directory.isSymbolicLink(),'Native package directory must be regular');
 assert.deepEqual(fs.readdirSync(pkg).sort(),['create_steering.js','package.json'],'Exact native package members');
 for(const name of ['create_steering.js','package.json']){const stat=fs.lstatSync(path.join(pkg,name));assert(stat.isFile()&&!stat.isSymbolicLink(),'Native package members must be regular files');}
 const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8'));
 assert.equal(manifest.name,'server_steering');assert.equal(manifest.type,'commonjs');
 assert.deepEqual(manifest.exports,{'./create_steering':'./create_steering.js'});
 const blocked=()=>{throw Error('Forbidden ambient generated effect');};
 const context=vm.createContext({Date:blocked,fetch:blocked,process:new Proxy({},{get:blocked}),console:new Proxy({},{get:blocked}),setTimeout:blocked,setInterval:blocked,Buffer:undefined},{codeGeneration:{strings:false,wasm:false}});
 new vm.Script('Math.random=()=>{throw Error("Forbidden ambient randomness")};').runInContext(context,{timeout:1000});
 const module={exports:{}};
 new vm.Script('(function(exports,module,require){"use strict";\n'+fs.readFileSync(file,'utf8')+'\n})',{filename:'create_steering.js'}).runInContext(context,{timeout:1000})(module.exports,module,blocked);
 assert.deepEqual(Object.keys(module.exports),['create_steering']);const factory=module.exports.create_steering;
 assert.equal(typeof factory,'function');assert.equal(factory.name,'create_steering');assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');return factory;
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
