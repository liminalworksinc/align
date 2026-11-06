// Prepare public types and naming bindings outside retained source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const ts=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=require("./markdown-harness.cjs"),[sourceRaw,outputRaw]=process.argv.slice(2);
const source=path.resolve(sourceRaw),output=path.resolve(outputRaw);
const implementation=path.resolve(here,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output),"refuse an existing binding draft");
assert(!output.startsWith(implementation+path.sep),"draft stays outside retained source until qualified registration");
const tree=ts.createSourceFile("markdown.mts",fs.readFileSync(source,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}),f=ts.factory;
const emit=node=>printer.printNode(ts.EmitHint.Unspecified,node,tree),types=[],methods=new Map();
for(const statement of tree.statements){
  if(!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  if(ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement)){
    if(types.length===0)ts.setEmitFlags(statement,ts.EmitFlags.NoLeadingComments);
    types.push(emit(statement));
  }
  else if(ts.isFunctionDeclaration(statement)){
    assert(statement.type&&h.FUNCTIONS.includes(statement.name.text),"unreviewed public function");
    const parameters=statement.parameters.map(parameter=>{
      assert(parameter.type&&!parameter.initializer,"unreviewed public parameter");
      return f.createParameterDeclaration(undefined,parameter.dotDotDotToken,parameter.name,parameter.questionToken,parameter.type,undefined);
    });
    methods.set(statement.name.text,f.createFunctionTypeNode(statement.typeParameters,parameters,statement.type));
  }else throw new Error("unreviewed Markdown runtime export");
}
assert.equal(types.length,6,"public types changed");
assert.deepEqual([...methods.keys()].sort(),[...h.FUNCTIONS].sort());
const lines=["// Typed public names for the independently qualified trust Markdown library.",
  'import * as native from "../native/.bindings/trust_markdown.js";',"",...types,""];
for(const name of h.FUNCTIONS)lines.push("export const "+name+" = native."+h.SYMBOL[name]+" as "+emit(methods.get(name))+";");
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,lines.join("\n")+"\n");
console.log(JSON.stringify({public_functions:methods.size,public_types:types.length,runtime_algorithms:0,applied:false}));
