'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"66d047c034a6e35d00344ffbd20b8918e7c9c16d12ae69001c371ec31a4f5021","package":"rate_limits","package_files":["create_limiter.js","package.json"],"maximum_cases":45,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {"use strict";
// Independent acceptance observer. Excluded from generated application authority.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const assert=require('node:assert/strict'),sqlite=require('node:sqlite');
const {DatabaseSync}=sqlite;
const {stripTypeScriptTypes,syncBuiltinESMExports}=require('node:module');
const {pathToFileURL}=require('node:url');
const cwdAtStart=process.cwd(),stdout=process.stdout,stderr=process.stderr;
const exit=process.exit.bind(process);
const CAPABILITY='rate-limits.create-limiter';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const errorSource="'use strict';\n\nclass HttpError extends Error {\n  constructor(status, message, code) {\n    super(message);\n    this.status = status;\n    this.code = code;\n  }\n}\n\nclass V2Error extends Error {\n  constructor(status, code, message, extra) {\n    super(message ?? code);\n    this.status = status;\n    this.code = code;\n    this.extra = extra;\n  }\n}\n\nfunction data() {\n  return { HttpError, V2Error };\n}\n\nmodule.exports = { data };\n";
assert.equal(sha(errorSource),"f02c958beb09e81862df58081dea41847741e0f49ced3fc1f594e3a2a408e1c5");
const errors={exports:{}};new Function("module","exports",errorSource)(errors,errors.exports);
const {V2Error}=errors.exports.data();
const ddl="  CREATE TABLE v2_rate_hits (\n    key TEXT NOT NULL,\n    at INTEGER NOT NULL\n  );\n  CREATE INDEX v2_rate_hits_key ON v2_rate_hits(key, at);\n  CREATE INDEX v2_rate_hits_at ON v2_rate_hits(at);\n";
assert.equal(sha(ddl),"7388550c041fa79742f67d1cbf7eef4b558da815039eae05cf1ba50b66e87eaa");

const KEEP = 24 * 3600 * 1000;
const fixtureKey = 'fixture-only/rate-limit-observer-v1';
const limit = (key,max=1,windowMs=10)=>({key,max,windowMs});
const UNDEFINED = {kind:'undefined'};
const refusal = {kind:'throw',constructor:'V2Error',name:'Error',status:429,code:'rate_limited',message:'Too many requests, try again later',actual_native_error:true};
const plain = value=>value===undefined?UNDEFINED:JSON.parse(JSON.stringify(value));

async function fixture(moduleSource, createApi) {
  const database = new DatabaseSync(':memory:');
  database.exec(ddl);
  const sql = [], signing = [], receivers = [], clock = {now:0,reads:0};
  const fault = {method:null,at:null,calls:{get:0,all:0,run:0},error:new Error('synthetic-port-failure')};
  const db = Object.fromEntries(['get','all','run'].map(method=>[method,function(statement,...args){
    receivers.push({method,bare:this===undefined});
    sql.push({method,statement,args});
    if (fault.method===method) {
      fault.calls[method]++;
      if(fault.at===null||fault.calls[method]===fault.at)throw fault.error;
    }
    return database.prepare(statement)[method](...args);
  }]));
  const signPayload = function(payload){
    receivers.push({method:'sign',bare:this===undefined});
    signing.push(payload);
    if(fault.method==='sign')throw fault.error;
    return crypto.createHmac('sha256',fixtureKey).update(payload).digest('base64url');
  };
  const hits = new Map();
  const readTime = function(){receivers.push({method:'now',bare:this===undefined});clock.reads++;if(clock.error)throw clock.error;return clock.now;};
  const context = vm.createContext({Date:{now:()=>readTime()},__alignV2Limits:hits});
  const binding = {hits,now:readTime,signPayload,get:db.get,all:db.all,run:db.run,V2Error};
  const imports = {
    '../secret':{signPayload},'./db':db,'./errors':{V2Error},
  };
  let allocation=0;
  async function load() {
    if (createApi) {
      const api = createApi(binding);
      assert(api && typeof api === 'object' && typeof api.then !== 'function','Expected a synchronous limiter service');
      for (const name of ['take','takeAll','retryAfterMs','otpEmailKey','accessEmailKey','durableRoom','durableCount','durableRetryAfterMs','takeDurable']) assert.equal(typeof api[name],'function',name);
      return api;
    }
    const module = new vm.SourceTextModule(moduleSource,{context,identifier:'retained-limits-'+(++allocation)});
    await module.link(async name=>{
      assert.ok(Object.hasOwn(imports,name),'Unexpected retained import');
      const values=imports[name];
      return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
    });
    await module.evaluate();
    return module.namespace;
  }
  const api = await load();
  const observed=[];
  const eq=(label,actual,expected)=>{
    const a=plain(actual), e=plain(expected);observed.push({label,actual:a,expected:e});assert.deepEqual(a,e,label);return actual;
  };
  const call=(name,...args)=>{
    try{const fn=api[name];return fn(...args);}catch(error){return {kind:'throw',constructor:error.constructor.name,name:error.name,status:error.status,code:error.code,message:error.message,actual_native_error:error instanceof V2Error};}
  };
  const rows=()=>database.prepare('SELECT key, at FROM v2_rate_hits ORDER BY rowid').all().map(r=>({...r}));
  const seed=(key,at)=>database.prepare('INSERT INTO v2_rate_hits (key, at) VALUES (?, ?)').run(key,at);
  return {api,load,eq,call,rows,seed,sql,signing,clock,fault,database,observed,hits,binding,receivers,fork:()=>fixture(moduleSource,createApi),close(){database.close();}};
}

