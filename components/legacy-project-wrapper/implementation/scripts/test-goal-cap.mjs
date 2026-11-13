import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=pathRoot();
function pathRoot(){return fileURLToPath(new URL('../',import.meta.url));}
const require=createRequire(new URL('../package.json',import.meta.url));
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const implementation=path.resolve(process.argv[2]??root),native=path.resolve(process.argv[4]??path.join(implementation,'lib/native'));
const manifest=JSON.parse(fs.readFileSync(path.join(implementation,'native/libraries.json'))).libraries;
function verify(name){const entry=manifest.find(x=>x.component===name);assert(entry,'Missing qualified dependency '+name);for(const member of entry.files){const file=path.resolve(native,entry.package,member.path);assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),member.digest);}return entry;}
for(const name of ['storage-runtime','storage-schema','migration-coordinator','wording','policy','http-errors'])verify(name);
const {create_store}=require(path.join(native,'storage_runtime/create_store.js'));
const {change_programs}=require(path.join(native,'storage_schema/change_programs.js'));
const {apply_migrations}=require(path.join(native,'migration_coordinator/apply_migrations.js'));
const {count}=require(path.join(native,'wording/count.js'));
const {authorize}=require(path.join(native,'policy/authorize.js'));
const {can_bind}=require(path.join(native,'policy/can_bind.js'));
const {can_read_goal}=require(path.join(native,'policy/can_read_goal.js'));
const errors=Object.fromEntries(['bad_request','conflict','forbidden','not_found'].map(name=>[name,require(path.join(native,'http_errors/'+name+'.js'))[name]]));
const sourceFile=path.resolve(process.argv[3]??path.join(implementation,'lib/v2/goals.ts'));
const original=fs.readFileSync(sourceFile),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ts=require('typescript');
const output=ts.transpileModule(original.toString(),{fileName:'goals.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});assert.equal(output.diagnostics.length,0);
const compiled=output.outputText;
let qualifiedGoalFactory;
if(compiled.includes('../native/.bindings/server_goals.js')){verify('server-goals');qualifiedGoalFactory=require(path.join(native,'server_goals/create_goals.js')).create_goals;assert.equal(typeof qualifiedGoalFactory,'function');}
const evaluate=new Function('require','exports',compiled),at='2026-01-02T03:04:05.000Z';
function storeAt(directory){const shared={};const store=create_store({dataDir:()=>directory,shared,DatabaseSync,join:path.join,existsSync:fs.existsSync,mkdirSync:fs.mkdirSync,chmodSync:fs.chmodSync,random:()=>0,setTimeout,schemaVersion:change_programs().length,changePrograms:change_programs,applyMigrations:apply_migrations,count});return {store,close(){if(shared.__alignV2Db){shared.__alignV2Db.domain.close();shared.__alignV2Db.auth.close();}}};}
function serviceAt(store,counter,countReads){
 const groups={
  '../native/.bindings/server_goals.js':{create_goals:qualifiedGoalFactory},
  './db':{...store,get(sql,...args){const row=store.get(sql,...args);if(sql==='SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?')countReads.push(row.n);return row;}},
  './errors':{badRequest:errors.bad_request,conflict:errors.conflict,forbidden:errors.forbidden,notFound:errors.not_found},
  './ids':{newId:prefix=>prefix+'_'+(++counter.id),nowIso:()=>at,sha256hex:value=>hash(value)},
  './policy':{canBind:can_bind,canReadGoal:can_read_goal},
  './workspaces':{need(pp,action,object){const decision=authorize(pp,action,object);assert(decision.ok,JSON.stringify(decision));}},
  './goal-limits':{limitsIn:value=>{assert(Array.isArray(value)&&value.length===0);return [];},limitsOf:row=>JSON.parse(row.limits_json||'[]')},
  './retention':{personName:(_id,name)=>name},
  './validate':{str:(body,key,max)=>{assert.equal(typeof body[key],'string');assert(body[key].length<=max);return body[key];},optStr:(body,key)=>body[key]??null,cleanName:s=>s},
  './text-core.mts':{isBlankText:s=>!s.trim()},'./change-words.mts':{DEPENDS_ON_MAX:5},
  './events':{event(){throw new Error('Unexpected limit event');}},
 };
 for(const name of ['./directives','./requests','./alignments','./allocation','./steering','./reallocations','./approval'])groups[name]=new Proxy({},{get(_target,key){throw new Error('Unexpected surrounding service '+name+'/'+String(key));}});
 const exports={};evaluate(name=>{assert(Object.hasOwn(groups,name),name);return groups[name];},exports);return exports;
}
async function testCase(round,held,initial){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'owned-goal-cap-')),a=storeAt(directory),b=storeAt(directory),counter={id:0},reads=[];
 let lock;try{
  a.store.authDb().exec('CREATE TABLE ba_user (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL)');a.store.migrate();
  a.store.run("INSERT INTO ba_user(id,name,email) VALUES('u1','One','u1@example.test')");
  a.store.run("INSERT INTO v2_workspaces(id,name,created_by,created_at) VALUES('ws1','Owned cap control','u1',?)",at);
  a.store.run("INSERT INTO v2_members(ws_id,user_id,role,created_at) VALUES('ws1','u1','owner',?)",at);
  const pp={userId:'u1',wsId:'ws1',wsRole:'owner',pods:new Map()},serviceA=serviceAt(a.store,counter,reads),serviceB=serviceAt(b.store,counter,reads);
  await a.store.tx(()=>{for(let i=0;i<initial;i++)serviceA.insertGoal(pp,{title:'Existing '+i,level:'team',podId:null,visibility:'workspace',measures:[],anchors:{repos:[],branch_patterns:[],issues:[]},dependsOn:[]},at);});
  b.store.get('SELECT COUNT(*) AS n FROM v2_goals');
  if(held){lock=new DatabaseSync(a.store.dbFile());lock.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE');}
  const first=serviceA.createGoal(pp,{title:'First queued create'}),second=serviceB.createGoal(pp,{title:'Second queued create'});
  if(held){assert.deepEqual(reads,[initial,initial]);await new Promise(resolve=>setTimeout(resolve,35));lock.exec('COMMIT');lock.close();lock=undefined;}
  const results=await Promise.allSettled([first,second]);
  const goalCount=a.store.get('SELECT COUNT(*) AS n FROM v2_goals').n,versionCount=a.store.get('SELECT COUNT(*) AS n FROM v2_goal_versions').n,auditCount=a.store.get("SELECT COUNT(*) AS n FROM v2_audit WHERE action='goal.created'").n;
  assert.equal(a.store.all('PRAGMA foreign_key_check').length,0);assert.equal(versionCount,goalCount);assert.equal(auditCount,goalCount);
  const fulfilled=results.filter(x=>x.status==='fulfilled').length,refusals=results.filter(x=>x.status==='rejected').map(x=>({code:x.reason.code,message:x.reason.message}));
  if(initial===1000){assert.equal(fulfilled,0);assert.equal(goalCount,1000);assert(refusals.every(x=>x.code==='too_many_goals'));}
  else { /* All outcomes are recorded before the aggregate cap invariant is checked. */ }
  return {round,held,initial,pre_transaction_count_reads:reads,fulfilled,refusals,goalCount,versionCount,auditCount,foreign_key_violations:0,cap_exceeded:goalCount>1000,passed:goalCount===1000&&fulfilled===(initial===1000?0:1)&&refusals.length===(initial===1000?2:1)&&refusals.every(x=>x.code==='too_many_goals')};
 }finally{if(lock){try{lock.exec('ROLLBACK');}catch{}lock.close();}a.close();b.close();}
}
async function main(){
 const results=[];
 for(let round=0;round<3;round++){results.push(await testCase(round,false,999));results.push(await testCase(round,true,999));}
 results.push(await testCase(0,false,1000));
 assert.deepEqual(fs.readFileSync(sourceFile),original);
 const failed=results.filter(x=>!x.passed).length;
 console.log(JSON.stringify({schema:'align/goal-cap-regression@1',passed:results.length-failed,failed,host:process.platform,node:process.version,source_sha256:hash(original),qualified_store_and_schema:true,independent_connections:true,owned_third_write_lock:true,actual_foreign_keys_versions_and_audits_verified:true,controlled_surrounding_services:['input services for valid empty content','unused neighbouring services fail closed'],results}));
 if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
