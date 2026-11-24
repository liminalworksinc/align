// Bundle the local audit into ONE file an outside person runs with `node liminal-audit.mjs` (spec 2.10). No bundler
// dependency: Node's own TypeScript stripping, then each module is wrapped in its own scope so top-level names cannot
// collide, and its imports are rewritten to read from the wrapped modules. Fails loudly on any import it cannot rewrite.
//
//   node packages/audit-core/scripts/bundle-local-audit.mjs <out.mjs>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["rules", "human-turns", "read", "measures", "outcomes", "discover", "payload", "standing"];
const out = process.argv[2];
if (!out) { console.error("usage: bundle-local-audit.mjs <out.mjs>"); process.exit(1); }

const nodeImports = new Set();
const v = (name) => `__${name.replace(/[^a-z0-9]/gi, "_")}`;

function rewrite(code, file) {
  // Static imports, all single-line in these modules (checked: no multi-line import blocks).
  code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?\s*$/gm, (_, names, from) => {
    const spec = names.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ": ")).join(", ");
    if (from.startsWith("node:")) { nodeImports.add(from); return `const { ${spec} } = ${v(from)};`; }
    const mod = from.match(/^\.\.?\/(?:src\/local\/)?(?:\.\.\/src\/local\/)?([\w-]+)\.ts$/)?.[1];
    if (!mod || !MODULES.includes(mod)) throw new Error(`${file}: cannot bundle import from ${from}`);
    return `const { ${spec} } = ${v(mod)};`;
  });
  if (/^\s*import\s/m.test(code)) throw new Error(`${file}: an import was left unrewritten`);
  return code;
}

let body = "";
for (const mod of MODULES) {
  const src = stripTypeScriptTypes(readFileSync(join(ROOT, "src/local", `${mod}.ts`), "utf8"), { mode: "strip" });
  const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|class)\s+([A-Za-z_$][\w$]*)/gm)].map((x) => x[1]);
  const code = rewrite(src, `${mod}.ts`).replace(/^export\s+(?=(?:async\s+)?(?:function|const|class)\b)/gm, "");
  body += `\n// ---- ${mod}.ts ----\nconst ${v(mod)} = (() => {\n${code}\nreturn { ${names.join(", ")} };\n})();\n`;
}
// The entry point: imports of ../src/local/<mod>.ts resolve to the wrapped modules.
const entrySrc = stripTypeScriptTypes(readFileSync(join(ROOT, "bin/liminal-audit.mts"), "utf8"), { mode: "strip" });
const entry = rewrite(entrySrc.replace(/from "\.\.\/src\/local\//g, 'from "./'), "liminal-audit.mts");

const header = `#!/usr/bin/env node\n// Liminal local audit, bundled ${new Date().toISOString().slice(0, 10)} from align packages/audit-core. Read-only; no network call.\n`;
const imports = [...nodeImports].sort().map((m) => `import * as ${v(m)} from "${m}";`).join("\n");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${header}${imports}\n${body}\n// ---- liminal-audit.mts ----\n${entry}\n`);
console.log(`wrote ${out}`);
