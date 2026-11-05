// Verifier-owned library acceptance harness for the paste-lines boundary (litai library-acceptance-oracle@1).
// usage: node paste_lines_library_harness.js EXPORT_DIR SURFACE_JSON CASES_JSON
// Imports each capability's module from the sealed export and prints literate-ai/library-acceptance-results@1.
// Case logic matches paste_lines_probe.mjs: arguments [operation, input]; result {"value": v} or {"error": ClassName}.
"use strict";
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function findModule(root, modulePath) {
  const rel = modulePath.split("/");
  const base = rel.pop();
  const names = new Set([`${base}.js`, `${base}.mjs`, `${base}.cjs`]);
  const hits = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir).sort()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) stack.push(full);
      else if (names.has(name)) {
        const parents = path.relative(root, dir).split(path.sep);
        if (rel.every((seg, i) => parents[parents.length - rel.length + i] === seg)) hits.push(full);
      }
    }
  }
  if (hits.length !== 1) throw new Error(`expected one ${modulePath} module in the export, found ${hits.length}`);
  return hits[0];
}

async function main() {
  const [exportDir, surfaceRaw, casesRaw] = process.argv.slice(2);
  const surface = JSON.parse(surfaceRaw);
  const cases = JSON.parse(casesRaw);
  const fns = {};
  for (const cap of surface.capabilities) {
    const symbol = cap.symbols[0];
    const mod = await import(pathToFileURL(findModule(exportDir, cap.module)).href);
    const fn = mod[symbol] ?? mod.default?.[symbol] ?? (typeof mod.default === "function" ? mod.default : undefined);
    if (typeof fn !== "function") throw new Error(`${cap.module} does not export function ${symbol}`);
    fns[cap.capability] = fn;
  }
  const out = [];
  for (const c of cases) {
    const [, input] = c.arguments;
    let result;
    try {
      const v = fns[c.capability](input);
      result = { value: v === undefined ? "<undefined>" : v };
    } catch (e) {
      result = { error: (e && e.constructor && e.constructor.name) || "Error" };
    }
    out.push({ case_id: c.case_id, capability: c.capability, result });
  }
  process.stdout.write(JSON.stringify({ schema: "literate-ai/library-acceptance-results@1", cases: out }) + "\n");
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
