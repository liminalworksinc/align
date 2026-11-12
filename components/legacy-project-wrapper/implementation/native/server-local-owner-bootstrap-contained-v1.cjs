'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"1cd4ba2366fcddc59af76abcb1db1853b692e0bb342fedcf610e49c564c5becf","package":"server_local_owner_bootstrap","package_files":["create_local_owner_bootstrap.js","package.json"],"maximum_cases":2,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Private original-free local owner acceptance harness.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const FILES={"server-local-owner-observer-v3.mjs": "// Independent public observations. This module contains no original implementation.\nimport assert from 'node:assert/strict';\nimport crypto from 'node:crypto';\n\nexport const RESOURCE_NAMES=['config','get','localOwnerEmail','getAuth','getHeadersConstructor','readPort','getConsole'];\nconst NativeHeaders=globalThis.Headers;\nconst SQL='SELECT 1 AS x FROM ba_user LIMIT 1';\nconst successful=['config','hosted.get','get','email','auth','context.get','adapter.get','create.get','create.call','api.get','otp.get','headers.get','port','headers.new','otp.call'];\nconst deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};\nconst tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};\nfunction environment(initial={}){\n  const options={...initial},trace=[],creates=[],sends=[],logs=[];\n  const marker=Object.freeze({failure:'opaque-local-owner-failure'});\n  const waiting={context:deferred(),create:deferred(),otp:deferred()};\n  const email=options.email??'owner@example.test';\n  function step(name){trace.push(name);if(options.fault===name)throw marker;}\n  const adapter={get createUser(){step('create.get');return function(user,control){\n    assert.equal(this,adapter);step('create.call');assert.equal(arguments.length,2);\n    assert.deepEqual(Object.keys(user).sort(),['email','emailVerified','name']);assert.equal(user.email,email);assert.equal(user.name,'Local owner');assert.equal(user.emailVerified,true);assert.deepEqual(Object.keys(control),['method']);assert.equal(control.method,'admin');\n    creates.push({user,control});if(options.fault==='create.reject')return Promise.reject(marker);\n    return options.pending==='create'?waiting.create.promise:Promise.resolve({ignored:'created'});\n  };}};\n  const context={get internalAdapter(){step('adapter.get');return adapter;}};\n  const api={get sendVerificationOTP(){step('otp.get');return function(argument){\n    assert.equal(this,api);step('otp.call');assert.equal(arguments.length,1);\n    assert.deepEqual(Object.keys(argument).sort(),['body','headers']);assert.deepEqual(Object.keys(argument.body).sort(),['email','type']);assert.equal(argument.body.email,email);assert.equal(argument.body.type,'sign-in');\n    assert(argument.headers instanceof NativeHeaders);sends.push(argument);\n    if(options.fault==='otp.reject')return Promise.reject(marker);\n    return options.pending==='otp'?waiting.otp.promise:Promise.resolve({ignored:'sent'});\n  };}};\n  const auth={get $context(){step('context.get');\n    if(options.fault==='context.reject')return Promise.reject(marker);\n    return options.pending==='context'?waiting.context.promise:Promise.resolve(context);\n  },get api(){step('api.get');return api;}};\n  class ObservedHeaders extends NativeHeaders{constructor(value){step('headers.new');assert.deepEqual(Object.keys(value),['host']);super(value);}}\n  const logger={get error(){step('logger.error.get');return function(message){\n    assert.equal(this,logger);step('logger.error.call');assert.equal(arguments.length,1);\n    assert.equal(message,`Align could not print a sign-in code for ${email}. Run npm run sign-in-link to get one.`);logs.push(message);\n  };}};\n  const resources={\n    config(){assert.equal(this,undefined);assert.equal(arguments.length,0);step('config');return {get hosted(){step('hosted.get');return options.hosted??false;}};},\n    get(sql){assert.equal(this,undefined);step('get');assert.equal(arguments.length,1);assert.equal(sql,SQL);return options.existing;},\n    localOwnerEmail(){assert.equal(this,undefined);assert.equal(arguments.length,0);step('email');return email;},\n    getAuth(){assert.equal(this,undefined);assert.equal(arguments.length,0);step('auth');return auth;},\n    getHeadersConstructor(){assert.equal(this,undefined);assert.equal(arguments.length,0);step('headers.get');return ObservedHeaders;},\n    readPort(){assert.equal(this,undefined);assert.equal(arguments.length,0);step('port');return options.port;},\n    getConsole(){assert.equal(this,undefined);assert.equal(arguments.length,0);step('logger.get');return logger;},\n  };\n  return {options,resources,trace,creates,sends,logs,marker,waiting,context,adapter,api,auth,logger};\n}\nexport async function observeLocalOwner(create){\n  assert.equal(typeof create,'function');const records=[];\n  const record=(id,w)=>records.push({id,trace:[...w.trace],created:w.creates.length,sent:w.sends.length,logged:w.logs.length,hosts:w.sends.map(item=>item.headers.get('host'))});\n  for(const [id,options,expected] of [\n    ['hosted',{hosted:true},['config','hosted.get']],\n    ['hosted-with-existing',{hosted:true,existing:{}},['config','hosted.get']],\n    ['hosted-truthy',{hosted:'configured'},['config','hosted.get']],\n    ['existing-object',{existing:{}},['config','hosted.get','get']],\n    ['existing-true',{existing:true},['config','hosted.get','get']],\n  ]){const w=environment(options);assert.equal(await create(w.resources).ensureLocalOwner(),undefined);assert.deepEqual(w.trace,expected);record(id,w);}\n  for(const [id,port,expected] of [['unset',undefined,'3100'],['empty','','3100'],['explicit','4801','4801'],['zero','0','0'],['leading-zero','04801','04801']]){\n    const w=environment({port}),api=create(w.resources);assert.deepEqual(Object.keys(api),['ensureLocalOwner']);\n    assert.equal(api.ensureLocalOwner.length,0);assert.equal(api.ensureLocalOwner.constructor.name,'AsyncFunction');\n    const detached=api.ensureLocalOwner;assert.equal(await detached(),undefined);assert.deepEqual(w.trace,successful);\n    assert.equal(w.creates.length,1);assert.equal(w.sends.length,1);assert.equal(w.logs.length,0);\n    assert.equal(w.sends[0].headers.get('host'),'127.0.0.1:'+expected);record('port-'+id,w);\n  }\n  for(const email of ['Owner+demo@example.test','another@example.test']){const w=environment({email});await create(w.resources).ensureLocalOwner();assert.deepEqual(w.trace,successful);record('email-'+email,w);}\n  for(const existing of [undefined,null,false,0,'']){const w=environment({existing});await create(w.resources).ensureLocalOwner();assert.deepEqual(w.trace,successful);record('absent-'+String(existing),w);}\n  for(const stage of ['config','hosted.get','get','email','auth','context.get','context.reject','adapter.get','create.get','create.call','create.reject','api.get']){\n    const w=environment({fault:stage});let caught=false;try{await create(w.resources).ensureLocalOwner();}catch(error){caught=true;assert.equal(error,w.marker);}\n    assert(caught,stage);assert.equal(w.logs.length,0);assert(!w.trace.includes('logger.get'));record('propagate-'+stage,w);\n  }\n  for(const stage of ['otp.get','headers.get','port','headers.new','otp.call','otp.reject']){\n    const w=environment({fault:stage});assert.equal(await create(w.resources).ensureLocalOwner(),undefined);assert.equal(w.logs.length,1);\n    assert.deepEqual(w.trace.slice(-3),['logger.get','logger.error.get','logger.error.call']);record('caught-'+stage,w);\n  }\n  for(const stage of ['logger.get','logger.error.get','logger.error.call']){\n    const w=environment({fault:'otp.call'});\n    if(stage==='logger.get')w.resources.getConsole=function(){w.trace.push(stage);throw w.marker;};\n    else {const logger={get error(){w.trace.push('logger.error.get');if(stage==='logger.error.get')throw w.marker;return function(){assert.equal(this,logger);w.trace.push('logger.error.call');throw w.marker;};}};w.resources.getConsole=function(){w.trace.push('logger.get');return logger;};}\n    let caught=false;try{await create(w.resources).ensureLocalOwner();}catch(error){caught=true;assert.equal(error,w.marker);}assert(caught);record('reporter-propagate-'+stage,w);\n  }\n  for(const stage of ['context','create','otp']){\n    const w=environment({pending:stage});let settled=false;const promise=create(w.resources).ensureLocalOwner();promise.then(()=>{settled=true;},()=>{settled=true;});\n    try{await tick();assert.equal(settled,false);if(stage==='context')assert(!w.trace.includes('adapter.get'));if(stage==='create')assert(!w.trace.includes('api.get'));if(stage==='otp')assert.equal(w.sends.length,1);}\n    finally{w.waiting[stage].resolve(stage==='context'?w.context:undefined);}\n    assert.equal(await promise,undefined);assert.deepEqual(w.trace,successful);record('wait-'+stage,w);\n  }\n  {\n    const w=environment(),api=create(w.resources);await api.ensureLocalOwner();w.options.existing={x:1};await api.ensureLocalOwner();\n    w.options.hosted=true;await api.ensureLocalOwner();assert.deepEqual(w.trace,[...successful,'config','hosted.get','get','config','hosted.get']);\n    assert.equal(w.creates.length,1);record('live-presence-and-hosting',w);\n  }\n  {\n    const w=environment({fault:'otp.reject'}),api=create(w.resources);await api.ensureLocalOwner();w.options.existing={x:1};await api.ensureLocalOwner();\n    assert.equal(w.creates.length,1);assert.equal(w.logs.length,1);assert.equal(w.sends.length,1);record('created-account-prevents-code-retry',w);\n  }\n  {\n    const w=environment({pending:'context'}),api=create(w.resources);const one=api.ensureLocalOwner(),two=api.ensureLocalOwner();\n    await tick();assert.equal(w.trace.filter(x=>x==='context.get').length,2);assert.equal(w.creates.length,0);\n    w.waiting.context.resolve(w.context);await Promise.all([one,two]);assert.equal(w.creates.length,2);assert.equal(w.sends.length,2);record('concurrent-calls-not-coalesced',w);\n  }\n  for(const [id,alter,reported] of [\n    ['null-config',w=>{w.resources.config=()=>null;},false],\n    ['undefined-auth',w=>{w.resources.getAuth=()=>undefined;},false],\n    ['null-context',w=>{w.resources.getAuth=()=>({$context:Promise.resolve(null)});},false],\n    ['missing-adapter',w=>{w.resources.getAuth=()=>({$context:Promise.resolve({})});},false],\n    ['noncallable-create',w=>{w.resources.getAuth=()=>({$context:Promise.resolve({internalAdapter:{createUser:null}})});},false],\n    ['null-api',w=>{w.resources.getAuth=()=>({$context:Promise.resolve(w.context),api:null});},true],\n    ['noncallable-endpoint',w=>{w.resources.getAuth=()=>({$context:Promise.resolve(w.context),api:{sendVerificationOTP:null}});},true],\n    ['nonconstructable-headers',w=>{w.resources.getHeadersConstructor=()=>null;},true],\n    ['invalid-header-value',w=>{w.options.port='4801\\ninvalid';},true],\n  ]){\n    const w=environment();alter(w);let error;try{assert.equal(await create(w.resources).ensureLocalOwner(),undefined);}catch(thrown){error=thrown;}\n    if(reported){assert.equal(error,undefined);assert.equal(w.logs.length,1);}else{assert(error&&typeof error==='object');assert.equal(error.name,'TypeError');assert.equal(w.logs.length,0);}record('provider-shape-'+id,w);\n  }\n  {\n    const w=environment({port:'4801'}),api=create(w.resources);await api.ensureLocalOwner();w.options.port='4802';await api.ensureLocalOwner();\n    assert.deepEqual(w.sends.map(item=>item.headers.get('host')),['127.0.0.1:4801','127.0.0.1:4802']);record('live-port-on-each-invocation',w);\n  }\n  for(const marker of [undefined,null,0,'opaque-failure']){\n    const w=environment();w.resources.config=function(){w.trace.push('config');throw marker;};\n    let caught=false;try{await create(w.resources).ensureLocalOwner();}catch(error){caught=true;assert.equal(error,marker);}\n    assert(caught);assert.equal(w.logs.length,0);record('opaque-failure-'+String(marker),w);\n  }\n  const captureWorld=environment(),reads=[];\n  const owned={};for(const name of RESOURCE_NAMES)Object.defineProperty(owned,name,{get(){reads.push(name);return captureWorld.resources[name];}});\n  Object.defineProperty(owned,'privateWorld',{get(){throw new Error('unrelated resource was read');}});\n  const resources=new Proxy(owned,{ownKeys(){throw new Error('resources were enumerated');}});\n  const api=create(resources);assert.deepEqual(reads,RESOURCE_NAMES);assert.deepEqual(captureWorld.trace,[]);\n  for(const name of RESOURCE_NAMES)captureWorld.resources[name]=()=>{throw new Error('resource alias was re-read');};\n  await api.ensureLocalOwner();assert.deepEqual(reads,RESOURCE_NAMES);assert.deepEqual(captureWorld.trace,successful);record('captured-once-in-order-no-eager-calls',captureWorld);\n  return {records,public_observations:records.length,resource_bindings:RESOURCE_NAMES.length,observations_sha256:crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex')};\n}\n", "server-local-owner-bindings-v1.mjs": "// Public construction and failure identity checks without an original implementation.\nimport assert from 'node:assert/strict';\nexport const RESOURCE_NAMES=['config','get','localOwnerEmail','getAuth','getHeadersConstructor','readPort','getConsole'];\nexport function acceptLocalOwnerBindings(create){\n  assert.equal(typeof create,'function');assert.equal(create.name,'create_local_owner_bootstrap');assert.equal(create.length,1);assert.equal(create.constructor.name,'Function');\n  const observations=[];\n  for(const failing of RESOURCE_NAMES){\n    const marker=Object.freeze({failing}),reads=[],resources={};\n    for(const name of RESOURCE_NAMES)Object.defineProperty(resources,name,{get(){reads.push(name);if(name===failing)throw marker;return ()=>{assert.fail('Construction-time resource call');};}});\n    let caught=false;try{create(resources);}catch(error){caught=true;assert.equal(error,marker);}\n    assert(caught);assert.deepEqual(reads,RESOURCE_NAMES.slice(0,RESOURCE_NAMES.indexOf(failing)+1));observations.push({failing,reads,identity_preserved:true});\n  }\n  const reads=[],resources={};\n  for(const name of RESOURCE_NAMES)Object.defineProperty(resources,name,{get(){reads.push(name);return ()=>{assert.fail('Construction-time resource call');};}});\n  const api=create(new Proxy(resources,{ownKeys(){assert.fail('Resource enumeration');}}));\n  assert.deepEqual(reads,RESOURCE_NAMES);assert(api&&typeof api==='object');assert.deepEqual(Reflect.ownKeys(api),['ensureLocalOwner']);\n  const descriptor=Object.getOwnPropertyDescriptor(api,'ensureLocalOwner');assert.equal(descriptor.get,undefined);\n  assert.equal(api.ensureLocalOwner.name,'ensureLocalOwner');assert.equal(api.ensureLocalOwner.length,0);assert.equal(api.ensureLocalOwner.constructor.name,'AsyncFunction');assert.equal(api.ensureLocalOwner,api.ensureLocalOwner);\n  return {factory:'create_local_owner_bootstrap',public_function:'ensureLocalOwner',capture_failures:observations,construction:{resource_reads:reads,services_called:0,namespace_keys:['ensureLocalOwner'],operation_arity:0,operation_async:true}};\n}\n"};
const loader=(()=>{const module={exports:{}};const exports=module.exports;'use strict';
// Private module conformance guards. This is not a security sandbox.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const CONTRACT={capability:'server-local-owner-bootstrap.create-local-owner-bootstrap',module:'server_local_owner_bootstrap/create_local_owner_bootstrap',symbol:'create_local_owner_bootstrap'};
function moduleLoader(root, context, refused) {
  const common = new Map(), modules = new Map();
  function inside(file) {
    const relative = path.relative(root, file);
    assert(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Import escapes candidate root');
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      assert(!fs.lstatSync(current).isSymbolicLink(), 'Candidate import symlink');
    }
    return file;
  }
  function resolve(specifier, parent) {
    if (!(specifier.startsWith('./') || specifier.startsWith('../'))) return refused('import ' + specifier);
    const stem = path.resolve(path.dirname(parent), specifier);
    const file = [stem, stem + '.js', stem + '.mjs', stem + '.cjs', stem + '.json', path.join(stem, 'index.js')]
      .find(name => fs.existsSync(name) && fs.statSync(name).isFile());
    assert(file, 'Missing candidate module: ' + specifier);
    return inside(file);
  }
  function esm(file, code) {
    if (file.endsWith('.mjs')) return true;
    if (file.endsWith('.cjs') || file.endsWith('.json')) return false;
    for (let directory = path.dirname(file); ; directory = path.dirname(directory)) {
      const manifest = path.join(directory, 'package.json');
      if (fs.existsSync(manifest)) {
        const type = JSON.parse(fs.readFileSync(manifest, 'utf8')).type;
        if (type === 'module') return true;
        if (type === 'commonjs') return false;
      }
      if (directory === root) break;
    }
    return /^\s*(?:import|export)\b/m.test(code);
  }
  function loadCommon(file) {
    if (common.has(file)) return common.get(file).exports;
    const code = fs.readFileSync(inside(file), 'utf8');
    if (file.endsWith('.json')) {
      const value = JSON.parse(code); common.set(file, { exports: value }); return value;
    }
    assert(!esm(file, code), 'Synchronous require of ESM is outside this target');
    const module = { exports: {} }; common.set(file, module);
    const wrapper = new vm.Script('(function(module,exports,require,__filename,__dirname){\n' + code + '\n})', {
      filename: file, importModuleDynamically: () => refused('dynamic import'),
    }).runInContext(context);
    wrapper(module, module.exports, name => loadCommon(resolve(name, file)), file, path.dirname(file));
    return module.exports;
  }
  function asModule(file) {
    if (modules.has(file)) return modules.get(file);
    const code = fs.readFileSync(inside(file), 'utf8');
    let module;
    if (esm(file, code)) module = new vm.SourceTextModule(code, { context, identifier: file,
      importModuleDynamically: () => refused('dynamic import') });
    else {
      const values = loadCommon(file);
      const names = file.endsWith('.json') ? ['default'] : [...new Set([...Object.keys(values), 'default'])];
      module = new vm.SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, name === 'default' ? values : values[name]);
      }, { context, identifier: file });
    }
    modules.set(file, module);
    return module;
  }
  return async (entry, symbol) => {
    const module = asModule(entry);
    if (module.status === 'unlinked') await module.link((name, parent, extra) => {
      const file = resolve(name, parent.identifier);
      if (file.endsWith('.json')) assert.equal(extra?.attributes?.type ?? extra?.assert?.type, 'json');
      return asModule(file);
    });
    if (module.status === 'linked') await module.evaluate();
    const factory = module.namespace[symbol];
    assert.equal(typeof factory, 'function', 'Missing named factory');
    assert.equal(factory.name, symbol); assert.equal(factory.length, 1);
    assert.equal(factory.constructor.name, 'Function');
    return factory;
  };
}

