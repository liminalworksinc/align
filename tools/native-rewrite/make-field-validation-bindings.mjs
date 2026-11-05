// Prepare the original public types and one native factory binding for review.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const implementation = path.resolve(here, "../../components/legacy-project-wrapper/implementation");
const ts = createRequire(path.join(implementation, "package.json"))("typescript");
const [sourceRaw, outputRaw] = process.argv.slice(2);
assert(sourceRaw && outputRaw, "expected original source directory and new draft directory");
const source = path.resolve(sourceRaw), output = path.resolve(outputRaw);
assert(!fs.existsSync(output), "refuse an existing validation binding draft");
assert(output !== implementation && !output.startsWith(implementation + path.sep),
  "prepare outside retained source until qualified registration");
const functions = ["str", "cleanName", "charCount", "oneLine", "optStr", "oneOf", "optOneOf", "nonNegInt", "revisionRead", "assertRevisionReached", "optInt", "iso", "optIso", "b64url", "strList"];
const data = ["NAME_MARKS_PER_CHAR", "NAME_PARTS_PER_CHAR", "NO_REVISION", "B64URL", "ID_RE", "SESSION_KEY_RE"];
const tree = ts.createSourceFile("validate.ts", fs.readFileSync(path.join(source, "validate.ts"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(tree.parseDiagnostics.length, 0);
const f = ts.factory, printer = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});
const emit = node => printer.printNode(ts.EmitHint.Unspecified, node, tree);
const types = [], declarations = new Map(), methods = new Map(), constants = new Map();
function parameter(original, index) {
  let type = original.type;
  if (!type) {
    assert(original.initializer && ts.isNumericLiteral(original.initializer), "unreviewed inferred validation parameter");
    type = f.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
  }
  const name = ts.isIdentifier(original.name) ? original.name : f.createIdentifier("options" + index);
  return f.createParameterDeclaration(undefined, original.dotDotDotToken, name,
    original.questionToken ?? (original.initializer ? f.createToken(ts.SyntaxKind.QuestionToken) : undefined), type, undefined);
}
for (const statement of tree.statements) {
  if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
  if (ts.isTypeAliasDeclaration(statement)) {
    assert.equal(statement.name.text, "Body");
    types.push(emit(statement));
  } else if (ts.isFunctionDeclaration(statement)) {
    const name = statement.name.text;
    assert(functions.includes(name), "unreviewed validation function");
    const list = declarations.get(name) ?? [];
    list.push(statement);
    declarations.set(name, list);
  } else if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      assert(ts.isIdentifier(declaration.name));
      const name = declaration.name.text, value = declaration.initializer;
      if (functions.includes(name)) {
        assert.equal(name, "charCount");
        assert(ts.isArrowFunction(value) && value.type);
        methods.set(name, f.createFunctionTypeNode(value.typeParameters, value.parameters.map(parameter), value.type));
      } else {
        assert(data.includes(name), "unreviewed validation data");
        let type = declaration.type;
        if (!type) {
          if (ts.isStringLiteral(value)) type = f.createLiteralTypeNode(f.createStringLiteral(value.text));
          else if (ts.isNumericLiteral(value)) type = f.createLiteralTypeNode(f.createNumericLiteral(value.text));
          else {
            assert(ts.isRegularExpressionLiteral(value), "unreviewed validation constant");
            type = f.createTypeReferenceNode("RegExp", undefined);
          }
        }
        constants.set(name, type);
      }
    }
  } else assert.fail("unreviewed public validation declaration");
}
for (const [name, list] of declarations) {
  const overloads = list.filter(declaration => !declaration.body);
  const publicDeclarations = overloads.length ? overloads : list;
  assert.equal(list.filter(declaration => declaration.body).length, 1);
  if (overloads.length) assert.equal(name, "revisionRead");
  const signatures = publicDeclarations.map(declaration => {
    let returns = declaration.type;
    if (!returns) {
      assert.equal(name, "assertRevisionReached");
      returns = f.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword);
    }
    return {types: declaration.typeParameters, parameters: declaration.parameters.map(parameter), returns};
  });
  methods.set(name, signatures.length === 1
    ? f.createFunctionTypeNode(signatures[0].types, signatures[0].parameters, signatures[0].returns)
    : f.createTypeLiteralNode(signatures.map(signature => f.createCallSignature(signature.types, signature.parameters, signature.returns))));
}
assert.equal(types.length, 1);
assert.deepEqual([...methods.keys()].sort(), [...functions].sort());
assert.deepEqual([...constants.keys()].sort(), [...data].sort());
const shape = f.createTypeLiteralNode([
  ...functions.map(name => f.createPropertySignature(undefined, name, undefined, methods.get(name))),
  ...data.map(name => f.createPropertySignature(undefined, name, undefined, constants.get(name))),
]);
const lines = [
  "// Typed public names for the independently qualified field validators.",
  'import { badRequest } from "./errors";',
  'import { BLANK_FILLERS, cleanProse, dropInvisible, isBlankText } from "./text-core.mts";',
  'import * as native from "../native/.bindings/field_validation.js";', "", ...types, "",
  "const values = native.create_validators({ badRequest, BLANK_FILLERS, cleanProse, dropInvisible, isBlankText }) as " + emit(shape) + ";", "",
  ...[...functions, ...data].map(name => "export const " + name + " = values." + name + ";"), "",
];
const rendered = lines.join("\n");
assert.equal(ts.createSourceFile("validate.ts", rendered, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).parseDiagnostics.length, 0);
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, "validate.ts"), rendered);
console.log(JSON.stringify({public_functions: methods.size, public_types: types.length, public_data: constants.size, overloads: 2, runtime_algorithms: 0, applied: false}));
