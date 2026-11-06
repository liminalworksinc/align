// Prepare only public types and naming bindings outside retained source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const dir=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const ts=createRequire(path.resolve(dir,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=require("./home-harness.cjs"),[sourceArg,outputArg]=process.argv.slice(2);
const source=path.resolve(sourceArg),output=path.resolve(outputArg);
const implementation=path.resolve(dir,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output),"refuse an existing binding draft");
assert(!output.startsWith(implementation+path.sep),"draft stays outside retained source until qualified registration");
const tree=ts.createSourceFile("home-core.mts",fs.readFileSync(source,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const f=ts.factory,printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const emit=n=>printer.printNode(ts.EmitHint.Unspecified,n,tree);
function parameter(p){
  let type=p.type;
  if(!type){
    assert(p.initializer&&[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(p.initializer.kind),"unreviewed inferred parameter");
    type=f.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
  }
  return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,
    p.questionToken||(p.initializer?f.createToken(ts.SyntaxKind.QuestionToken):undefined),type,undefined);
}
const types=[],methods=new Map(),data=new Map();
for(const s of tree.statements){
  const exported=s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
  if(!exported)continue;
  if(ts.isInterfaceDeclaration(s)||ts.isTypeAliasDeclaration(s))types.push(emit(s));
  if(ts.isFunctionDeclaration(s)){
    assert(s.type&&h.FUNCTIONS.includes(s.name.text),"unexpected or inferred public function");
    methods.set(s.name.text,f.createFunctionTypeNode(s.typeParameters,s.parameters.map(parameter),s.type));
  }
  if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations){
    assert(ts.isIdentifier(d.name),"unexpected exported destructuring");
    const key=d.name.text;
    if(h.FUNCTIONS.includes(key)){
      assert(ts.isArrowFunction(d.initializer)&&d.initializer.type,"unexpected or inferred public arrow");
      methods.set(key,f.createFunctionTypeNode(d.initializer.typeParameters,d.initializer.parameters.map(parameter),d.initializer.type));
    }else{
      assert(h.DATA.includes(key),"unreviewed public data");
      let type=d.type;
      if(!type){
        assert(ts.isAsExpression(d.initializer)&&d.initializer.type.getText(tree)==="const"&&ts.isArrayLiteralExpression(d.initializer.expression),"unreviewed public data type");
        const elements=d.initializer.expression.elements;
        assert(elements.every(e=>ts.isStringLiteral(e)),"unreviewed tuple member");
        type=f.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword,f.createTupleTypeNode(elements.map(e=>f.createLiteralTypeNode(f.createStringLiteral(e.text)))));
      }
      data.set(key,type);
    }
  }
}
assert.deepEqual([...methods.keys()].sort(),[...h.FUNCTIONS].sort());
assert.deepEqual([...data.keys()].sort(),[...h.DATA].sort());
assert.equal(types.length,4,"public type declarations changed");
const shape=f.createTypeLiteralNode([...data].map(([key,type])=>f.createPropertySignature(undefined,key,undefined,type)));
const lines=["// Typed public names for the independently qualified Home attention library.",
  'import * as native from "../native/.bindings/home_attention.js";',"",...types,"",
  "const values = native.data() as "+emit(shape)+";",""];
for(const key of h.DATA)lines.push("export const "+key+" = values."+key+";");
lines.push("");
for(const key of h.FUNCTIONS)lines.push("export const "+key+" = native."+h.SYMBOL[key]+" as "+emit(methods.get(key))+";");
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,lines.join("\n")+"\n");
console.log(JSON.stringify({public_functions:methods.size,public_data:data.size,public_types:types.length,runtime_algorithms:0,applied:false}));