function guardedContext(refused) {
  const context = vm.createContext({ __refuseIdentityEffectsEffect: refused, Error, TypeError, RangeError, SyntaxError }, { codeGeneration: { strings: false, wasm: false } });
  // These are conformance guards, not a security sandbox.
  vm.runInContext(`
    Object.defineProperty(Math, 'random', {get(){return __refuseIdentityEffectsEffect('Math.random');},set(){return __refuseIdentityEffectsEffect('Math.random mutation');}});
    for (const name of ['__identityEffectsForbiddenState','URL','Request','Headers','Date','fetch','AbortSignal','URLSearchParams','console','process','performance','crypto','WebAssembly','Buffer','setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','clearImmediate','queueMicrotask','WebSocket','eval','Function','global']) {
      Object.defineProperty(globalThis,name,{get(){return __refuseIdentityEffectsEffect(name);},set(){return __refuseIdentityEffectsEffect(name+' assignment');}});
    }
  `, context);
  return context;
}
function sourceRoot(input){
 const root=path.resolve(input);assert(fs.statSync(root).isDirectory());assert(!fs.lstatSync(root).isSymbolicLink());
 const roots=[root,path.join(root,'source')].filter(item=>fs.existsSync(item)&&fs.statSync(item).isDirectory());
 const matches=roots.filter(item=>['.js','.cjs','.mjs'].some(ext=>fs.existsSync(path.join(item,CONTRACT.module+ext))));
 assert.equal(matches.length,1,'Exactly one direct source or artifact/source root required');assert(!fs.lstatSync(matches[0]).isSymbolicLink());return matches[0];
}
async function loadCandidate(input,surface){
 const root=sourceRoot(input);
 if(surface){const matches=surface.capabilities.filter(item=>item.capability===CONTRACT.capability);assert.equal(matches.length,1);assert.equal(matches[0].module,CONTRACT.module);assert.deepEqual(matches[0].symbols,[CONTRACT.symbol]);}
 const entries=['.js','.cjs','.mjs'].map(ext=>path.join(root,CONTRACT.module+ext)).filter(file=>fs.existsSync(file));assert.equal(entries.length,1);
 const effects=[],refused=name=>{effects.push(name);throw new Error('Undeclared local owner effect: '+name);};
 const context=guardedContext(refused),read=moduleLoader(root,context,refused),factory=await read(entries[0],CONTRACT.symbol);
 const audit=()=>assert.deepEqual(effects,[],'Caught undeclared effects remain audited');audit();return {factory,audit};
}
module.exports={CONTRACT,moduleLoader,guardedContext,sourceRoot,loadCandidate};

