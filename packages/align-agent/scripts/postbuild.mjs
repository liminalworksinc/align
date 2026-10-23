// Mark the CLI and hook entry points executable after tsc.
import fs from "node:fs";
import path from "node:path";
const dist = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "dist");
for (const f of ["cli.js", "hook.js"]) fs.chmodSync(path.join(dist, f), 0o755);
