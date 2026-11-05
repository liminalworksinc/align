// Verifier-owned calls use decimal text to carry exact BigInt arguments.
const fs = require("node:fs"), path = require("node:path");
const {pathToFileURL} = require("node:url");

async function load(root, baseline) {
  if (baseline) return (await import(pathToFileURL(path.join(root, "prices.ts")).href)).picoToMicros;
  const hits = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (path.basename(dir) === "spend_rounding" && /^pico_to_micros\.(?:js|mjs|cjs)$/.test(e.name)) hits.push(p);
    }
  })(root);
  if (hits.length !== 1) throw new Error("expected one native rounding module");
  const m = await import(pathToFileURL(hits[0]).href);
  const fn = m.pico_to_micros ?? m.default?.pico_to_micros ?? m.default;
  if (typeof fn !== "function") throw new Error("missing rounding callable");
  return fn;
}

async function main() {
  if (["--baseline", "--generated"].includes(process.argv[1])) {
    const [mode, raw] = process.argv.slice(1);
    const fn = await load(process.cwd(), mode === "--baseline");
    process.stdout.write(JSON.stringify(String(fn(BigInt(JSON.parse(raw)[0])))) + "\n");
  } else {
    const [root, , raw] = process.argv.slice(2), fn = await load(root, false);
    const cases = JSON.parse(raw).map(c => ({case_id: c.case_id, capability: c.capability,
      result: String(fn(BigInt(c.arguments[0])))}));
    process.stdout.write(JSON.stringify({schema: "literate-ai/library-acceptance-results@1", cases}) + "\n");
  }
}
module.exports = {load};
if (require.main === module || ["--baseline", "--generated"].includes(process.argv[1])) {
  main().catch(error => {console.error(error); process.exit(1);});
}
