#!/usr/bin/env node
// Stage manager for the live replan: gets one operator agent armed, checks nothing else will wake,
// and gives a one-command backup for every step that can go wrong on stage.
//
//   node scripts/live.mjs ready      preflight, warm the routes, reset, start the operator, wait for its
//                                    baseline FAIL, confirm its watcher is armed and nothing else will wake
//   node scripts/live.mjs status     who wakes on the next decision, what was delivered/acted on, last verdict
//   node scripts/live.mjs push       backup for Act 1: Leadership pushes company goal v2 through the API
//   node scripts/live.mjs agree      backup for Act 3: finish the Product ⇄ Security agreement through the API,
//                                    from wherever the browser left off (propose → counter → acknowledge → ratify)
//   node scripts/live.mjs rescue     the agent didn't wake: hand it the directive in its pane (say so on stage)
//   node scripts/live.mjs fallback   the live run itself failed: show the committed, verified run instead
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALIGN = process.env.ALIGN_URL || "http://localhost:3100";
const TMUX = process.env.TMUX_SESSION || "align";
const PANE = `${TMUX}:0.0`;
const EVIDENCE = path.join(ROOT, "sparta/walkthrough-lab/evidence");
const WATCH_WINDOW_MIN = 55; // scripts/align-watch.mjs WINDOW_MS; the Stop hook re-arms it after every agent turn
const OPERATOR = /^You're the Security triage operator/;
const PASS = {
  leadership: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo",
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
};
// Same text the browser pre-fills (components/ProposalsView.tsx), so a backup step reads the same on screen.
const MEASURE =
  "Beta customers' issues are handled first: marked urgent, tagged as beta, a private note for engineers, and a reply to the customer. The critical security ticket is not touched";
const RATIONALE =
  "The CEO changed a requirement today: the beta launch comes first. Security's current target only counts how many tickets get closed, oldest first, so beta issues wait in line. The attached practice test runs the current plan and the new plan on the same practice tickets, with the same pass/fail checks.";
const COMMITMENT =
  "Product will tag every beta issue as beta when it comes in and publish exactly what is in the beta by Wednesday. Product will postpone the ticket dashboard polish.";
const COUNTER_SUFFIX = ", and its private notes stay untouched too";
// Committed, verified run from docs/LIVE_REPLAN.md.
const RECORDED = { fail: "p-throughput@1-normal-134756.json", pass: "p-beta@1-normal-134838.json" };

