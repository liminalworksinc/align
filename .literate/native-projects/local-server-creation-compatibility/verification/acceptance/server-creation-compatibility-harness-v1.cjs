'use strict';
// Independent private test code, in readable source. The original route implementations are excluded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/server-creation-compatibility/driver.cjs
modules["/__private__/server-creation-compatibility/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Private verifier. Original implementations are loaded only in source mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function relativeFile(root, relative, routeSegments = false) {
  assert.equal(typeof relative, 'string');
  assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':'));
  const parts = relative.split('/');
  assert(parts.every(part => (/^[A-Za-z0-9_.-]+$/.test(part) || (routeSegments && /^\[(?:\.\.\.)?[A-Za-z0-9_]+\]$/.test(part))) && part !== '.' && part !== '..'));
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Private verifier input must not be a symlink');
    assert(i === parts.length - 1 ? stat.isFile() : stat.isDirectory());
  }
  return current;
}
function pinned(root, relative, hash, routeSegments = false) {
  const file = relativeFile(root, relative, routeSegments);
  const bytes = fs.readFileSync(file);
  assert(bytes.length <= 8 * 1024 * 1024);
  assert.equal(digest(bytes), hash, 'Private input changed: ' + relative);
  return {file, bytes};
}
function prepare(root, relative, hash) {
  const input = pinned(root, relative, hash);
  const manifest = JSON.parse(input.bytes);
  assert.equal(manifest.schema, 'align/readable-private-qualification@1');
  const files = new Map();
  for (const item of manifest.files) {
    assert(!files.has(item.name));
    const loaded = pinned(root, item.path, item.sha256);
    assert.equal(loaded.bytes.length, item.size);
    files.set(item.name, loaded);
  }
  return {manifest, files};
}
function candidatePackage(root, manifest) {
  const matches = [path.join(root, manifest.package), path.join(root, 'source', manifest.package)].filter(file => fs.existsSync(file));
  assert.equal(matches.length, 1, 'Expected exactly one generated package');
  const directory = matches[0];
  assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
  assert.deepEqual(fs.readdirSync(directory).sort(), [...manifest.package_files].sort());
  for (const name of manifest.package_files) relativeFile(directory, name);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  assert.equal(metadata.name, manifest.package);
  assert.equal(metadata.type, 'commonjs');
  assert.deepEqual(metadata.exports, manifest.package_exports);
  return directory;
}
function factoryFromBytes(bytes, symbol) {
  const blocked = () => { throw Error('Forbidden ambient generated effect'); };
  const context = vm.createContext({Date: blocked, process: new Proxy({}, {get: blocked}), console: new Proxy({}, {get: blocked}), fetch: blocked, setInterval: blocked, setTimeout: blocked, Buffer: undefined}, {codeGeneration: {strings: false, wasm: false}});
  new vm.Script('Math.random=()=>{throw Error("Forbidden ambient randomness")};').runInContext(context, {timeout: 1000});
  const module = {exports: {}};
  new vm.Script('(function(exports,module,require){"use strict";\n' + bytes.toString('utf8') + '\n})', {filename: symbol + '.js'}).runInContext(context, {timeout: 1000})(module.exports, module, blocked);
  assert.deepEqual(Object.keys(module.exports), [symbol]);
  const factory = module.exports[symbol];
  assert.equal(typeof factory, 'function');
  assert.equal(factory.name, symbol);
  assert.equal(factory.length, 1);
  assert.equal(factory.constructor.name, 'Function');
  return factory;
}
function corpus(capability, files) {
  const get = name => {
    assert(files.has(name), 'Undeclared private corpus input');
    return require(files.get(name).file);
  };
  const fixture = get(capability.fixture);
  const characterization = get(capability.characterization);
  const semantic = capability.cases ? get(capability.cases).semanticBatches() : [fixture.semanticCases()];
  const properties = [], effects = [];
  for (const entry of characterization.fault_paths) {
    let settings = entry.settings;
    if (capability.fault_settings_codec === 'semantic-label@1') {
      const matches = semantic.flat().filter(item => item.operation === entry.operation && item.settings.label === entry.settings.label);
      assert.equal(matches.length, 1, 'Fault settings require one immutable semantic case');
      assert.deepEqual(JSON.parse(JSON.stringify(matches[0].settings)), entry.settings);
      settings = matches[0].settings;
    }
    for (let propertyFault = 1; propertyFault <= entry.reads; propertyFault++) properties.push(capability.runner ? {...settings, propertyFault} : {operation: entry.operation, settings: {...settings, propertyFault}});
    for (let effectFault = 1; effectFault <= entry.effects; effectFault++) effects.push(capability.runner ? {...settings, effectFault} : {operation: entry.operation, settings: {...settings, effectFault}});
  }
  for (let captureFault = 1; captureFault <= capability.resource_count; captureFault++) effects.push(capability.runner ? {captureFault} : {operation: capability.default_operation, settings: {captureFault}});
  semantic.push(properties, effects);
  assert.deepEqual(semantic.map(entries => entries.length), characterization.batches.map(item => item.records));
  return {fixture, batches: semantic, characterization};
}
function withPublicConstants(factory, constants) {
  return resources => {
    const api = factory(resources);
    for (const name of ['LOI_EVENTS', 'FUNNEL', 'WAW_WEEKS']) {
      assert.deepEqual(JSON.parse(JSON.stringify(api[name])), constants[name]);
      if (name !== 'WAW_WEEKS') {
        assert.strictEqual(api[name], api[name]);
        assert(!Object.isFrozen(api[name]));
      }
    }
    return api;
  };
}
async function runBatch(factory, capability, batch, files) {
  const {fixture, batches, characterization} = corpus(capability, files);
  assert(Number.isSafeInteger(batch) && batch >= 0 && batch < batches.length);
  if (capability.constant_data) {
    const constants = JSON.parse(files.get(capability.constant_data).bytes).constants;
    factory = withPublicConstants(factory, constants);
  }
  const hash = crypto.createHash('sha256');
  for (const entry of batches[batch]) {
    const value = capability.runner ? await fixture.fixture(entry).run(factory) : await fixture.fixture(entry.settings).run(factory, entry.operation);
    hash.update(JSON.stringify(value) + '\n');
  }
  const actual = {batch, records: batches[batch].length, sha256: hash.digest('hex')};
  assert.deepEqual(actual, characterization.batches[batch], 'Frozen original observations differ');
  return actual;
}
async function main(args, repository) {
  const [mode, manifestPath, manifestHash, ...rest] = args;
  assert(['build','source','generated'].includes(mode));
  const {manifest, files} = prepare(repository, manifestPath, manifestHash);
  if (mode === 'build') {
    assert.equal(rest.length, 0);
    const directory = candidatePackage(process.cwd(), manifest);
    for (const name of manifest.package_files.filter(file => file.endsWith('.js'))) {
      const result = cp.spawnSync(process.execPath, ['--check', path.join(directory, name)], {encoding: 'utf8', timeout: 30000});
      assert.equal(result.status, 0, result.stderr);
    }
    console.log(JSON.stringify({schema: 'align/readable-private-package-build@1', passed: true, files: manifest.package_files.length}));
    return;
  }
  const expected = mode === 'source' ? 3 : 1;
  assert.equal(rest.length, expected);
  const [index] = JSON.parse(rest.at(-1));
  assert(Number.isSafeInteger(index) && index >= 0 && index < manifest.plans.length);
  const plan = manifest.plans[index];
  const capability = manifest.capabilities.find(item => item.id === plan.capability);
  assert(capability);
  let bytes;
  if (mode === 'source') {
    const references = JSON.parse(pinned(repository, rest[0], rest[1]).bytes);
    assert.equal(references.schema, 'align/private-original-reference@1');
    const record = references.factories.find(item => item.symbol === capability.symbol);
    assert(record);
    for (const source of references.raw_sources) pinned(process.cwd(), source.path, source.sha256, true);
    bytes = pinned(repository, record.path, record.sha256).bytes;
  } else {
    const directory = candidatePackage(process.cwd(), manifest);
    bytes = fs.readFileSync(path.join(directory, capability.module));
  }
  const factory = factoryFromBytes(bytes, capability.symbol);
  const value = await runBatch(factory, capability, plan.batch, files);
  assert.deepEqual(value, plan.expected_result);
  console.log(JSON.stringify(value));
}
module.exports = {main, prepare, candidatePackage, factoryFromBytes, runBatch};

};

