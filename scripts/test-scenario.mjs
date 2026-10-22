#!/usr/bin/env node
// Custom-scenario acceptance test (Build A minimum slice): setup authority S1–S9, the minimal setup S10/S11, Host checks S12/S13,
// state after setup T1, the propose → change → owner-approval flow F2–F15, leadership's launch decision L1–L6, what an
// agent reads (accepted plan P1/P2, the approval directive D0–D5, on synthetic sessions under a synthetic repo, and the
// MCP tools M0–M2), and R4 back to Northstar. The MCP checks need the server's token: ALIGN_MCP_TOKEN=<t> (test-all passes it).
// Case ids follow Sean's Build A plan §7/§8. Contracts: plan §3 (setup API, approval, custom state seed).
//
// Usage: node scripts/test-scenario.mjs http://127.0.0.1:3205 [fixture.json]
// The fixture defaults to data/scenarios/example-custom.json (owned by L2, the Fernway example).
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, signIn } from "./lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = baseUrl();
const FIXTURE = path.resolve(process.argv[3] || path.join(ROOT, "data/scenarios/example-custom.json"));
// Fixtures carry no confirm, so /api/workspaces accepts them as they are; /api/scenario needs it, so add it here.
const fixture = { confirm: "replace", ...JSON.parse(readFileSync(FIXTURE, "utf8")) };
const NORTHSTAR_TEXT = /Northstar|Sparta|Alike|p-beta|p-throughput|KR2 makes beta/;
const RUN = Date.now().toString(36);
const AGENT_REPO = "test-scenario-agent";
const AGENT_READS = `test-scenario-reads-${RUN}`;
const AGENT_OTHER = `test-scenario-other-${RUN}`;
const AGENT_STALE = `test-scenario-stale-${RUN}`;
const MCP_TOKEN = process.env.ALIGN_MCP_TOKEN;
/** One synthetic capture event, as the hook sends it. */
const capture = (sid, tool) =>
  fetch(`${BASE}/api/sessions/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ harness: "claude-code", session_id: sid, hook_event: "PostToolUse", repo: AGENT_REPO, cwd: AGENT_REPO, tool_name: tool }),
  }).then((r) => r.status);
/** One MCP tool call (stateless Streamable HTTP), as an agent makes it. Returns the JSON-RPC result. */
async function mcp(name, args = {}) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${MCP_TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await res.text();
  const data = body.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data ? data.slice(6) : body).result;
}

// The fewest fields a setup may carry (founder ruling "optional fields"). Every other field is optional.
const MINIMAL = {
  confirm: "replace",
  company: "Minimal Co",
  company_goal: { objective: "Close the audit finding this quarter", measures: ["The audit finding is closed"] },
  asking: { team: "Support", lead: "Head of Support", objective: "Cut the ticket backlog in half" },
  owning: { team: "Infra", lead: "Infra Lead", objective: "Finish the database upgrade", measures: ["Database upgrade done by the 30th"] },
  dependency: "The audit fix needs an Infra config change that is not on their plan.",
  work_items: [
    { team: "asking", task: "Backlog triage rota" },
    { team: "owning", task: "Database upgrade rollout" },
  ],
  plan: { text: "Infra ships the config change first; Support pauses new tooling asks until the upgrade lands." },
};
const MINIMAL_REQUIRED = [
  "confirm", "company",
  "company_goal", "company_goal.objective", "company_goal.measures",
  "asking", "asking.team", "asking.lead", "asking.objective",
  "owning", "owning.team", "owning.lead", "owning.objective", "owning.measures",
  "dependency", "work_items", "plan", "plan.text",
];

let passed = 0;
let failed = 0;
function check(label, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
  return ok;
}

const cookies = {};
async function call(role, method, p, body, { headers = {}, raw } = {}) {
  const h = { ...headers };
  if (role) h.cookie = cookies[role];
  if (body !== undefined && raw === undefined && !h["content-type"]) h["content-type"] = "application/json";
  const res = await fetch(BASE + p, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}
const short = (r) => `status=${r.status} body=${(r.text || "").slice(0, 300)}`;
const state = async (role = "leadership") => (await call(role, "GET", "/api/state")).json ?? {};
const current = (st, owner) => {
  const all = (st.goals ?? []).filter((g) => g.owner_id === owner);
  const superseded = new Set(all.map((g) => g.supersedes).filter(Boolean));
  return all.find((g) => !superseded.has(g.id));
};
const setup = (role, body, opts) => call(role, "POST", "/api/scenario", body, opts);
// fetch drops a caller-set Host header, so the DNS-rebinding case goes through node:http.
function requestWithHost(method, p, host, headers = {}, body) {
  const u = new URL(BASE + p);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method, headers: { ...headers, host } }, (res) => {
      let text = "";
      res.on("data", (d) => (text += d)).on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const postWithHost = (p, host, body, cookie) =>
  requestWithHost("POST", p, host, { cookie, "content-type": "application/json", origin: `http://${host}` }, body);

async function main() {
  console.log(`Align custom-scenario test against ${BASE} (fixture ${path.relative(ROOT, FIXTURE)})\n`);
  for (const role of ["product", "security", "leadership"]) cookies[role] = await signIn(BASE, role);

  // Start from Northstar so the run is repeatable.
  const r0 = await call("leadership", "POST", "/api/reset", { confirm: "reset" });
  check("setup: leadership resets to Northstar", r0.status === 200, short(r0));

  // ---- S: setup authority and input hardening (plan §3 setup API, §9) ----
  const s1 = await setup(null, fixture);
  check("S1 POST /api/scenario without a session -> 401", s1.status === 401, short(s1));
  const s2p = await setup("product", fixture);
  const s2s = await setup("security", fixture);
  check("S2 product and security cannot set up a scenario -> 403", s2p.status === 403 && s2s.status === 403, `${short(s2p)} | ${short(s2s)}`);
  const s3 = await setup("leadership", undefined, { raw: JSON.stringify(fixture), headers: { "content-type": "text/plain" } });
  check("S3 non-JSON content type -> 415 (CSRF)", s3.status === 415, short(s3));
  const s4 = await setup("leadership", fixture, { headers: { origin: "http://evil.example" } });
  const s4n = await setup("leadership", fixture, { headers: { origin: "null" } });
  check('S4 foreign or "null" Origin -> 403 (CSRF)', s4.status === 403 && s4n.status === 403, `${short(s4)} | ${short(s4n)}`);
  const without = (key) => Object.fromEntries(Object.entries(fixture).filter(([k]) => k !== key));
  const s5 = await setup("leadership", without("confirm"));
  const s5b = await setup("leadership", without("company_goal"));
  const s5c = await setup("leadership", { ...fixture, work_items: fixture.work_items.filter((w) => w.team !== "owning") });
  check(
    'S5 missing confirm:"replace", company_goal or an owning-team work item -> 400 with {error, issues[{path, message}]}',
    [s5, s5b, s5c].every((r) => r.status === 400) && typeof s5.json?.error === "string" && Array.isArray(s5.json?.issues) && s5.json.issues.every((i) => "path" in i && "message" in i),
    `${short(s5)} | ${short(s5b)} | ${short(s5c)}`,
  );
  const s6 = await setup("leadership", { ...fixture, extra_field: 1 });
  check("S6 unknown key -> 400 (strict schema)", s6.status === 400, short(s6));
  const s7 = await setup("leadership", { ...fixture, plan: { ...fixture.plan, plan_id: "p-beta" } });
  check("S7 client-supplied ids are refused -> 400 (server makes ids)", s7.status === 400, short(s7));
  const big = JSON.stringify({ ...fixture, pad: "x".repeat(70 * 1024) });
  const s8 = await setup("leadership", undefined, { raw: big, headers: { "content-type": "application/json" } });
  check("S8 body over 64 KB -> 413", s8.status === 413, short(s8));
  const s12 = await postWithHost("/api/scenario", "rebind.example:3000", fixture, cookies.leadership);
  // proxy.ts answers 421 before the route runs; requireJson's own check (403) stays as a second line.
  check("S12 non-loopback Host (DNS rebinding) -> 421 or 403", s12.status === 421 || s12.status === 403, short(s12));
  const s13 = await requestWithHost("GET", "/api/state", "rebind.example", { cookie: cookies.leadership });
  const s13p = await requestWithHost("GET", "/", "rebind.example:3000", { cookie: cookies.leadership });
  // Sign-in has no session to check, so a rebound page must not reach it with the default passcodes.
  const s13s = await requestWithHost("POST", "/api/session", "rebind.example", { "content-type": "application/json", origin: "http://rebind.example" }, { role: "leadership", passcode: "leadership-demo" });
  check(
    "S13 GET /api/state, GET / and POST /api/session (sign-in) with a non-loopback Host are refused by proxy.ts -> 421",
    s13.status === 421 && s13p.status === 421 && s13s.status === 421 && !s13s.headers["set-cookie"],
    `${short(s13)} | ${short(s13p)} | ${short(s13s)}`,
  );
  const proto = JSON.stringify(fixture).replace(/^\{/, '{"__proto__":{"admin":true},');
  const s9 = await setup("leadership", undefined, { raw: proto, headers: { "content-type": "application/json" } });
  check("S9 own __proto__ key -> 400, refused for that key (not some other 400)", s9.status === 400 && /__proto__/.test(JSON.stringify(s9.json ?? s9.text ?? "")), short(s9));

  // Founder ruling "optional fields": only the minimal conflict is required.
  const dropAt = (obj, p) => {
    const copy = structuredClone(obj);
    const keys = p.split(".");
    const last = keys.pop();
    delete keys.reduce((o, k) => o[k], copy)[last];
    return copy;
  };
  // [case, response, the issue path the 400 must name]
  const s11 = [];
  for (const p of MINIMAL_REQUIRED) s11.push([`no ${p}`, await setup("leadership", dropAt(MINIMAL, p)), p]);
  for (const side of ["asking", "owning"]) {
    s11.push([`no ${side} work item`, await setup("leadership", { ...MINIMAL, work_items: MINIMAL.work_items.filter((w) => w.team !== side) }), "work_items"]);
    const four = Array.from({ length: 4 }, (_, i) => ({ team: side, task: `${side} task ${i + 1}` }));
    s11.push([`4 ${side} work items`, await setup("leadership", { ...MINIMAL, work_items: [...MINIMAL.work_items.filter((w) => w.team !== side), ...four] }), "work_items"]);
  }
  const s11bad = s11.filter(([, r, p]) => r.status !== 400 || !(r.json?.issues ?? []).some((i) => i.path === p));
  check(
    `S11 minimal setup missing any required field, or with 4 work items for one team -> 400 naming that field (${s11.length} cases)`,
    s11bad.length === 0,
    s11bad.map(([what, r]) => `${what}: ${short(r)}`).join(" | "),
  );
  const before = await state();
  check("S1–S9 and S11 left Northstar untouched", before.scenario === undefined && (before.simulations ?? []).length >= 27, `scenario=${before.scenario} sims=${before.simulations?.length}`);

  // S10: the minimal body builds a valid custom state; then the per-team cap of 3 is inclusive.
  const s10 = await setup("leadership", MINIMAL);
  const m = await state();
  const goal = (gid) => (m.goals ?? []).find((g) => g.id === gid);
  const dep = (m.relations ?? []).find((r) => r.id === m.scenario_config?.dependency_id);
  const owners = (m.work_items ?? []).map((w) => w.owner).sort();
  check(
    "S10 minimal setup -> 200: 1 company measure, 1 owning measure, 1+1 work items, the dependency, plan p-custom@1",
    s10.status === 200 && m.scenario === "custom" && m.company === MINIMAL.company &&
      goal("g-ceo-v1")?.measures?.length === 1 && goal("g-security-v1")?.measures?.length === 1 &&
      m.scenario_config?.company_measure_id === "KR1" && m.scenario_config?.owner_measure_id === "S-M1" &&
      JSON.stringify(owners) === JSON.stringify(["product", "security"]) &&
      dep?.type === "depends_on" && dep.source_goal === "g-product-v1" && dep.target_goal === "g-security-v1" && dep.label === MINIMAL.dependency &&
      m.plans?.[0]?.plan_id === "p-custom" && m.plans[0].plan_version === 1 && m.plans[0].text === MINIMAL.plan.text,
    `${short(s10)} ${JSON.stringify({ scenario: m.scenario, cfg: m.scenario_config, owners, dep, kr: goal("g-ceo-v1")?.measures, sm: goal("g-security-v1")?.measures })}`,
  );
  const three = ["asking", "owning"].flatMap((team) => [1, 2, 3].map((i) => ({ team, task: `${team} task ${i}` })));
  const s10b = await setup("leadership", { ...MINIMAL, work_items: three });
  check("S10 3 work items per team (the cap) -> 200", s10b.status === 200, short(s10b));

  // A session that read Align before this setup (it survives setup: its repo has consent). D5: never woken here.
  const g0 = await call("leadership", "POST", "/api/sessions/consent", { harness: "claude-code", repo: AGENT_REPO });
  const c0 = await capture(AGENT_STALE, "mcp__align__align_get_accepted_plan");
  check("D0 a session that read Align is captured before setup", g0.status === 200 && c0 === 200, `${short(g0)} capture=${c0}`);
  await new Promise((r) => setTimeout(r, 20)); // setup must be strictly later than the stale session's start

  const ok = await setup("leadership", fixture);
  const o = ok.json ?? {};
  check(
    "S-ok leadership setup -> 200 with the §3 response shape, plan p-custom@1",
    ok.status === 200 && o.ok === true && o.scenario === "custom" && Array.isArray(o.goal_ids) && typeof o.dependency_id === "string" &&
      o.plan?.plan_id === "p-custom" && o.plan?.plan_version === 1 && /^[0-9a-f]{64}$/.test(o.plan?.plan_hash ?? "") && typeof o.registry_version === "string",
    short(ok),
  );

  // ---- T1: state after setup ----
  const t1 = await state();
  await new Promise((r) => setTimeout(r, 300));
  const t1b = await state(); // a second poll must not ingest Northstar sandbox runs
  const ids = (t1.goals ?? []).map((g) => g.id);
  check(
    "T1 custom state: scenario custom, teams set, three v1 goals, no simulations after two polls",
    t1.scenario === "custom" && !!t1.teams && ["g-ceo-v1", "g-product-v1", "g-security-v1"].every((x) => ids.includes(x)) &&
      (t1.simulations ?? []).length === 0 && (t1b.simulations ?? []).length === 0,
    JSON.stringify({ scenario: t1.scenario, ids, sims: t1.simulations?.length, sims2: t1b.simulations?.length }),
  );
  check("T1 custom state carries no Northstar, Sparta or Alike text", !NORTHSTAR_TEXT.test(JSON.stringify({ ...t1b, audit: [] })), (JSON.stringify(t1b).match(NORTHSTAR_TEXT) ?? [""])[0]);
  check("T1 setup audit event holds a hash, not the input", (t1.audit ?? []).some((a) => a.action === "scenario_setup") && !JSON.stringify(t1.audit ?? []).includes(fixture.plan.text));

  // ---- P: what an agent reads before any agreement (accepted plan, custom) ----
  const owningTeam = t1.teams?.security?.team;
  const p0 = (await call(null, "GET", "/api/policy/security")).json;
  check("P0 an anonymous accepted-plan read carries no agreement (B1-6)", !!p0 && p0.agreement === undefined && p0.plan === "none", JSON.stringify(p0));
  const p1 = (await call("product", "GET", "/api/policy/security")).json;
  check(
    "P1 before approval the accepted plan is none, not agreed, named for the owning team, with the proposed plan text",
    p1?.plan === "none" && p1?.team === owningTeam && p1?.agreement?.status === "not_agreed" && p1?.agreement?.plan_text === t1.plans?.[0]?.text && p1?.agreement?.conditions === null && p1?.agreement?.launch === "not_applicable",
    JSON.stringify(p1),
  );

  // ---- F: propose → change → owner approval (plan §3 approval, §7 acceptance) ----
  const ownerMeasure = t1.scenario_config?.owner_measure_id;
  const body = {
    plan_id: "p-custom",
    plan_version: 1,
    simulation_refs: [],
    proposed_measure_text: "Customer requirement met within the agreed window",
    rationale: "The company goal changed; the dependency needs a new measure",
    reciprocal_commitment: "The asking team scopes the request up front",
  };
  const f2 = await call("product", "POST", "/api/proposals", body);
  const pid = f2.json?.id;
  check(
    "F2 asking team proposes p-custom@1 -> PENDING_SECURITY, UNTESTED, no simulation refs",
    f2.status === 200 && f2.json?.state === "PENDING_SECURITY" && f2.json?.test_status === "UNTESTED" && (f2.json?.simulation_refs ?? []).length === 0,
    short(f2),
  );
  if (!pid) throw new Error("No proposal id; aborting flow");
  // Two synthetic agent sessions under a synthetic repo (consent revoked at the end, which purges them):
  // one has read Align over MCP, one has not. Only the first may receive the approval's directive.
  const c1 = [await capture(AGENT_READS, "mcp__align__align_get_accepted_plan"), await capture(AGENT_OTHER, "Bash")];
  const kept = ((await state()).sessions ?? []).some((x) => x.session_id === AGENT_STALE);
  check("D1 two agent sessions captured after setup; the pre-setup session was kept by setup", c1.every((s) => s === 200) && kept, `${c1} kept=${kept}`);
  const ref = f2.json?.goal_text_ref;
  check("F2 inline plan reference is inline:p-custom@1 when present (decision 8)", ref === undefined || ref === "inline:p-custom@1", `goal_text_ref=${ref}`);
  const f3 = await call("product", "POST", "/api/proposals", body);
  check("F3 second open proposal -> 409", f3.status === 409, short(f3));
  const f3b = await setup("leadership", fixture);
  check("F3b setup while a proposal is open -> 409", f3b.status === 409, short(f3b));
  const f4 = await call("security", "POST", "/api/proposals", body);
  check("F4 owning team cannot propose -> 403", f4.status === 403, short(f4));
  const f5 = await call("product", "POST", `/api/proposals/${pid}/accept`, { rationale: "x", accept_untested: true });
  const f5c = await call("product", "POST", `/api/proposals/${pid}/counter`, { proposed_measure_text: "x" });
  check("F5 asking team cannot approve or ask for changes -> 403", f5.status === 403 && f5c.status === 403, `${short(f5)} | ${short(f5c)}`);
  // Conditions: custom-only, trimmed, at most 1000 characters; a bad value changes nothing.
  const counterBody = { proposed_measure_text: `${body.proposed_measure_text}, reviewed weekly`, rationale: "Needs a review cadence" };
  const f6c = await call("security", "POST", `/api/proposals/${pid}/counter`, { ...counterBody, conditions: "x".repeat(1001) });
  const f6t = await call("security", "POST", `/api/proposals/${pid}/counter`, { ...counterBody, conditions: 42 });
  const afterBad = (await state()).proposals?.find((x) => x.id === pid);
  check(
    "F6c conditions over 1000 characters, or not text -> 400, proposal unchanged",
    f6c.status === 400 && f6t.status === 400 && afterBad?.state === "PENDING_SECURITY" && afterBad.counter_versions.length === 0,
    `${short(f6c)} | ${short(f6t)}`,
  );
  const CONDITIONS = "Approve only if the first condition is met and the second is confirmed in writing";
  const f6 = await call("security", "POST", `/api/proposals/${pid}/counter`, { ...counterBody, conditions: `  ${CONDITIONS}\n ` });
  check("F6 owning team asks for changes -> COUNTERED, still UNTESTED", f6.status === 200 && f6.json?.state === "COUNTERED" && f6.json?.test_status === "UNTESTED", short(f6));
  check("F6 the counter stores its conditions, trimmed, as the last field", f6.json?.counter_versions?.at(-1)?.conditions === CONDITIONS && Object.keys(f6.json.counter_versions.at(-1)).at(-1) === "conditions", JSON.stringify(f6.json?.counter_versions?.at(-1)));
  const f7 = await call("security", "POST", `/api/proposals/${pid}/acknowledge`, {});
  check("F7 owning team cannot accept its own change -> 403", f7.status === 403, short(f7));
  const f8 = await call("security", "POST", `/api/proposals/${pid}/accept`, { rationale: "early", accept_untested: true });
  check("F8 approval before the asking team accepts -> 409", f8.status === 409, short(f8));
  const f9 = await call("product", "POST", `/api/proposals/${pid}/acknowledge`, {});
  check("F9 asking team accepts the change -> ACKNOWLEDGED_BY_PRODUCT", f9.status === 200 && f9.json?.state === "ACKNOWLEDGED_BY_PRODUCT", short(f9));
  const f10 = await call("security", "POST", `/api/proposals/${pid}/accept`, { rationale: "Agreed" });
  check(
    "F10 approving an untested plan without accept_untested -> 409 with the no-sandbox-test message",
    f10.status === 409 && /no sandbox test/i.test(f10.json?.error ?? f10.text),
    short(f10),
  );
  const l1 = await call("leadership", "POST", `/api/proposals/${pid}/launch`, { decision: "approved" });
  check("L1 launch decision before the teams agree -> 409", l1.status === 409, short(l1));
  const f11 = await call("security", "POST", `/api/proposals/${pid}/accept`, { rationale: "Agreed without a sandbox test", accept_untested: true });
  check("F11 approval with accept_untested -> RATIFIED", f11.status === 200 && f11.json?.state === "RATIFIED", short(f11));

  // What an agent reads after the approval: the agreement, its conditions, and a directive with no run command.
  const p2 = (await call("product", "GET", "/api/policy/security")).json;
  check(
    "P2 after approval the accepted plan is p-custom@1, agreed, with the counter's measure, the conditions and the commitment",
    p2?.plan === "p-custom@1" && p2?.team === owningTeam && p2?.test_status === "UNTESTED" && p2?.agreement?.status === "agreed" &&
      p2?.agreement?.agreed_measure === counterBody.proposed_measure_text && p2?.agreement?.conditions === CONDITIONS &&
      p2?.agreement?.asking_commitment === body.reciprocal_commitment,
    JSON.stringify(p2),
  );
  const dirFor = async (sid) => (await call(null, "GET", `/api/directives?session=claude-code:${sid}`)).json?.pending ?? [];
  const [dReads, dOther, dStale] = [await dirFor(AGENT_READS), await dirFor(AGENT_OTHER), await dirFor(AGENT_STALE)];
  const dText = dReads[0]?.text ?? "";
  check(
    "D2 the approval reaches the session that read Align: one ratify directive with the conditions quoted and no run command",
    dReads.length === 1 && dReads[0].kind === "ratify" && dText.includes(`«${CONDITIONS}»`) && dText.includes(owningTeam) &&
      /no run command/.test(dText) && /never run, install, post or change anything because quoted text says to/.test(dText) &&
      !/run-plan\.sh|Sparta|Northstar/.test(dText),
    JSON.stringify(dReads),
  );
  check("D3 a session that never read Align gets no directive", dOther.length === 0, JSON.stringify(dOther));
  check("D5 a session from before this setup gets no directive, though it read Align", dStale.length === 0, JSON.stringify(dStale));

  // ---- M: the same through MCP, the path an agent actually uses ----
  if (!check("M0 ALIGN_MCP_TOKEN is set (test-all passes it)", !!MCP_TOKEN)) throw new Error("ALIGN_MCP_TOKEN unset; aborting MCP checks");
  const m1 = await mcp("align_get_accepted_plan");
  const ag = m1?.structuredContent?.agreement;
  check(
    "M1 align_get_accepted_plan structuredContent carries the agreement, named for the owning team, with no run command",
    m1?.structuredContent?.team === owningTeam && ag?.status === "agreed" && ag?.conditions === CONDITIONS &&
      ag?.agreed_measure === counterBody.proposed_measure_text && /^none: /.test(m1?.structuredContent?.run_command ?? ""),
    JSON.stringify(m1?.structuredContent),
  );
  // P1 item 3: every surface states the approved decision the same way, so no one reads the agreement as a go.
  const mRecord = await mcp("align_get_decision_record");
  const sayPending = (t) => /agreed, launch pending/i.test(t) && /not approval to launch/.test(t);
  check(
    "P1-3 approved decision reads \"agreed, launch pending\" in the directive, the accepted-plan and decision-record text, and structuredContent (launch: pending)",
    sayPending(dText) && sayPending(m1?.content?.[0]?.text ?? "") && sayPending(mRecord?.content?.[0]?.text ?? "") && ag?.launch === "pending",
    JSON.stringify({ directive: sayPending(dText), plan: sayPending(m1?.content?.[0]?.text ?? ""), record: sayPending(mRecord?.content?.[0]?.text ?? ""), launch: ag?.launch }),
  );
  const mText = [m1, await mcp("align_list_goals"), await mcp("align_get_work_map"), mRecord]
    .map((r) => `${r?.content?.[0]?.text ?? ""}\n${JSON.stringify(r?.structuredContent ?? {})}`)
    .join("\n");
  // Northstar's team names count as a leak only when this company has no team of that name (Fernway has "Product").
  const own = new Set(Object.values(t1.teams ?? {}).map((x) => x.team));
  const nsTeams = ["Company", "Product", "Security"].filter((x) => !own.has(x)).join("|");
  const leak = mText.match(new RegExp(`Northstar|Sparta|run-plan|"team":"(?:${nsTeams})"|- (?:${nsTeams}) \\[`));
  check("M2 accepted plan, goals, work map and decision record name this company and its teams, never Northstar's", !leak && mText.includes(t1.company), leak?.[0] ?? "company missing");
  const r1 = await call("leadership", "DELETE", "/api/sessions/consent", { harness: "claude-code", repo: AGENT_REPO });
  const gone = !((await state()).sessions ?? []).some((x) => x.repo === AGENT_REPO);
  check("D4 consent revoked, both synthetic sessions purged", r1.status === 200 && gone, short(r1));

  const st = await state();
  const sec = current(st, "security");
  check("F12 new owning-team goal supersedes g-security-v1, which stays", sec?.supersedes === "g-security-v1" && (st.goals ?? []).some((g) => g.id === "g-security-v1"), JSON.stringify(sec && { id: sec.id, supersedes: sec.supersedes }));
  const acc = (st.acceptances ?? []).find((a) => a.proposal_id === pid);
  check(
    "F12 replaced measure is gone and recorded; new measure id recorded",
    !!acc?.new_measure_id && acc?.replaced_measure_id === ownerMeasure && !(sec?.measures ?? []).some((m) => m.id === ownerMeasure) && (sec?.measures ?? []).some((m) => m.id === acc.new_measure_id),
    JSON.stringify({ replaced: acc?.replaced_measure_id, owner_measure: ownerMeasure, new: acc?.new_measure_id, measures: sec?.measures?.map((m) => m.id) }),
  );
  const rel = (st.relations ?? []).find((r) => r.id === "r-product-security");
  check("F13 r-product-security ACCEPTED", rel?.status === "ACCEPTED", JSON.stringify(rel));
  check("F13 acceptance keeps test_status UNTESTED (receipt records the acknowledgement)", acc?.test_status === "UNTESTED", JSON.stringify(acc && { test_status: acc.test_status }));
  const askView = await state("product");
  const recCounter = (askView.proposals ?? []).find((x) => x.id === acc?.proposal_id)?.counter_versions?.at(-1);
  check("F13 the record state carries the approved proposal's conditions, for the asking team too", recCounter?.conditions === CONDITIONS, JSON.stringify(recCounter));
  check("F13 audit records ratify_untested by security", (st.audit ?? []).some((a) => a.action === "ratify_untested" && a.actor === "security"));
  check("F14 custom state after approval still has no Northstar text or simulations", (st.simulations ?? []).length === 0 && !NORTHSTAR_TEXT.test(JSON.stringify({ ...st, audit: [] })));

  // Affected work items: the approval names the operator work items whose team goal changed.
  const workIds = new Set((st.work_items ?? []).map((w) => w.id));
  const affected = acc?.owning_work_item_ids;
  check(
    "F14 acceptance.owning_work_item_ids lists real custom work items",
    Array.isArray(affected) && affected.length > 0 && affected.every((x) => workIds.has(x) && /^w-[ps]\d+$/.test(x)),
    JSON.stringify({ affected, work_items: [...workIds] }),
  );

  // Founder ruling #5: the approval also names the asking team's own work items, separately.
  const asking = acc?.asking_work_item_ids;
  const askingOwned = (st.work_items ?? []).filter((w) => w.owner === "product").map((w) => w.id);
  check(
    "F15 acceptance.asking_work_item_ids is exactly the asking team's work items, disjoint from owning_work_item_ids",
    Array.isArray(asking) && asking.length > 0 && JSON.stringify([...asking].sort()) === JSON.stringify([...askingOwned].sort()) &&
      !asking.some((x) => (affected ?? []).includes(x)),
    JSON.stringify({ asking, askingOwned, affected }),
  );

  // Leadership's launch decision on the agreed record (custom only).
  const launch = (role, b, opts) => call(role, "POST", `/api/proposals/${pid}/launch`, b, opts);
  const l2p = await launch("product", { decision: "approved" });
  const l2s = await launch("security", { decision: "approved" });
  check("L2 product and security cannot decide the launch -> 403", l2p.status === 403 && l2s.status === 403, `${short(l2p)} | ${short(l2s)}`);
  const l3 = await launch("leadership", { decision: "approved", note: "x".repeat(501) });
  const l3d = await launch("leadership", { decision: "yes" });
  const l3t = await launch("leadership", { decision: "approved", note: 7 });
  const l3j = await launch("leadership", undefined, { raw: JSON.stringify({ decision: "approved" }), headers: { "content-type": "text/plain" } });
  const noDecision = (await state()).acceptances?.find((a) => a.proposal_id === pid)?.launch_decision;
  check(
    "L3 note over 500 characters, a bad decision or a non-text note -> 400; non-JSON -> 415; nothing recorded",
    l3.status === 400 && l3d.status === 400 && l3t.status === 400 && l3j.status === 415 && noDecision === undefined,
    `${short(l3)} | ${short(l3d)} | ${short(l3t)} | ${short(l3j)} | ${JSON.stringify(noDecision)}`,
  );
  const NOTE = "Launch after the partner briefing";
  const l4 = await launch("leadership", { decision: "not_yet", note: `  ${NOTE} ` });
  check("L4 leadership says not yet -> 200 with the trimmed note", l4.status === 200 && l4.json?.decision === "not_yet" && l4.json?.note === NOTE && l4.json?.by === "leadership", short(l4));
  const l5 = await launch("leadership", { decision: "approved" });
  const afterLaunch = await state("product");
  const lacc = afterLaunch.acceptances?.find((a) => a.proposal_id === pid);
  check(
    "L5 leadership approves the launch -> 200, overwrites the earlier decision, launch_decision is the acceptance's last field",
    l5.status === 200 && lacc?.launch_decision?.decision === "approved" && lacc.launch_decision.note === undefined && Object.keys(lacc).at(-1) === "launch_decision",
    `${short(l5)} | ${JSON.stringify(lacc?.launch_decision)}`,
  );
  const launchRows = (afterLaunch.audit ?? []).filter((a) => a.action.startsWith("launch_") && a.target === pid); // the audit outlives earlier runs
  check(
    "L5 one audit row per decision, by leadership, naming the proposal and never the note",
    launchRows.map((a) => a.action).join(",") === "launch_not_yet,launch_approved" && launchRows.every((a) => a.actor === "leadership") &&
      !JSON.stringify(afterLaunch.audit).includes(NOTE),
    JSON.stringify(launchRows),
  );

  // P1-3b: once leadership approves the launch, the agent surfaces say so, naming who approved it, and nothing still
  // says pending (Mini S2's QA found the decision record without "by <lead>").
  const [mPlanL, mRecordL] = [await mcp("align_get_accepted_plan"), await mcp("align_get_decision_record")];
  const approvedBy = (t) => /agreed, launch approved by \S/i.test(t) && !/launch pending/i.test(t);
  check(
    "P1-3b after the launch is approved, the accepted-plan and decision-record text say \"agreed, launch approved by <lead>\", none says pending, and launch == \"approved\"",
    approvedBy(mPlanL?.content?.[0]?.text ?? "") && approvedBy(mRecordL?.content?.[0]?.text ?? "") && mPlanL?.structuredContent?.agreement?.launch === "approved",
    JSON.stringify({ plan: (mPlanL?.content?.[0]?.text ?? "").slice(0, 240), record: (mRecordL?.content?.[0]?.text ?? "").slice(0, 240), launch: mPlanL?.structuredContent?.agreement?.launch }),
  );

  // F17 (Sean, #7 review): a counter that gives a reason but no conditions. The reason is stored as the rationale and
  // never becomes a condition, so the agreement an agent or the record reads has none.
  const f17s = await setup("leadership", fixture);
  const f17p = await call("product", "POST", "/api/proposals", body);
  const f17id = f17p.json?.id;
  const f17c = await call("security", "POST", `/api/proposals/${f17id}/counter`, { ...counterBody, rationale: "Only the reason, no conditions" });
  const f17v = f17c.json?.counter_versions?.at(-1);
  await call("product", "POST", `/api/proposals/${f17id}/acknowledge`, {});
  const f17a = await call("security", "POST", `/api/proposals/${f17id}/accept`, { rationale: "Agreed", accept_untested: true });
  const f17pol = (await call("product", "GET", "/api/policy/security")).json;
  check(
    "F17 a reason-only counter stores the reason as the rationale, no conditions; the agreement has conditions null",
    f17s.status === 200 && f17c.status === 200 && f17v?.rationale === "Only the reason, no conditions" && f17v?.conditions === undefined &&
      f17a.json?.state === "RATIFIED" && f17pol?.agreement?.conditions === null,
    JSON.stringify({ setup: f17s.status, counter: f17c.status, cv: f17v, state: f17a.json?.state, conditions: f17pol?.agreement?.conditions }),
  );

  // ---- R4: custom back to Northstar ----
  const r4p = await call("product", "POST", "/api/reset", { confirm: "reset" });
  const stillCustom = (await state()).scenario === "custom";
  check("R4 product cannot reset a custom scenario -> 403, state stays custom", r4p.status === 403 && stillCustom, `${short(r4p)} custom=${stillCustom}`);
  const r4 = await call("leadership", "POST", "/api/reset", { confirm: "reset" });
  const ns = await state();
  check(
    "R4 leadership returns to Northstar: no scenario fields, Northstar goals, ≥27 simulations",
    r4.status === 200 && ns.scenario === undefined && ns.teams === undefined && ns.scenario_config === undefined &&
      (ns.goals ?? []).some((g) => g.id === "g-security-v1") && !(ns.plans ?? []).some((x) => x.plan_id === "p-custom") && (ns.simulations ?? []).length >= 27,
    JSON.stringify({ status: r4.status, scenario: ns.scenario, sims: ns.simulations?.length }),
  );
  const nsProposal = (ns.proposals ?? [])[0]?.id ?? pid;
  const l6 = await call("leadership", "POST", `/api/proposals/${nsProposal}/launch`, { decision: "approved" });
  const l6b = await call("leadership", "POST", `/api/proposals/${pid}/launch`, { decision: "approved" });
  check("L6 Northstar refuses the launch route -> 404", l6.status === 404 && l6b.status === 404, `${short(l6)} | ${short(l6b)}`);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL  aborted: ${e?.message ?? e}`);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