const C = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", amber: "\x1b[33m", red: "\x1b[31m", reset: "\x1b[0m" };
const ok = (m) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const warn = (m) => console.log(`  ${C.amber}!${C.reset} ${m}`);
const bad = (m) => console.log(`  ${C.red}✗${C.reset} ${m}`);
const hdr = (m) => console.log(`\n${C.bold}${m}${C.reset}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const short = (id) => id.replace(/^claude-code:/, "").slice(0, 8);

// ---------- HTTP ----------
class Jar {
  cookies = new Map();
  store(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
  }
  get header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
async function call(method, p, body, jar, timeout = 15000) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (jar?.cookies.size) headers.cookie = jar.header;
  const res = await fetch(ALIGN + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  jar?.store(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
async function signIn(role) {
  const jar = new Jar();
  const r = await call("POST", "/api/session", { role, passcode: PASS[role] }, jar);
  if (r.status !== 200) throw new Error(`${role} sign-in failed (${r.status})`);
  return jar;
}
let leadershipJar; // GET /api/sessions and /api/mappings need a signed-in session (B1-3)
const leadJar = async () => (leadershipJar ??= await signIn("leadership"));
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
const tmux = (...a) => sh("tmux", a);
const pane = () => tmux("capture-pane", "-t", PANE, "-p").stdout || "";

// ---------- who will wake ----------
// Mirrors sessionTeams() in lib/directives.ts: a Security ratification reaches sessions whose prompts or tools
// look like Security work (or that are mapped to a Security goal).
function wakesOnSecurity(sess, mappings) {
  if (mappings.find((x) => x.session_id === sess.id)?.choice?.startsWith("g-security")) return true;
  const text = [...sess.prompts.map((p) => p.text), ...sess.tools].join(" ");
  return /triage|p-throughput|p-beta|run-plan|security|align_get_accepted_plan/i.test(text);
}
async function sessions() {
  const r = await call("GET", "/api/sessions", undefined, await leadJar());
  const { sessions = [], mappings = [], listening = {} } = r.json ?? {};
  const live = sessions.filter((s) => listening[s.id]);
  const operators = live.filter((s) => OPERATOR.test(s.prompts[0]?.text ?? "")).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const others = live.filter((s) => !operators.includes(s) && wakesOnSecurity(s, mappings));
  return { all: sessions, live, operator: operators[0], extraOperators: operators.slice(1), others };
}
function reportWakers({ operator, extraOperators, others }) {
  if (operator) ok(`Operator ${short(operator.id)} is armed: Align will wake it on the next decision`);
  else bad("No operator agent is armed. Run: node scripts/live.mjs ready");
  for (const s of extraOperators) bad(`Another operator ${short(s.id)} is also armed and would run Sparta too: /exit it (started ${clock(s.started_at)})`);
  for (const s of others) warn(`Session ${short(s.id)} would also wake ("${(s.prompts[0]?.text ?? "").slice(0, 50)}…"): /exit it before going on`);
  return !!operator && extraOperators.length === 0 && others.length === 0;
}

// ---------- evidence ----------
function latestEvidence() {
  const files = readdirSync(EVIDENCE).filter((f) => f.endsWith(".json"));
  files.sort((a, b) => statSync(path.join(EVIDENCE, b)).mtimeMs - statSync(path.join(EVIDENCE, a)).mtimeMs);
  return files[0] ? path.join(EVIDENCE, files[0]) : null;
}
const verdict = (file) => (sh("node", ["scripts/verify-run.mjs", file]).stdout || "").split("\n")[0];

// ================= commands =================
async function ready() {
  const started = new Date().toISOString();
  hdr("1 · Preflight");
  const check = sh("scripts/run-of-show.sh", ["check"]);
  process.stdout.write(check.stdout.split("\n").slice(2).join("\n"));
  if (/Fix the items marked/.test(check.stdout)) return bad("Preflight failed: fix the ✗ items, then run ready again");

  hdr("2 · Warming every route the demo touches (first hits compile in dev)");
  const t0 = Date.now();
  const gets = ["/", "/api/state", "/api/policy/security", "/api/sessions", "/api/simulations", "/api/mappings", "/api/directives?session=warmup", "/api/mcp"];
  const posts = ["/api/org/push", "/api/proposals", "/api/proposals/warmup/counter", "/api/proposals/warmup/acknowledge", "/api/proposals/warmup/accept", "/api/directives/ack", "/api/timer"];
  // Unauthenticated POSTs are refused (401/400) but still compile the route, without changing state.
  const warmJar = await leadJar();
  await Promise.all([...gets.map((p) => call("GET", p, undefined, warmJar, 90000)), ...posts.map((p) => call("POST", p, {}, undefined, 90000))].map((x) => x.catch(() => null)));
  ok(`${gets.length + posts.length} routes warm (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  hdr("3 · Reset");
  process.stdout.write(sh("scripts/run-of-show.sh", ["reset"]).stdout.split("\n").slice(2).join("\n"));

  hdr("4 · Operator agent");
  process.stdout.write(sh("scripts/run-of-show.sh", ["tmux"]).stdout.split("\n").slice(2).join("\n"));
  // Killing the old tmux agent can orphan its watcher, which would keep listening for a session that's gone.
  const orphans = (sh("ps", ["-Ao", "pid=,ppid=,command="]).stdout || "").split("\n").filter((l) => / 1 .*align-watch\.mjs/.test(l));
  for (const l of orphans) process.kill(Number(l.trim().split(/\s+/)[0]));
  if (orphans.length) ok(`Stopped ${orphans.length} orphaned watcher(s) from earlier agents`);
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await sleep(1500);
    const t = pane();
    if (/Do you trust/.test(t)) tmux("send-keys", "-t", PANE, "Enter");
    up = /for shortcuts|❯/.test(t);
  }
  if (!up) return bad(`Claude Code didn't come up in tmux. Look: tmux attach -t ${TMUX}`);
  ok("Claude Code is up");
  sh("scripts/run-of-show.sh", ["operator"], { stdio: "inherit", timeout: 300000 });

  hdr("5 · Armed?");
  let w;
  for (let i = 0; i < 30; i++) {
    w = await sessions();
    if (w.operator && w.operator.started_at >= started) break;
    await sleep(2000);
  }
  if (!w.operator || w.operator.started_at < started) return bad(`The new operator's watcher never connected. Look: tmux attach -t ${TMUX}`);
  const clean = reportWakers(w);
  ok(`Armed at ${clock(Date.now())}. The watcher lasts ~${WATCH_WINDOW_MIN} min: if you go on after ${clock(Date.now() + (WATCH_WINDOW_MIN - 5) * 60000)}, run ready again`);
  console.log(clean ? `\n${C.green}Ready.${C.reset} tmux attach -t ${TMUX}` : `\n${C.amber}Close the sessions flagged above, then: node scripts/live.mjs status${C.reset}`);
  cue();
}

async function status() {
  hdr("Align");
  const pol = (await call("GET", "/api/policy/security")).json;
  ok(`Security ${pol.goal_version} authorizes ${pol.plan}${pol.test_status ? ` (${pol.test_status})` : ""} · ${pol.authority}`);
  hdr("Agents");
  const w = await sessions();
  reportWakers(w);
  for (const d of w.operator?.directives ?? [])
    console.log(`    ${d.event_id}: delivered ${clock(d.delivered_at)}${d.acted_at ? `, acted on ${clock(d.acted_at)}` : `, ${C.amber}not acted on yet${C.reset}`}`);
  hdr("Last Sparta run");
  const f = latestEvidence();
  console.log(f ? `  ${path.basename(f)}  ${C.dim}(${clock(statSync(f).mtimeMs)})${C.reset}\n  ${verdict(f)}` : "  none");
}

async function push() {
  hdr("Leadership pushes company goal v2 (backup for Act 1)");
  const r = await call("POST", "/api/org/push", {}, await signIn("leadership"));
  if (r.status === 200) ok(`Pushed at ${clock(r.json.pushed_at ?? Date.now())}. The operator should wake within a second: watch the top pane`);
  else if (r.status === 409) ok("Already pushed (nothing new drafted). If the agent didn't wake: node scripts/live.mjs rescue");
  else bad(`Push refused (${r.status}): ${r.json?.error ?? "no detail"}`);
}

async function agree() {
  hdr("Product ⇄ Security agreement (backup for Act 3)");
  const product = await signIn("product");
  const security = await signIn("security");
  let st = (await call("GET", "/api/state", undefined, product)).json;
  if (!(st.pushes ?? []).length) {
    warn("Company goal v2 isn't pushed yet; pushing it first");
    await push();
    st = (await call("GET", "/api/state", undefined, product)).json;
  }
  let p = [...st.proposals].reverse().find((x) => !["RATIFIED", "REJECTED"].includes(x.state));
  if (!p) {
    // Same runs the browser attaches (components/select.ts comparablePair): latest baseline, candidate, outage test.
    const latest = (pred) => [...st.simulations].reverse().find(pred);
    const cand = latest((r) => r.plan_id === "p-beta" && r.scenario === "normal");
    const base = latest((r) => r.plan_id === "p-throughput" && r.scenario === "normal" && (!cand || (r.mission_id === cand.mission_id && r.seed_version === cand.seed_version && r.checks_version === cand.checks_version)));
    const intr = latest((r) => r.plan_id === "p-beta" && r.scenario === "interruption");
    const r = await call("POST", "/api/proposals", {
      proposed_measure_text: MEASURE, rationale: RATIONALE, reciprocal_commitment: COMMITMENT,
      plan_id: "p-beta", plan_version: 1, simulation_refs: [base?.id, cand?.id, intr?.id].filter(Boolean),
    }, product);
    if (r.status !== 200) return bad(`Proposal refused (${r.status}): ${r.json?.error ?? ""}`);
    p = r.json;
    ok(`Product proposed, pinned to p-beta@1 (${p.test_status})`);
  } else ok(`Picking up proposal ${p.id} at ${p.state}`);
  for (let guard = 0; guard < 4 && p.state !== "RATIFIED"; guard++) {
    let r;
    if (p.state === "PENDING_SECURITY") {
      const text = (p.counter_versions.at(-1)?.proposed_measure_text ?? p.proposed_measure_text) + COUNTER_SUFFIX;
      r = await call("POST", `/api/proposals/${p.id}/counter`, { proposed_measure_text: text, rationale: "Keep the critical security ticket off-limits.", changes_plan: false }, security);
      if (r.status === 200) ok("Security asked for changes (wording only: the test still counts)");
    } else if (p.state === "COUNTERED") {
      r = await call("POST", `/api/proposals/${p.id}/acknowledge`, {}, product);
      if (r.status === 200) ok("Product accepted Security's changes");
    } else if (p.state === "ACKNOWLEDGED_BY_PRODUCT") {
      r = await call("POST", `/api/proposals/${p.id}/accept`, { rationale: "Agreed with the revised terms." }, security);
      if (r.status === 200) ok(`Security ratified its goal revision at ${clock(Date.now())}. The operator should wake and rerun: watch the top pane`);
    } else return bad(`Proposal is ${p.state}; finish it in the browser`);
    if (r.status !== 200) return bad(`Step refused (${r.status}): ${r.json?.error ?? ""}`);
    p = r.json;
  }
}

async function rescue() {
  hdr("Rescue: hand the directive to the operator directly");
  const { operator, all } = await sessions();
  const op = operator ?? all.filter((s) => OPERATOR.test(s.prompts[0]?.text ?? "")).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!op) return bad("No operator session on record. Run: node scripts/live.mjs ready");
  const pending = (await call("GET", `/api/directives?session=${encodeURIComponent(op.id)}`)).json?.pending ?? [];
  const lastDelivered = (op.directives ?? []).at(-1);
  let text;
  if (pending.length) {
    const d = pending.at(-1);
    text = d.text.split("\n").join(" ");
    await call("POST", "/api/directives/ack", { session: op.id, event_id: d.event_id });
    warn(`The watcher hadn't delivered ${d.event_id}; typing it into the operator's pane`);
  } else if (lastDelivered && !lastDelivered.acted_at) {
    text = "Align delivered a ratified change to you a moment ago (see above). Follow it now.";
    warn(`${lastDelivered.event_id} was delivered but not acted on; nudging the operator`);
  } else return ok("Nothing to rescue: no undelivered or unacted decision for the operator");
  tmux("send-keys", "-t", PANE, "-l", text);
  await sleep(400);
  tmux("send-keys", "-t", PANE, "Enter");
  console.log(`  ${C.dim}Say it on stage: "the watcher missed it, so I'm handing the agent Align's directive by hand".${C.reset}`);
}

function fallback() {
  hdr("Fallback: the committed, verified run (docs/LIVE_REPLAN.md)");
  console.log(`  before:  ${verdict(path.join(EVIDENCE, RECORDED.fail))}`);
  console.log(`  after:   ${verdict(path.join(EVIDENCE, RECORDED.pass))}`);
  console.log(`  ${C.dim}Say: "the live run didn't finish, so here is the same run from today, recorded with timestamps; rerun it with scripts/run-plan.sh accepted".${C.reset}`);
}

function cue() {
  console.log(`
${C.bold}ON STAGE${C.reset}  ${C.dim}(browser does the deciding; the terminal is only the safety net)${C.reset}
  Act 1  Leadership clicks "Approve and send to teams"   → agent wakes, flags KR3, holds
         ${C.dim}button misbehaves?  node scripts/live.mjs push${C.reset}
  Act 3  Security clicks "Approve the change to my goal"  → agent wakes, runs p-beta@1, Sparta PASS 9/9
         ${C.dim}stuck mid-negotiation?  node scripts/live.mjs agree   (continues from where the browser is)${C.reset}
  ${C.dim}agent silent for 10 s?  node scripts/live.mjs rescue    run failed or provider throttled?  node scripts/live.mjs fallback
  anything unclear?  node scripts/live.mjs status${C.reset}`);
}

const cmds = { ready, status, push, agree, rescue, fallback, cue };
const cmd = cmds[process.argv[2] ?? "status"];
if (!cmd) {
  console.log("usage: node scripts/live.mjs {ready|status|push|agree|rescue|fallback|cue}");
  process.exit(1);
}
try {
  await cmd();
} catch (e) {
  bad(e.cause?.code === "ECONNREFUSED" ? `Align isn't running at ${ALIGN} (npm run dev)` : e.message);
  process.exit(1);
}
