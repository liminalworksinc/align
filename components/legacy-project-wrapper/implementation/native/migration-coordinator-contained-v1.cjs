'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"a0f3bb77bf73c4092fe5e161688b21625c263d456e899a3f1cc5244895d19ec1","package":"migration_coordinator","package_files":["apply_migrations.js","package.json"],"maximum_cases":21,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {const MIGRATION_WORDING={"files":{"count.js":{"source":"'use strict';\nconst {plural}=require('./plural.js');\nfunction count(n,one,many=one+'s',fmt=String){return fmt(n)+' '+plural(n,one,many);}\nmodule.exports={count};\n","sha256":"0d71b7a5ac7d9ae4e7d27283dff53b802cfc2a5a9cb7b52d78f789554ded26a7"},"plural.js":{"source":"'use strict';\nfunction plural(n,one,many=one+'s'){return n===1?one:many;}\nmodule.exports={plural};\n","sha256":"d263327901ef7f54011023f3245f2b050eb2394bd8e48216574584c07cce75f2"}}};
const MIGRATION_SOURCE_SHA256="e4c493e2e1a34e3810f2a13e17e94304abdff2555b2b99698e4dcb5e42eac12f";
"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {DatabaseSync}=require("node:sqlite"),{stripTypeScriptTypes}=require("node:module");
const {createHash}=require("node:crypto"),{pathToFileURL}=require("node:url");
const CAPABILITY="storage-upgrade.apply-migrations",SYMBOL="apply_migrations";
const hash=x=>createHash("sha256").update(x).digest("hex");
function count(n,one){
  const files=MIGRATION_WORDING.files,cache=new Map();
  function load(name){if(cache.has(name))return cache.get(name).exports;const r=files[name];assert(r);assert.equal(hash(r.source),r.sha256);const m={exports:{}};cache.set(name,m);new Function("require","module","exports",r.source)(relative=>{assert(relative.startsWith("./"));return load(path.posix.normalize(path.posix.join(path.posix.dirname(name),relative)));},m,m.exports);return m.exports;}
  return load("count.js").count(n,one);
}
function* vectors(){
  for(let start=0;start<=23;start++)yield {target:22,start};
  for(const target of [0,1,2,3,7])for(let start=0;start<=target+1;start++)yield {target,start};
  for(const target of [0,1,3,7,22])for(const start of [...new Set([0,target,target+1])])for(const kind of ["error","object","string","undefined"])yield {target,start,faults:[{op:"complete",kind,id:"completion"}]};
  for(const target of [1,3,7,22])for(const start of [0,target-1]){
    const positions=[...new Set([start+1,target])];
    for(const at of positions){
      for(const op of ["begin","apply","brokenReferences","writeVersion","commit"])
        for(const kind of ["error","object","string","undefined"])yield {target,start,faults:[{op,at,kind,id:"primary"}]};
      for(const broken of [1,2,3])yield {target,start,brokenAt:at,broken};
      for(const kind of ["error","object","string","undefined"])yield {target,start,brokenAt:at,broken:2,faults:[{op:"referenceError",at,kind,id:"primary"}]};
      for(const cleanup of ["rollback","enable","both"])yield {target,start,brokenAt:at,broken:2,faults:[{op:"referenceError",at,kind:"object",id:"primary"},...(cleanup!=="enable"?[{op:"rollback",at,kind:"object",id:"rollback"}]:[]),...(cleanup!=="rollback"?[{op:"setReferences",enabled:true,kind:"object",id:"enable"}]:[])]};
      for(const primary of ["apply","brokenReferences","writeVersion","commit"]){
        yield {target,start,faults:[{op:primary,at,kind:"object",id:"primary"},{op:"rollback",at,kind:"object",id:"rollback"}]};
        yield {target,start,faults:[{op:primary,at,kind:"object",id:"primary"},{op:"setReferences",enabled:true,kind:"object",id:"enable"}]};
        yield {target,start,faults:[{op:primary,at,kind:"object",id:"primary"},{op:"rollback",at,kind:"object",id:"rollback"},{op:"setReferences",enabled:true,kind:"object",id:"enable"}]};
      }
    }
    for(const op of ["readVersion","setReferences"]){for(const kind of ["error","object","string","undefined"])yield {target,start,faults:[{op,...(op==="setReferences"?{enabled:false}:{}),kind,id:"initial"}]};}
    yield {target,start,faults:[{op:"setReferences",enabled:true,kind:"object",id:"enable"}]};
    yield {target,start,faults:[{op:"begin",at:start+1,kind:"object",id:"begin"},{op:"setReferences",enabled:true,kind:"object",id:"enable"}]};
  }
}
const countVectors=()=>[...vectors()].length;
function errorValue(f){return f.kind==="error"?new Error("fixture "+f.id):f.kind==="object"?{fixture:f.id}:f.kind==="string"?"fixture "+f.id:undefined;}
function fixture(vector,execute){
  const db=new DatabaseSync(":memory:",{enableForeignKeyConstraints:true}),trace=[],committed=[],faults=(vector.faults||[]).map(f=>({...f,value:errorValue(f),used:false}));
  const migrations=Array.from({length:vector.target},(_,i)=>{
    const n=i+1,bad=n===vector.brokenAt?vector.broken:0;
    return `CREATE TABLE fixture_step_${n}(id INTEGER PRIMARY KEY,value TEXT NOT NULL,parent_id INTEGER REFERENCES fixture_parent(id)); INSERT INTO fixture_step_${n} VALUES(1,'Keep café 東京',1);`+Array.from({length:bad},(_,j)=>`INSERT INTO fixture_step_${n} VALUES(${j+2},'Broken fixture',999);`).join("");
  });
  const rawExec=db.exec.bind(db),rawPrepare=db.prepare.bind(db);
  rawExec("CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); INSERT INTO fixture_parent VALUES(1)");
  for(let i=0;i<Math.min(vector.start,vector.target);i++)rawExec(migrations[i]);
  rawExec("PRAGMA user_version="+vector.start);
  let next=vector.start+1,inTransaction=false,completed=0;
  function observe(op,args=[]){
    trace.push([op,...args]);
    const match=faults.find(f=>!f.used&&f.op===op&&(f.at===undefined||f.at===next)&&(f.enabled===undefined||f.enabled===args[0]));
    if(match){match.used=true;throw match.value;}
  }
  function exec(sql){
    let op,args=[];
    if(sql==="BEGIN IMMEDIATE")op="begin";
    else if(sql==="COMMIT")op="commit";
    else if(sql==="ROLLBACK")op="rollback";
    else if(sql==="PRAGMA foreign_keys = OFF"){op="setReferences";args=[false];}
    else if(sql==="PRAGMA foreign_keys = ON"){op="setReferences";args=[true];}
    else if(/^PRAGMA user_version = \d+$/.test(sql)){op="writeVersion";args=[Number(sql.split(" = ")[1])];}
    else {const i=migrations.indexOf(sql);assert(i>=0,"Unknown verifier SQL");op="apply";args=[i+1];}
    observe(op,args);const result=rawExec(sql);
    if(op==="begin")inTransaction=true;
    if(op==="rollback")inTransaction=false;
    if(op==="commit"){inTransaction=false;committed.push(rawPrepare("PRAGMA user_version").get().user_version);next++;}
    return result;
  }
  function prepare(sql){
    if(sql==="PRAGMA user_version")return {get(){observe("readVersion");return rawPrepare(sql).get();}};
    if(sql==="PRAGMA foreign_key_check")return {all(){observe("brokenReferences");return rawPrepare(sql).all();}};
    throw new Error("Unexpected verifier query "+sql);
  }
  const driver={exec,prepare};
  const complete=()=>{observe("complete");completed++;};
  const context={
    changeCount:vector.target,
    readVersion(){assert.equal(this,context);return Number(prepare("PRAGMA user_version").get().user_version);},
    setReferences(enabled){assert.equal(this,context);exec("PRAGMA foreign_keys = "+(enabled?"ON":"OFF"));},
    begin(){assert.equal(this,context);exec("BEGIN IMMEDIATE");},
    apply(version){assert.equal(this,context);exec(migrations[version-1]);},
    brokenReferences(){assert.equal(this,context);return prepare("PRAGMA foreign_key_check").all().length;},
    referenceError(version,n){assert.equal(this,context);observe("referenceError",[version,n]);return new Error(`migration ${version} left ${count(n,"broken reference")}`);},
    writeVersion(version){assert.equal(this,context);exec("PRAGMA user_version = "+version);},
    commit(){assert.equal(this,context);exec("COMMIT");},
    rollback(){assert.equal(this,context);exec("ROLLBACK");},
    complete(){assert.equal(this,context);complete();},
  };
  function error(e){const m=faults.find(f=>f.used&&f.value===e);return m?{marker:m.id,identity:true,kind:m.kind}:{name:e?.name??null,message:e?.message??null};}
  try {
    let outcome;try{const result=execute(context,driver,migrations,complete,(n,label)=>{observe("referenceError",[next,n]);return count(n,label);});outcome={returned_undefined:result===undefined,is_promise:result instanceof Promise};}catch(e){outcome={error:error(e)};}
    const tables=rawPrepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>({name,rows:rawPrepare('SELECT * FROM "'+name+'" ORDER BY id').all()}));
    return {trace,outcome,version:rawPrepare("PRAGMA user_version").get().user_version,foreign_keys:rawPrepare("PRAGMA foreign_keys").get().foreign_keys,committed,in_transaction:inTransaction,completed,faults:faults.map(f=>({id:f.id,used:f.used})),tables};
  } finally {db.close();}
}
function baseline(root){
  const source=fs.readFileSync(path.join(root,"migrate.ts"),"utf8");assert.equal(hash(source),MIGRATION_SOURCE_SHA256);
  const js=stripTypeScriptTypes(source,{mode:"strip"}).replace(/^export function migrate\(/,"function migrate(");
  assert(!/\b(?:import|export)\b/.test(js));
  return (_context,driver,migrations,complete,formatCount)=>new Function("openDb","MIGRATIONS","lockDown","count",js+"\nreturn migrate;")(()=>({domain:driver,file:"owned-fixture"}),migrations,complete,formatCount)();
}
async function generated(root,surface){
  const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY);
  if(surface)assert(binding?.symbols.includes(SYMBOL),"Missing coordinator symbol");
  const modulePath=binding?.module||"migration_coordinator/apply_migrations",files=[];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith(".")||e.name==="node_modules")continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(c|m)?js$/.test(e.name))files.push(f);}}
  walk(root);const normalize=p=>p.replaceAll(path.sep,"/");
  const matches=files.filter(f=>normalize(f).endsWith("/"+modulePath+".js")||normalize(f).endsWith("/"+modulePath+".cjs")||normalize(f).endsWith("/"+modulePath+".mjs"));
  assert.equal(matches.length,1,"Ambiguous coordinator module");const m=await import(pathToFileURL(matches[0]).href),fn=m[SYMBOL]??m.default?.[SYMBOL];assert.equal(typeof fn,"function");
  return context=>fn(context);
}
function runBatch(execute,start,limit){
  assert(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(limit)&&limit>0);const digest=createHash("sha256");let i=0,n=0;
  for(const vector of vectors()){if(i++<start)continue;if(n===limit)break;digest.update(JSON.stringify({vector,observed:fixture(vector,execute)})+"\n");n++;}
  assert.equal(n,limit);return {observations:n,sha256:digest.digest("hex")};
}
async function main(){
  if(["--baseline","--generated"].includes(process.argv[1])){const [mode,raw]=process.argv.slice(1),[start,limit]=JSON.parse(raw);const execute=mode==="--baseline"?baseline(process.cwd()):await generated(process.cwd());process.stdout.write(JSON.stringify(runBatch(execute,start,limit))+"\n");}
  else{const [root,surfaceRaw,casesRaw]=process.argv.slice(2),execute=await generated(root,JSON.parse(surfaceRaw)),cases=[];for(const c of JSON.parse(casesRaw)){assert.equal(c.capability,CAPABILITY);const [start,limit]=c.arguments;cases.push({case_id:c.case_id,capability:CAPABILITY,result:runBatch(execute,start,limit)});}process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");}
}
module.exports={CAPABILITY,SYMBOL,vectors,countVectors,fixture,baseline,generated,runBatch,count};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});
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
