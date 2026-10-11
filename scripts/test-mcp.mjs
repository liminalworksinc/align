#!/usr/bin/env node
// Smoke test for Align's read-only MCP server. Usage: node scripts/test-mcp.mjs [url]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.argv[2] || process.env.ALIGN_MCP_URL || "http://localhost:3100/api/mcp";
const EXPECTED = ["align_get_accepted_plan", "align_get_decision_record", "align_get_work_map", "align_list_goals"];

function readToken() {
  if (process.env.ALIGN_MCP_TOKEN) return process.env.ALIGN_MCP_TOKEN;
  try {
    const line = readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("ALIGN_MCP_TOKEN="));
    return line?.slice("ALIGN_MCP_TOKEN=".length).trim().replace(/^["']|["']$/g, "") || "";
  } catch {
    return "";
  }
}

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};

const initBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "align-test", version: "0" } },
});
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };

// (a) no token -> 401, and a wrong token -> 401
const noTok = await fetch(URL_, { method: "POST", headers, body: initBody });
ok(noTok.status === 401, `no token -> ${noTok.status} (www-authenticate: ${noTok.headers.get("www-authenticate") ?? "-"})`);
const badTok = await fetch(URL_, { method: "POST", headers: { ...headers, authorization: "Bearer not-the-token" }, body: initBody });
ok(badTok.status === 401, `wrong token -> ${badTok.status}`);

const token = readToken();
if (!token) {
  console.error("ALIGN_MCP_TOKEN not found in env or .env.local");
  process.exit(1);
}
const goodTok = await fetch(URL_, { method: "POST", headers: { ...headers, authorization: `Bearer ${token}` }, body: initBody });
if (goodTok.status === 401) {
  console.error("Correct token was rejected (401). The dev server probably started before ALIGN_MCP_TOKEN was added to .env.local: restart it.");
  process.exit(2);
}

// (b) listTools with the token
const client = new Client({ name: "align-test", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(URL_), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
await client.connect(transport);
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
ok(JSON.stringify(names) === JSON.stringify(EXPECTED), `listTools -> ${names.join(", ")}`);
ok(
  tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.idempotentHint === true && t.annotations?.openWorldHint === false),
  "every tool is readOnlyHint + idempotentHint, openWorldHint false",
);
ok(tools.every((t) => t.outputSchema), "every tool declares an outputSchema");

// (c) call each tool
const calls = [
  ["align_list_goals", {}],
  ["align_get_accepted_plan", {}],
  ["align_get_work_map", {}],
  ["align_get_decision_record", {}],
];
for (const [name, args] of calls) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.find((c) => c.type === "text")?.text ?? "";
  ok(!r.isError && r.structuredContent !== undefined, `${name} returned structuredContent`);
  console.log(text.split("\n").map((l) => `      ${l}`).join("\n"));
  if (name === "align_get_work_map") {
    const first = r.structuredContent?.groups?.flatMap((g) => g.sessions)?.[0];
    if (first) {
      const one = await client.callTool({ name, arguments: { session_id: first.id } });
      const s = one.structuredContent?.groups?.[0]?.sessions?.[0];
      ok(one.structuredContent?.total_sessions === 1 && (s?.mapping === null || s?.mapping?.probabilities !== undefined), `${name} {session_id} -> single session`);
      console.log(`      ${one.content?.[0]?.text ?? ""}`);
    }
  }
  if (name === "align_get_decision_record") ok(r.structuredContent?.note === "Company outcome is not verified by this record.", "decision record carries the outcome note");
}

// (d) unknown / mutating tool must fail
let rejected = false;
let detail = "";
try {
  const r = await client.callTool({ name: "align_ratify", arguments: { proposal_id: "x" } });
  rejected = r.isError === true;
  detail = r.content?.[0]?.text ?? "";
} catch (e) {
  rejected = true;
  detail = e instanceof Error ? e.message : String(e);
}
ok(rejected, `align_ratify rejected (${detail.slice(0, 120)})`);

await client.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll MCP checks passed");
process.exit(failures ? 1 : 0);
