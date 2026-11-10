'use strict';
// Independent private test code, in readable source. No original service algorithm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/server-metrics/driver.cjs
modules["/__private__/server-metrics/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
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
    for (let propertyFault = 1; propertyFault <= entry.reads; propertyFault++) properties.push(capability.runner ? {...entry.settings, propertyFault} : {operation: entry.operation, settings: {...entry.settings, propertyFault}});
    for (let effectFault = 1; effectFault <= entry.effects; effectFault++) effects.push(capability.runner ? {...entry.settings, effectFault} : {operation: entry.operation, settings: {...entry.settings, effectFault}});
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

// Private verifier module: /__private__/server-metrics/server-metrics-cases-draft-v1.cjs
modules["/__private__/server-metrics/server-metrics-cases-draft-v1.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Labeled synthetic observations, including independent calendar and privacy cases.
const {MONDAY,DAY,WEEK}=require('./server-metrics-fixture-draft-v1.cjs');
const item=(operation,settings={})=>({operation,settings});
function semanticBatches(){
  const batches=Array.from({length:6},()=>[]);
  for(const origin of [0,-DAY,Date.UTC(2000,1,29),MONDAY])
    for(const offset of [-1,0,1,DAY-1,DAY,3*DAY,6*DAY,7*DAY-1,7*DAY])
      batches[0].push(item('week',{t:origin+offset,empty:true}));
  for(const values of [[],[7],[3,1,2],[2,2,2,2],[-10,0,10],[9,8,7,6,5,4,3,2,1]])
    for(const p of [0,0.01,0.25,0.5,0.75,0.99,1])
      batches[1].push(item('percentile',{values,p,empty:true}));
  for(const name of ['loi_sent','loi_signed'])for(const ws of ['ws-0','ws-1','missing'])
    for(const noteRef of [undefined,null,'','LOI-8','a'.repeat(64),'a'.repeat(65),'https://example.invalid','a@example.invalid','bad ref'])
      for(const verifiedOriginal of [undefined,false,true])
        batches[2].push(item('loi',{name,ws,options:{noteRef,verifiedOriginal}}));
  for(const name of ['loi_sent','loi_signed'])for(const priorSigned of [false,true])
    for(const now of [0,MONDAY,MONDAY+1])
      batches[2].push(item('loi',{name,priorSigned,now}));
  for(const since of [null,'','2026-07-01','2026-10-26','2026-11-02','2099-01-01','invalid'])
    for(const now of [MONDAY-1,MONDAY,MONDAY+1,MONDAY+WEEK-1,MONDAY+WEEK])
      batches[3].push(item('report',{since,now}));
  for(const activitySource of ['session','epoch','usage','audit','operator','all'])
    for(const cohortWeeks of [0,1,2,4,5,12,13])
      batches[3].push(item('report',{activitySource,cohortWeeks}));
  for(const workspaces of [1,2,4])for(const sampleOnly of [false,true])
    for(const estimateCount of [0,1,3,5])
      batches[4].push(item('report',{workspaces,sampleOnly,estimateCount,allStages:true}));
  for(const empty of [false,true])for(const noSample of [false,true])
    for(const noRolled of [false,true])for(const requestState of ['approved','pending','rejected'])
      batches[4].push(item('report',{empty,noSample,noRolled,requestState}));
  for(const minutes of [0,0.1,1,59.4,59.9,60,119.9,2879,2880,3000])
    for(const cost of [null,0,1,-1000000])
      batches[5].push(item('report',{minutes,cost}));
  for(const directiveOnly of [false,true])for(const orphanEvents of [false,true])
    for(const omitOptions of [false,true])
      batches[5].push(item('report',{directiveOnly,orphanEvents,omitOptions}));
  return batches;
}
const faultPaths=[item('report'),item('report',{empty:true}),item('loi'),
  item('loi',{options:{verifiedOriginal:false,noteRef:'bad ref'}}),
  item('percentile',{empty:true,values:[9,1,5,3],p:0.75}),item('week',{empty:true,t:MONDAY+6*DAY})];
module.exports={semanticBatches,faultPaths};

};

// Private verifier module: /__private__/server-metrics/server-metrics-fixture-draft-v1.cjs
modules["/__private__/server-metrics/server-metrics-fixture-draft-v1.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Labeled synthetic private controls. No production analytics or outcomes.
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const resourceNames = ['ESTIMATES','NOTE_REF_RE','recordEvent','readDate'];
const estimates = ['same_day','two_to_three_days','about_a_week','longer','would_not_be_decided'];
const metadata = {weekStart:1,percentile:2,recordLoi:4,buildReport:1,formatReport:1};
const exportsInOrder = ['weekStart','percentile','LOI_EVENTS','recordLoi','FUNNEL','WAW_WEEKS','buildReport','formatReport'];
const MONDAY = Date.parse('2026-11-09T00:00:00.000Z');
const DAY = 86400000, WEEK = 7 * DAY;
function normalize(value, seen = new Map()) {
  if (value === undefined) return {$undefined:true};
  if (typeof value === 'function') return {$function:true};
  if (typeof value === 'bigint') return {$bigint:String(value)};
  if (typeof value === 'number' && !Number.isFinite(value)) return {$number:String(value)};
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if (Array.isArray(value)) return Array.from(value,item => normalize(item,seen));
  return Object.fromEntries(Object.keys(value).map(key => [key,normalize(value[key],seen)]));
}
function fixture(settings = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE v2_workspaces(id TEXT PRIMARY KEY,private_name TEXT);
    CREATE TABLE v2_events(id TEXT PRIMARY KEY,name TEXT,ws_id TEXT,actor TEXT,at TEXT,props TEXT);
    CREATE TABLE v2_sessions(ws_id TEXT,session_key TEXT,created_at TEXT);
    CREATE TABLE v2_epochs(ws_id TEXT,session_key TEXT,epoch_id TEXT,goal_id TEXT,created_at TEXT);
    CREATE TABLE v2_usage(ws_id TEXT,session_key TEXT,epoch_id TEXT,received_at TEXT,ts TEXT,est_list_usd_micros INTEGER);
    CREATE TABLE v2_audit(ws_id TEXT,actor_id TEXT,at TEXT);
    CREATE TABLE v2_spend_rollups(ws_id TEXT,goal_id TEXT,day TEXT,requests INTEGER,est_list_usd_micros INTEGER);
    CREATE TABLE v2_change_requests(ws_id TEXT,state TEXT,decided_at TEXT);`);
  let serial = 0;
  const iso = ms => new Date(ms).toISOString();
  function insert(table,row) {
    const keys = Object.keys(row);
    db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(() => '?').join(',')+')').run(...keys.map(k => row[k]));
  }
  function event(name,ws,at,props = {},actor = null) {
    insert('v2_events',{id:'event-'+(++serial),name,ws_id:ws,actor,at:iso(at),props:JSON.stringify(props)});
  }
  const secretNames = ['Private person Example','private-person@example.invalid','https://private.example.invalid/project'];
  if (!settings.empty) {
    const count = settings.workspaces ?? 4;
    for (let i=0;i<count;i++) {
      const ws = 'ws-'+i, sample = (settings.sampleOnly || (!settings.noSample && i===count-1));
      const created = MONDAY - (settings.cohortWeeks ?? (i+1))*WEEK + (settings.createdOffset ?? 0);
      insert('v2_workspaces',{id:ws,private_name:secretNames[i%secretNames.length]});
      event('workspace_created',ws,created,{kind:sample?'sample':'blank'},'ale.person-'+i);
      if (i%2===0) event('code_redeemed',ws,created-60000,{},'ale.person-'+i);
      const stages = ['device_paired','first_session_captured','first_session_bound','second_member_joined','first_change_request','first_approval','first_mcp_read'];
      for (let j=0;j<stages.length;j++) {
        if (j > (settings.stageLimit ?? 7) || (!settings.allStages && j > i+2)) continue;
        const delay = stages[j]==='first_session_bound' ? (settings.minutes ?? ((i+1)*90))*60000 : (j+1)*60000;
        event(stages[j],ws,created+delay,{},'ale.person-'+i);
      }
      if (settings.directiveOnly) {
        db.prepare("DELETE FROM v2_events WHERE name = 'first_approval' AND ws_id = ?").run(ws);
        event('first_directive',ws,created+7*60000,{kind:'stop'});
      }
      event('member_first_session_captured',ws,created+2*60000,{harness:'codex'},'ale.person-'+i);
      event('invite_sent',ws,created+3*60000,{role:'member'},'ale.person-'+i);
      event('invite_accepted',ws,created+4*60000,{role:'member'},'ale.person-'+i);
      for (const offset of settings.activeWeeks ?? [0,1,4]) {
        const at = created + offset*WEEK + 5*60000;
        const sk = 'session-'+i+'-'+offset, ep = 'epoch-'+i+'-'+offset;
        const source = settings.activitySource ?? 'all';
        if (source==='all'||source==='session') insert('v2_sessions',{ws_id:ws,session_key:sk,created_at:iso(at)});
        if (source==='all'||source==='epoch') insert('v2_epochs',{ws_id:ws,session_key:sk,epoch_id:ep,goal_id:i%2?'goal-'+i:null,created_at:iso(at)});
        if (source==='all'||source==='usage') insert('v2_usage',{ws_id:ws,session_key:sk,epoch_id:ep,received_at:iso(at),ts:iso(at),est_list_usd_micros:settings.cost === null?null:(settings.cost??(i+1)*1000000)});
        if (source==='all'||source==='audit'||source==='operator') insert('v2_audit',{ws_id:ws,actor_id:source==='operator'?null:'actor-'+i,at:iso(at)});
      }
      if (!settings.noRolled) insert('v2_spend_rollups',{ws_id:ws,goal_id:i%2?'goal-'+i:'',day:iso(created).slice(0,10),requests:i+2,est_list_usd_micros:(i+1)*2000000});
      for (const [j,estimate] of estimates.entries()) {
        if (j >= (settings.estimateCount ?? 5)) break;
        event('value_reported',ws,created+10000+j,{estimate},'ale.value-'+j);
      }
      event('value_card_viewed',ws,created+10001,{},'ale.value-1');
      event('value_card_viewed',ws,created+10002,{},null);
      event('follow_up_clicked',ws,created+10003,{},'ale.value-1');
      event('first_ask',ws,created+10004,{},'ale.value-1');
      event('first_limit',ws,created+10005,{},'ale.value-1');
      insert('v2_change_requests',{ws_id:ws,state:settings.requestState??'approved',decided_at:iso(created+10006)});
    }
    for (const interest of ['try','evaluate']) for (const via of ['form','value_card']) event('access_requested',null,MONDAY,{interest,via});
    event('access_approved',null,MONDAY);
    event('access_declined',null,MONDAY);
    event('code_created',null,MONDAY,{source:'request'});
    event('code_created',null,MONDAY,{source:'operator'});
    event('loi_sent','ws-0',MONDAY-1000,{note_ref:'LOI-7'});
    if (settings.priorSigned) event('loi_signed','ws-0',MONDAY-500,{verified_original:'yes'});
    if (settings.orphanEvents) {
      event('workspace_created','wsx-purged',MONDAY-2*WEEK,{kind:'blank'});
      event('first_session_bound','wsx-purged',MONDAY-WEEK);
    }
  }
  const tables = ['v2_workspaces','v2_events','v2_sessions','v2_epochs','v2_usage','v2_audit','v2_spend_rollups','v2_change_requests'];
  const snapshot = () => Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
  const initial = normalize(snapshot());
  let active=false, reads=0, effects=0, captures=0, dateReads=0;
  const trace=[],wrapped=new WeakMap(),fault=new Error('owned metrics fault');
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label) {
    if (!value || typeof value!=='object' || value instanceof Date || value instanceof RegExp) return value;
    if (wrapped.has(value)) return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver) {
        if (active && typeof key==='string') {
          trace.push(['get',label,key]);
          if (++reads===settings.propertyFault) throw fault;
        }
        return watch(Reflect.get(target,key,receiver),label+'.'+String(key));
      },
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });
    wrapped.set(value,proxy);return proxy;
  }
  function effect(name,args,fn) {
    if (active) {trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}
    return quiet(fn);
  }
  const sqlPort={};
  for(const method of ['get','all','run']) sqlPort[method]=function(sql,...args){
    assert.equal(this,sqlPort);
    return effect('db.'+method,[sql,...args],()=>{
      const statement=db.prepare(sql);
      const value=statement[method](...args);
      return method==='run'?Number(value.changes):watch(value,method+'.'+sql);
    });
  };
  class FixedDate extends Date {
    constructor(...args){super(...(args.length?args:[settings.clock??MONDAY+123456]));}
    static now(){return settings.clock??MONDAY+123456;}
  }
  const supplied={
    ESTIMATES:watch([...estimates],'ESTIMATES'),
    NOTE_REF_RE:/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/,
    recordEvent:function(dbArg,name,o){
      assert.equal(this,undefined);assert.equal(dbArg,sqlPort);
      return effect('recordEvent',[name,o],()=>event(name,o.ws,Date.parse(o.at),o.props,o.actor??null));
    },
    readDate:function(){assert.equal(this,undefined);dateReads++;return effect('readDate',[],()=>FixedDate);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  async function run(factory,operation='report') {
    let value,caught,didThrow=false,percentileInput;
    try {
      const api=factory(resources);
      assert.deepEqual(Object.keys(api),exportsInOrder);
      for(const [name,length]of Object.entries(metadata)){
        assert.equal(api[name].name,name);assert.equal(api[name].length,length);assert.equal(api[name].constructor.name,'Function');
      }
      active=true;
      if(operation==='week') value=api.weekStart(settings.t??MONDAY);
      else if(operation==='percentile') {
        percentileInput=watch([...(settings.values??[])],'values');
        value=api.percentile(percentileInput,settings.p??0.5);
      } else if(operation==='loi') {
        const o=watch(Object.hasOwn(settings,'options')?settings.options:{noteRef:'LOI-8',verifiedOriginal:true},'options');
        const args=[sqlPort,settings.name??'loi_signed',settings.ws??'ws-0',o];
        if(Object.hasOwn(settings,'now')) args.push(settings.now);
        value=api.recordLoi(...args);
      } else if(operation==='report') {
        const options=watch({since:settings.since??null,now:new Date(settings.now??MONDAY+123456)},'options');
        const report=settings.omitOptions?api.buildReport(sqlPort):api.buildReport(sqlPort,options);
        value={report,text:api.formatReport(report)};
        const serialized=quiet(()=>JSON.stringify(value));
        assert(secretNames.every(secret=>!serialized.includes(secret)),'Private content leaked into report');
      } else throw Error('Unknown metrics operation');
    } catch(error) {caught=error;didThrow=true;}
    active=false;
    const output={result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,code:normalize(caught?.code),sameFault:caught===fault}:null,
      input:normalize(percentileInput),trace,reads,effects,captures,dateReads,initial,final:normalize(snapshot())};
    db.close();return output;
  }
  return {run};
}
module.exports={fixture,normalize,resourceNames,metadata,exportsInOrder,MONDAY,DAY,WEEK};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/server-metrics/metrics-characterization.json": {
    "batches": [
      {
        "batch": 0,
        "records": 36,
        "sha256": "c696a1b3186d5c1ddc55771288d25cd3257c2345954b9e99801de3a0e7390782"
      },
      {
        "batch": 1,
        "records": 42,
        "sha256": "6e364ecc5c3b93b2ff4c1ec9fe3614838b9c5a975983b962b805a1045ed59b6f"
      },
      {
        "batch": 2,
        "records": 174,
        "sha256": "472ba906d3dc0d50b3d9c8af53674cbd1cb5b2984be88a033b30adcbc4451c8a"
      },
      {
        "batch": 3,
        "records": 77,
        "sha256": "4adf4462e1cd6c5b96a7a39e0c1eee5165d1abdcea7e9ebec694bb8b9722e201"
      },
      {
        "batch": 4,
        "records": 48,
        "sha256": "fe4ff61cf3bbf9ae498cb43bc506be0203d19ed00cd866a831606c4899e425de"
      },
      {
        "batch": 5,
        "records": 48,
        "sha256": "eb695f2b817398df9a7b07a63fc375dc907d3501646b739f4e221282146fc139"
      },
      {
        "batch": 6,
        "records": 623,
        "sha256": "a188cad86750f56b3d610ed52ad200faa8560328a3624d49f6edf696f08c115f"
      },
      {
        "batch": 7,
        "records": 151,
        "sha256": "dff99a8559f6dd55c7d21cb598fa06e3d2bdf7ddec83e6604f954a5bdd8b87d1"
      }
    ],
    "fault_paths": [
      {
        "operation": "report",
        "settings": {},
        "reads": 539,
        "effects": 94,
        "captures": 4,
        "dateReads": 60
      },
      {
        "operation": "report",
        "settings": {
          "empty": true
        },
        "reads": 68,
        "effects": 45,
        "captures": 4,
        "dateReads": 11
      },
      {
        "operation": "loi",
        "settings": {},
        "reads": 5,
        "effects": 5,
        "captures": 4,
        "dateReads": 2
      },
      {
        "operation": "loi",
        "settings": {
          "options": {
            "verifiedOriginal": false,
            "noteRef": "bad ref"
          }
        },
        "reads": 1,
        "effects": 1,
        "captures": 4,
        "dateReads": 1
      },
      {
        "operation": "percentile",
        "settings": {
          "empty": true,
          "values": [
            9,
            1,
            5,
            3
          ],
          "p": 0.75
        },
        "reads": 10,
        "effects": 0,
        "captures": 4,
        "dateReads": 0
      },
      {
        "operation": "week",
        "settings": {
          "empty": true,
          "t": 1794700800000
        },
        "reads": 0,
        "effects": 2,
        "captures": 4,
        "dateReads": 2
      }
    ]
  },
  "/__private__/server-metrics/server-metrics.public-target-data-v2.json": {
    "schema": "align/public-node-port-data@1",
    "component": "server-metrics",
    "original_source": "lib/v2/metrics-core.mts",
    "original_source_sha256": "b1efbdd97422e28716e34719428d5e4f4efc86a7cdf67ae67b1fb06f87d4bd21",
    "constants": {
      "LOI_EVENTS": [
        "loi_sent",
        "loi_signed"
      ],
      "FUNNEL": [
        {
          "step": "workspace created",
          "events": [
            "workspace_created"
          ]
        },
        {
          "step": "device paired",
          "events": [
            "device_paired"
          ]
        },
        {
          "step": "first session captured",
          "events": [
            "first_session_captured"
          ]
        },
        {
          "step": "first session bound to a goal",
          "events": [
            "first_session_bound"
          ]
        },
        {
          "step": "second member joined",
          "events": [
            "second_member_joined"
          ]
        },
        {
          "step": "first change request",
          "events": [
            "first_change_request"
          ]
        },
        {
          "step": "first approval or directive",
          "events": [
            "first_approval",
            "first_directive"
          ]
        },
        {
          "step": "first MCP read",
          "events": [
            "first_mcp_read"
          ]
        }
      ],
      "WAW_WEEKS": 8
    },
    "sql": [
      {
        "operation": "recordLoi",
        "source_line": 58,
        "method": "get",
        "statement": {
          "text": "SELECT 1 AS x FROM v2_workspaces WHERE id = ?",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "recordLoi",
        "source_line": 59,
        "method": "get",
        "statement": {
          "text": "SELECT at FROM v2_events WHERE name = ? AND ws_id = ?",
          "slots": 0
        },
        "argument_expression_count": 2,
        "variadic_arguments_present": false
      },
      {
        "operation": "count",
        "source_line": 133,
        "method": "get",
        "statement": {
          "text": "SELECT COUNT(*) AS n FROM v2_events WHERE name = ? AND at >= ? <slot-1>",
          "slots": 1
        },
        "argument_expression_count": 3,
        "variadic_arguments_present": true
      },
      {
        "operation": "buildReport",
        "source_line": 134,
        "method": "all",
        "statement": {
          "text": "SELECT ws_id FROM v2_events WHERE name = 'workspace_created' AND json_extract(props, '$.kind') = 'sample'",
          "slots": 0
        },
        "argument_expression_count": 0,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 138,
        "method": "all",
        "statement": {
          "text": "SELECT ws_id, name, MIN(at) AS at FROM v2_events WHERE ws_id IS NOT NULL GROUP BY ws_id, name",
          "slots": 0
        },
        "argument_expression_count": 0,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 157,
        "method": "all",
        "statement": {
          "text": "SELECT ws_id, at FROM v2_events WHERE name = 'workspace_created' AND ws_id IS NOT NULL AND at >= ? ORDER BY at",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 179,
        "method": "all",
        "statement": {
          "text": "SELECT DISTINCT ws_id, substr(at, 1, 10) AS day FROM (\n       SELECT ws_id, created_at AS at FROM v2_sessions\n       UNION ALL SELECT ws_id, created_at FROM v2_epochs\n       UNION ALL SELECT ws_id, received_at FROM v2_usage\n       UNION ALL SELECT ws_id, at FROM v2_audit WHERE ws_id IS NOT NULL AND actor_id IS NOT NULL\n     ) WHERE at >= ?",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 223,
        "method": "get",
        "statement": {
          "text": "SELECT COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.goal_id IS NOT NULL)) AS bound\n     FROM v2_sessions s WHERE s.created_at >= ?",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 228,
        "method": "get",
        "statement": {
          "text": "SELECT COUNT(*) AS requests, SUM(e.goal_id IS NOT NULL) AS bound_requests, SUM(u.est_list_usd_micros) AS usd,\n            SUM(CASE WHEN e.goal_id IS NOT NULL THEN u.est_list_usd_micros END) AS bound_usd\n     FROM v2_usage u LEFT JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id\n     WHERE u.ts >= ?",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 235,
        "method": "get",
        "statement": {
          "text": "SELECT SUM(requests) AS requests, SUM(CASE WHEN goal_id <> '' THEN requests END) AS bound_requests,\n            SUM(est_list_usd_micros) AS usd, SUM(CASE WHEN goal_id <> '' THEN est_list_usd_micros END) AS bound_usd\n     FROM v2_spend_rollups WHERE day >= ?",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "buildReport",
        "source_line": 248,
        "method": "all",
        "statement": {
          "text": "SELECT ws_id, name, at FROM v2_events WHERE name IN ('loi_sent', 'loi_signed') AND at >= ? ORDER BY at",
          "slots": 0
        },
        "argument_expression_count": 1,
        "variadic_arguments_present": false
      },
      {
        "operation": "wsEvents",
        "source_line": 259,
        "method": "all",
        "statement": {
          "text": "SELECT ws_id FROM v2_events WHERE name = ? AND at >= ? AND ws_id IS NOT NULL <slot-1> <slot-2>",
          "slots": 2
        },
        "argument_expression_count": 4,
        "variadic_arguments_present": true
      },
      {
        "operation": "buildReport",
        "source_line": 264,
        "method": "get",
        "statement": {
          "text": "SELECT COUNT(DISTINCT ws_id) AS n FROM v2_change_requests WHERE state = 'approved' AND decided_at >= ? <slot-1>",
          "slots": 1
        },
        "argument_expression_count": 2,
        "variadic_arguments_present": true
      }
    ],
    "public_types": [
      "export type LoiEvent = (typeof LOI_EVENTS)[number];",
      "export type LoiResult = { ok: true; at: string } | { ok: false; reason: \"no_workspace\" | \"verified_original_required\" | \"bad_note_ref\" | \"already_recorded\"; at?: string };",
      "interface Timing {\n  workspaces: number;\n  median_minutes: number | null;\n  p75_minutes: number | null;\n}",
      "export interface Report {\n  generated_at: string;\n  since: string | null;\n  access: { requested: number; requested_try: number; requested_evaluate: number; approved: number; declined: number; codes_created: number; codes_from_requests: number; codes_redeemed: number };\n  funnel: { step: string; workspaces: number; of_previous: number | null; of_created: number | null }[];\n  other: { sample_workspaces_created: number; invites_sent: number; invites_accepted: number; people_with_a_first_session: number };\n  time_to_first_value: { from_workspace_created: Timing; from_code_redeemed: Timing };\n  weekly_active_workspaces: { week: string; active: number; growth: number | null; complete: boolean }[];\n  retention: { cohort: string; workspaces: number; week1: number | null; week1_share: number | null; week4: number | null; week4_share: number | null }[];\n  goal_binding: {\n    sessions: number;\n    bound_sessions: number;\n    sessions_share: number | null;\n    requests: number;\n    bound_requests: number;\n    requests_share: number | null;\n    est_list_usd_micros: number;\n    bound_est_list_usd_micros: number;\n    spend_share: number | null;\n  };\n  lois: { sent: number; signed: number; workspaces: { ws_id: string; sent_at: string | null; signed_at: string | null }[] };\n  value: {\n    workspaces_with_approved_request: number;\n    viewed: { people: number; workspaces: number };\n    reported: { people: number; by_estimate: Record<(typeof ESTIMATES)[number], number> };\n    follow_up_clicked: number;\n    access_from_value_card: { try: number; evaluate: number };\n    first_ask: number;\n    first_limit: number;\n  };\n}"
    ],
    "text_protocol_tokens": [
      {
        "source_line": 328,
        "text": "Align report, <slot-1><slot-2> (weeks start Monday 00:00 UTC; sample workspaces left out)",
        "slots": 2
      },
      {
        "source_line": 328,
        "text": ", since <slot-1>",
        "slots": 1
      },
      {
        "source_line": 328,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 329,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 330,
        "text": "Access",
        "slots": 0
      },
      {
        "source_line": 333,
        "text": "requested",
        "slots": 0
      },
      {
        "source_line": 333,
        "text": "<slot-1> try, <slot-2> evaluate",
        "slots": 2
      },
      {
        "source_line": 334,
        "text": "approved",
        "slots": 0
      },
      {
        "source_line": 335,
        "text": "declined",
        "slots": 0
      },
      {
        "source_line": 336,
        "text": "codes created",
        "slots": 0
      },
      {
        "source_line": 336,
        "text": "<slot-1> from requests",
        "slots": 1
      },
      {
        "source_line": 337,
        "text": "codes redeemed",
        "slots": 0
      },
      {
        "source_line": 339,
        "text": "step",
        "slots": 0
      },
      {
        "source_line": 339,
        "text": "count",
        "slots": 0
      },
      {
        "source_line": 339,
        "text": "detail",
        "slots": 0
      },
      {
        "source_line": 341,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 342,
        "text": "Workspace funnel (workspaces created in the period that reached each step)",
        "slots": 0
      },
      {
        "source_line": 345,
        "text": "step",
        "slots": 0
      },
      {
        "source_line": 345,
        "text": "workspaces",
        "slots": 0
      },
      {
        "source_line": 345,
        "text": "of previous",
        "slots": 0
      },
      {
        "source_line": 345,
        "text": "of created",
        "slots": 0
      },
      {
        "source_line": 347,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 348,
        "text": "Time to first value (to the first session bound to a goal)",
        "slots": 0
      },
      {
        "source_line": 351,
        "text": "from workspace created",
        "slots": 0
      },
      {
        "source_line": 352,
        "text": "from code redeemed",
        "slots": 0
      },
      {
        "source_line": 354,
        "text": "from",
        "slots": 0
      },
      {
        "source_line": 354,
        "text": "workspaces",
        "slots": 0
      },
      {
        "source_line": 354,
        "text": "median",
        "slots": 0
      },
      {
        "source_line": 354,
        "text": "p75",
        "slots": 0
      },
      {
        "source_line": 356,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 357,
        "text": "Weekly active workspaces (a shared session, epoch or usage upload, or a member's audited action, that week)",
        "slots": 0
      },
      {
        "source_line": 359,
        "text": "<slot-1> (so far)",
        "slots": 1
      },
      {
        "source_line": 359,
        "text": "-",
        "slots": 0
      },
      {
        "source_line": 359,
        "text": "<slot-1><slot-2>",
        "slots": 2
      },
      {
        "source_line": 359,
        "text": "+",
        "slots": 0
      },
      {
        "source_line": 359,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 360,
        "text": "week",
        "slots": 0
      },
      {
        "source_line": 360,
        "text": "active",
        "slots": 0
      },
      {
        "source_line": 360,
        "text": "week on week",
        "slots": 0
      },
      {
        "source_line": 362,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 363,
        "text": "Retention by creation week (active in week 1 and week 4 after it; - until that week ends)",
        "slots": 0
      },
      {
        "source_line": 366,
        "text": "-",
        "slots": 0
      },
      {
        "source_line": 366,
        "text": "<slot-1> (<slot-2>)",
        "slots": 2
      },
      {
        "source_line": 366,
        "text": "-",
        "slots": 0
      },
      {
        "source_line": 366,
        "text": "<slot-1> (<slot-2>)",
        "slots": 2
      },
      {
        "source_line": 367,
        "text": "cohort",
        "slots": 0
      },
      {
        "source_line": 367,
        "text": "workspaces",
        "slots": 0
      },
      {
        "source_line": 367,
        "text": "week 1",
        "slots": 0
      },
      {
        "source_line": 367,
        "text": "week 4",
        "slots": 0
      },
      {
        "source_line": 369,
        "text": "(none)",
        "slots": 0
      },
      {
        "source_line": 370,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 371,
        "text": "Bound to goals (sessions shared, and usage, in the period)",
        "slots": 0
      },
      {
        "source_line": 374,
        "text": "sessions",
        "slots": 0
      },
      {
        "source_line": 375,
        "text": "requests",
        "slots": 0
      },
      {
        "source_line": 376,
        "text": "estimated spend",
        "slots": 0
      },
      {
        "source_line": 378,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 378,
        "text": "bound",
        "slots": 0
      },
      {
        "source_line": 378,
        "text": "total",
        "slots": 0
      },
      {
        "source_line": 378,
        "text": "share",
        "slots": 0
      },
      {
        "source_line": 380,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 381,
        "text": "Other",
        "slots": 0
      },
      {
        "source_line": 384,
        "text": "sample workspaces created",
        "slots": 0
      },
      {
        "source_line": 385,
        "text": "invites sent",
        "slots": 0
      },
      {
        "source_line": 386,
        "text": "invites accepted",
        "slots": 0
      },
      {
        "source_line": 387,
        "text": "people with a first shared session in a workspace",
        "slots": 0
      },
      {
        "source_line": 389,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 389,
        "text": "count",
        "slots": 0
      },
      {
        "source_line": 391,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 392,
        "text": "Decision value (approved change requests and their value card; one per person per workspace)",
        "slots": 0
      },
      {
        "source_line": 395,
        "text": "workspaces with an approved request",
        "slots": 0
      },
      {
        "source_line": 395,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 396,
        "text": "value card viewed",
        "slots": 0
      },
      {
        "source_line": 396,
        "text": "1 workspace",
        "slots": 0
      },
      {
        "source_line": 396,
        "text": "<slot-1> workspaces",
        "slots": 1
      },
      {
        "source_line": 397,
        "text": "value reported",
        "slots": 0
      },
      {
        "source_line": 397,
        "text": "<slot-1> <slot-2>",
        "slots": 2
      },
      {
        "source_line": 397,
        "text": ", ",
        "slots": 0
      },
      {
        "source_line": 398,
        "text": "follow-up clicked",
        "slots": 0
      },
      {
        "source_line": 398,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 399,
        "text": "access requested from the card",
        "slots": 0
      },
      {
        "source_line": 399,
        "text": "<slot-1> try, <slot-2> evaluate",
        "slots": 2
      },
      {
        "source_line": 400,
        "text": "workspaces with a first ask",
        "slots": 0
      },
      {
        "source_line": 400,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 401,
        "text": "workspaces with a first limit",
        "slots": 0
      },
      {
        "source_line": 401,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 403,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 403,
        "text": "count",
        "slots": 0
      },
      {
        "source_line": 403,
        "text": "detail",
        "slots": 0
      },
      {
        "source_line": 405,
        "text": "",
        "slots": 0
      },
      {
        "source_line": 406,
        "text": "LOIs (operator-recorded): <slot-1> sent, <slot-2> signed (verified originals only)",
        "slots": 2
      },
      {
        "source_line": 409,
        "text": "-",
        "slots": 0
      },
      {
        "source_line": 409,
        "text": "-",
        "slots": 0
      },
      {
        "source_line": 410,
        "text": "workspace",
        "slots": 0
      },
      {
        "source_line": 410,
        "text": "sent",
        "slots": 0
      },
      {
        "source_line": 410,
        "text": "signed",
        "slots": 0
      },
      {
        "source_line": 414,
        "text": "\n",
        "slots": 0
      }
    ],
    "not_an_implementation": true,
    "contains_private_verification_inputs": false
  }
};
const fileNames = {
  "metrics-characterization.json": "/__private__/server-metrics/metrics-characterization.json",
  "server-metrics-cases-draft-v1.cjs": "/__private__/server-metrics/server-metrics-cases-draft-v1.cjs",
  "server-metrics-fixture-draft-v1.cjs": "/__private__/server-metrics/server-metrics-fixture-draft-v1.cjs",
  "server-metrics.public-target-data-v2.json": "/__private__/server-metrics/server-metrics.public-target-data-v2.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "server-metrics",
  "package": "server_metrics",
  "package_files": [
    "package.json",
    "create_metrics.js"
  ],
  "package_exports": {
    "./create_metrics": "./create_metrics.js"
  },
  "capabilities": [
    {
      "id": "server-metrics.create-metrics",
      "symbol": "create_metrics",
      "module": "create_metrics.js",
      "fixture": "server-metrics-fixture-draft-v1.cjs",
      "cases": "server-metrics-cases-draft-v1.cjs",
      "characterization": "metrics-characterization.json",
      "resource_count": 4,
      "default_operation": "report",
      "runner": false,
      "constant_data": "server-metrics.public-target-data-v2.json"
    }
  ],
  "plans": [
    {
      "capability": "server-metrics.create-metrics",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 36,
        "sha256": "c696a1b3186d5c1ddc55771288d25cd3257c2345954b9e99801de3a0e7390782"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 42,
        "sha256": "6e364ecc5c3b93b2ff4c1ec9fe3614838b9c5a975983b962b805a1045ed59b6f"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 174,
        "sha256": "472ba906d3dc0d50b3d9c8af53674cbd1cb5b2984be88a033b30adcbc4451c8a"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 3,
      "expected_result": {
        "batch": 3,
        "records": 77,
        "sha256": "4adf4462e1cd6c5b96a7a39e0c1eee5165d1abdcea7e9ebec694bb8b9722e201"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 4,
      "expected_result": {
        "batch": 4,
        "records": 48,
        "sha256": "fe4ff61cf3bbf9ae498cb43bc506be0203d19ed00cd866a831606c4899e425de"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 5,
      "expected_result": {
        "batch": 5,
        "records": 48,
        "sha256": "eb695f2b817398df9a7b07a63fc375dc907d3501646b739f4e221282146fc139"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 6,
      "expected_result": {
        "batch": 6,
        "records": 623,
        "sha256": "a188cad86750f56b3d610ed52ad200faa8560328a3624d49f6edf696f08c115f"
      }
    },
    {
      "capability": "server-metrics.create-metrics",
      "batch": 7,
      "expected_result": {
        "batch": 7,
        "records": 151,
        "sha256": "dff99a8559f6dd55c7d21cb598fa06e3d2bdf7ddec83e6604f954a5bdd8b87d1"
      }
    }
  ],
  "files": [
    {
      "name": "metrics-characterization.json",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-metrics/metrics-characterization.json",
      "sha256": "fb124a190e20e101e3909e19c4c4e14af082002a8e72bcabf972cee26c003f44",
      "size": 2318
    },
    {
      "name": "server-metrics-cases-draft-v1.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-metrics/server-metrics-cases-draft-v1.cjs",
      "sha256": "aa7b50a8ddb70f613126623d6d629b4ef53dc6546ab8f2d808251736cff7c064",
      "size": 2809
    },
    {
      "name": "server-metrics-fixture-draft-v1.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-metrics/server-metrics-fixture-draft-v1.cjs",
      "sha256": "92806e4bcc70a780e809b612a427a6fd07b80394bf230343d0d910381610eb1c",
      "size": 11176
    },
    {
      "name": "server-metrics.public-target-data-v2.json",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-metrics/server-metrics.public-target-data-v2.json",
      "sha256": "b0a58e3249484324136d872c85838575fdb2cb988e3f27c489ace0f5de0d977c",
      "size": 17178
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
const driver = load("/__private__/server-metrics/driver.cjs");

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
