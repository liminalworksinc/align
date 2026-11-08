// Compare the runtime image's exact operator files with independently prepared pinned inputs.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareOperator } from "./prepare-operator.mjs";

if (process.argv.length !== 3) throw new Error("Usage: node scripts/test-operator-image.mjs IMAGE");
const implementation = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "align-operator-image-"));
try {
  const {manifest} = prepareOperator(implementation, path.join(temporary, "runtime"));
  const probe = `
    const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
    const files=[];
    function visit(directory,prefix){for(const name of fs.readdirSync(directory).sort()){
      const file=path.join(directory,name),relative=prefix+name,stat=fs.lstatSync(file);
      if(stat.isDirectory()){
        if((stat.mode&0o777)!==0o755)throw new Error('Unexpected operator directory mode '+relative);
        visit(file,relative+'/');
      }
      else if(stat.isFile())files.push({path:relative,mode:stat.mode&0o777,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
      else throw new Error('Unsupported operator runtime file '+relative);
    }}
    for(const name of ['lib','scripts'])visit('/app/'+name,name+'/');
    console.log(JSON.stringify({manifest:JSON.parse(fs.readFileSync('/app/.operator-manifest.json')),files}));
  `;
  const result = spawnSync("docker", ["run", "--rm", "--pull=never", "--network", "none", "--read-only",
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "32", "--memory", "128m",
    "--cpus", "1", "--user", "node", "--entrypoint", "node", process.argv[2], "-e", probe],
    {encoding:"utf8", timeout:30000, maxBuffer:2*1024*1024});
  assert.ifError(result.error);
  assert.equal(result.status,0,result.stderr);
  const actual = JSON.parse(result.stdout);
  assert.deepEqual(actual.manifest,manifest,"Operator manifest differs from the reviewed inputs");
  assert.deepEqual(actual.files,manifest.files,"Runtime code differs from the exact pinned operator closure");
  console.log(JSON.stringify({files:manifest.files.length,qualified_packages:manifest.libraries.length,exact_source_and_package_bytes:true}));
} finally {
  fs.rmSync(temporary,{recursive:true,force:true});
}
