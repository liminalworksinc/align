// Review template only. Do not execute. Every executable segment is preserved.
// REVIEW_LITERAL names identify decoded JSON data in manifest.json.
// Canonical generated package gate. Private qualifier command, no subject algorithm.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(),packageRoot=path.join(root,'server_auth');
assert(!fs.lstatSync(root).isSymbolicLink());assert(!fs.lstatSync(packageRoot).isSymbolicLink());
const manifestPath=path.join(packageRoot,'package.json');assert(!fs.lstatSync(manifestPath).isSymbolicLink());
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
assert.equal(manifest.name,'server_auth');assert.equal(manifest.type,'commonjs');
for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])if(manifest[field]!==undefined){
 assert(manifest[field]&&typeof manifest[field]==='object'&&!Array.isArray(manifest[field]));assert.equal(Object.keys(manifest[field]).length,0);
}
assert(manifest.exports&&typeof manifest.exports==='object'&&!Array.isArray(manifest.exports));
assert.deepEqual(Object.keys(manifest.exports),['./create_auth']);assert.equal(manifest.exports['./create_auth'],'./create_auth.js');
for(const name of ['server_auth/create_auth.js','main.js']){
 const file=path.join(root,name);assert(!fs.lstatSync(file).isSymbolicLink());assert(fs.statSync(file).isFile());
}
const files=[];
(function walk(directory){for(const name of fs.readdirSync(directory).sort()){
 const file=path.join(directory,name),status=fs.lstatSync(file);assert(!status.isSymbolicLink(),'Generated source symlink');
 if(status.isDirectory()){assert(name!=='node_modules');walk(file);}
 else if(/\.(?:c|m)?js$/.test(name))files.push(file);
}})(root);
assert(files.length>=2);
for(const file of files)cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe',timeout:10000});
process.stdout.write(JSON.stringify({schema:'align/server-auth-package-build@1',passed:true,javascript_files:files.length})+'\n');
