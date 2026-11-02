// Mark the CLI and hook entry points executable after tsc, and record the build's identity (dist/build.json): a hash of
// every built file, so `align` can tell when the hooks' copy in ALIGN_HOME/bin/current is another build of the same
// version (E2E-AGENT cycle 13 C13-1).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "dist");
for (const f of ["cli.js", "hook.js"]) fs.chmodSync(path.join(dist, f), 0o755);
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith(".js")) files.push(p);
  }
};
walk(dist);
const h = crypto.createHash("sha256");
for (const f of files.map((f) => path.relative(dist, f).split(path.sep).join("/")).sort()) {
  h.update(`${f}\0`);
  h.update(fs.readFileSync(path.join(dist, f)));
  h.update("\0");
}
const version = JSON.parse(fs.readFileSync(path.join(dist, "..", "package.json"), "utf8")).version;
fs.writeFileSync(path.join(dist, "build.json"), JSON.stringify({ version, build: h.digest("hex").slice(0, 12) }) + "\n");