// Private verifier module: /__private__/server-creation-compatibility/observations-fixture.cjs
modules["/__private__/server-creation-compatibility/observations-fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const NOW=Date.parse('2026-02-01T12:00:00Z'),ALC='alc_'+'a'.repeat(32),LEGACY='a'.repeat(20);
const plain=v=>JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?{bigint:String(x)}:x));
function world(){
 const effects=[];const state={runs:[],gets:[],failure:null,eventFailure:null};let db;
 class Clock extends Date{constructor(...args){effects.push(['date-new',...args]);super(...args);}static now(){assert.equal(this,Clock);effects.push(['date-now']);return NOW;}toISOString(){effects.push(['date-iso']);return super.toISOString();}}
 const core={CODE_RE:/^alc_[a-z2-7]{32}$/,codeHash:function(key,code){assert.equal(this,undefined);effects.push(['codeHash',key,code]);return 'digest:'+code;},rand32:function(n){assert.equal(this,undefined);effects.push(['rand32',n]);return 'b'.repeat(24);},recordEvent:function(database,name,details){assert.equal(this,undefined);assert.equal(database,db);effects.push(['recordEvent',name,details]);if(state.eventFailure)throw state.eventFailure;}};
 db={run:function(sql,...args){assert.equal(this,db);effects.push(['run',sql,...args]);if(state.failure)throw state.failure;return state.runs.length?state.runs.shift():1;},get:function(sql,...args){assert.equal(this,db);effects.push(['get',sql,...args]);return state.gets.length?state.gets.shift():undefined;}};
 const resources={core,createHash:function(algorithm){assert.equal(this,undefined);assert.equal(algorithm,'sha256');effects.push(['createHash',algorithm]);const h=crypto.createHash(algorithm);const port={update:function(value){assert.equal(this,port);effects.push(['hash-update',value]);h.update(value);return this;},digest:function(format){assert.equal(this,port);effects.push(['hash-digest',format]);return h.digest(format);}};return port;},readDate:function(){assert.equal(this,undefined);effects.push(['readDate']);return Clock;}};
 return {effects,state,resources,db};
}
async function run(make){
 const records=[];const record=(name,result,w)=>records.push({name,result:plain(result),effects:plain(w.effects)});
 async function setup(){const w=world();w.api=await make(w.resources);assert.deepEqual(w.effects,[]);assert.deepEqual(Object.keys(w.api),['V1_CODE_RE','isCreationCode','importCreationCodes','redeemCreationCode']);assert.deepEqual([w.api.isCreationCode.length,w.api.importCreationCodes.length,w.api.redeemCreationCode.length],[1,5,6]);return w;}
 for(const [name,code,expected]of[['current',ALC,true],['legacy',LEGACY,true],['upper-legacy',LEGACY.toUpperCase(),false],['short','a'.repeat(19),false],['long','a'.repeat(21),false],['whitespace',' '+LEGACY,false],['empty','',false],['null',null,false],['wrong-alphabet','alc_'+'0'.repeat(32),false]]){const w=await setup();const value=w.api.isCreationCode(code);assert.equal(value,expected);record('format-'+name,value,w);}
 {
  const w=await setup();const calls=[];w.resources.core.CODE_RE.test=function(value){assert.equal(this,w.resources.core.CODE_RE);calls.push(['current',value]);return true;};w.api.V1_CODE_RE.test=function(){throw Error('Short circuit required');};assert.equal(w.api.isCreationCode('synthetic'),true);record('predicate-current-short-circuit',calls,w);
 }
 {
  const w=await setup();const calls=[];w.resources.core.CODE_RE.test=function(value){assert.equal(this,w.resources.core.CODE_RE);calls.push(['current',value]);return false;};w.api.V1_CODE_RE.test=function(value){assert.equal(this,w.api.V1_CODE_RE);calls.push(['legacy',value]);return true;};assert.equal(w.api.isCreationCode('synthetic'),true);record('predicate-shared-regex-object',calls,w);
 }
 {
  const w=await setup();const spent=crypto.createHash('sha256').update(LEGACY).digest('hex');w.state.runs=[0,1];w.state.gets=[{x:1}];const rows=[{code:LEGACY,email:null},{code:'b'.repeat(20),email:'Person@Example.COM'},{code:'c'.repeat(20),email:null}];const value=w.api.importCreationCodes(w.db,'fixture-key',rows,new Set([spent]),7);assert.deepEqual(plain(value),{imported:1,present:1,used:1,spentOnV1:1});assert.equal(w.effects.filter(e=>e[0]==='rand32').length,2);assert.equal(w.effects.filter(e=>e[0]==='recordEvent').length,1);const insert=w.effects.find(e=>e[0]==='run');assert.equal(insert[4],'person@example.com');record('import-mixed-spent-present-new',value,w);
 }
 for(const [name,code,email]of[['current-not-import',ALC,null],['bad-code','bad',null],['upper-code',LEGACY.toUpperCase(),null],['empty-email',LEGACY,''],['spaced-email',LEGACY,' person@example.com '],['bad-email',LEGACY,'person'],['comma-email',LEGACY,'a,b@example.com']]){const w=await setup();let error;try{w.api.importCreationCodes(w.db,'fixture-key',[{code:LEGACY,email:null},{code,email}],new Set(),2);}catch(e){error=e;}assert.equal(error?.message,'Invalid import row');assert.deepEqual(w.effects,[['readDate'],['date-now']]);record('import-upfront-'+name,error.message,w);}
 for(const [name,runResult,getResult,expected]of[['one',1,undefined,{imported:1,present:0,used:0,spentOnV1:0}],['zero-used',0,{x:1},{imported:0,present:1,used:1,spentOnV1:0}],['zero-unspent',0,undefined,{imported:0,present:1,used:0,spentOnV1:0}],['string-one','1',undefined,{imported:0,present:1,used:0,spentOnV1:0}],['bigint-one',1n,{}, {imported:0,present:1,used:1,spentOnV1:0}],['two',2,false,{imported:0,present:1,used:0,spentOnV1:0}],['true',true,0,{imported:0,present:1,used:0,spentOnV1:0}]]){const w=await setup();w.state.runs=[runResult];w.state.gets=[getResult];const value=w.api.importCreationCodes(w.db,'fixture-key',[{code:LEGACY,email:null}],new Set(),1,0);assert.deepEqual(plain(value),expected);assert.equal(w.effects.filter(e=>e[0]==='date-now').length,0);record('import-strict-run-'+name,value,w);}
 {
  const w=await setup();const value=w.api.importCreationCodes(w.db,'fixture-key',[],new Set(),0);assert.deepEqual(plain(value),{imported:0,present:0,used:0,spentOnV1:0});assert.equal(w.effects.filter(e=>e[0]==='readDate').length,3);record('import-empty-no-db',value,w);
 }
 for(const phase of ['database','event']){const w=await setup(),failure=new Error('Synthetic '+phase+' refusal');if(phase==='database')w.state.failure=failure;else w.state.eventFailure=failure;let error;try{w.api.importCreationCodes(w.db,'fixture-key',[{code:LEGACY,email:null}],new Set(),1);}catch(e){error=e;}assert.equal(error,failure);assert(!w.effects.some(e=>e[0]==='run'&&/BEGIN|ROLLBACK|COMMIT/.test(e[1])));record('import-'+phase+'-error-identity',error.message,w);}
 for(const [name,code,runResult,expected]of[['current',ALC,1,true],['legacy',LEGACY,1,true],['not-found',LEGACY,0,false],['string-one',LEGACY,'1',false],['bigint-one',LEGACY,1n,false],['two',LEGACY,2,false],['invalid','bad',1,false],['upper',LEGACY.toUpperCase(),1,false]]){const w=await setup();w.state.runs=[runResult];const value=w.api.redeemCreationCode(w.db,'fixture-key',code,'Person@Example.COM','person','workspace');assert.equal(value,expected);if(code==='bad'||code===LEGACY.toUpperCase())assert.deepEqual(w.effects,[['readDate'],['date-now']]);else{const effect=w.effects.find(e=>e[0]==='run');assert.equal(effect.at(-1),'person@example.com');assert.equal(w.effects.filter(e=>e[0]==='recordEvent').length,0);}record('redeem-'+name,value,w);}
 {
  const w=await setup();const original=w.resources.readDate;w.resources.readDate=()=>{throw Error('Changed provider container must not replace captured resolver');};assert.equal(w.api.redeemCreationCode(w.db,'fixture-key','bad','x','p','w'),false);assert(w.effects.some(e=>e[0]==='date-now'));w.resources.readDate=original;record('captured-resolver-identity',false,w);
 }
 return {schema:'align/current-v2-creation-compatibility-characterization@1',passed:true,records,exports:['V1_CODE_RE','isCreationCode','importCreationCodes','redeemCreationCode'],all_inputs_synthetic:true,actual_SQLite_integration_pending:true,source_authority_transferred:false};
}
module.exports={world,run};

};

