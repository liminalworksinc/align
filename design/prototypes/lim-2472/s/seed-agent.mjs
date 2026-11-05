#!/usr/bin/env node
// LIM-2472 shared seed (workstream S): fill a local Mode L Align with a fictional workspace whose AGENT side is not
// empty, so Work, Apps, Sessions, the record and both concepts' Homes can be judged. Real HTTP routes only (no SQLite,
// no fixtures), as real people, devices and a connected app would call them.
//
//   node design/prototypes/lim-2472/s/seed-agent.mjs <BASE> <out.json> [--workspace <ws>]
//
// Start the server with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR, e.g.
//   ALIGN_TEST_IDP=1 ALIGN_DATA_DIR=/tmp/align-seed npx next dev -H 127.0.0.1 -p 3803
//
// What it makes (everything fictional; URLs are example.test; titles a tester could read as real say "(fictional)"):
//   - three test-IdP people: an owner, a member and a viewer;
//   - the Northstar sample workspace, created by the owner (--workspace <ws> uses an existing workspace instead, but
//     only one the owner account can already reach, which on a fresh server means none: the accounts are new, so
//     leave it out and read the new workspace id from <out.json>);
//   - a paired device per person (the device flow: authorize, approve in the browser session, token);
//   - shared sessions bound to goals, with usage rows, so each bound goal has a 7-day allocation share;
//   - change requests: one approved AND launched (its directive answered received then applied by the device), one
//     approved and not launched, one pending;
//   - evidence: a self-reported link (a person) and an agent-reported link (the connected app, over MCP);
//   - a second OAuth app (Theo's) that only connects, so Apps also has a Not observed row;
//   - one OAuth app (dynamic registration, consent approve, PKCE token) that reads the goals over MCP after the
//     launch, so Apps shows Last connected and Last read the goals, and …/value has apps.items[].sent_at.
// Writes <out.json> (mode 600): base, workspace, goal and request ids, the three accounts' emails and their throwaway
// test-IdP passwords (this local server only). Prints nothing secret.
import { createHash, createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const WS_ARG = flag("--workspace");
const BASE = (args[0] || "http://127.0.0.1:3803").replace(/\/$/, "");
const OUT = args[1] || "lim-2472-seed.json";
const REDIRECT = "http://127.0.0.1:33418/callback";

async function call(method, p, { body, cookie, bearer, form, headers = {} } = {}) {
  // Browser-style Origin on cookie, sign-up and OAuth consent calls only: device routes refuse anything that looks like
  // a browser.
  const h = { ...(bearer || p.startsWith("/api/v2/device/authorize") || p.startsWith("/api/v2/device/token") || p === "/oauth/token" || p === "/oauth/register" || p === "/api/mcp" ? {} : { origin: BASE }), ...headers };
  let payload;
  if (form) {
    h["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (cookie) h.cookie = cookie;
  if (bearer) h.authorization = `Bearer ${bearer}`;
  const res = await fetch(BASE + p, { method, headers: h, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // An MCP answer may come as an event stream: take its data line.
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    if (line) json = JSON.parse(line.slice(5));
  }
  return { status: res.status, json, text, setCookies: res.headers.getSetCookie?.() ?? [] };
}
async function must(label, p) {
  const r = await p;
  if (r.status < 200 || r.status >= 300) throw new Error(`${label}: ${r.status} ${r.text.slice(0, 400)}`);
  return r.json;
}
const cookieOf = (sc) => sc.map((c) => c.split(";")[0]).join("; ");
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

// ---- people ----
async function account(name, email) {
  const password = `pw-${randomBytes(12).toString("base64url")}`;
  const r = await call("POST", "/api/v2/auth/sign-up/email", { body: { name, email, password } });
  if (r.status !== 200) throw new Error(`sign-up ${email}: ${r.status} ${r.text.slice(0, 200)} (start the server with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR)`);
  return { name, email, password, id: r.json.user.id, cookie: cookieOf(r.setCookies) };
}

// ---- devices (the align CLI's device flow) ----
async function pair(user, ws, name) {
  const pub = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
  const secret = randomBytes(32);
  const a = await must("authorize", call("POST", "/api/v2/device/authorize", { body: { device_name: name, public_key: pub } }));
  await must("approve device", call("POST", "/api/v2/device/approve", { cookie: user.cookie, body: { user_code: a.user_code, workspace_ids: [ws] } }));
  const t = await must("token", call("POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: a.device_code } }));
  return { secret, access: t.access_token, name };
}

async function share(dev, ws, native, { repo, title, harness = "claude-code", startedH, goal, requests = 0 }) {
  const key = createHmac("sha256", dev.secret).update(`${ws}\0${harness}\0${native}`).digest("base64url");
  const repoKey = createHmac("sha256", dev.secret).update(`${ws}\0repo\0${repo}`).digest("base64url");
  await must(`share ${title}`, call("PUT", `/api/v2/workspaces/${ws}/sessions/${key}`, { bearer: dev.access, body: { harness, repo_key: repoKey, repo_alias: repo, started_at: hoursAgo(startedH), title } }));
  let epoch = null;
  if (goal) {
    epoch = `ep_${randomBytes(18).toString("base64url")}`;
    await must(`bind ${title}`, call("POST", `/api/v2/workspaces/${ws}/sessions/${key}/epochs`, { bearer: dev.access, body: { epoch_id: epoch, goal_id: goal, starts_at: hoursAgo(startedH), root_turn: null, cause: "manual" } }));
  }
  if (epoch && requests > 0) {
    // Usage rows spread over the session's life (the last one 20 minutes ago), as the CLI reports them.
    const rows = Array.from({ length: requests }, (_, i) => ({
      request_key: createHmac("sha256", dev.secret).update(`req\0${native}\0${i}`).digest("base64url"),
      ts: new Date(Date.now() - (20 + i * ((startedH * 60 - 30) / requests)) * 60_000).toISOString(),
      epoch_id: epoch,
      model: harness === "codex" ? "gpt-5-codex" : "claude-sonnet-4-5",
      query_source: i % 4 === 3 ? "subagent" : "main",
      input: 1200 + i * 37,
      output: 260 + i * 11,
      cache_read: 6000,
      cache_write_5m: 300,
      cache_write_1h: 0,
      cache_write_unsplit: 0,
      basis: "subscription_included",
      est_list_usd_micros: 14_000 + i * 120,
      price_table_version: "2026-10-01",
      source: "otel",
    }));
    await must(`usage ${title}`, call("POST", `/api/v2/workspaces/${ws}/sessions/${key}/usage`, { bearer: dev.access, body: { rows } }));
  }
  return key;
}

// ---- the connected app (Align's OAuth server, then MCP) ----
async function connectApp(user, ws, clientName) {
  const reg = await must("register app", call("POST", "/oauth/register", { body: { client_name: clientName, redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", scope: "goals:read changes:evidence" } }));
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = { response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "seed", resource: `${BASE}/api/mcp`, scope: "goals:read changes:evidence" };
  const ap = await must("approve app", call("POST", "/api/oauth/approve", { cookie: user.cookie, body: { params, decision: "approve", workspace_id: ws } }));
  const code = ap.redirect ? new URL(ap.redirect).searchParams.get("code") : null;
  if (!code) throw new Error(`approve app: no code (${JSON.stringify(ap).slice(0, 200)})`);
  const t = await must("app token", call("POST", "/oauth/token", { form: { grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier, resource: `${BASE}/api/mcp` } }));
  return { client_id: reg.client_id, access: t.access_token };
}
let rpc = 0;
async function tool(app, name, args = {}) {
  const r = await call("POST", "/api/mcp", { bearer: app.access, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } } });
  const res = r.json?.result;
  if (r.status !== 200 || !res || res.isError) throw new Error(`mcp ${name}: ${r.status} ${r.text.slice(0, 300)}`);
  return res.structuredContent ?? res;
}

// ---------------------------------------------------------------------------------------------------------------------

const owner = await account("Mara Quill", "mara@example.test");
const member = await account("Theo Vance", "theo@example.test");
const viewer = await account("Ines Park", "ines@example.test");

let ws = WS_ARG;
if (!ws) {
  const sample = await must("sample", call("POST", "/api/v2/workspaces/sample", { cookie: owner.cookie, body: {} }));
  ws = sample.workspace?.id ?? sample.id;
}
for (const [p, role] of [
  [member, "member"],
  [viewer, "viewer"],
]) {
  const inv = await must(`invite ${p.email}`, call("POST", `/api/v2/workspaces/${ws}/invites`, { cookie: owner.cookie, body: { email: p.email, role } }));
  await must(`accept ${p.email}`, call("POST", `/api/v2/invites/${inv.token}/accept`, { cookie: p.cookie, body: {} }));
}

const goals = (await must("goals", call("GET", `/api/v2/workspaces/${ws}/goals`, { cookie: owner.cookie }))).goals;
const byTitle = (t) => goals.find((g) => g.title === t);
const company = byTitle("Expand to regulated customers") ?? goals.find((g) => g.level === "company") ?? goals[0];
const onboarding = byTitle("Ship self-serve onboarding") ?? goals.find((g) => g.id !== company.id) ?? goals[0];
const security = byTitle("Pass the security review") ?? goals.find((g) => g.id !== company.id && g.id !== onboarding.id) ?? goals[0];

// Devices and sessions first, so the launch below has a bound session to deliver its version to. Theo's session stays
// unbound: binding to a goal he doesn't own needs an approved alignment first.
const ownerDev = await pair(owner, ws, "Mara's laptop (fictional)");
const sOnb = await share(ownerDev, ws, "n1", { repo: "web-onboarding", title: "Signup flow, step 2 copy", startedH: 5, goal: onboarding.id, requests: 14 });
const sSec = await share(ownerDev, ws, "n2", { repo: "security-review", title: "Pen-test scope checklist", harness: "codex", startedH: 3, goal: security.id, requests: 8 });
await share(ownerDev, ws, "n3", { repo: "infra", title: "Audit log retention script", startedH: 26 });
const memberDev = await pair(member, ws, "Theo's desktop (fictional)");
await share(memberDev, ws, "m1", { repo: "web-onboarding", title: "Pricing page for regulated tier", startedH: 2 });
await pair(viewer, ws, "Ines's laptop (fictional)");

// The connected app: approved by Mara, scoped to read goals and add evidence links.
const app = await connectApp(owner, ws, "Claude Code (fictional seed)");

// 1. Approved AND launched: the sample's own pending request on the security goal. Its device answers the launch
// directive received, then applied, for the session bound to that goal.
const groups = await must("crs", call("GET", `/api/v2/workspaces/${ws}/change-requests`, { cookie: owner.cookie }));
const crs = [...(groups.waiting_on_me ?? []), ...(groups.mine ?? []), ...(groups.others ?? [])];
let launchedCr = crs.find((c) => c.goal.id === security.id && c.state === "pending");
if (!launchedCr) {
  const g = await must("goal", call("GET", `/api/v2/workspaces/${ws}/goals/${security.id}`, { cookie: member.cookie }));
  launchedCr = await must(
    "propose security",
    call("POST", `/api/v2/workspaces/${ws}/goals/${security.id}/change-requests`, {
      cookie: member.cookie,
      body: { base_version: g.goal.version, changes: { measures: [...g.goal.measures, { text: "Pen test window booked (fictional)", target: "before launch" }] }, reason: "Book the pen test before launch. (Fictional seed.)" },
    }),
  );
}
// A self-reported link from a person before the decision, so the record and Work show one of each kind.
await must(
  "self-reported evidence",
  call("POST", `/api/v2/workspaces/${ws}/goals/${security.id}/change-requests/${launchedCr.id}/evidence`, { cookie: owner.cookie, body: { kind: "doc", url: "https://docs.example.test/pen-test-scope", label: "Pen-test scope (fictional)" } }),
);
await must("approve and launch", call("POST", `/api/v2/workspaces/${ws}/goals/${security.id}/change-requests/${launchedCr.id}/approve_and_launch`, { cookie: owner.cookie, body: { revision: launchedCr.revision } }));
const dirs = (await must("directives", call("GET", "/api/v2/directives?cursor=0", { bearer: ownerDev.access }))).directives;
const launchDir = dirs.filter((d) => d.kind === "goal_version" && d.session_keys?.includes(sSec)).pop();
if (launchDir) {
  await must("receipt received", call("POST", `/api/v2/directives/${launchDir.id}/receipts`, { bearer: ownerDev.access, body: { session_key: sSec, state: "received", at: new Date().toISOString() } }));
  await must("receipt applied", call("POST", `/api/v2/directives/${launchDir.id}/receipts`, { bearer: ownerDev.access, body: { session_key: sSec, state: "applied", at: new Date().toISOString() } }));
}

// The connected app reads the goals after the launch: Align serves the launched version and records it as sent
// (…/value apps.items[].sent_at), and the grant gets last_used_at and last_read_at.
await tool(app, "align_list_goals");
await tool(app, "align_get_goal", { goal_id: security.id });

// A second app that only connects (initialize and tools/list, no tool call that returns goals): Apps lists it with a
// Last connected time and "Not seen yet" under Last read the goals, so all three evidence classes have something.
const idle = await connectApp(member, ws, "Codex (fictional seed, connected only)");
await call("POST", "/api/mcp", { bearer: idle.access, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: ++rpc, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "seed", version: "0" } } } });
await call("POST", "/api/mcp", { bearer: idle.access, headers: { accept: "application/json, text/event-stream" }, body: { jsonrpc: "2.0", id: ++rpc, method: "tools/list", params: {} } });

// 2. Approved, not launched: Theo raises the company target; Mara approves only.
const co = await must("goal", call("GET", `/api/v2/workspaces/${ws}/goals/${company.id}`, { cookie: member.cookie }));
const coCr = await must(
  "propose company",
  call("POST", `/api/v2/workspaces/${ws}/goals/${company.id}/change-requests`, {
    cookie: member.cookie,
    body: { base_version: co.goal.version, changes: { measures: co.goal.measures.map((m, i) => (i === 0 ? { ...m, target: "4 this year" } : m)) }, reason: "A fourth design partner signed a pilot letter. Raise the target from 3 to 4. (Fictional seed.)" },
  }),
);
await must("approve only", call("POST", `/api/v2/workspaces/${ws}/goals/${company.id}/change-requests/${coCr.id}/approve`, { cookie: owner.cookie, body: { revision: coCr.revision, without_evidence: true } }));

// 3. Pending: Theo narrows onboarding; the connected app adds an agent-reported link to it over MCP.
const onb = await must("goal", call("GET", `/api/v2/workspaces/${ws}/goals/${onboarding.id}`, { cookie: member.cookie }));
const onbCr = await must(
  "propose onboarding",
  call("POST", `/api/v2/workspaces/${ws}/goals/${onboarding.id}/change-requests`, {
    cookie: member.cookie,
    body: { base_version: onb.goal.version, changes: { title: "Ship self-serve onboarding for regulated teams (fictional)" }, reason: "Two design partners asked for SSO before they can trial it. This narrows the goal to the regulated tier first. (Fictional seed.)" },
  }),
);
await tool(app, "align_add_change_request_evidence", { change_request_id: onbCr.id, kind: "pr", url: "https://git.example.test/northstar/web-onboarding/pull/42", label: "SSO entry point draft (fictional)" });

const out = {
  base: BASE,
  ws,
  goals: { company: company.id, onboarding: onboarding.id, security: security.id },
  change_requests: { launched: launchedCr.id, approved_not_launched: coCr.id, pending: onbCr.id },
  sessions: { owner_onboarding: sOnb, owner_security: sSec },
  apps: { reads: app.client_id, connected_only: idle.client_id },
  accounts: Object.fromEntries([owner, member, viewer].map((p, i) => [["owner", "member", "viewer"][i], { name: p.name, email: p.email, password: p.password }])),
  note: "Fictional seed for a local Mode L server started with ALIGN_TEST_IDP=1. Passwords are throwaway test-IdP passwords for that server only.",
};
writeFileSync(OUT, JSON.stringify(out, null, 2), { mode: 0o600 });
console.log(`seeded ${ws}: owner ${owner.email}, member ${member.email}, viewer ${viewer.email}; ids and test passwords in ${OUT}`);
