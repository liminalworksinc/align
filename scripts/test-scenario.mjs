#!/usr/bin/env node
// Custom-scenario acceptance test (Build A minimum slice): setup authority S1–S8, state after setup T1,
// the propose → change → owner-approval flow F2–F14 plus the affected work items check, and R4 back to Northstar.
// Case ids follow Sean's Build A plan §7/§8. Contracts: plan §3 (setup API, approval, custom state seed).
//
// Usage: node scripts/test-scenario.mjs http://127.0.0.1:3205 [fixture.json]
// The fixture defaults to data/scenarios/example-custom.json (owned by L2).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, signIn } from "./lib/harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = baseUrl();
const FIXTURE = path.resolve(process.argv[3] || path.join(ROOT, "data/scenarios/example-custom.json"));
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
const NORTHSTAR_TEXT = /Northstar|Sparta|Alike|p-beta|p-throughput|KR2 makes beta/;

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

async function main() {
  console.log(`Align custom-scenario test against ${BASE} (fixture ${path.relative(ROOT, FIXTURE)})\n`);
  for (const role of ["product", "security", "leadership"]) cookies[role] = await signIn(BASE, role);

  // Start from Northstar so the run is repeatable.
  const r0 = await call("leadership", "POST", "/api/reset", { confirm: "reset", scenario: "northstar" });
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
  check("S4 foreign Origin -> 403 (CSRF)", s4.status === 403, short(s4));
  const without = (key) => Object.fromEntries(Object.entries(fixture).filter(([k]) => k !== key));
  const s5 = await setup("leadership", without("confirm"));
  const s5b = await setup("leadership", without("company_measure"));
  check(
    'S5 missing confirm:"replace" or company_measure -> 400 with a plain sentence and issues',
    s5.status === 400 && s5b.status === 400 && typeof s5.json?.error === "string" && Array.isArray(s5.json?.issues),
    `${short(s5)} | ${short(s5b)}`,
  );
  const s6 = await setup("leadership", { ...fixture, extra_field: 1 });
  const s6p = await setup("leadership", undefined, { raw: JSON.stringify(fixture).replace(/^\{/, '{"__proto__":{"admin":true},') });
  check("S6 unknown key and own __proto__ key -> 400 (strict schema)", s6.status === 400 && s6p.status === 400, `${short(s6)} | ${short(s6p)}`);
  const s7 = await setup("leadership", { ...fixture, plan_id: "p-beta" });
  check("S7 client-supplied ids are refused -> 400 (server makes ids)", s7.status === 400, short(s7));
  const big = JSON.stringify({ ...fixture, pad: "x".repeat(70 * 1024) });
  const s8 = await setup("leadership", undefined, { raw: big, headers: { "content-type": "application/json" } });
  check("S8 body over 64 KB -> 413", s8.status === 413, short(s8));
  const before = await state();
  check("S1–S8 left Northstar untouched", before.scenario === undefined && (before.simulations ?? []).length >= 27, `scenario=${before.scenario} sims=${before.simulations?.length}`);

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
  check("T1 setup audit event holds a hash, not the input", (t1.audit ?? []).some((a) => a.action === "scenario_setup") && !JSON.stringify(t1.audit ?? []).includes(fixture.plan_text ?? "\u0000"));

  // ---- F: propose → change → owner approval (plan §3 approval, §7 acceptance) ----
  const plan = (t1.plans ?? []).find((x) => x.plan_id === "p-custom" && x.plan_version === 1);
  const ownerMeasure = t1.scenario_config?.owner_measure_id;
  const body = {
    plan_id: "p-custom",
    plan_version: 1,
    simulation_refs: [],
    proposed_measure_text: fixture.proposed_measure_text ?? "Customer requirement met within the agreed window",
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
  const f6 = await call("security", "POST", `/api/proposals/${pid}/counter`, {
    proposed_measure_text: `${body.proposed_measure_text}, reviewed weekly`,
    rationale: "Needs a review cadence",
    changes_plan: false,
    plan_params: plan?.params ?? {},
  });
  check("F6 owning team asks for changes -> COUNTERED, still UNTESTED", f6.status === 200 && f6.json?.state === "COUNTERED" && f6.json?.test_status === "UNTESTED", short(f6));
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
  const f11 = await call("security", "POST", `/api/proposals/${pid}/accept`, { rationale: "Agreed without a sandbox test", accept_untested: true });
  check("F11 approval with accept_untested -> RATIFIED", f11.status === 200 && f11.json?.state === "RATIFIED", short(f11));

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
  check("F13 audit records ratify_untested by security", (st.audit ?? []).some((a) => a.action === "ratify_untested" && a.actor === "security"));
  check("F14 custom state after approval still has no Northstar text or simulations", (st.simulations ?? []).length === 0 && !NORTHSTAR_TEXT.test(JSON.stringify({ ...st, audit: [] })));

  // Affected work items: the approval names the operator work items whose team goal changed.
  const workIds = new Set((st.work_items ?? []).map((w) => w.id));
  const affected = acc?.affected_work_item_ids;
  check(
    "F14 acceptance.affected_work_item_ids lists real custom work items",
    Array.isArray(affected) && affected.length > 0 && affected.every((x) => workIds.has(x) && /^w-[ps]\d+$/.test(x)),
    JSON.stringify({ affected, work_items: [...workIds] }),
  );

  // ---- R4: custom back to Northstar ----
  const r4p = await call("product", "POST", "/api/reset", { confirm: "reset", scenario: "northstar" });
  check("R4 switching scenario needs leadership -> 403 for product", r4p.status === 403, short(r4p));
  const r4 = await call("leadership", "POST", "/api/reset", { confirm: "reset", scenario: "northstar" });
  const ns = await state();
  check(
    "R4 leadership returns to Northstar: no scenario fields, Northstar goals, ≥27 simulations",
    r4.status === 200 && ns.scenario === undefined && ns.teams === undefined && ns.scenario_config === undefined &&
      (ns.goals ?? []).some((g) => g.id === "g-security-v1") && !(ns.plans ?? []).some((x) => x.plan_id === "p-custom") && (ns.simulations ?? []).length >= 27,
    JSON.stringify({ status: r4.status, scenario: ns.scenario, sims: ns.simulations?.length }),
  );
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL  aborted: ${e?.message ?? e}`);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
