#!/usr/bin/env node
// Align acceptance test: drives the full Product <-> Security agreement flow over HTTP
// against a running server, with two independent cookie jars (one per role).
// Usage: node scripts/test-flow.mjs [baseUrl]   (default http://localhost:3100)

const BASE = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const PASSCODES = {
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
};

// ---------- tiny cookie jar ----------
class Jar {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }
  store(res) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of list) {
      const [pair, ...attrs] = line.split(";").map((x) => x.trim());
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1);
      const expired = attrs.some((a) => /^max-age=\s*(0|-\d+)$/i.test(a));
      if (expired || v === "") this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const product = new Jar("product");
const security = new Jar("security");

async function call(jar, method, path, body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (jar && jar.cookies.size) headers.cookie = jar.header();
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  if (jar) jar.store(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

// ---------- assertion harness ----------
let passed = 0;
let failed = 0;
const failures = [];

function check(label, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ""}`);
  }
  return ok;
}

const short = (r) => `status=${r.status} body=${(r.text || "").slice(0, 300)}`;

function testStatusFor(sims, plan, simRefs) {
  const runs = sims.filter((r) => simRefs.includes(r.id));
  const pass = runs.find(
    (r) =>
      r.plan_id === plan.plan_id &&
      r.plan_version === plan.plan_version &&
      r.plan_hash === plan.plan_hash &&
      r.verdict === "PASS",
  );
  if (!pass) return "UNTESTED";
  const comparable = runs.some(
    (r) =>
      r.verdict === "FAIL" &&
      r.plan_id !== plan.plan_id &&
      r.mission_id === pass.mission_id &&
      r.seed_version === pass.seed_version &&
      r.checks_version === pass.checks_version,
  );
  return comparable ? "TESTED" : "UNTESTED";
}

function currentGoal(state, owner) {
  const all = state.goals.filter((g) => g.owner_id === owner);
  const superseded = new Set(all.map((g) => g.supersedes).filter(Boolean));
  return all.find((g) => !superseded.has(g.id));
}

async function main() {
  console.log(`Align acceptance test against ${BASE}\n`);

  // ---- setup: sign in both roles, reset ----
  const sp = await call(product, "POST", "/api/session", { role: "product", passcode: PASSCODES.product });
  const ss = await call(security, "POST", "/api/session", { role: "security", passcode: PASSCODES.security });
  check("setup: product signs in (200, cookie set)", sp.status === 200 && product.cookies.size > 0, short(sp));
  check("setup: security signs in (200, cookie set)", ss.status === 200 && security.cookies.size > 0, short(ss));
  if (sp.status !== 200 || ss.status !== 200) throw new Error("Cannot sign in; aborting");
  const reset = await call(product, "POST", "/api/reset", { confirm: "reset" });
  check("setup: POST /api/reset starts clean", reset.status === 200 && reset.json?.ok === true, short(reset));

  // ---- G6 auth ----
  const bad = await call(new Jar("anon"), "POST", "/api/session", { role: "product", passcode: "definitely-wrong" });
  check("G6 wrong passcode -> 401", bad.status === 401, short(bad));

  const anon = await call(null, "POST", "/api/proposals", {
    plan_id: "p-beta",
    plan_version: 1,
    proposed_measure_text: "x",
    reciprocal_commitment: "y",
  });
  check("G6 unauthenticated mutation (POST /api/proposals, no cookie) -> 401", anon.status === 401, short(anon));

  // ---- G2 private constraints filtered ----
  const pState0 = await call(product, "GET", "/api/state");
  const sState0 = await call(security, "GET", "/api/state");
  const pc = pState0.json?.private_constraints ?? null;
  const sc = sState0.json?.private_constraints ?? null;
  check(
    "G2 product's private_constraints are all owner=product",
    Array.isArray(pc) && pc.length > 0 && pc.every((c) => c.owner === "product"),
    JSON.stringify(pc),
  );
  check(
    "G2 security's private_constraints are all owner=security",
    Array.isArray(sc) && sc.length > 0 && sc.every((c) => c.owner === "security"),
    JSON.stringify(sc),
  );

  // ---- G8 timer start ----
  const t0 = await call(product, "POST", "/api/timer", { action: "ceo_change_viewed" });
  check("G8 timer starts on ceo_change_viewed (started_at set)", t0.status === 200 && !!t0.json?.started_at, short(t0));
  const tBad = await call(product, "POST", "/api/timer", { action: "not_a_real_action" });
  check("G8 unknown timer action -> 400", tBad.status === 400, short(tBad));

  // ---- proposal creation ----
  const simsRes = await call(product, "GET", "/api/simulations");
  const sims = simsRes.json?.simulations ?? [];
  const simRefs = sims
    .filter((r) => (r.plan_id === "p-throughput" || r.plan_id === "p-beta") && r.scenario === "normal")
    .map((r) => r.id);
  const betaPlan = (pState0.json?.plans ?? []).find((p) => p.plan_id === "p-beta" && p.plan_version === 1);
  const expectedStatus = betaPlan
    ? testStatusFor(sims, { plan_id: betaPlan.plan_id, plan_version: betaPlan.plan_version, plan_hash: betaPlan.hash }, simRefs)
    : "UNTESTED";

  const proposalBody = {
    plan_id: "p-beta",
    plan_version: 1,
    simulation_refs: simRefs,
    proposed_measure_text: "Beta incidents triaged per launch-readiness policy within 24h",
    rationale: "CEO KR2 makes beta readiness the priority",
    reciprocal_commitment: "Product tags beta issues obs-beta at intake and publishes beta scope",
  };

  const secProp = await call(security, "POST", "/api/proposals", proposalBody);
  check("G6 Security cannot create a proposal -> 403", secProp.status === 403, short(secProp));

  const prop = await call(product, "POST", "/api/proposals", proposalBody);
  const p = prop.json ?? {};
  check("Product creates proposal -> 200, state PENDING_SECURITY", prop.status === 200 && p.state === "PENDING_SECURITY", short(prop));
  check(
    `Proposal test_status matches evidence (${simRefs.length} sim refs, expected ${expectedStatus})`,
    p.test_status === expectedStatus,
    `got ${p.test_status}`,
  );
  const pid = p.id;
  if (!pid) throw new Error("No proposal id; aborting flow");
  const initialTestStatus = p.test_status;

  const dup = await call(product, "POST", "/api/proposals", proposalBody);
  check("Second open proposal -> 409", dup.status === 409, short(dup));

  // ---- G6 Product cannot act as Security ----
  const pAccept = await call(product, "POST", `/api/proposals/${pid}/accept`, { rationale: "x" });
  check("G6 Product cannot accept -> 403", pAccept.status === 403, short(pAccept));
  const pCounter = await call(product, "POST", `/api/proposals/${pid}/counter`, { proposed_measure_text: "x" });
  check("G6 Product cannot counter -> 403", pCounter.status === 403, short(pCounter));
  const pReject = await call(product, "POST", `/api/proposals/${pid}/reject`, {});
  check("G6 Product cannot reject -> 403", pReject.status === 403, short(pReject));

  // ---- counter #1 (no plan change) ----
  const c1 = await call(security, "POST", `/api/proposals/${pid}/counter`, {
    proposed_measure_text: "Beta incidents triaged within 24h; P0 within 4h",
    rationale: "Tighten P0 window",
    changes_plan: false,
  });
  check("Security counter (changes_plan=false) -> COUNTERED", c1.status === 200 && c1.json?.state === "COUNTERED", short(c1));
  check("Counter without plan change keeps test_status unchanged", c1.json?.test_status === initialTestStatus, `got ${c1.json?.test_status}, expected ${initialTestStatus}`);

  const sAck = await call(security, "POST", `/api/proposals/${pid}/acknowledge`, {});
  check("G6 Security cannot acknowledge -> 403", sAck.status === 403, short(sAck));
  const earlyRatify = await call(security, "POST", `/api/proposals/${pid}/accept`, { rationale: "too early" });
  check("Security cannot ratify while COUNTERED -> 409", earlyRatify.status === 409, short(earlyRatify));

  const ack1 = await call(product, "POST", `/api/proposals/${pid}/acknowledge`, {});
  check("Product acknowledges -> ACKNOWLEDGED_BY_PRODUCT", ack1.status === 200 && ack1.json?.state === "ACKNOWLEDGED_BY_PRODUCT", short(ack1));

  // ---- counter #2 (plan change -> STALE) ----
  const c2 = await call(security, "POST", `/api/proposals/${pid}/counter`, {
    proposed_measure_text: "Beta incidents triaged within 24h; P0 within 4h; protected tickets untouched",
    rationale: "Changes the executable plan's protected set",
    changes_plan: true,
  });
  check("G4/G7 Security counter (changes_plan=true) -> COUNTERED", c2.status === 200 && c2.json?.state === "COUNTERED", short(c2));
  check("G4/G7 plan-changing counter marks test_status STALE", c2.json?.test_status === "STALE", `got ${c2.json?.test_status}`);
  const ack2 = await call(product, "POST", `/api/proposals/${pid}/acknowledge`, {});
  check("Product acknowledges again -> ACKNOWLEDGED_BY_PRODUCT", ack2.status === 200 && ack2.json?.state === "ACKNOWLEDGED_BY_PRODUCT", short(ack2));

  // ---- ratify ----
  const rat = await call(security, "POST", `/api/proposals/${pid}/accept`, { rationale: "Agreed with revised terms" });
  check("Security ratifies -> RATIFIED", rat.status === 200 && rat.json?.state === "RATIFIED", short(rat));

  const sState1 = await call(security, "GET", "/api/state");
  const st = sState1.json ?? {};
  const curSec = st.goals ? currentGoal(st, "security") : null;
  check(
    "G2/G4 new security goal version v2.2 supersedes g-security-v1",
    curSec?.version === "v2.2" && curSec?.supersedes === "g-security-v1",
    JSON.stringify(curSec && { id: curSec.id, version: curSec.version, supersedes: curSec.supersedes }),
  );
  check("Prior version g-security-v1 still present (not overwritten)", !!st.goals?.some((g) => g.id === "g-security-v1" && g.version === "v1"));
  const rel = st.relations?.find((r) => r.id === "r-product-security");
  check("Relation r-product-security status ACCEPTED", rel?.status === "ACCEPTED", JSON.stringify(rel));
  const acc = st.acceptances?.find((a) => a.proposal_id === pid);
  check("Acceptance test_status === STALE (no false green)", acc?.test_status === "STALE", JSON.stringify(acc && { test_status: acc.test_status, accepted_version: acc.accepted_version }));

  // ---- G6 reload consistency ----
  const pState2 = await call(product, "GET", "/api/state");
  const sState2 = await call(security, "GET", "/api/state");
  check(
    "G6 reload: both sessions see identical acceptances",
    pState2.status === 200 &&
      sState2.status === 200 &&
      JSON.stringify(pState2.json?.acceptances) === JSON.stringify(sState2.json?.acceptances) &&
      (pState2.json?.acceptances?.length ?? 0) > 0,
  );
  const pCur = pState2.json?.goals ? currentGoal(pState2.json, "security") : null;
  const sCur = sState2.json?.goals ? currentGoal(sState2.json, "security") : null;
  check(
    "G6 reload: both sessions see the same current security goal version",
    !!pCur && !!sCur && pCur.id === sCur.id && pCur.version === sCur.version,
    `product=${pCur?.id}@${pCur?.version} security=${sCur?.id}@${sCur?.version}`,
  );

  // ---- G8 timer end ----
  const seenP = await call(product, "POST", "/api/timer", { action: "saw_accepted_version" });
  check("G8 timer not ended after only Product saw accepted version", seenP.status === 200 && seenP.json?.ended_at === null, short(seenP));
  const seenS = await call(security, "POST", "/api/timer", { action: "saw_accepted_version" });
  check("G8 timer ends after both sessions saw accepted version", seenS.status === 200 && !!seenS.json?.ended_at, short(seenS));
  const tps = seenS.json?.touchpoints ?? [];
  const expectActor = { propose: "product", counter: "security", acknowledge: "product", ratify: "security" };
  for (const [action, actor] of Object.entries(expectActor)) {
    const rows = tps.filter((t) => t.action === action);
    check(
      `G8 touchpoints include ${action} by ${actor}`,
      rows.length > 0 && rows.every((t) => t.actor === actor),
      JSON.stringify(rows),
    );
  }

  // ---- audit actors ----
  const finalState = (await call(security, "GET", "/api/state")).json ?? {};
  const auditRows = (finalState.audit ?? []).filter((a) => a.action in expectActor);
  const wrong = auditRows.filter((a) => a.actor !== expectActor[a.action]);
  const seen = new Set(auditRows.map((a) => a.action));
  check(
    "Audit log: propose/acknowledge by product, counter/ratify by security",
    auditRows.length > 0 && wrong.length === 0 && Object.keys(expectActor).every((k) => seen.has(k)),
    `wrong=${JSON.stringify(wrong)} seen=${[...seen]}`,
  );

  // ---- G7 ingestion idempotent ----
  const i1 = await call(product, "GET", "/api/simulations");
  const i2 = await call(product, "GET", "/api/simulations");
  check(
    "G7 evidence ingestion idempotent (second call added 0, same count)",
    i1.status === 200 && i2.status === 200 && i2.json?.added === 0 && i1.json?.simulations?.length === i2.json?.simulations?.length,
    `first added=${i1.json?.added} n=${i1.json?.simulations?.length}; second added=${i2.json?.added} n=${i2.json?.simulations?.length}`,
  );

  // ---- evidence 404 ----
  const ev = await call(product, "GET", "/api/evidence/does-not-exist");
  check("Evidence for unknown id -> 404", ev.status === 404, short(ev));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL  aborted: ${e?.message ?? e}`);
}

// ---- cleanup: leave the demo clean ----
try {
  const r = await call(product.cookies.size ? product : security, "POST", "/api/reset", { confirm: "reset" });
  check("teardown: POST /api/reset leaves demo state clean", r.status === 200 && r.json?.ok === true, short(r));
} catch (e) {
  failed++;
  console.log(`FAIL  teardown reset: ${e?.message ?? e}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
