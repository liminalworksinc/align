// Review template only. Do not execute. Every executable segment is preserved.
// REVIEW_LITERAL names identify decoded JSON data in manifest.json.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.cwd(),pkg=path.join(root,'server_sample');assert(!fs.lstatSync(root).isSymbolicLink());assert(fs.lstatSync(pkg).isDirectory()&&!fs.lstatSync(pkg).isSymbolicLink());
const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8'));assert.equal(manifest.name,'server_sample');assert.equal(manifest.type,'commonjs');assert.deepEqual(manifest.exports,{'./create_sample':'./create_sample.js'});
for(const key of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])if(manifest[key]!==undefined)assert.deepEqual(manifest[key],{});
for(const name of ['main.js','server_sample/create_sample.js'])assert(fs.statSync(path.join(root,name)).isFile()&&!fs.lstatSync(path.join(root,name)).isSymbolicLink());
const asset=path.join(pkg,'sample-text.json');assert(fs.lstatSync(asset).isFile()&&!fs.lstatSync(asset).isSymbolicLink());assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(asset)).digest('hex'),'c502a40c1af1342250b646e8bbba9e0bb97e77b49c6b045db156b201be3008f3');const files=[];(function walk(directory){for(const name of fs.readdirSync(directory)){const file=path.join(directory,name),stat=fs.lstatSync(file);assert(!stat.isSymbolicLink());if(stat.isDirectory()){assert(name!=='node_modules');walk(file);}else if(/\.(?:c|m)?js$/.test(name))files.push(file);}})(root);
assert(files.length>=2);for(const file of files)cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe',timeout:10000});
process.stdout.write(JSON.stringify({schema:'align/sample-native-package-build@1',passed:true,javascript_files:files.length})+'\n');

