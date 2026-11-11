// Review template only. Do not execute. Every executable segment is preserved.
// REVIEW_LITERAL names identify decoded JSON data in manifest.json.
// Private independent authentication acceptance. No original implementation.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const BODIES=REVIEW_LITERAL_BODIES,CACHE=new Map();
function trusted(name){if(CACHE.has(name))return CACHE.get(name).exports;assert(Object.hasOwn(BODIES,name));const m={exports:{}};CACHE.set(name,m);new Function('require','module','exports',BODIES[name])(key=>Object.hasOwn(BODIES,key)?trusted(key):(assert(['node:assert/strict','node:fs','node:path','node:vm','node:crypto'].includes(key)),require(key)),m,m.exports);return m.exports;}
const loader=trusted('loader'),bindings=trusted('./server-auth-binding-v2.mjs'),edges=trusted('./server-auth-scenarios-v4.mjs'),bindingCases=trusted('./server-auth-binding-cases-v4.mjs'),precision=trusted('./server-auth-precision-cases-v1.mjs'),extra=trusted('./server-auth-extra-cases-v2.mjs');
const PLANS=REVIEW_LITERAL_PLANS,CAPABILITIES=['server-auth.create-auth'],SYMBOLS=['create_auth'],CASE_IDS=PLANS.map((p,i)=>p.capability+'-'+String(i+1).padStart(3,'0'));
const wire=value=>JSON.parse(JSON.stringify(value));
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const digest=value=>({sha256:crypto.createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')});
async function runSelected(root,surface,selected){
 assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
 const indices=selected.map(item=>{assert(Array.isArray(item.arguments)&&item.arguments.length===1);const index=item.arguments[0];assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);assert.equal(item.capability,PLANS[index].capability);assert.equal(typeof item.case_id,'string');return index;});
 assert.equal(new Set(indices).size,indices.length);
 const adapter=loader.createCandidateAdapter(path.resolve(root),surface,bindings),wanted=indices.map(i=>PLANS[i]);
 const labels=wanted.filter(p=>p.kind==='edges').flatMap(p=>p.labels);
 const rows=labels.length?await edges.runScenarios(adapter.load,{labels}):[];
 const precisionLabels=wanted.filter(p=>p.kind==='precision').flatMap(p=>p.labels);
 const precisionRows=precisionLabels.length?await precision.runPrecision(adapter.load,{labels:precisionLabels}):[];
 const extraLabels=wanted.filter(p=>p.kind==='extra').flatMap(p=>p.labels);
 const extraRows=extraLabels.length?await extra.runExtra(adapter.load,{labels:extraLabels}):[];
 let checkedBindings;
 if(wanted.some(p=>p.kind==='bindings')){const {factory}=await adapter.fresh();checkedBindings=await bindingCases.bindingChecks(factory);}
 const result=[];
 for(let position=0;position<indices.length;position++){
  const plan=PLANS[indices[position]],item=selected[position];
  const value=wire(plan.kind==='bindings'?checkedBindings:plan.labels.map(name=>{const found=(plan.kind==='extra'?extraRows:plan.kind==='precision'?precisionRows:rows).filter(row=>row.name===name);assert.equal(found.length,1);return found[0];}));
  assert.deepEqual(value,plan.golden,'Authentication source/binding observation mismatch');
  result.push({case_id:item.case_id,capability:item.capability,result:digest(value)});
 }
 adapter.audit();return result;
}
async function main(){const args=process.argv.slice(2);assert.equal(args.length,3);const cases=await runSelected(args[0],JSON.parse(args[1]),JSON.parse(args[2]));process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases})+'\n');}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,PLANS,runSelected,digest,loader};
if(require.main===module){if(typeof vm.SourceTextModule!=='function'){const child=require('node:child_process').spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules',__filename,...process.argv.slice(2)],{stdio:'inherit',timeout:240000});if(child.error)throw child.error;process.exit(child.status??1);}main().catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});}

const verifier=module.exports,sourceFs=require('node:fs'),sourceOs=require('node:os'),sourcePath=require('node:path');
const privateFiles=REVIEW_LITERAL_privateFiles;
const root=sourceFs.mkdtempSync(sourcePath.join(sourceOs.tmpdir(),'auth-source-profile-'));
for(const [name,content] of Object.entries(privateFiles)){
 const file=sourcePath.join(root,name);sourceFs.mkdirSync(sourcePath.dirname(file),{recursive:true});sourceFs.writeFileSync(file,content);
}
const args=JSON.parse(process.argv[1]);
require('node:assert/strict')(Array.isArray(args)&&args.length===1&&Number.isSafeInteger(args[0])&&verifier.PLANS[args[0]]);
const plan=verifier.PLANS[args[0]];
verifier.runSelected(root,null,[{case_id:'profile',capability:plan.capability,arguments:args}])
 .then(cases=>process.stdout.write(JSON.stringify(cases[0].result)+'\n'))
 .catch(error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;})
 .finally(()=>sourceFs.rmSync(root,{recursive:true,force:true}));
