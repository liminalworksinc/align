// Prepare type-only public naming bindings outside the retained implementation.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const dir=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const ts=createRequire(path.resolve(dir,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=require("./envelope-harness.cjs"),[sourceArg,outputArg]=process.argv.slice(2),source=path.resolve(sourceArg),output=path.resolve(outputArg);
assert(!fs.existsSync(output),"refuse an existing binding draft directory");
const implementation=path.resolve(dir,"../../components/legacy-project-wrapper/implementation");
assert(!output.startsWith(implementation+path.sep),"draft bindings stay outside retained source until qualified registration");
fs.mkdirSync(output,{recursive:true});
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}),f=ts.factory;
function parameter(p){
  let type=p.type;
  if(!type){
    const initial=p.initializer;assert(initial,"untyped public parameter");
    if(initial.kind===ts.SyntaxKind.TrueKeyword||initial.kind===ts.SyntaxKind.FalseKeyword)type=f.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
    else if(ts.isStringLiteral(initial)||ts.isNoSubstitutionTemplateLiteral(initial))type=f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    else if(ts.isNumericLiteral(initial))type=f.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    else throw new Error("unreviewed inferred public parameter "+p.name.getText());
  }
  return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,p.questionToken||(p.initializer?f.createToken(ts.SyntaxKind.QuestionToken):undefined),type,undefined);
}
for(const [name,methodNames,dataKeys,dataOp] of [
  ["envelope",h.ENVELOPE_METHODS,h.DATA_KEYS,"envelope_data"],
  ["ended",h.ENDED_METHODS,["SHARE_CHANGED"],"ended_data"],
]){
  const filename=name+".ts",text=fs.readFileSync(path.join(source,filename),"utf8"),tree=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const emit=n=>printer.printNode(ts.EmitHint.Unspecified,n,tree),types=[],methods=new Map(),data=new Map(),typeImports=[];
  for(const s of tree.statements){
    if(ts.isImportDeclaration(s)&&s.importClause?.isTypeOnly)typeImports.push(emit(s));
    if(ts.isInterfaceDeclaration(s)||ts.isTypeAliasDeclaration(s))types.push(emit(s));
    const exported=s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
    if(!exported)continue;
    if(ts.isFunctionDeclaration(s)){
      assert(s.type&&methodNames.includes(s.name.text),"unexpected or inferred public function");
      methods.set(s.name.text,f.createFunctionTypeNode(s.typeParameters,s.parameters.map(parameter),s.type));
    }
    if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations){
      assert(ts.isIdentifier(d.name),"unexpected exported destructuring");const key=d.name.text;
      if(methodNames.includes(key)){
        assert(ts.isArrowFunction(d.initializer)&&d.initializer.type,"unexpected or inferred public arrow");
        const arrow=d.initializer;
        methods.set(key,f.createFunctionTypeNode(arrow.typeParameters,arrow.parameters.map(parameter),arrow.type));
      }else{
        assert(dataKeys.includes(key),"unreviewed public data");
        let type=d.type;
        if(!type&&ts.isNumericLiteral(d.initializer))type=f.createLiteralTypeNode(f.createNumericLiteral(d.initializer.text));
        else if(!type&&ts.isStringLiteral(d.initializer))type=f.createLiteralTypeNode(f.createStringLiteral(d.initializer.text));
        else if(!type&&ts.isNewExpression(d.initializer)&&d.initializer.expression.getText(tree)==="Set")type=f.createTypeReferenceNode("Set",[f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)]);
        assert(type,"unreviewed inferred data type "+key);data.set(key,type);
      }
    }
  }
  assert.deepEqual([...methods.keys()].sort(),[...methodNames].sort());
  assert.deepEqual([...data.keys()].sort(),[...dataKeys].sort());
  const shape=f.createTypeLiteralNode([...data].map(([key,type])=>f.createPropertySignature(undefined,key,undefined,type)));
  const lines=["// Typed public names for the independently qualified envelope library.",'import * as native from "../native/.bindings/agent_envelope.js";',...typeImports,"",...types,"",
    "const values = native."+dataOp+"() as "+emit(shape)+";",""];
  for(const key of dataKeys)lines.push("export const "+key+" = values."+key+";");
  lines.push("");
  for(const key of methodNames)lines.push("export const "+key+" = native."+h.SYMBOL[key]+" as "+emit(methods.get(key))+";");
  fs.writeFileSync(path.join(output,filename),lines.join("\n")+"\n");
}
console.log(JSON.stringify({drafts:2,runtime_algorithms:0,public_functions:49,public_data:16,applied:false}));