const cases=[];
const test=(name,run)=>cases.push({name,run});
test('memory-count-and-rolling-retry',f=>{
  f.eq('first',f.call('take','a',2,100,0),undefined);
  f.eq('second',f.call('take','a',2,100,25),undefined);
  f.eq('third refused',f.call('take','a',2,100,30),refusal);
  f.eq('oldest admission expiry',f.call('retryAfterMs',[limit('a',2,100)],30),70);
  f.eq('one expiry makes room',f.call('retryAfterMs',[limit('a',2,100)],100),0);
  f.eq('admit after expiry',f.call('take','a',2,100,100),undefined);
  f.eq('remaining rolling wait',f.call('retryAfterMs',[limit('a',2,100)],100),25);
});
test('memory-cutoff-equality',f=>{
  f.eq('at zero',f.call('take','a',1,10,0),undefined);
  f.eq('before cutoff',f.call('take','a',1,10,9),refusal);
  f.eq('one millisecond left',f.call('retryAfterMs',[limit('a')],9),1);
  f.eq('equal cutoff expires',f.call('take','a',1,10,10),undefined);
});
test('memory-clock-moves-backward',f=>{
  f.api.take('a',1,10,100);
  f.eq('future hit still counts',f.call('take','a',1,10,90),refusal);
  f.eq('wait includes clock reversal',f.call('retryAfterMs',[limit('a')],90),20);
});
test('memory-key-identity',f=>{
  for(const key of ['A','a','a ','é','e\u0301','']) f.eq('distinct '+JSON.stringify(key),f.call('take',key,1,10,0),undefined);
  f.eq('same empty key refused',f.call('take','',1,10,0),refusal);
});
test('memory-batch-all-or-none',f=>{
  f.api.take('full',1,10,0);
  f.eq('batch refused',f.call('takeAll',[limit('new'),limit('full')],1),false);
  f.eq('unfilled key uncounted',f.call('take','new',1,10,1),undefined);
  f.eq('full key unchanged',f.call('retryAfterMs',[limit('full')],1),9);
});
test('memory-batch-duplicate-key-counts-once',f=>{
  f.eq('duplicate batch',f.call('takeAll',[limit('a',2),limit('a',2)],0),true);
  f.eq('second hit still fits',f.call('take','a',2,10,0),undefined);
  f.eq('third refused',f.call('take','a',2,10,0),refusal);
});
test('memory-duplicate-last-window-wins',f=>{
  f.api.take('a',2,100,0);
  f.eq('different windows admitted',f.call('takeAll',[limit('a',2,100),limit('a',2,5)],10),true);
  f.eq('short final window discarded old hit',f.call('take','a',2,100,10),undefined);
  f.eq('two current hits now full',f.call('take','a',2,100,10),refusal);
});
test('memory-retry-max-and-sort',f=>{
  for(const at of [20,0,10])f.api.take('a',4,100,at);
  f.eq('max-th newest expiry',f.call('retryAfterMs',[limit('a',2,100)],30),80);
  f.eq('three-hit limit expiry',f.call('retryAfterMs',[limit('a',3,100)],30),70);
  f.api.take('b',1,200,0);
  f.eq('all constraints must have room',f.call('retryAfterMs',[limit('a',3,100),limit('b',1,200)],30),170);
});
test('memory-empty-batch-and-query',f=>{
  f.eq('empty batch',f.call('takeAll',[],0),true);
  f.eq('empty retry',f.call('retryAfterMs',[],0),0);
  f.eq('no SQLite operations',f.sql,[]);
  f.eq('no signing operations',f.signing,[]);
});
test('memory-default-clock',f=>{
  f.clock.now=50;f.eq('implicit now',f.call('take','a',1,50),undefined);
  f.clock.now=99;f.eq('implicit wait',f.call('retryAfterMs',[limit('a',1,50)]),1);
  f.clock.now=100;f.eq('implicit cutoff',f.call('take','a',1,50),undefined);
  f.eq('clock reads',f.clock.reads,3);
});
test('memory-shared-across-module-loads',async f=>{
  f.api.take('a',1,10,0);
  const second=await f.load();
  let result;try{second.take('a',1,10,0);}catch(error){result=error;}
  f.eq('same process reuses counted state',result instanceof V2Error,true);
});
test('memory-capacity-and-successful-touch',f=>{
  for(let i=0;i<10000;i++)f.api.take('k'+i,1,100000,0);
  f.eq('successful touch',f.call('take','k0',2,100000,1),undefined);
  f.eq('new key fits',f.call('take','extra',1,100000,1),undefined);
  f.eq('touched key survived',f.call('take','k0',2,100000,1),refusal);
  f.eq('oldest untouched key evicted',f.call('take','k1',1,100000,1),undefined);
});
test('memory-refusal-does-not-touch-order',f=>{
  for(let i=0;i<10000;i++)f.api.take('k'+i,1,100000,0);
  f.eq('refusal',f.call('take','k0',1,100000,1),refusal);
  f.api.take('extra',1,100000,1);
  f.eq('refused oldest key was evicted',f.call('take','k0',1,100000,1),undefined);
});
test('memory-retry-does-not-touch-order',f=>{
  for(let i=0;i<10000;i++)f.api.take('k'+i,1,100000,0);
  f.eq('retry is read-only',f.call('retryAfterMs',[limit('k0',1,100000)],1),99999);
  f.api.take('extra',1,100000,1);
  f.eq('queried oldest key was evicted',f.call('take','k0',1,100000,1),undefined);
});
test('durable-room-count-retry',f=>{
  const ls=[limit('a',2,100)];
  f.eq('initial room',f.call('durableRoom',ls,0),true);
  f.eq('first count',f.call('durableCount',ls,0),undefined);
  f.eq('second count',f.call('durableCount',ls,25),undefined);
  f.eq('full',f.call('durableRoom',ls,30),false);
  f.eq('retry',f.call('durableRetryAfterMs',ls,30),70);
  f.eq('cutoff makes room',f.call('durableRoom',ls,100),true);
  f.eq('both stored hits preserved',f.rows(),[{key:'a',at:0},{key:'a',at:25}]);
});
test('durable-cutoff-equality',f=>{
  f.seed('a',0);
  f.eq('before cutoff full',f.call('durableRoom',[limit('a')],9),false);
  f.eq('exact cutoff expired',f.call('durableRoom',[limit('a')],10),true);
  f.eq('exact cutoff has no wait',f.call('durableRetryAfterMs',[limit('a')],10),0);
});
test('durable-clock-moves-backward',f=>{
  f.seed('a',100);
  f.eq('future hit still counts',f.call('durableRoom',[limit('a')],90),false);
  f.eq('wait includes clock reversal',f.call('durableRetryAfterMs',[limit('a')],90),20);
});
test('durable-admission-all-or-none',f=>{
  f.seed('full',0);f.seed('expired',-KEEP-1);const before=f.rows();
  f.eq('refused',f.call('takeDurable',[limit('new'),limit('full')],1),false);
  f.eq('refusal neither counts nor prunes',f.rows(),before);
});
test('durable-duplicate-key-counts-twice',f=>{
  f.eq('prechecks share initial state',f.call('takeDurable',[limit('a'),limit('a')],0),true);
  f.eq('each occurrence inserts',f.rows(),[{key:'a',at:0},{key:'a',at:0}]);
  f.eq('now full',f.call('durableRoom',[limit('a')],1),false);
});
test('durable-repeated-count-is-not-unique',f=>{
  f.api.durableCount([limit('a')],0);f.api.durableCount([limit('a')],0);
  f.eq('same-key same-time duplicates retained',f.rows(),[{key:'a',at:0},{key:'a',at:0}]);
});
test('durable-pruning-inclusive-at-24-hours',f=>{
  for(const at of [-KEEP-1,-KEEP,-KEEP+1,0])f.seed('a',at);
  f.eq('empty count still prunes',f.call('durableCount',[],0),undefined);
  f.eq('inclusive cutoff',f.rows(),[{key:'a',at:-KEEP+1},{key:'a',at:0}]);
});
test('durable-empty-room-and-retry-read-only',f=>{
  f.seed('old',-KEEP-1);const before=f.rows();
  f.eq('empty room',f.call('durableRoom',[],0),true);
  f.eq('empty retry',f.call('durableRetryAfterMs',[],0),0);
  f.eq('read methods preserve old rows',f.rows(),before);
  f.eq('empty queries do not issue SQL',f.sql,[]);
});
test('durable-empty-admission-prunes',f=>{
  f.seed('old',-KEEP-1);
  f.eq('empty take succeeds',f.call('takeDurable',[],0),true);
  f.eq('empty take prunes',f.rows(),[]);
  f.eq('one delete only',f.sql.map(x=>x.method),['run']);
});
test('durable-retry-overfull-and-multiple-constraints',f=>{
  for(const at of [0,10,20])f.seed('a',at);
  f.eq('second newest expiry',f.call('durableRetryAfterMs',[limit('a',2,100)],30),80);
  f.seed('b',0);
  f.eq('maximum constraint wait',f.call('durableRetryAfterMs',[limit('a',2,100),limit('b',1,200)],30),170);
});
test('durable-default-clock',f=>{
  f.clock.now=50;f.eq('implicit take',f.call('takeDurable',[limit('a',1,50)]),true);
  f.clock.now=99;f.eq('implicit retry',f.call('durableRetryAfterMs',[limit('a',1,50)]),1);
  f.clock.now=100;f.eq('implicit room',f.call('durableRoom',[limit('a',1,50)]),true);
  f.eq('one clock read per public call',f.clock.reads,3);
});
test('durable-transaction-is-caller-owned',f=>{
  f.database.exec("CREATE TRIGGER reject_second BEFORE INSERT ON v2_rate_hits WHEN NEW.key = 'reject' BEGIN SELECT RAISE(ABORT, 'fixture refusal'); END");
  f.database.exec('BEGIN');let error;
  try{f.api.durableCount([limit('first'),limit('reject')],0);}catch(e){error=e;}
  f.eq('driver error reached caller',error?.code,'ERR_SQLITE_ERROR');
  f.database.exec('ROLLBACK');
  f.eq('caller rollback restores rows',f.rows(),[]);
  f.eq('helper issued no transaction statement',f.sql.every(x=>!/^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(x.statement)),true);
});
test('durable-without-caller-transaction-is-partial',f=>{
  f.seed('old',-KEEP-1);
  f.database.exec("CREATE TRIGGER reject_second BEFORE INSERT ON v2_rate_hits WHEN NEW.key = 'reject' BEGIN SELECT RAISE(ABORT, 'fixture refusal'); END");
  let error;try{f.api.durableCount([limit('first'),limit('reject')],0);}catch(e){error=e;}
  f.eq('driver error reached caller',error?.code,'ERR_SQLITE_ERROR');
  f.eq('outside required transaction earlier effects persist',f.rows(),[{key:'first',at:0}]);
});
test('durable-port-errors-preserve-identity',f=>{
  f.fault.method='get';let error;try{f.api.durableRoom([limit('a')],0);}catch(e){error=e;}
  f.eq('same get error',error===f.fault.error,true);
  f.fault.method='all';error=undefined;try{f.api.durableRetryAfterMs([limit('a')],0);}catch(e){error=e;}
  f.eq('same all error',error===f.fault.error,true);
  f.fault.method='run';error=undefined;try{f.api.durableCount([limit('a')],0);}catch(e){error=e;}
  f.eq('same run error',error===f.fault.error,true);
});
test('email-key-domain-separation-and-raw-input',f=>{
  for(const email of ['person@example.invalid','Person@example.invalid',' person@example.invalid ','','é@example.invalid']) {
    const otp=f.api.otpEmailKey(email),access=f.api.accessEmailKey(email);
    f.eq('otp input '+JSON.stringify(email),f.signing.at(-2),'alo.'+email);
    f.eq('access input '+JSON.stringify(email),f.signing.at(-1),'ala.'+email);
    f.eq('separate hashes '+JSON.stringify(email),otp!==access,true);
    f.eq('otp prefix',otp.startsWith('otp-email-hour:'),true);
    f.eq('access prefix',access.startsWith('access-email:'),true);
    if(email)f.eq('email absent from output',!otp.includes(email)&&!access.includes(email),true);
  }
  f.eq('signing has no SQL effects',f.sql,[]);
});

