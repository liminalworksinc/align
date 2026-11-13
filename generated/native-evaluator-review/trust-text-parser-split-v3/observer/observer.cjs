 'use strict';
// Case inputs and observations only. Private expectations are never mounted here.
const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const stringify=JSON.stringify,from=Buffer.from,concat=Buffer.concat,gzip=zlib.gzipSync;
const write=process.stdout.write.bind(process.stdout),h=require('./legacy-observations.cjs');
const chunks=[];let total=0;
function append(value){const raw=from(stringify(value)+'\n');total+=raw.length;assert(total<=64*1024*1024,'Observation expansion bound exceeded');chunks.push(raw);}
h.emitBatch=(methods,op,start,limit,pure)=>{
 let index=0,count=0;
 for(const vector of h.vectors(op)){if(index++<start)continue;if(count===limit)break;append(h.encode(h.observe(methods,op,vector,pure)));count++;}
 assert.equal(count,limit);
};
const fixture=require('./current-observations.cjs'),mod={exports:{}};
new Function('exports','module','require','"use strict";\n'+fs.readFileSync('/inputs/source/trust_text_parser/create_trust_text_parser.js','utf8'))(mod.exports,mod,()=>{throw Error('Forbidden generated module import');});
assert.deepEqual(Object.keys(mod.exports),['create_trust_text_parser']);
const factory=mod.exports.create_trust_text_parser;
assert.equal(typeof factory,'function');assert.equal(factory.name,'create_trust_text_parser');assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');
fixture.run(factory).then(value=>{
 for(const row of value.records)append(row);
 append({schema:'align/parser-additional-observations@1',surface:value.surface,guards:value.guards});
 const output=gzip(concat(chunks),{level:6});assert(output.length<=4*1024*1024,'Compressed observation bound exceeded');write(output);
}).catch(error=>{console.error(error.stack);process.exitCode=1;});
