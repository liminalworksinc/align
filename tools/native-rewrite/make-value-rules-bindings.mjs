// Draft exact public types and native aliases outside retained source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const ts=createRequire(path.resolve(here,"../../components/legacy-project-wrapper/implementation/package.json"))("typescript");
const h=createRequire(import.meta.url)("./value-rules-harness.cjs");
const [sourceRaw,outputRaw]=process.argv.slice(2),source=path.resolve(sourceRaw),output=path.resolve(outputRaw);
const implementation=path.resolve(here,"../../components/legacy-project-wrapper/implementation");
assert(!fs.existsSync(output),"refuse an existing value binding draft");
assert(!output.startsWith(implementation+path.sep),"draft stays outside retained source until qualified registration");
const f=ts.factory,printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
const tree=ts.createSourceFile("value-core.mts",fs.readFileSync(path.join(source,"value-core.mts"),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const emit=node=>printer.printNode(ts.EmitHint.Unspecified,node,tree),types=[],methods=new Map(),data=new Map();
function literal(node){
  assert(ts.isStringLiteral(node)||ts.isNumericLiteral(node),"unreviewed value data literal");
  return f.createLiteralTypeNode(ts.isStringLiteral(node)?f.createStringLiteral(node.text):f.createNumericLiteral(node.text));
}
function parameter(p){
  assert(p.type,"unreviewed inferred value parameter");
  return f.createParameterDeclaration(undefined,p.dotDotDotToken,p.name,
    p.questionToken||(p.initializer?f.createToken(ts.SyntaxKind.QuestionToken):undefined),p.type,undefined);
}
for(const statement of tree.statements){
  if(!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
  if(ts.isTypeAliasDeclaration(statement))types.push(emit(statement));
  else if(ts.isFunctionDeclaration(statement)){
    assert(h.FUNCTIONS.includes(statement.name.text)&&statement.type,"unreviewed public value function");
    methods.set(statement.name.text,f.createFunctionTypeNode(statement.typeParameters,statement.parameters.map(parameter),statement.type));
  }else if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
    assert(ts.isIdentifier(declaration.name),"unreviewed value destructuring");
    const name=declaration.name.text,value=declaration.initializer;
    if(h.FUNCTIONS.includes(name)){
      assert(ts.isArrowFunction(value),"unreviewed value callable");
      assert(value.type||name==="estimateSaid","unreviewed inferred value return");
      methods.set(name,f.createFunctionTypeNode(value.typeParameters,value.parameters.map(parameter),value.type??f.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)));
    }else{
      assert(h.DATA.includes(name),"unreviewed public value data");
      if(name==="ESTIMATE_WORDS"){
        assert(ts.isAsExpression(value)&&value.type.getText(tree)==="const"&&ts.isArrayLiteralExpression(value.expression),"unreviewed estimate table type");
        const rows=value.expression.elements.map(row=>{
          assert(ts.isObjectLiteralExpression(row),"unreviewed estimate row");
          return f.createTypeLiteralNode(row.properties.map(property=>{
            assert(ts.isPropertyAssignment(property)&&ts.isIdentifier(property.name),"unreviewed estimate field");
            return f.createPropertySignature([f.createModifier(ts.SyntaxKind.ReadonlyKeyword)],property.name,undefined,literal(property.initializer));
          }));
        });
        data.set(name,f.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword,f.createTupleTypeNode(rows)));
      }else data.set(name,declaration.type??literal(value));
    }
  }
}
assert.deepEqual([...methods.keys()].sort(),[...h.FUNCTIONS].sort());
assert.deepEqual([...data.keys()].sort(),[...h.DATA].sort());
assert.equal(types.length,1);
const shape=f.createTypeLiteralNode([...data].map(([name,type])=>f.createPropertySignature(undefined,name,undefined,type)));
const lines=["// Typed public names for the independently qualified value-card library.",
  'import * as native from "../native/.bindings/value_rules.js";',"",...types,"",
  "const values = native.value_data() as "+emit(shape)+";",""];
for(const name of h.DATA)lines.push("export const "+name+" = values."+name+";");
lines.push("");
for(const name of h.FUNCTIONS)lines.push("export const "+name+" = native."+h.SYMBOL[name]+" as "+emit(methods.get(name))+";");
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,"value-core.mts"),lines.join("\n")+"\n");
console.log(JSON.stringify({public_functions:methods.size,public_types:types.length,public_data:data.size,runtime_algorithms:0,applied:false}));