test('signing-port-errors-preserve-identity',f=>{
  f.fault.method='sign';f.fault.error=Object.freeze({fixture:'signing-error'});
  for(const name of ['otpEmailKey','accessEmailKey']){
    let thrown;try{f.api[name]('person@example.invalid');}catch(error){thrown=error;}
    f.eq(name+' preserves the same thrown value',thrown===f.fault.error,true);
  }
  f.eq('exact attempted signing inputs',f.signing,['alo.person@example.invalid','ala.person@example.invalid']);
  f.eq('no storage effects',f.sql,[]);
  f.eq('no clock reads',f.clock.reads,0);
});
test('default-clock-errors-precede-all-effects',f=>{
  const sentinel=Object.freeze({fixture:'clock-error'});f.clock.error=sentinel;
  const calls=[['take',['a',1,10]],['takeAll',[[limit('a')]]],['retryAfterMs',[[limit('a')]]],['durableRoom',[[limit('a')]]],['durableCount',[[limit('a')]]],['durableRetryAfterMs',[[limit('a')]]],['takeDurable',[[limit('a')]]]];
  for(const [name,args]of calls){let thrown;try{f.api[name](...args);}catch(error){thrown=error;}f.eq(name+' preserves the same clock error',thrown===sentinel,true);}
  f.eq('one attempted default per call',f.clock.reads,7);
  f.eq('no database call before clock failure',f.sql,[]);
  f.eq('no signing call before clock failure',f.signing,[]);
  f.eq('explicit memory time bypasses clock',f.call('take','a',1,10,0),undefined);
  f.eq('explicit durable time bypasses clock',f.call('takeDurable',[limit('a')],0),true);
  f.eq('explicit times add no clock reads',f.clock.reads,7);
});
test('later-write-error-identity-with-caller-rollback',f=>{
  f.seed('old',-KEEP-1);const before=f.rows();
  f.fault.method='run';f.fault.at=3;f.fault.error=Object.freeze({fixture:'second-insert-error'});
  f.database.exec('BEGIN');let thrown;
  try{f.api.durableCount([limit('first'),limit('second')],0);}catch(error){thrown=error;}
  f.eq('same second-write failure',thrown===f.fault.error,true);
  f.eq('first write occurred inside transaction',f.rows(),[{key:'first',at:0}]);
  f.database.exec('ROLLBACK');
  f.eq('caller rollback restores old row and removes first insert',f.rows(),before);
  f.eq('exact calls up to failing second insert',f.sql.map(x=>({method:x.method,args:x.args})),[{method:'run',args:[-KEEP]},{method:'run',args:['first',0]},{method:'run',args:['second',0]}]);
});
test('later-write-error-without-caller-transaction',f=>{
  f.seed('old',-KEEP-1);f.fault.method='run';f.fault.at=3;f.fault.error=Object.freeze({fixture:'second-insert-error'});
  let thrown;try{f.api.takeDurable([limit('first'),limit('second')],0);}catch(error){thrown=error;}
  f.eq('same propagated failure',thrown===f.fault.error,true);
  f.eq('earlier effects persist outside required transaction',f.rows(),[{key:'first',at:0}]);
});
test('durable-room-short-circuits-before-later-read',f=>{
  f.seed('full',0);f.fault.method='get';f.fault.at=2;
  f.eq('full first key returns false',f.call('durableRoom',[limit('full'),limit('unread')],0),false);
  f.eq('second query not attempted',f.sql.map(x=>x.args),[['full',-10]]);
});
test('durable-retry-later-read-error-identity',f=>{
  f.seed('a',0);const before=f.rows();f.fault.method='all';f.fault.at=2;f.fault.error=Object.freeze({fixture:'later-retry-read'});
  let thrown;try{f.api.durableRetryAfterMs([limit('a'),limit('b')],0);}catch(error){thrown=error;}
  f.eq('same second-query failure',thrown===f.fault.error,true);
  f.eq('both queries attempted in input order',f.sql.map(x=>x.args),[['a',-10,1],['b',-10,1]]);
  f.eq('read failure has no row effects',f.rows(),before);
});
test('durable-admission-later-precheck-error-has-no-writes',f=>{
  f.seed('old',-KEEP-1);const before=f.rows();f.fault.method='get';f.fault.at=2;f.fault.error=Object.freeze({fixture:'later-admission-read'});
  let thrown;try{f.api.takeDurable([limit('a'),limit('b')],0);}catch(error){thrown=error;}
  f.eq('same second-precheck failure',thrown===f.fault.error,true);
  f.eq('no count or prune attempted',f.sql.map(x=>x.method),['get','get']);
  f.eq('existing rows unchanged',f.rows(),before);
});

