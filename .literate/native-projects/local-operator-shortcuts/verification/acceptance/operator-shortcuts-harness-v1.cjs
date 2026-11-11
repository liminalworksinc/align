'use strict';
// Independent private test code, in readable source. No original service algorithm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/operator-shortcuts/driver.cjs
modules["/__private__/operator-shortcuts/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Private verifier. Original implementations are loaded only in source mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function relativeFile(root, relative) {
  assert.equal(typeof relative, 'string');
  assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':'));
  const parts = relative.split('/');
  assert(parts.every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..'));
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Private verifier input must not be a symlink');
    assert(i === parts.length - 1 ? stat.isFile() : stat.isDirectory());
  }
  return current;
}
function pinned(root, relative, hash) {
  const file = relativeFile(root, relative);
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
    for (const source of references.raw_sources) pinned(process.cwd(), source.path, source.sha256);
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

// Private verifier module: /__private__/operator-shortcuts/fixture.cjs
modules["/__private__/operator-shortcuts/fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
"use strict";
const assert = require("node:assert/strict");

const signIn = "scripts/sign-in-link.mjs";
const retention = "scripts/retention.mjs";
const cases = [
  ["sign-in-default",signIn,{},0,["timeout","fetch","stdout"]],
  ["sign-in-explicit-email",signIn,{args:[" USER@EXAMPLE.INVALID "],env:{PORT:"4103",ALIGN_LOCAL_OWNER_EMAIL:"unused@example.invalid"},responseBody:{code:"synthetic-unused-code"}},0,["timeout","fetch","stdout"]],
  ["sign-in-env-owner",signIn,{env:{ALIGN_LOCAL_OWNER_EMAIL:" LOCAL@EXAMPLE.INVALID "}},0,["timeout","fetch","stdout"]],
  ["sign-in-rate-limit-message",signIn,{status:429,responseBody:{message:"Synthetic rate-limit message"}},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-rate-limit-fallback",signIn,{status:429,jsonFailure:true},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-refusal-message",signIn,{status:403,responseBody:{message:"Synthetic refusal"}},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-fetch-failure",signIn,{fetchFailure:true},1,["timeout","fetch","stderr"]],
  ["retention-default",retention,{},0,["delegate"]],
  ["retention-dry-run",retention,{args:["--dry-run"]},0,["delegate"]],
  ["retention-invalid-option",retention,{args:["--unknown"]},2,["stderr"]],
  ["sign-in-refusal-plain",signIn,{status:404},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-refusal-json-failure",signIn,{status:503,jsonFailure:true},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-rate-limit-empty-message",signIn,{status:429,responseBody:{message:""}},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-empty-cli-email-fallback",signIn,{args:[""],env:{ALIGN_LOCAL_OWNER_EMAIL:" OTHER@EXAMPLE.INVALID "}},0,["timeout","fetch","stdout"]],
  ["sign-in-whitespace-email",signIn,{args:[" "]},0,["timeout","fetch","stdout"]],
  ["retention-repeated-dry-run",retention,{args:["--dry-run","--dry-run"]},0,["delegate"]],
  ["retention-mixed-invalid",retention,{args:["--dry-run","unknown"]},2,["stderr"]],
  ["sign-in-refusal-redacts-code",signIn,{status:403,responseBody:{message:"Synthetic refusal",code:"synthetic-unused-code"}},1,["timeout","fetch","readResponseBody","stderr"]],
  ["sign-in-success-204",signIn,{status:204},0,["timeout","fetch","stdout"]],
];

function contextFor(index) {
  const [name,file,input,expectedExit,expectedEffects] = cases[index];
  const {args=[],env={},status=200,responseBody={},jsonFailure=false,fetchFailure=false} = input;
  const argv = ["node",file,...args];
  const exit = new Error("simulated process exit");
  const effects = [];
  let exitCode = 0;
  const resources = {
    process:{argv,env,exit(code){exitCode=code;throw exit;}},
    console:{log(value){effects.push({name:"stdout",value});},error(value){effects.push({name:"stderr",value});}},
    AbortSignal:{timeout(milliseconds){effects.push({name:"timeout",milliseconds});return {milliseconds};}},
    fetch:async(url,init)=>{
      assert.equal(new URL(url).hostname,"127.0.0.1");
      effects.push({name:"fetch",url,method:init.method,headers:init.headers,body:JSON.parse(init.body),timeout:init.signal.milliseconds});
      if(fetchFailure)throw new Error("synthetic offline result");
      const response={status,ok:status>=200&&status<300};
      response.json=async function(){
        assert.strictEqual(this,response,"Response.json receiver");
        effects.push({name:"readResponseBody"});
        if(jsonFailure)throw new Error("synthetic JSON failure");
        return responseBody;
      };
      return response;
    },
    runAdmin:async()=>{effects.push({name:"delegate",args:argv.slice(2)});},
  };
  return {name,file,resources,exit,finish(){
    assert.equal(exitCode,expectedExit,name);
    assert.deepEqual(effects.map(effect=>effect.name),expectedEffects,name);
    const plain = JSON.parse(JSON.stringify({name,file,exitCode,effects}));
    assert(!JSON.stringify(plain).includes("synthetic-unused-code"),name);
    if(file===signIn){
      const base="http://127.0.0.1:"+(env.PORT||3100);
      const email=(args[0]||env.ALIGN_LOCAL_OWNER_EMAIL||"owner@align.localhost").trim().toLowerCase();
      assert.deepEqual(plain.effects[1],{name:"fetch",url:base+"/api/v2/auth/email-otp/send-verification-otp",method:"POST",headers:{"content-type":"application/json",origin:base},body:{email,type:"sign-in"},timeout:15000});
    }
    if(file===retention && exitCode===0)assert.deepEqual(plain.effects[0].args,["retention","run",...args]);
    return plain;
  }};
}

async function observe(factory) {
  const records=[];
  for(let index=0;index<cases.length;index++){
    const current=contextFor(index);
    const api=factory(current.resources);
    assert.deepEqual(Object.keys(api).sort(),["retention","signInLink"]);
    assert.equal(typeof api.retention,"function");
    assert.equal(typeof api.signInLink,"function");
    try {await api[current.file===retention?"retention":"signInLink"]();}
    catch(error){if(error!==current.exit)throw error;}
    records.push(current.finish());
  }
  return records;
}
module.exports={cases,contextFor,observe};

const recorded=new WeakMap();
function semanticBatches(){
  let offset=0;
  return [7,6,6].map(size=>{
    const entries=Array.from({length:size},(_,index)=>({operation:0,settings:{index:offset+index}}));
    offset+=size;
    return entries;
  });
}
function fixture({index}){
  return {async run(factory){
    if(!recorded.has(factory))recorded.set(factory,observe(factory));
    const observations=await recorded.get(factory);
    assert.equal(observations.length,19);
    assert(Number.isInteger(index) && index>=0 && index<observations.length);
    return observations[index];
  }};
}
module.exports={semanticBatches,fixture};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/operator-shortcuts/characterization.json": {
    "schema": "align/B28-operator-shortcuts-frozen-observations@1",
    "fault_paths": [],
    "batches": [
      {
        "batch": 0,
        "records": 7,
        "sha256": "89688a03dbff57dc31e17d74c3583a5ed96707a94e2e8643763301446f925dd9"
      },
      {
        "batch": 1,
        "records": 6,
        "sha256": "ca901a707826c955ce22be23f778f035754ce434bfe42435689f879667ea6c8a"
      },
      {
        "batch": 2,
        "records": 6,
        "sha256": "a34362def084d9ee4786c8b386c7323d78abc9d66a88795ee5d29fd5fb944631"
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
  "fixture.cjs": "/__private__/operator-shortcuts/fixture.cjs",
  "characterization.json": "/__private__/operator-shortcuts/characterization.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "operator-shortcuts",
  "package": "operator_shortcuts",
  "package_files": [
    "package.json",
    "create_operator_shortcuts.js"
  ],
  "package_exports": {
    "./create_operator_shortcuts": "./create_operator_shortcuts.js"
  },
  "capabilities": [
    {
      "id": "operator-shortcuts.create-operator-shortcuts",
      "symbol": "create_operator_shortcuts",
      "module": "create_operator_shortcuts.js",
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
      "capability": "operator-shortcuts.create-operator-shortcuts",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 7,
        "sha256": "89688a03dbff57dc31e17d74c3583a5ed96707a94e2e8643763301446f925dd9"
      }
    },
    {
      "capability": "operator-shortcuts.create-operator-shortcuts",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 6,
        "sha256": "ca901a707826c955ce22be23f778f035754ce434bfe42435689f879667ea6c8a"
      }
    },
    {
      "capability": "operator-shortcuts.create-operator-shortcuts",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 6,
        "sha256": "a34362def084d9ee4786c8b386c7323d78abc9d66a88795ee5d29fd5fb944631"
      }
    }
  ],
  "files": [
    {
      "name": "fixture.cjs",
      "path": "tools/native-rewrite/qualification/operator-shortcuts-v1/fixture.cjs",
      "sha256": "2aa2c9575bd145fdd3e65cffda9bd2cf1cfd20815cc04539fb5028c47a61a00e",
      "size": 5744
    },
    {
      "name": "characterization.json",
      "path": "tools/native-rewrite/qualification/operator-shortcuts-v1/characterization.json",
      "sha256": "5dbb1f827427bb7bb498c55de299e0e3a9d7cc74fa257caf4d952493eb9391a4",
      "size": 779
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
const driver = load("/__private__/operator-shortcuts/driver.cjs");

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
