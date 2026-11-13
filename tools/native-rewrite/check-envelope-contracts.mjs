// Check authored contract coverage and immutable wording against inert source AST.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
const dir=path.dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const ts=createRequire(path.resolve(dir,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=require("./envelope-harness.cjs"),[source,contractsPath]=process.argv.slice(2);
const contracts=JSON.parse(fs.readFileSync(contractsPath,"utf8"));
assert.equal(contracts.kind,"library");
assert.deepEqual(Object.keys(contracts.capabilities).sort(),Object.values(h.CAPABILITY).sort());
const text=fs.readFileSync(path.join(source,"ended.ts"),"utf8"),tree=ts.createSourceFile("ended.ts",text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="words");
assert(fn?.body,"source word catalogue is absent");
const sw=fn.body.statements.find(ts.isSwitchStatement);assert(sw);
const variables=new Map();
function visit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name))variables.set(n.name.text,n.initializer);ts.forEachChild(n,visit);}
visit(tree);
const expressions=new Map([["f.ws","ws"],["again","again"],["never","never"],["noShare","no-share"],["neverSentWords(OUT_WHEN)","never-out"],["neverSentWords(RELOGIN_WHEN)","never-relogin"],['f.before ?? "this machine signed out of Align"',"before"]]);
function template(n){
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
  if(ts.isIdentifier(n)){
    if(n.text==="SHARE_CHANGED")return "{SHARE_CHANGED}";
    assert(n.text==="STOPPED_ON_WEB","unexpected word constant");
    return template(variables.get(n.text));
  }
  assert(ts.isTemplateExpression(n),"unexpected word expression");
  let result=n.head.text;
  for(const span of n.templateSpans){
    const expr=span.expression.getText(tree),key=expressions.get(expr);assert(key,"unreviewed interpolation: "+expr);
    result+="{"+key+"}"+span.literal.text;
  }
  return result;
}
const observed={},pending=[];
for(const clause of sw.caseBlock.clauses){
  if(!ts.isCaseClause(clause))continue;
  pending.push(clause.expression.text);
  if(!clause.statements.length)continue;
  assert(clause.statements.length===1&&ts.isReturnStatement(clause.statements[0]),"unexpected catalogue clause");
  const e=clause.statements[0].expression;
  let value;
  if(ts.isConditionalExpression(e)){assert.equal(e.condition.getText(tree),"unsent");value={normal:template(e.whenFalse),unsent:template(e.whenTrue)};}
  else value=template(e);
  for(const key of pending.splice(0))observed[key]=value;
}
assert.equal(pending.length,0);
const contract=contracts.capabilities[h.CAPABILITY.shareNotice],catalog=JSON.parse(contract.split("Catalogue: ",2)[1].slice(0,-1));
assert.deepEqual(catalog,observed,"authored wording differs from inert source literals");
const envText=fs.readFileSync(path.join(source,"envelope.ts"),"utf8"),envTree=ts.createSourceFile("envelope.ts",envText,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const envVars=new Map();
for(const n of envTree.statements)if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)if(ts.isIdentifier(d.name))envVars.set(d.name.text,d.initializer);
function literal(n){
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
  if(ts.isNumericLiteral(n))return Number(n.text);
  assert(ts.isObjectLiteralExpression(n),"unexpected metadata expression");
  return Object.fromEntries(n.properties.map(p=>{assert(ts.isPropertyAssignment(p));return[p.name.text,literal(p.initializer)];}));
}
const dataContract=contracts.capabilities[h.CAPABILITY.envelopeData];
const authored=JSON.parse(dataContract.split("Their initial values, except SAFE_REQUESTS, are ",2)[1].split(". SAFE_REQUESTS is",1)[0]);
const sourceData=Object.fromEntries(h.DATA_KEYS.filter(k=>k!=="SAFE_REQUESTS").map(k=>[k,literal(envVars.get(k))]));
assert.deepEqual(authored,sourceData,"authored metadata differs from inert source literals");
for(const key of ["AUTHORITY","LIMITS_HEAD"])assert(contracts.capabilities[h.CAPABILITY.renderEnvelope].includes(JSON.stringify(literal(envVars.get(key)))),"unreviewed envelope constant "+key);
assert(!Object.values(contracts.capabilities).some(s=>s.includes("/Users/")));
console.log(JSON.stringify({capabilities:Object.keys(contracts.capabilities).length,catalogue_keys:Object.keys(observed).length,metadata_values:Object.keys(sourceData).length,exact_source_wording:true,source_not_executed:true}));