test('bare-consumer-aliases-preserve-all-nine-functions',f=>{
  const {take,takeAll,retryAfterMs,otpEmailKey,accessEmailKey,durableRoom,durableCount,durableRetryAfterMs,takeDurable}=f.api;
  f.eq('bare memory take',take('bare-a',1,10,0),undefined);
  f.eq('bare memory batch',takeAll([limit('bare-b')],0),true);
  f.eq('bare memory retry',retryAfterMs([limit('bare-a')],0),10);
  const signed=prefix=>crypto.createHmac('sha256',fixtureKey).update(prefix+'bare@example.invalid').digest('base64url');
  f.eq('bare OTP key',otpEmailKey('bare@example.invalid'),'otp-email-hour:'+signed('alo.'));
  f.eq('bare access key',accessEmailKey('bare@example.invalid'),'access-email:'+signed('ala.'));
  f.eq('bare durable room',durableRoom([limit('bare-d')],0),true);
  f.eq('bare durable count',durableCount([limit('bare-d')],0),undefined);
  f.eq('bare durable retry',durableRetryAfterMs([limit('bare-d')],0),10);
  f.eq('bare durable admission',takeDurable([limit('bare-e')],0),true);
  f.eq('bare calls keep expected rows',f.rows(),[{key:'bare-d',at:0},{key:'bare-e',at:0}]);
});
test('bound-memory-store-remains-the-same-object',f=>{
  f.hits.set('provided',[0]);
  f.eq('external preloaded hit is counted',f.call('take','provided',1,10,0),refusal);
  f.hits.delete('provided');
  f.eq('external removal is visible',f.call('take','provided',1,10,0),undefined);
  f.eq('admission updates supplied store',f.hits.get('provided'),[0]);
  f.hits.set('provided',[5]);
  f.eq('external timestamp replacement is visible',f.call('retryAfterMs',[limit('provided')],0),15);
});
test('separate-bound-stores-remain-independent',async f=>{
  const other=await f.fork();
  try{
    f.api.take('separate',1,10,0);
    f.eq('second bound store has room',other.call('take','separate',1,10,0),undefined);
    f.eq('first store retains its hit',f.call('retryAfterMs',[limit('separate')],0),10);
    f.eq('second store retains its hit',other.call('retryAfterMs',[limit('separate')],0),10);
    f.hits.delete('separate');
    f.eq('first external removal is visible',f.call('retryAfterMs',[limit('separate')],0),0);
    f.eq('second store is unaffected',other.call('retryAfterMs',[limit('separate')],0),10);
  }finally{other.close();}
});
test('bound-context-references-are-captured-once',f=>{
  const changed=()=>{throw new Error('synthetic replacement port must not run');};
  f.binding.hits=new Map();
  for(const name of ['now','signPayload','get','all','run','V2Error'])f.binding[name]=changed;
  f.eq('captured clock and store',f.call('take','capture',1,10),undefined);
  f.eq('captured qualified error constructor',f.call('take','capture',1,10),refusal);
  f.eq('captured memory object',f.hits.get('capture'),[0]);
  const signed=prefix=>crypto.createHmac('sha256',fixtureKey).update(prefix+'capture@example.invalid').digest('base64url');
  f.eq('captured OTP signer',f.call('otpEmailKey','capture@example.invalid'),'otp-email-hour:'+signed('alo.'));
  f.eq('captured access signer',f.call('accessEmailKey','capture@example.invalid'),'access-email:'+signed('ala.'));
  f.eq('captured durable write',f.call('durableCount',[limit('capture-d')],0),undefined);
  f.eq('captured durable count read',f.call('durableRoom',[limit('capture-d')],0),false);
  f.eq('captured newest-hit read',f.call('durableRetryAfterMs',[limit('capture-d')],0),10);
  f.eq('captured durable admission',f.call('takeDurable',[limit('capture-e')],0),true);
  f.eq('only invoked default clocks are read',f.clock.reads,2);
});

