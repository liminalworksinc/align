// Inert literal and export coverage checks complement semantic contract review.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url),h=require("./wording-harness.cjs");
const ts=require(path.join(here,"../../components/legacy-project-wrapper/implementation/node_modules/typescript/lib/typescript.js"));
const [source,contractsPath]=process.argv.slice(2),contracts=JSON.parse(fs.readFileSync(contractsPath,"utf8"));
assert.equal(contracts.kind,"library");
assert.deepEqual(Object.keys(contracts.capabilities).sort(),Object.values(h.CAPABILITY).sort());
const declarations=new Map();
for(const file of Object.keys(h.MODULES)) {
  const ast=ts.createSourceFile(file,fs.readFileSync(path.join(source,file),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,"source must parse without execution");
  const exported=[];
  for(const statement of ast.statements) {
    const isExport=statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
    if(ts.isFunctionDeclaration(statement)&&isExport)exported.push(statement.name.text);
    if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations) {
      if(ts.isIdentifier(d.name))declarations.set(d.name.text,d.initializer);
      if(isExport)exported.push(d.name.text);
    }
  }
  assert.deepEqual(exported.sort(),[...h.MODULES[file],...(h.DATA[file]||[])].sort(),"uncovered runtime export");
}
const values={BLANK_FILLERS:"\u115f\u1160\u3164\uffa0\u2800",DEPENDS_ON_MAX:5,COUNTER_SAME_AS_PROPOSAL:"That's what the proposal already asks for: approve it instead."};
for(const [name,expected] of Object.entries(values)) {
  const node=declarations.get(name);assert(node,"missing public data "+name);
  const actual=ts.isStringLiteral(node)?node.text:ts.isNumericLiteral(node)?Number(node.text):undefined;
  assert.equal(actual,expected,"public data drift "+name);
}
const labels=declarations.get("LIMIT_WORDS");assert(ts.isObjectLiteralExpression(labels));
assert.deepEqual(Object.fromEntries(labels.properties.map(p=>[p.name.text,p.initializer.text])),{must:"Must",must_not:"Must not",out_of_scope:"Out of scope"});
const dataContract=contracts.capabilities[h.CAPABILITY.wordingData];
for(const name of Object.keys(values))assert(dataContract.includes(name));
assert(dataContract.includes(values.COUNTER_SAME_AS_PROPOSAL));
assert(dataContract.includes("U+115F U+1160 U+3164 U+FFA0 U+2800"));
for(const [op,capability] of Object.entries(h.CAPABILITY)) {
  const text=contracts.capabilities[capability];
  assert(text.startsWith("JavaScript module wording/"+h.SYMBOL[op]+" exports "));
  assert(!/\/Users\/|\/tmp\/|localhost:|[A-Za-z]:\\/.test(text),"host locator in contract");
}
console.log(JSON.stringify({capabilities:17,public_data:3,limit_labels:3,source_executed:false}));
