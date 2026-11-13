// Owned regression controls. Candidate fixtures execute only in the parser containers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const app=path.join(root,'components/legacy-project-wrapper/implementation');
const oracle=JSON.parse(fs.readFileSync(path.join(app,'native/trust-text-parser.json')));
assert.equal(oracle.harness,'trust-text-parser-split-contained-v3.cjs');
const wrapper=path.join(app,'native',oracle.harness);
const selected=oracle.cases.map(({case_id,capability,arguments:args})=>({case_id,capability,arguments:args}));
const source=path.join(root,'generated/native-review-source/trust_text_parser');
const cache=path.join(os.homedir(),'.cache/align-native-oracle-controls');
fs.mkdirSync(cache,{recursive:true,mode:0o700});
const work=fs.mkdtempSync(path.join(cache,'parser-'));
const packageRoot=path.join(work,'trust_text_parser');fs.mkdirSync(packageRoot);
fs.copyFileSync(path.join(source,'package.json'),path.join(packageRoot,'package.json'));
const candidate=path.join(packageRoot,'create_trust_text_parser.js');
const original=fs.readFileSync(path.join(source,'create_trust_text_parser.js'),'utf8');
const judge=fs.readFileSync(path.join(root,'generated/native-evaluator-review/trust-text-parser-split-v3/judge.cjs'),'utf8');
const goldens=JSON.parse(judge.split('const GOLDENS=')[1].split(';\n')[0]);
const privateDigests=[...goldens.plans.map(item=>item.expected_result.sha256),goldens.additional_guard_sha256];
const canary='ALIGN_PARSER_OWNED_HOST_CANARY';assert(!Object.hasOwn(process.env,canary));
const environment={...process.env,[canary]:'owned-public-canary'};
const rows=[];
function invoke(body,env=environment){
 fs.writeFileSync(candidate,body);
 return spawnSync(process.execPath,[wrapper,work,'null',JSON.stringify(selected)],{env,encoding:'utf8',timeout:170000,maxBuffer:4*1024*1024});
}
function rejected(name,body,expected){
 const result=invoke(body);assert(!result.error,String(result.error));assert.notEqual(result.status,0,name);
 assert(privateDigests.every(digest=>!result.stderr.includes(digest)&&!result.stdout.includes(digest)),name+': private digest in diagnostics');
 if(expected)assert(result.stderr.includes(expected),name+': '+result.stderr.slice(-1800));
 rows.push({name,passed:true});return result;
}
try{
 const positive=invoke(original);assert(!positive.error,String(positive.error));assert.equal(positive.status,0,positive.stderr);
 assert.deepEqual(JSON.parse(positive.stdout),{schema:'literate-ai/library-acceptance-results@1',cases:oracle.cases.map(({case_id,capability,expected_result})=>({case_id,capability,result:expected_result}))});
 rows.push({name:'admitted-source-parity',passed:true});
 const read=rejected('private-read',`'use strict';function create_trust_text_parser(resources){
 const p=resources.slug.constructor('return process')(),fs=p.getBuiltinModule('node:fs');
 const read=file=>{try{fs.readFileSync(file);return 'unexpected-read';}catch(error){return error.code;}};
 p.stderr.write('ALIGN_PRIVATE_READ='+JSON.stringify({oracle:read('/inputs/oracle.cjs'),judge:read('/inputs/judge.cjs'),hostCanary:p.env.${canary}??null,uid:p.getuid()})+'\\n');
 throw Error('Owned private-read control');}module.exports={create_trust_text_parser};`,'ALIGN_PRIVATE_READ=');
 const marker=read.stderr.split('\n').find(line=>line.includes('ALIGN_PRIVATE_READ='));
 assert.deepEqual(JSON.parse(marker.split('ALIGN_PRIVATE_READ=')[1]),{oracle:'ENOENT',judge:'ENOENT',hostCanary:null,uid:65532});
 rejected('forged-pass',"process.stdout.write(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases:[]}));process.exit(0);",'Contained evaluator failed');
 rejected('digest-is-not-observations',"const z=process.mainModule.require('node:zlib');process.stdout.write(z.gzipSync(Buffer.from('"+oracle.cases[0].expected_result.sha256+"\\n')));process.exit(0);",'Contained evaluator failed');
 rejected('wrong-parser',"function create_trust_text_parser(resources){return {parseInline:function parseInline(text,opts){return [];},parseMarkdown:function parseMarkdown(text,opts){return [];}};}module.exports={create_trust_text_parser};",'Historical observations differ');
 const needle='function create_trust_text_parser(';assert.equal(original.split(needle).length,2);
 rejected('current-only-option-mutation',original.replace(needle,'function base_parser(')+"\nfunction create_trust_text_parser(resources){const api=base_parser(resources),parse=api.parseInline;return {parseInline:function parseInline(text,opts){const value=parse(text,opts);if(opts?.prefix==='current')opts.ownedMutation=true;return value;},parseMarkdown:api.parseMarkdown};}\n",'Additional observations differ');
 const hostMarker=path.join(work,'forbidden-host-execution');
 const unavailable=invoke("require('node:fs').writeFileSync("+JSON.stringify(hostMarker)+",'forbidden');",{...environment,PATH:''});
 assert.notEqual(unavailable.status,0);assert(unavailable.stderr.includes('Docker runtime unavailable'));assert(!fs.existsSync(hostMarker));
 rows.push({name:'runtime-unavailable-fails-closed',passed:true});
 console.log(JSON.stringify({passed:true,controls:rows.length,candidateHostExecution:false,privateOracleAbsentFromCandidate:true}));
}finally{fs.rmSync(work,{recursive:true,force:true});}
