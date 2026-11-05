// Inert source-shape checks complement the independent runtime profile.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json"));
const ts=require("typescript"),[source,contractPath]=process.argv.slice(2);
const contracts=JSON.parse(fs.readFileSync(contractPath,"utf8"));
const expectedCaps=["http-errors.bad-request","http-errors.conflict","http-errors.data","http-errors.forbidden","http-errors.not-found"];
assert.deepEqual(Object.keys(contracts.capabilities).sort(),expectedCaps);
const expected={
  "lib/errors.ts":{name:"HttpError",parameters:["status","message","code"],properties:["status","code"],super:"message",factories:[]},
  "lib/v2/errors.ts":{name:"V2Error",parameters:["status","code","message","extra"],properties:["status","code","extra"],super:"message??code",factories:["notFound","badRequest","forbidden","conflict"]},
};
const factoryArguments={notFound:["404",'"not_found"','"Not found"'],badRequest:["400","code","message"],forbidden:["403","code","message"],conflict:["409","code","message"]};
let constructors=0,factories=0;
for(const [file,shape] of Object.entries(expected)){
  const tree=ts.createSourceFile(file,fs.readFileSync(path.join(source,file),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(tree.parseDiagnostics.length,0);
  assert(tree.statements.every(s=>s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)),"unreviewed module statement");
  const classes=tree.statements.filter(ts.isClassDeclaration);assert.equal(classes.length,1);
  const cls=classes[0];assert.equal(cls.name.text,shape.name);assert.equal(cls.heritageClauses.length,1);assert.equal(cls.heritageClauses[0].types[0].expression.getText(tree),"Error");
  assert.equal(cls.members.length,1);const ctor=cls.members[0];assert(ts.isConstructorDeclaration(ctor));
  assert.deepEqual(ctor.parameters.map(p=>p.name.getText(tree)),shape.parameters);
  assert.deepEqual(ctor.parameters.filter(p=>p.modifiers?.some(m=>m.kind===ts.SyntaxKind.PublicKeyword)).map(p=>p.name.getText(tree)),shape.properties);
  assert(ctor.parameters.every(p=>p.type&&!p.initializer));
  assert.equal(ctor.body.statements.length,1);const call=ctor.body.statements[0].expression;
  assert(ts.isCallExpression(call));assert.equal(call.expression.kind,ts.SyntaxKind.SuperKeyword);assert.equal(call.arguments.length,1);assert.equal(call.arguments[0].getText(tree).replaceAll(/\s/g,""),shape.super);constructors++;
  const vars=tree.statements.filter(ts.isVariableStatement).flatMap(s=>[...s.declarationList.declarations]);
  assert.deepEqual(vars.map(v=>v.name.getText(tree)),shape.factories);
  for(const variable of vars){
    const name=variable.name.getText(tree),arrow=variable.initializer;assert(ts.isArrowFunction(arrow));assert(ts.isNewExpression(arrow.body));assert.equal(arrow.body.expression.getText(tree),"V2Error");
    assert.deepEqual(arrow.body.arguments.map(a=>a.getText(tree)),factoryArguments[name]);
    const initializers=arrow.parameters.filter(p=>p.initializer);
    if(name==="badRequest"){assert.equal(initializers.length,1);assert.equal(initializers[0].name.getText(tree),"code");assert.equal(initializers[0].initializer.text,"bad_request");}
    else assert.equal(initializers.length,0);
    factories++;
  }
}
const data=contracts.capabilities["http-errors.data"];
for(const fragment of ["HttpError","V2Error","arity 3","arity 4","super(message)","super(message ?? code)","this.status=status","this.code=code","this.extra=extra","inherited setters","nonwritable","same two shared class objects"])assert(data.includes(fragment),"missing constructor contract: "+fragment);
for(const [name,args] of Object.entries(factoryArguments)){
  const cap="http-errors."+name.replaceAll(/[A-Z]/g,c=>"-"+c.toLowerCase());
  const text=contracts.capabilities[cap];assert(text);
  assert(text.includes(args[0]),"missing factory status");
}
console.log(JSON.stringify({capabilities:5,constructors,factories,public_runtime_exports:6,source_executed:false}));
