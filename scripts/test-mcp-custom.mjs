// test-mcp against a custom scenario. The SDK client in test-mcp validates every tool's structuredContent against
// its outputSchema; the Northstar run never exercises the custom `agreement` object, so a field the schema doesn't
// declare there (additionalProperties: false) went unseen. Restores Northstar afterwards, since later gate steps
// (test-capture, test-mapper) run on it.
// Usage: ALIGN_MCP_TOKEN=... node scripts/test-mcp-custom.mjs <baseUrl> [fixture.json]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, signIn } from "./lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = baseUrl();
const FIXTURE = path.resolve(process.argv[3] || path.join(ROOT, "data/scenarios/example-custom.json"));

async function post(cookie, p, body) {
  const r = await fetch(BASE + p, { method: "POST", headers: { cookie, "content-type": "application/json", origin: BASE }, body: JSON.stringify(body) });
  if (r.status !== 200) throw new Error(`POST ${p} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const lead = await signIn(BASE, "leadership");
await post(lead, "/api/reset", { confirm: "reset" });
await post(lead, "/api/scenario", { ...JSON.parse(readFileSync(FIXTURE, "utf8")), confirm: "replace" });
const run = spawnSync(process.execPath, [path.join(ROOT, "scripts/test-mcp.mjs"), `${BASE}/api/mcp`], { stdio: "inherit", env: process.env });
await post(lead, "/api/reset", { confirm: "reset" });
console.log(run.status === 0 ? `test-mcp passes on the custom scenario ${path.basename(FIXTURE)}` : `test-mcp FAILED on the custom scenario ${path.basename(FIXTURE)}`);
process.exit(run.status ?? 1);
