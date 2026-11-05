// Prepare the original generic signature and a native alias outside retained source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json")),ts=require("typescript"),f=ts.factory;
const [sourceRaw,outputRaw]=process.argv.slice(2),source=path.resolve(sourceRaw),output=path.resolve(outputRaw),implementation=path.resolve(here,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output),"refuse an existing queue binding draft");assert(!output.startsWith(implementation+path.sep),"draft remains outside retained source until qualified registration");
const tree=ts.createSourceFile("locks.ts",fs.readFileSync(source,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const exports=tree.statements.filter(s=>s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));assert.equal(exports.length,1);const fn=exports[0];assert(ts.isFunctionDeclaration(fn)&&fn.name.text==="withLock"&&fn.type&&fn.typeParameters.length===1);
const parameters=fn.parameters.map(p=>{assert(p.type&&!p.initializer);return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,p.questionToken,p.type,undefined);});
const signature=f.createFunctionTypeNode(fn.typeParameters,parameters,fn.type),printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const text='// Public generic signature for the independently qualified shared promise queue.\nimport * as native from "./native/.bindings/promise_queues.js";\n\nexport const withLock = native.with_lock as '+printer.printNode(ts.EmitHint.Unspecified,signature,tree)+';\n';
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,text);console.log(JSON.stringify({public_functions:1,generic_parameters:1,runtime_algorithms:0,applied:false}));