// Private verifier module: /__private__/server-creation-compatibility/fixture.cjs
modules["/__private__/server-creation-compatibility/fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
"use strict";
const assert = require("node:assert/strict");
const originalObservations = require("./observations-fixture.cjs");
const observed = new WeakMap();
function semanticBatches() {
  let index = 0;
  return [13, 13, 12].map(size => Array.from({length: size}, () => ({operation: 0, settings: {index: index++}})));
}
function fixture({index}) {
  assert(Number.isSafeInteger(index) && index >= 0 && index < 38);
  return {async run(factory) {
    if (!observed.has(factory)) observed.set(factory, originalObservations.run(factory));
    const result = await observed.get(factory);
    assert(result.passed && result.records.length === 38);
    return result.records[index];
  }};
}
module.exports = {semanticBatches, fixture};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/server-creation-compatibility/characterization.json": {
    "schema": "align/creation-compatibility-frozen-observations@1",
    "fault_paths": [],
    "batches": [
      {
        "batch": 0,
        "records": 13,
        "sha256": "baf5b4c07dc3588f76e44664be10e665280c86c1bb41c46f73d3e5be7423804d"
      },
      {
        "batch": 1,
        "records": 13,
        "sha256": "92e598ed81cb4db80177b5405100e99322597dee9dff610ba8d3320a4142f1d3"
      },
      {
        "batch": 2,
        "records": 12,
        "sha256": "e754d257d077455de0f4b8ab667a3716eae8aa012b2cc9ec464c9f624d20863f"
      },
      {
        "batch": 3,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "batch": 4,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ]
  }
};
const fileNames = {
  "observations-fixture.cjs": "/__private__/server-creation-compatibility/observations-fixture.cjs",
  "fixture.cjs": "/__private__/server-creation-compatibility/fixture.cjs",
  "characterization.json": "/__private__/server-creation-compatibility/characterization.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "server-creation-compatibility",
  "package": "server_creation_compatibility",
  "package_files": [
    "package.json",
    "create_creation_compatibility.js"
  ],
  "package_exports": {
    "./create_creation_compatibility": "./create_creation_compatibility.js"
  },
  "capabilities": [
    {
      "id": "server-creation-compatibility.create-creation-compatibility",
      "symbol": "create_creation_compatibility",
      "module": "create_creation_compatibility.js",
      "fixture": "fixture.cjs",
      "cases": "fixture.cjs",
      "characterization": "characterization.json",
      "resource_count": 0,
      "default_operation": 0,
      "runner": false
    }
  ],
  "plans": [
    {
      "capability": "server-creation-compatibility.create-creation-compatibility",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 13,
        "sha256": "baf5b4c07dc3588f76e44664be10e665280c86c1bb41c46f73d3e5be7423804d"
      }
    },
    {
      "capability": "server-creation-compatibility.create-creation-compatibility",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 13,
        "sha256": "92e598ed81cb4db80177b5405100e99322597dee9dff610ba8d3320a4142f1d3"
      }
    },
    {
      "capability": "server-creation-compatibility.create-creation-compatibility",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 12,
        "sha256": "e754d257d077455de0f4b8ab667a3716eae8aa012b2cc9ec464c9f624d20863f"
      }
    }
  ],
  "files": [
    {
      "name": "observations-fixture.cjs",
      "path": "tools/native-rewrite/qualification/server-creation-compatibility-v1/observations-fixture.cjs",
      "sha256": "17efafe8ce568f854c21014702d6139cfd97972d5e2456a0c5972d415b34f859",
      "size": 7904
    },
    {
      "name": "fixture.cjs",
      "path": "tools/native-rewrite/qualification/server-creation-compatibility-v1/fixture.cjs",
      "sha256": "2e644a98ed0ad7636f1ff4c673ec24e83d3b13f0301183cb672ff5656985f987",
      "size": 733
    },
    {
      "name": "characterization.json",
      "path": "tools/native-rewrite/qualification/server-creation-compatibility-v1/characterization.json",
      "sha256": "f59e765d3d04bedaa775521173547e60553cd0f249ad18787cb39473c3e9d06f",
      "size": 782
    }
  ]
};