test('supplied-callbacks-use-bare-function-convention',f=>{
  f.api.take('receiver',1,10);
  f.api.otpEmailKey('receiver@example.invalid');
  f.api.durableCount([limit('receiver-d')]);
  f.api.durableRoom([limit('receiver-d')]);
  f.api.durableRetryAfterMs([limit('receiver-d')]);
  f.eq('clock signer and SQL callback kinds', [...new Set(f.receivers.map(x=>x.method))].sort(), ['all','get','now','run','sign']);
  f.eq('callbacks receive no method receiver',f.receivers.every(x=>x.bare),true);
});

test('public-function-names-and-required-arities-are-preserved',f=>{
  const names=['take','takeAll','retryAfterMs','otpEmailKey','accessEmailKey','durableRoom','durableCount','durableRetryAfterMs','takeDurable'];
  f.eq('all nine public function names and required arities',names.map(name=>({export:name,name:f.api[name].name,arity:f.api[name].length})),names.map(name=>({export:name,name,arity:name==='take'?3:1})));
});

test('binding-construction-has-no-effects',f=>{
  f.eq('binding construction preserves supplied resources',{
    clock:f.clock.reads,sql:f.sql,signing:f.signing,hits:[...f.hits],receivers:f.receivers,
  },{clock:0,sql:[],signing:[],hits:[],receivers:[]});
});