return module.exports;})();
const CAPABILITIES=['server-local-owner-bootstrap.create-local-owner-bootstrap'];
const PLANS=[{kind:'factory-bindings',capability:CAPABILITIES[0]},{kind:'public-order-waits-and-errors',capability:CAPABILITIES[0]}];
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const digest=value=>({sha256:crypto.createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')});
async function runSelected(root,surface,selected){
 assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
 const indices=selected.map(item=>{assert(Array.isArray(item.arguments)&&item.arguments.length===1);const index=item.arguments[0];assert(Number.isSafeInteger(index)&&PLANS[index]);assert.equal(item.capability,PLANS[index].capability);assert.equal(typeof item.case_id,'string');return index;});
 assert.equal(new Set(indices).size,indices.length);assert.equal(new Set(selected.map(item=>item.case_id)).size,selected.length);
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'local-owner-verifier-'));let passed=false;
 try{
  for(const [name,content]of Object.entries(FILES))fs.writeFileSync(path.join(temporary,name),content,{flag:'wx'});
  const {pathToFileURL}=require('node:url');
  const observer=await import(pathToFileURL(path.join(temporary,'server-local-owner-observer-v3.mjs')).href);
  const bindings=await import(pathToFileURL(path.join(temporary,'server-local-owner-bindings-v1.mjs')).href);
  const results=[];
  for(let position=0;position<indices.length;position++){
   const candidate=await loader.loadCandidate(path.resolve(root),surface);
   const value=indices[position]===0?bindings.acceptLocalOwnerBindings(candidate.factory):await observer.observeLocalOwner(candidate.factory);
   candidate.audit();results.push({case_id:selected[position].case_id,capability:CAPABILITIES[0],result:digest(value)});
  }
  passed=true;return results;
 }finally{if(passed)fs.rmSync(temporary,{recursive:true});}
}
async function main(){const args=process.argv.slice(2);assert.equal(args.length,3);const cases=await runSelected(args[0],JSON.parse(args[1]),JSON.parse(args[2]));process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n');}
module.exports={CAPABILITIES,PLANS,runSelected,digest,loader};
if(require.main===module){if(typeof vm.SourceTextModule!=='function'){const result=require('node:child_process').spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules',__filename,...process.argv.slice(2)],{stdio:'inherit',timeout:240000});if(result.error)throw result.error;process.exit(result.status??1);}main().catch(error=>{console.error(error);process.exitCode=1;});}
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
