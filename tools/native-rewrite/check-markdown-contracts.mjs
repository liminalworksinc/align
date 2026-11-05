// Inert public-surface, node-kind and grammar-literal checks. No source execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const ts=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=createRequire(import.meta.url)("./markdown-harness.cjs");
const [source,contractFile]=process.argv.slice(2),text=fs.readFileSync(path.join(source,"markdown.mts"),"utf8");
const tree=ts.createSourceFile("markdown.mts",text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const contracts=JSON.parse(fs.readFileSync(contractFile,"utf8")),combined=Object.values(contracts.capabilities).join("\n");
assert.equal(contracts.kind,"library");
assert.deepEqual(Object.keys(contracts.capabilities).sort(),Object.values(h.CAPABILITY).sort());
const functions=[],types=[],grammar=new Map(),nodeKinds=new Set();
for(const s of tree.statements){
  const exported=s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  if(exported){
    if(ts.isFunctionDeclaration(s))functions.push(s.name.text);
    else if(ts.isInterfaceDeclaration(s)||ts.isTypeAliasDeclaration(s))types.push(s.name.text);
    else throw new Error("unreviewed Markdown runtime export");
  }
  if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations){
    if(ts.isIdentifier(d.name)&&["EMAIL","CONTROL","HEADING","FENCE","RULE","ITEM","TABLE_SEP"].includes(d.name.text)){
      assert(d.initializer&&d.initializer.kind===ts.SyntaxKind.RegularExpressionLiteral,"grammar initializer changed");
      grammar.set(d.name.text,d.initializer.getText(tree));
    }
  }
}
function visit(node){
  if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==="t"&&ts.isStringLiteral(node.initializer))nodeKinds.add(node.initializer.text);
  ts.forEachChild(node,visit);
}
visit(tree);
assert.deepEqual(functions.sort(),[...h.FUNCTIONS].sort());
assert.deepEqual(types.sort(),["Inline","ListItem","List","Block","DocPlace","ParseOptions"].sort());
assert.equal(grammar.size,7);
for(const [name,literal] of grammar){
  if(name==="FENCE"){
    assert.equal(literal,"/^\\s*"+String.fromCharCode(96).repeat(3)+"/");
    assert(combined.includes("three backticks"),"missing fence grammar");
  }else assert(combined.includes(literal),"missing exact grammar for "+name);
}
assert.deepEqual([...nodeKinds].sort(),["text","code","strong","em","link","list","heading","para","table","quote","rule"].sort());
for(const kind of nodeKinds)assert(combined.includes("'"+kind+"'"),"missing node kind "+kind);
for(const type of types)assert(combined.includes(type),"missing public type shape "+type);
console.log(JSON.stringify({capabilities:functions.length,public_types:types.length,grammar_literals:grammar.size,node_kinds:nodeKinds.size,source_executed:false}));
