// Read public decision constants without opening databases or starting surrounding services.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export function decisionActions(root, relative, name) {
  const require = createRequire(path.join(root, "package.json"));
  const ts = require("typescript");
  const native = path.join(root, "lib/native") + path.sep;
  const cache = new Map();
  const forbidden = (module, member) => () => {
    throw new Error(`Decision constant reader called surrounding service ${module}/${String(member)}`);
  };
  function evaluate(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const result = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    assert.equal(result.diagnostics?.length ?? 0, 0, `Cannot read decision module ${file}`);
    const imports = (specifier) => {
      const resolved = path.resolve(path.dirname(file), specifier);
      if (specifier.startsWith(".") && resolved.startsWith(native)) return evaluate(resolved);
      assert(!file.startsWith(native), `Unexpected native import ${specifier}`);
      return new Proxy({}, { get: (_target, member) => forbidden(specifier, member) });
    };
    new Function("require", "module", "exports", result.outputText)(imports, loaded, loaded.exports);
    return loaded.exports;
  }
  const actions = evaluate(path.join(root, relative))[name];
  assert(Array.isArray(actions) && actions.length > 0 && actions.every((action) => typeof action === "string" && action.length > 0), `Missing decision actions ${relative}:${name}`);
  assert.equal(new Set(actions).size, actions.length, `Duplicate decision action ${relative}:${name}`);
  return [...actions];
}
