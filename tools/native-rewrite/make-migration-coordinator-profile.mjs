// Capture the exact retained coordinator before candidate generation.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const h=require("./migration-coordinator-harness.cjs");
const [sourceRaw,profileRaw,captureRaw]=process.argv.slice(2);
assert(sourceRaw&&profileRaw&&captureRaw,"usage: node make-migration-coordinator-profile.mjs SOURCE_SNAPSHOT PROFILE CAPTURE");
const source=path.resolve(sourceRaw),profileFile=path.resolve(profileRaw),captureFile=path.resolve(captureRaw);
assert.notEqual(profileFile,captureFile);
assert(!fs.existsSync(profileFile)&&!fs.existsSync(captureFile),"refuse existing capture outputs");
const baseline=h.baseline(source),total=h.countVectors(),cases=[];
for(let start=0;start<total;start+=32){
  const limit=Math.min(32,total-start);
  cases.push({case_id:"storage-upgrade.apply-migrations-"+String(cases.length).padStart(3,"0"),arguments:[start,limit],expected_result:h.runBatch(baseline,start,limit)});
}
const packed=fs.readFileSync(path.join(here,"migration-coordinator-harness.cjs")).toString("base64");
const invoke=mode=>["node","-e",`eval(Buffer.from('${packed}','base64').toString())`,"--",mode];
const build=`
const fs = require('fs'), p = require('path'), cp = require('child_process');
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d).sort()) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const f = p.join(d, n);
    if (fs.statSync(f).isDirectory()) walk(f);
    else if (/\\.(c|m)?js$/.test(n)) files.push(f);
  }
})('.');
if (!files.length) throw new Error('no JavaScript source');
for (const f of files) cp.execFileSync(process.execPath, ['--check', f], {stdio: 'inherit'});
`;
const profile={
  schema:"urn:literate-ai:schema:v2:local-regenerative-qualification-profile",
  profile_id:"align-migration-coordinator-host-v1",
  generated_root:"source",
  build_command:["node","-e",`eval(Buffer.from('${Buffer.from(build).toString("base64")}','base64').toString())`],
  test_commands:[["node","main.js","--litai-test"]],
  source_command:invoke("--baseline"),generated_command:invoke("--generated"),
  covered_surface_ids:[h.CAPABILITY],minimum_clean_runs:2,
  timeout_seconds:900,maximum_output_bytes:1048576,cases,
};
const capture={schema:"align/migration-coordinator-profile-capture@1",passed:true,observations:total,batches:cases.length,cases};
for(const [file,value] of [[profileFile,profile],[captureFile,capture]]){
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n",{flag:"wx"});
}
console.log(JSON.stringify({observations:total,batches:cases.length,minimum_clean_runs:2}));
