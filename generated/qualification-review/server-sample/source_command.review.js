// Review template only. Do not execute. Every executable segment is preserved.
// REVIEW_LITERAL names identify decoded JSON data in manifest.json.
'use strict';
// Private sample acceptance. Original subject implementation is excluded.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),os=require('node:os');
const BODIES=REVIEW_LITERAL_BODIES,CACHE=new Map();
function trusted(name){if(CACHE.has(name))return CACHE.get(name).exports;assert(Object.hasOwn(BODIES,name),'Unknown private module');const m={exports:{}};CACHE.set(name,m);new Function('require','module','exports',BODIES[name])(key=>{const resolved=name.startsWith('dependency/')&&(key.startsWith('./')||key.startsWith('../'))?path.posix.join(path.posix.dirname(name),key):key;return Object.hasOwn(BODIES,resolved)?trusted(resolved):(assert(['node:assert/strict','node:fs','node:path','node:vm','node:crypto','node:sqlite'].includes(key),'Unexpected private dependency: '+key),require(key));},m,m.exports);return m.exports;}
const dependencies=Object.assign({},...["dependency/storage_runtime/create_store.js","dependency/storage_schema/change_programs.js","dependency/migration_coordinator/apply_migrations.js","dependency/wording/count.js","dependency/policy/authorize.js","dependency/server_workspace_admission/create_creation.js"].map(trusted));
const loader=trusted('loader'),bindings=trusted('./server-workspaces-binding-cases-v1.mjs'),sample=trusted('./server-workspaces-sample-fixture-v2.mjs');
const workspace=trusted('dependency/server_workspaces/create_workspaces.js');
const loadWorkspace=async f=>workspace.create_workspaces({...f.resources,readDate:()=>f.Clock});
const PLANS=REVIEW_LITERAL_PLANS,CAPABILITIES=["server-sample.create-sample"],SYMBOLS=['create_sample'],CASE_IDS=PLANS.map((p,i)=>p.capability+'-'+String(i+1).padStart(3,'0'));
const wire=value=>JSON.parse(JSON.stringify(value));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
const digest=value=>({sha256:crypto.createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')});
async function runSelected(root,surface,selected){
 assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
 const indices=selected.map(item=>{assert(Array.isArray(item.arguments)&&item.arguments.length===1);const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);assert.equal(item.capability,PLANS[index].capability);assert.equal(typeof item.case_id,'string');return index;});assert.equal(new Set(indices).size,indices.length);
 const metadata={SAMPLE_NAME:'string',SAMPLE_REASON:'string',SAMPLE_LIMIT_TEXT:'string',createSampleWorkspace:[3,'AsyncFunction']};
 const adapter=loader.createCandidateAdapter(root,surface,'sample',metadata,bindings.SAMPLE_RESOURCES),results=[];
 for(let position=0;position<indices.length;position++){
  const plan=PLANS[indices[position]],item=selected[position];let value;
  if(plan.kind==='sample')value=await sample.runSampleCases(adapter.load);
  else if(plan.kind==='clock')value=await sample.sampleCase(adapter.load,{changingClock:true});
  else if(plan.kind==='isolation')value=await sample.sampleInstanceIsolation(await adapter.sameModuleLoad());
  else if(plan.kind==='bindings')value=bindings.checkSampleBindings((await adapter.fresh()).factory);
  else{
   assert.equal(plan.kind,'populated');const parent=fs.mkdtempSync(path.join(os.tmpdir(),'owned-sample-native-'));let complete=false;
   try{value=await trusted('./server-workspaces-sample-populated-fixture-v1.mjs').samplePopulated({directory:path.join(parent,'cases'),dependencies,loadWorkspace,loadSample:adapter.load});complete=true;}
   finally{if(complete)fs.rmSync(parent,{recursive:true,force:true});else process.stderr.write('Failed owned fixture retained: '+parent+'\n');}
  }
  value=wire(value);assert.deepEqual(value,plan.golden,'Sample source, binding or populated behavior differs in batch '+indices[position]);
  results.push({case_id:item.case_id,capability:item.capability,result:digest(value)});
 }
 adapter.audit();return results;
}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,PLANS,runSelected,digest,loader};
if(require.main===module){if(typeof vm.SyntheticModule!=='function'||typeof vm.SourceTextModule!=='function'){const child=require('node:child_process').spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules',__filename,...process.argv.slice(2)],{stdio:'inherit',timeout:240000});if(child.error)throw child.error;process.exit(child.status??1);}const args=process.argv.slice(2);assert.equal(args.length,3);runSelected(args[0],JSON.parse(args[1]),JSON.parse(args[2])).then(cases=>process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n')).catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});}

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');const verifier=module.exports,args=JSON.parse(process.argv[1]);assert(Array.isArray(args)&&args.length===1&&Number.isSafeInteger(args[0])&&verifier.PLANS[args[0]]);const plan=verifier.PLANS[args[0]];
const privateFiles=REVIEW_LITERAL_privateFiles,privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'owned-sample-source-'));for(const [name,text]of Object.entries(privateFiles)){const file=path.join(privateRoot,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}verifier.runSelected(privateRoot,null,[{case_id:'profile',capability:plan.capability,arguments:args}]).then(cases=>process.stdout.write(JSON.stringify(cases[0].result)+'\n')).catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;}).finally(()=>fs.rmSync(privateRoot,{recursive:true,force:true}));

