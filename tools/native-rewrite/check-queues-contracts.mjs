// Inert checks for the one public generic function and shared Map initialization.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json")),ts=require("typescript");
const [source,contractFile]=process.argv.slice(2),tree=ts.createSourceFile("locks.ts",fs.readFileSync(path.join(source,"locks.ts"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
assert.equal(tree.parseDiagnostics.length,0);assert.equal(tree.statements.length,3);assert(!tree.statements.some(ts.isImportDeclaration));
const exports=tree.statements.filter(node=>node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));assert.equal(exports.length,1);
const fn=exports[0];assert(ts.isFunctionDeclaration(fn));assert.equal(fn.name.text,"withLock");assert(fn.modifiers.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword));assert.deepEqual(fn.typeParameters.map(p=>p.name.text),["T"]);
assert.deepEqual(fn.parameters.map(p=>p.name.getText(tree)),["key","fn"]);assert.equal(fn.parameters[0].type.getText(tree),"string");assert.equal(fn.parameters[1].type.getText(tree).replaceAll(/\s/g,""),"()=>Promise<T>");assert.equal(fn.type.getText(tree),"Promise<T>");
const variables=tree.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]);assert.deepEqual(variables.map(v=>v.name.getText(tree)),["g","locks"]);
assert(variables[0].initializer.getText(tree).startsWith("globalThis as unknown as"));assert.equal(variables[1].initializer.getText(tree).replaceAll(/\s/g,""),"(g.__alignLocks??=newMap())");
const body=fn.body.getText(tree);for(const fragment of ["locks.get(key) ?? Promise.resolve()","prev.then(() => next)","locks.set(key, tail)","await prev.catch(() => undefined)","return await fn()","release()","locks.get(key) === tail","locks.delete(key)"])assert(body.includes(fragment),"source queue clause changed: "+fragment);
const contracts=JSON.parse(fs.readFileSync(contractFile,"utf8"));assert.deepEqual(Object.keys(contracts.capabilities),["promise-queues.with-lock"]);const text=contracts.capabilities["promise-queues.with-lock"];
for(const fragment of ["globalThis.__alignLocks","native Map identity","previous.then(() => releasePromise)","previous.catch(() => undefined)","return await","finally","exact tail","original return reference","no receiver and no arguments","no timers"])assert(text.includes(fragment),"contract queue clause missing: "+fragment);
console.log(JSON.stringify({capabilities:1,public_functions:1,generic_type_parameters:1,shared_global_maps:1,source_executed:false}));