for(const method of ['take','takeAll'])test('externally-oversized-memory-store-is-trimmed-by-'+method,f=>{
  for(let index=0;index<10003;index++)f.hits.set('preloaded-'+index,[0]);
  const actual=method==='take'?f.call(method,'fresh',1,100,0):f.call(method,[limit('fresh',1,100)],0);
  f.eq('admission succeeds with oversized supplied store',actual,method==='take'?undefined:true);
  f.eq('admission restores the 10000-key bound',f.hits.size,10000);
  f.eq('only the four oldest preloaded keys are removed',[0,1,2,3,4].map(index=>f.hits.has('preloaded-'+index)),[false,false,false,false,true]);
  f.eq('new admission is stored in the supplied Map',f.hits.get('fresh'),[0]);
});


function installEffectsGuard() {
  const effects = { filesystem: 0, network: 0, childProcess: 0, ambientEnvironment: 0, ambientCwd: 0, ambientClock: 0, ambientState: 0 };
  let trusted = 0;
  const NativeError = Error;
  const originalCwd = process.cwd.bind(process);
  const modules = [
    [fs, "filesystem"], [require("node:fs/promises"), "filesystem"],
    [require("node:http"), "network"], [require("node:https"), "network"],
    [require("node:net"), "network"], [require("node:tls"), "network"],
    [require("node:dgram"), "network"], [require("node:dns"), "network"],
    [require("node:dns/promises"), "network"], [require("node:child_process"), "childProcess"],
  ];
  function caller(skip) {
    const previous = NativeError.prepareStackTrace;
    const previousLimit = NativeError.stackTraceLimit;
    try {
      NativeError.stackTraceLimit = 16;
      NativeError.prepareStackTrace = (_error, frames) => frames;
      const record = {};
      NativeError.captureStackTrace(record, skip);
      return record.stack[0]?.getFileName() || "";
    } finally { NativeError.prepareStackTrace = previous; NativeError.stackTraceLimit = previousLimit; }
  }
  function blocked(domain, name) {
    effects[domain]++;
    throw new NativeError("Rate-limit verifier blocked " + domain + "." + name);
  }
  function wrap(original, domain, name) {
    function guarded(...args) {
      if (trusted) return Reflect.apply(original, this, args);
      const origin = caller(guarded);
      if (domain === "filesystem" && name === "writeSync" && (args[0] === 1 || args[0] === 2) && origin === "node:internal/fs/sync_write_stream") return Reflect.apply(original, this, args);
      const loaderRead = domain === "filesystem" && /^(?:read|open|close|stat|lstat|fstat|realpath|access|exists)/.test(name) && origin.startsWith("node:internal/modules/");
      if (loaderRead) {
        trusted++;
        try { return Reflect.apply(original, this, args); }
        finally { trusted--; }
      }
      return blocked(domain, name);
    }
    if (typeof original.native === "function") guarded.native = wrap(original.native, domain, name + ".native");
    return guarded;
  }
  const seen = new Set();
  for (const [object, domain] of modules) {
    if (seen.has(object)) continue;
    seen.add(object);
    for (const key of Object.getOwnPropertyNames(object)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const original = object[key];
      if (typeof original !== "function") continue;
      const value = wrap(original, domain, key);
      if (descriptor.configurable) Object.defineProperty(object, key, { configurable: true, enumerable: descriptor.enumerable, value, writable: true });
      else assert(Reflect.set(object, key, value), "cannot instrument " + domain + "." + key);
    }
  }
  const workers = require("node:worker_threads");
  workers.Worker = wrap(workers.Worker, "childProcess", "Worker");
  for (const name of ["fetch", "WebSocket", "EventSource"]) if (typeof globalThis[name] === "function") globalThis[name] = wrap(globalThis[name], "network", name);
  for (const name of ["exit", "abort", "kill"]) process[name] = wrap(process[name], "childProcess", "process." + name);
  process.env = new Proxy({}, {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      if (trusted || caller(this.get).startsWith("node:")) return undefined;
      return blocked("ambientEnvironment", key);
    },
    set(_target, key) { return blocked("ambientEnvironment", String(key)); },
    ownKeys() {
      if (trusted || caller(this.ownKeys).startsWith("node:")) return [];
      return blocked("ambientEnvironment", "enumerate");
    },
  });
  process.cwd = function guardedCwd() {
    if (trusted || caller(guardedCwd).startsWith("node:")) return originalCwd();
    return blocked("ambientCwd", "cwd");
  };
  for (const name of ["DatabaseSync", "Session"]) if (typeof sqlite[name] === "function") sqlite[name] = wrap(sqlite[name], "filesystem", "sqlite." + name);
  const OriginalDate = globalThis.Date;
  const blockedNow = () => blocked("ambientClock", "Date.now");
  globalThis.Date = new Proxy(OriginalDate, {
    get(target, key, receiver) { return key === "now" ? blockedNow : Reflect.get(target, key, receiver); },
    apply() { return blocked("ambientClock", "Date"); },
    construct() { return blocked("ambientClock", "new Date"); },
  });
  if (typeof performance?.now === "function") Object.defineProperty(performance, "now", { configurable: true, value: () => blocked("ambientClock", "performance.now") });
  for (const name of ["hrtime", "uptime"]) if (typeof process[name] === "function") process[name] = () => blocked("ambientClock", "process." + name);
  Object.defineProperty(globalThis, "__alignV2Limits", { configurable: true, get() { return blocked("ambientState", "__alignV2Limits"); }, set() { return blocked("ambientState", "__alignV2Limits"); } });
  syncBuiltinESMExports();
  return {
    effects,
    assertClean() { for (const [name, value] of Object.entries(effects)) assert.equal(value, 0, "rate-limit effect: " + name); },
    trusted(fn) { trusted++; try { return fn(); } finally { trusted--; } },
  };
}


