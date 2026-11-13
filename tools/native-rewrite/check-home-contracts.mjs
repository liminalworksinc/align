// Check Home metadata and complete runtime-export coverage without execution.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const h=require("./home-harness.cjs"),ts=require(path.join(here,"../../components/legacy-project-wrapper/implementation/node_modules/typescript/lib/typescript.js"));
const [source,contractsPath]=process.argv.slice(2),contracts=JSON.parse(fs.readFileSync(contractsPath,"utf8"));
assert.equal(contracts.kind,"library");assert.deepEqual(Object.keys(contracts.capabilities).sort(),Object.values(h.CAPABILITY).sort());
const ast=ts.createSourceFile("home-core.mts",fs.readFileSync(path.join(source,"home-core.mts"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
assert.equal(ast.parseDiagnostics.length,0);const declarations=new Map(),exports=[];
for(const s of ast.statements) {
  assert(!ts.isImportDeclaration(s),"Home boundary gained an import");
  const exported=s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  if(ts.isFunctionDeclaration(s)&&exported)exports.push(s.name.text);
  if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations){declarations.set(d.name.text,d.initializer);if(exported)exports.push(d.name.text);}
}
assert.deepEqual(exports.sort(),[...h.FUNCTIONS,...h.DATA].sort());
const expected={EVIDENCE_CLASSES:["delivery_receipt","agent_reported","not_observed"],EVIDENCE_WORDS:{delivery_receipt:"Delivery receipt",agent_reported:"Agent reported",not_observed:"Not observed"},UNLAUNCHED_STATES:["pending","not_yet"]};
for(const [name,value] of Object.entries(expected)) {
  let node=declarations.get(name);while(ts.isAsExpression(node))node=node.expression;
  const actual=ts.isArrayLiteralExpression(node)?node.elements.map(e=>e.text):ts.isObjectLiteralExpression(node)?Object.fromEntries(node.properties.map(p=>[p.name.text,p.initializer.text])):undefined;
  assert.deepEqual(actual,value,"Home metadata drift "+name);
  assert(contracts.capabilities[h.CAPABILITY.data].includes(name));
  for(const text of Array.isArray(value)?value:Object.values(value))assert(contracts.capabilities[h.CAPABILITY.data].includes(text));
}
for(const [op,cap] of Object.entries(h.CAPABILITY)) {
  const text=contracts.capabilities[cap];assert(text.startsWith("JavaScript module home_attention/"+h.SYMBOL[op]+" exports "));
  assert(!/\/Users\/|\/tmp\/|localhost:|[A-Za-z]:\\/.test(text),"host locator in Home contract");
}
console.log(JSON.stringify({capabilities:9,public_data:3,source_executed:false}));
