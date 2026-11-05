// Prepare only public declarations and native aliases outside retained source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json"));
const ts=require("typescript"),h=createRequire(import.meta.url)("./http-errors-harness.cjs"),f=ts.factory;
const [sourceRaw,outputRaw]=process.argv.slice(2),source=path.resolve(sourceRaw),output=path.resolve(outputRaw);
const implementation=path.resolve(here,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output),"refuse an existing error binding draft");
assert(!output.startsWith(implementation+path.sep),"draft stays outside retained source until qualified registration");
let classes=0,factories=0;
for(const file of ["lib/errors.ts","lib/v2/errors.ts"]){
  const tree=ts.createSourceFile(file,fs.readFileSync(path.join(source,file),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length,0);
  const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}),emit=node=>printer.printNode(ts.EmitHint.Unspecified,node,tree);
  const declarations=tree.statements.filter(ts.isClassDeclaration);assert.equal(declarations.length,1);
  const original=declarations[0],ctor=original.members[0];assert.equal(original.members.length,1);assert(ts.isConstructorDeclaration(ctor));
  const name=original.name.text;assert.equal(name,file==="lib/errors.ts"?"HttpError":"V2Error");
  const parameters=ctor.parameters.map(p=>{
    assert(p.type&&!p.initializer,"unreviewed constructor parameter");
    return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,p.questionToken,p.type,undefined);
  });
  const properties=ctor.parameters.filter(p=>p.modifiers?.some(m=>m.kind===ts.SyntaxKind.PublicKeyword)).map(p=>
    f.createPropertyDeclaration(undefined,p.name,p.questionToken,p.type,undefined));
  const shape=name+"Shape";
  const ambient=f.createClassDeclaration([f.createModifier(ts.SyntaxKind.DeclareKeyword)],shape,undefined,original.heritageClauses,[...properties,f.createConstructorDeclaration(undefined,parameters,undefined)]);
  const binding=file==="lib/errors.ts"?'./native/.bindings/http_errors.js':'../native/.bindings/http_errors.js';
  const lines=["// Public error types and aliases for the independently qualified native library.","import * as native from "+JSON.stringify(binding)+";","",emit(ambient),"",
    "export type "+name+" = "+shape+";",
    "export const "+name+" = (native.data() as {"+name+": typeof "+shape+"})."+name+";"];
  for(const statement of tree.statements.filter(ts.isVariableStatement))for(const declaration of statement.declarationList.declarations){
    const op=declaration.name.getText(tree),arrow=declaration.initializer;assert(h.FUNCTIONS.includes(op)&&op!=="data");assert(ts.isArrowFunction(arrow));assert(ts.isNewExpression(arrow.body)&&arrow.body.expression.getText(tree)==="V2Error");
    const args=arrow.parameters.map(p=>{
      let type=p.type;if(!type){assert(p.initializer&&ts.isStringLiteral(p.initializer),"unreviewed inferred parameter type");type=f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);}
      return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,p.questionToken??(p.initializer?f.createToken(ts.SyntaxKind.QuestionToken):undefined),type,undefined);
    });
    const signature=f.createFunctionTypeNode(undefined,args,f.createTypeReferenceNode("V2Error",undefined));
    lines.push("export const "+op+" = native."+h.SYMBOL[op]+" as "+emit(signature)+";");factories++;
  }
  const destination=path.join(output,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,lines.join("\n")+"\n");classes++;
}
assert.equal(classes,2);assert.equal(factories,4);
console.log(JSON.stringify({public_class_declarations:classes,factory_aliases:factories,runtime_algorithms:0,applied:false}));