function load(file) {
  if (loaded.has(file)) return loaded.get(file).exports;
  if (Object.hasOwn(jsonData,file)) return jsonData[file];
  assert(Object.hasOwn(modules,file),'Undeclared private verifier module '+file);
  const module = {exports:{}};
  loaded.set(file,module);
  const imports = name => {
    if (name.startsWith('node:')) return require(name);
    const resolved = name.startsWith('/') ? name : path.posix.resolve(path.posix.dirname(file),name);
    return load(resolved);
  };
  modules[file](imports,module,module.exports,file,path.posix.dirname(file));
  return module.exports;
}
const driver = load("/__private__/server-creation-compatibility/driver.cjs");

const files = new Map(Object.entries(fileNames).map(([name,file]) => [name,{file,bytes:Object.hasOwn(jsonData,file)?Buffer.from(JSON.stringify(jsonData[file])):Buffer.alloc(0)}]));
const CAPABILITIES = manifest.capabilities.map(item=>item.id);
const SYMBOLS = manifest.capabilities.map(item=>item.symbol);
const PLANS = manifest.plans;
const CASE_IDS = PLANS.map(plan=>plan.capability+'-'+String(plan.batch+1).padStart(3,'0'));
async function runSelected(root,_surface,selected) {
  assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
  const indices=selected.map(item=>{
    assert(Array.isArray(item.arguments)&&item.arguments.length===1);
    const index=item.arguments[0];
    assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);
    assert.equal(item.capability,PLANS[index].capability);
    assert.equal(item.case_id,CASE_IDS[index]);
    return index;
  });
  assert.equal(new Set(indices).size,indices.length);
  const directory=driver.candidatePackage(root,manifest),factories=new Map(),results=[];
  for(let at=0;at<selected.length;at++) {
    const item=selected[at],plan=PLANS[indices[at]];
    const capability=manifest.capabilities.find(cap=>cap.id===plan.capability);
    if(!factories.has(capability.id))factories.set(capability.id,driver.factoryFromBytes(fs.readFileSync(path.join(directory,capability.module)),capability.symbol));
    const result=await driver.runBatch(factories.get(capability.id),capability,plan.batch,files);
    assert.deepEqual(result,plan.expected_result);
    results.push({case_id:item.case_id,capability:item.capability,result});
  }
  return results;
}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,PLANS,runSelected};
if(require.main===module) {
  assert.equal(process.argv.length,5);
  runSelected(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4])).then(cases=>console.log(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases}))).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