function generatedPath(root, surface) {
  const binding = surface?.capabilities.find(item => item.capability === CAPABILITY);
  if (surface) assert(binding && binding.symbols.includes("create_limiter"), "missing rate-limit import capability");
  const module = binding?.module || "rate_limits/create_limiter";
  const files = [];
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const file = path.join(folder, entry.name);
      assert(!entry.isSymbolicLink(), "candidate source must not contain symbolic links");
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && [".js", ".mjs", ".cjs"].includes(path.extname(file))) files.push(file);
    }
  }
  walk(root);
  const hits = files.filter(file => {
    const relative = path.relative(root, file).split(path.sep).join("/");
    return [".js", ".mjs", ".cjs"].some(ext => relative === module + ext || relative.endsWith("/" + module + ext));
  });
  assert.equal(hits.length, 1, "expected one advertised rate-limit module");
  return hits[0];
}


async function runCase(moduleSource,factory,args){
  assert(Array.isArray(args)&&args.length===1&&Number.isSafeInteger(args[0])&&args[0]>=0&&args[0]<cases.length,"invalid limiter case selector");
  const item=cases[args[0]],f=await fixture(moduleSource,factory);
  try{
    await item.run(f);
    const record={name:item.name,observations:f.observed,sql:f.sql,signing:f.signing};
    return {observations:f.observed.length,sha256:sha(JSON.stringify(record))};
  }finally{f.close();}
}
async function main(){
  const profile=["--baseline","--generated"].includes(process.argv[1]);
  const mode=profile?process.argv[1]:"--generated";
  const root=profile?cwdAtStart:path.resolve(process.argv[2]);
  const surface=profile?null:JSON.parse(process.argv[3]);
  const selected=profile?[{arguments:JSON.parse(process.argv[2])}]:JSON.parse(process.argv[4]);
  assert(Array.isArray(selected)&&selected.length>0&&selected.length<=64);
  let moduleSource,factory,file;
  if(mode==="--baseline"){
    const original=fs.readFileSync(path.join(root,'limits.ts'),'utf8');
    assert.equal(sha(original),'22872169cc9c83fb09f26c1a95a7872cfc02315962df0d9c402197e02a209af4');
    moduleSource=stripTypeScriptTypes(original,{mode:'strip'});
  }else file=generatedPath(root,surface);
  const guard=installEffectsGuard();
  if(file){
    const module=await import(pathToFileURL(file).href);
    factory=module.create_limiter??module.default?.create_limiter??module.default;
    assert.equal(typeof factory,'function','missing limiter constructor');
    assert.equal(factory.length,1,'limiter constructor must have one required argument');
  }
  guard.assertClean();
  const results=[];
  for(const item of selected){
    if(!profile)assert.equal(item.capability,CAPABILITY);
    const result=await runCase(moduleSource,factory,item.arguments);guard.assertClean();
    results.push(profile?result:{case_id:item.case_id,capability:CAPABILITY,result});
  }
  const output=profile?results[0]:{schema:'literate-ai/library-acceptance-results@1',cases:results};
  guard.trusted(()=>stdout.write(JSON.stringify(output)+'\n'));
}
module.exports={CAPABILITY,cases,runCase,generatedPath,installEffectsGuard};
if(require.main===module||['--baseline','--generated'].includes(process.argv[1]))main().catch(error=>{stderr.write((error.stack||String(error))+'\n');exit(1);});
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
