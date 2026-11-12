#!/usr/bin/env node
// LIM-2472 concept A: fill a local Mode L server (started with ALIGN_TEST_IDP=1) with a fictional workspace to build
// and screenshot against. Everything goes through the real v2 API as real people would: two test-IdP accounts, the
// Northstar sample, an invite, change requests, an approve-and-launch, a paired device with shared sessions bound to
// goals, and receipts for what Align delivered. All names are fictional; the workspace is the "(sample)" one.
//
//   node design/prototypes/lim-2472/a/seed.mjs http://127.0.0.1:3801 <out.json>
//
// Writes <out.json> (mode 600) with the workspace id and the two accounts' emails and passwords for shots.mjs. The
// passwords are throwaway test-IdP passwords for this local server only.
import { createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:3801").replace(/\/$/, "");
const OUT = process.argv[3] || "concept-a-seed.json";

async function call(method, p, { body, cookie, bearer } = {}) {
  // Browser-style Origin on cookie and sign-up calls only: device routes refuse anything that looks like a browser.
  const h = bearer || p.startsWith("/api/v2/device/authorize") || p.startsWith("/api/v2/device/token") ? {} : { origin: BASE };
  if (body !== undefined) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  if (bearer) h.authorization = `Bearer ${bearer}`;
  const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, setCookies: res.headers.getSetCookie?.() ?? [] };
}
async function must(label, p) {
  const r = await p;
  if (r.status < 200 || r.status >= 300) throw new Error(`${label}: ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}
const cookieOf = (sc) => sc.map((c) => c.split(";")[0]).join("; ");

async function account(name, email) {
  const password = `pw-${randomBytes(9).toString("base64url")}`;
  let r = await call("POST", "/api/v2/auth/sign-up/email", { body: { name, email, password } });
  if (r.status !== 200) throw new Error(`sign-up ${email}: ${r.status} ${r.text.slice(0, 200)} (start the server with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR)`);
  return { name, email, password, id: r.json.user.id, cookie: cookieOf(r.setCookies) };
}

async function pair(user, ws, name) {
  const pub = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
  const secret = randomBytes(32);
  const a = await must("authorize", call("POST", "/api/v2/device/authorize", { body: { device_name: name, public_key: pub } }));
  await must("approve device", call("POST", "/api/v2/device/approve", { cookie: user.cookie, body: { user_code: a.user_code, workspace_ids: [ws] } }));
  const t = await must("token", call("POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: a.device_code } }));
  return { secret, access: t.access_token };
}

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
async function share(dev, ws, native, { repo, title, harness = "claude-code", startedH, goal, usage = 0 }) {
  const key = createHmac("sha256", dev.secret).update(`${ws}\0${harness}\0${native}`).digest("base64url");
  const repoKey = createHmac("sha256", dev.secret).update(`${ws}\0repo\0${repo}`).digest("base64url");
  await must(`share ${title}`, call("PUT", `/api/v2/workspaces/${ws}/sessions/${key}`, { bearer: dev.access, body: { harness, repo_key: repoKey, repo_alias: repo, started_at: hoursAgo(startedH), title } }));
  // A binding epoch (to the goal, or to none): usage is reported against an epoch, as the align CLI does.
  const epoch = `ep_${randomBytes(18).toString("base64url")}`;
  await must(`bind ${title}`, call("POST", `/api/v2/workspaces/${ws}/sessions/${key}/epochs`, { bearer: dev.access, body: { epoch_id: epoch, goal_id: goal ?? null, starts_at: hoursAgo(startedH), root_turn: null, cause: "manual" } }));
  // Fictional usage rows, as the CLI reports them (agent reported): this is what each goal's 7-day share counts.
  const rows = Array.from({ length: usage }, (_, i) => ({
    request_key: createHmac("sha256", dev.secret).update(`req\0${native}-${i}`).digest("base64url"),
    epoch_id: epoch,
    ts: hoursAgo(Math.max(0.2, startedH - 0.1 - i * 0.05)),
    model: "claude-sonnet-4-5",
    query_source: "main",
    input: 1000,
    output: 200,
    cache_read: 5000,
    cache_write_5m: 300,
    cache_write_1h: 0,
    cache_write_unsplit: 0,
    basis: "subscription_included",
    est_list_usd_micros: 12_345,
    price_table_version: "2026-10-01",
    source: "otel",
  }));
  if (rows.length) await must(`usage ${title}`, call("POST", `/api/v2/workspaces/${ws}/sessions/${key}/usage`, { bearer: dev.access, body: { rows } }));
  return key;
}

const owner = await account("Mara Quill", "mara@example.test");
const member = await account("Theo Vance", "theo@example.test");

const sample = await must("sample", call("POST", "/api/v2/workspaces/sample", { cookie: owner.cookie, body: {} }));
const ws = sample.workspace?.id ?? sample.id;
const inv = await must("invite", call("POST", `/api/v2/workspaces/${ws}/invites`, { cookie: owner.cookie, body: { email: member.email, role: "member" } }));
await must("accept", call("POST", `/api/v2/invites/${inv.token}/accept`, { cookie: member.cookie, body: {} }));

const goals = (await must("goals", call("GET", `/api/v2/workspaces/${ws}/goals`, { cookie: owner.cookie }))).goals;
const byTitle = (t) => goals.find((g) => g.title === t);
const company = byTitle("Expand to regulated customers");
const onboarding = byTitle("Ship self-serve onboarding");
const security = byTitle("Pass the security review");

// Devices and sessions first, so the launch below has bound sessions to deliver its version to.
const ownerDev = await pair(owner, ws, "Mara's laptop (sample)");
const s1 = await share(ownerDev, ws, "n1", { repo: "web-onboarding", title: "Signup flow, step 2 copy", startedH: 5, goal: onboarding.id, usage: 30 });
const s2 = await share(ownerDev, ws, "n2", { repo: "security-review", title: "Pen-test scope checklist", harness: "codex", startedH: 3, goal: security.id, usage: 12 });
await share(ownerDev, ws, "n3", { repo: "infra", title: "Audit log retention script", startedH: 26, usage: 8 });
const memberDev = await pair(member, ws, "Theo's desktop (sample)");
await share(memberDev, ws, "m1", { repo: "web-onboarding", title: "Pricing page for regulated tier", startedH: 2, usage: 10 }); // unbound: binding to a goal Theo does not own needs an approved alignment first

// The sample's own pending request on the security goal: approve and launch it, so its new version is sent to the
// session bound to that goal; that session's device then answers with a received receipt (a delivery receipt).
const groups = await must("crs", call("GET", `/api/v2/workspaces/${ws}/change-requests`, { cookie: owner.cookie }));
const crs = [...(groups.waiting_on_me ?? []), ...(groups.mine ?? []), ...(groups.others ?? [])];
const seeded = crs.find((c) => c.goal.id === security.id && c.state === "pending");
await must("approve and launch", call("POST", `/api/v2/workspaces/${ws}/goals/${security.id}/change-requests/${seeded.id}/approve_and_launch`, { cookie: owner.cookie, body: { revision: seeded.revision } }));
const dirs = (await must("directives", call("GET", "/api/v2/directives?cursor=0", { bearer: ownerDev.access }))).directives;
const launched = dirs.filter((d) => d.kind === "goal_version" && d.session_keys?.includes(s2)).pop();
if (launched) await must("receipt", call("POST", `/api/v2/directives/${launched.id}/receipts`, { bearer: ownerDev.access, body: { session_key: s2, state: "received", at: new Date().toISOString() } }));

// Theo proposes two changes on goals Mara owns: one waits on her decision; the other she approves without launching.
const onb = await must("goal", call("GET", `/api/v2/workspaces/${ws}/goals/${onboarding.id}`, { cookie: member.cookie }));
await must(
  "propose onboarding",
  call("POST", `/api/v2/workspaces/${ws}/goals/${onboarding.id}/change-requests`, {
    cookie: member.cookie,
    body: { base_version: onb.version ?? onb.goal?.version, changes: { title: "Ship self-serve onboarding for regulated teams" }, reason: "Two design partners asked for SSO before they can trial it. This narrows the goal to the regulated tier first. (Fictional sample.)" },
  }),
);
const co = await must("goal", call("GET", `/api/v2/workspaces/${ws}/goals/${company.id}`, { cookie: member.cookie }));
const coCr = await must(
  "propose company",
  call("POST", `/api/v2/workspaces/${ws}/goals/${company.id}/change-requests`, {
    cookie: member.cookie,
    body: { base_version: co.version ?? co.goal?.version, changes: { measures: [{ text: "Regulated customers live", target: "4 this year" }] }, reason: "A fourth design partner signed a pilot letter. Raise the target from 3 to 4. (Fictional sample.)" },
  }),
);
const coView = coCr.id ? coCr : coCr.change_request;
await must("approve only", call("POST", `/api/v2/workspaces/${ws}/goals/${company.id}/change-requests/${coView.id}/approve`, { cookie: owner.cookie, body: { revision: coView.revision } }));

writeFileSync(OUT, JSON.stringify({ base: BASE, ws, owner: { email: owner.email, password: owner.password }, member: { email: member.email, password: member.password } }, null, 2), { mode: 0o600 });
console.log(`seeded ${ws} (Northstar (sample)): owner ${owner.email}, member ${member.email}; credentials in ${OUT}`);
