// Prepare public types and naming bindings outside retained source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const ts=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=require("./wording-harness.cjs"),[sourceRaw,outputRaw]=process.argv.slice(2),source=path.resolve(sourceRaw),output=path.resolve(outputRaw);
const implementation=path.resolve(here,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output),"refuse an existing wording binding draft");
assert(!output.startsWith(implementation+path.sep),"draft stays outside retained source until qualified registration");
const f=ts.factory,printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const inferredReturns=new Set(["plural","count","hiddenGoals"]);
function parameter(p){
  let type=p.type;
  if(!type){
    assert(p.initializer&&(ts.isTemplateExpression(p.initializer)||ts.isNoSubstitutionTemplateLiteral(p.initializer)),"unreviewed inferred public parameter");
    type=f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
  }
  return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,
    p.questionToken||(p.initializer?f.createToken(ts.SyntaxKind.QuestionToken):undefined),type,undefined);
}
fs.mkdirSync(output,{recursive:true});
let functions=0,types=0,dataCount=0;
for(const [filename,names] of Object.entries(h.MODULES)){
  const tree=ts.createSourceFile(filename,fs.readFileSync(path.join(source,filename),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const emit=node=>printer.printNode(ts.EmitHint.Unspecified,node,tree),declarations=[],methods=new Map(),data=new Map();
  const dataKeys=h.DATA[filename]??[];
  for(const statement of tree.statements){
    if(!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
    if(ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement))declarations.push(emit(statement));
    if(ts.isFunctionDeclaration(statement)){
      assert(names.includes(statement.name.text)&&statement.type,"unreviewed function export");
      methods.set(statement.name.text,f.createFunctionTypeNode(statement.typeParameters,statement.parameters.map(parameter),statement.type));
    }
    if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
      assert(ts.isIdentifier(declaration.name),"unreviewed exported destructuring");
      const key=declaration.name.text;
      if(names.includes(key)){
        const arrow=declaration.initializer;
        assert(ts.isArrowFunction(arrow),"unreviewed public callable");
        assert(arrow.type||inferredReturns.has(key),"unreviewed inferred return");
        methods.set(key,f.createFunctionTypeNode(arrow.typeParameters,arrow.parameters.map(parameter),arrow.type??f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)));
      }else{
        assert(dataKeys.includes(key),"unreviewed public data");
        const value=declaration.initializer;
        assert(ts.isStringLiteral(value)||ts.isNumericLiteral(value),"unreviewed constant type");
        data.set(key,declaration.type??f.createLiteralTypeNode(ts.isStringLiteral(value)?f.createStringLiteral(value.text):f.createNumericLiteral(value.text)));
      }
    }
  }
  assert.deepEqual([...methods.keys()].sort(),[...names].sort());
  assert.deepEqual([...data.keys()].sort(),[...dataKeys].sort());
  const lines=["// Typed public names for the independently qualified wording library.",
    'import * as native from "../native/.bindings/wording.js";',"",...declarations,""];
  if(data.size){
    const shape=f.createTypeLiteralNode([...data].map(([name,type])=>f.createPropertySignature(undefined,name,undefined,type)));
    lines.push("const values = native.wording_data() as "+emit(shape)+";","");
    for(const name of dataKeys)lines.push("export const "+name+" = values."+name+";");
    lines.push("");
  }
  for(const name of names)lines.push("export const "+name+" = native."+h.SYMBOL[name]+" as "+emit(methods.get(name))+";");
  fs.writeFileSync(path.join(output,filename),lines.join("\n")+"\n");
  functions+=methods.size;types+=declarations.length;dataCount+=data.size;
}
assert.equal(functions,16);assert.equal(types,3);assert.equal(dataCount,3);
console.log(JSON.stringify({public_functions:functions,public_types:types,public_data:dataCount,runtime_algorithms:0,applied:false}));
