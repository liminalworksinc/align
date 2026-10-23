#!/usr/bin/env node
// Align autopilot: runs the four-act walkthrough on screen, end to end, against the live app.
//
//   node scripts/autopilot.mjs            paced for viewing / screen recording (default)
//   node scripts/autopilot.mjs --fast     shorter holds
//   node scripts/autopilot.mjs --no-reset keep current state (default resets to company goal v1)
//   node scripts/autopilot.mjs --no-agent skip Act 4 (Claude Code in tmux)
//   AUTOPILOT_HEADLESS=1                  no windows; exits when done (status 1 if any step was missing)
//
// Selectors follow the v6 UI (LIM-2424): nav is Your turn / Company goal / Goals / Scenario Studio / Decisions / Work;
// a proposal opens from its Your turn card; the owner answers with Accept / Counter / Decline.
//
// Act 1  Leadership ratifies and pushes company goal v2
// Act 2  Jev re-matches captured agent sessions to the new goals (Work map)
// Act 3  Product and Security negotiate the Security goal change, with Sparta evidence attached
// Act 4  Claude Code asks Align over MCP which plan is authorized, runs it, Sparta passes
import puppeteer from "puppeteer-core";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = process.env.ALIGN_URL || "http://localhost:3100";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FAST = process.argv.includes("--fast");
const RESET = !process.argv.includes("--no-reset");
const AGENT = !process.argv.includes("--no-agent");
const HEADLESS = process.env.AUTOPILOT_HEADLESS === "1";
const HOLD = HEADLESS ? 300 : FAST ? 700 : 2200;
const TMUX = process.env.TMUX_SESSION || "align";
const EVIDENCE_DIR = path.join(ROOT, "sparta/walkthrough-lab/evidence");
const PASS = {
  leadership: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo",
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const problems = [];

async function api(p, init = {}) {
  const res = await fetch(URL_ + p, init);
  return res.json().catch(() => ({}));
}

// ---------- browser helpers ----------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  defaultViewport: null,
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "--window-position=40,40"],
});
async function windowFor(role) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${role}: ${e.message}`));
  if (HEADLESS) {
    await page.setViewport({ width: 1440, height: 900 });
    return page;
  }
  const cdp = await page.createCDPSession();
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: 40, top: 40, width: 1440, height: 900 } });
  return page;
}
async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__align_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__align_caption";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", zIndex: 99999,
        background: "rgba(20,20,28,.92)", color: "#fff", padding: "12px 20px", borderRadius: "12px",
        font: "600 18px system-ui, sans-serif", boxShadow: "0 8px 30px rgba(0,0,0,.35)", maxWidth: "80%", textAlign: "center", pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => {});
}
async function focus(page, text) {
  await page.bringToFront();
  if (text) await caption(page, text);
  await sleep(HOLD / 2);
}
/** Click a button (exact visible text or prefix) with a short highlight so viewers can follow. */
async function press(page, label, { exact = false, within = "button", nav = false } = {}) {
  if (nav) { within = 'nav[aria-label="Main"] button'; }
  await page.bringToFront();
  const handle = await page.waitForFunction(
    (label, exact, within, nav) => {
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      return [...document.querySelectorAll(within)].find((e) => {
        const t = norm(e.textContent || "");
        return !e.disabled && (nav ? t.startsWith(label) : exact ? t === label : t.startsWith(label) || t.includes(label));
      }) || null;
    },
    { timeout: 15000, polling: 250 },
    label, exact, within, nav,
  ).catch(() => null);
  const el = handle?.asElement();
  if (!el) {
    problems.push(`could not find "${label}"`);
    log(`  ! missing: ${label}`);
    if (process.env.AUTOPILOT_DEBUG) {
      const dir = process.env.AUTOPILOT_DEBUG;
      await page.screenshot({ path: `${dir}/missing-${label.replace(/[^a-z]+/gi, "_")}.png` }).catch(() => {});
      const btns = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => (b.disabled ? "[x] " : "") + b.textContent.replace(/\s+/g, " ").trim().slice(0, 60)));
      log(`    url=${page.url()} buttons: ${btns.join(" | ")}`);
    }
    return false;
  }
  await el.evaluate((e) => {
    e.scrollIntoView({ block: "center", behavior: "smooth" });
    e.style.outline = "4px solid #7c3aed";
    e.style.outlineOffset = "3px";
  });
  await sleep(HOLD / 2);
  await el.click();
  await el.evaluate((e) => (e.style.outline = "")).catch(() => {});
  await sleep(HOLD);
  return true;
}
async function signIn(page, role) {
  await page.goto(URL_ + "/", { waitUntil: "networkidle0" });
  await page.evaluate((r) => document.querySelector(`input[value=${r}]`)?.click(), role);
  await page.type("input[type=password]", PASS[role]);
  await press(page, "Sign in", { exact: true });
}
async function waitFor(desc, fn, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await fn()) return true; } catch { /* keep polling */ }
    await sleep(1500);
  }
  problems.push(`timed out waiting for ${desc}`);
  log(`  ! timed out: ${desc}`);
  return false;
}

// ---------- tmux / Claude Code helpers ----------
const tmux = (...a) => spawnSync("tmux", a, { encoding: "utf8" });
const pane = () => tmux("capture-pane", "-t", TMUX, "-p").stdout || "";
function startClaude() {
  tmux("kill-session", "-t", TMUX);
  tmux("new-session", "-d", "-s", TMUX, "-x", "200", "-y", "55", "-c", ROOT);
  tmux("send-keys", "-t", TMUX, "clear; claude", "Enter");
}
function showTerminal() {
  try {
    execFileSync("osascript", ["-e", `tell application "Terminal" to do script "tmux attach -t ${TMUX}"`, "-e", 'tell application "Terminal" to activate']);
  } catch { log("  ! could not open Terminal; attach manually: tmux attach -t " + TMUX); }
}

// ================= RUN =================
log("Preflight");
const policy0 = await api("/api/policy/security");
if (!policy0.plan) { console.error("Align is not reachable at " + URL_); process.exit(1); }

if (AGENT) { startClaude(); log("Claude Code starting in tmux session '" + TMUX + "'"); }

const L = await windowFor("leadership");
await signIn(L, "leadership");
// Leadership's cookie, for API reads that need a signed-in session (B1-3).
const jar = (await L.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
if (RESET) {
  await api("/api/reset", { method: "POST", headers: { "content-type": "application/json", cookie: jar }, body: JSON.stringify({ confirm: "reset" }) });
  log("Workspace reset: company goal v1, no proposals");
  await L.reload({ waitUntil: "networkidle0" });
}
const P = await windowFor("product");
await signIn(P, "product");
const S = await windowFor("security");
await signIn(S, "security");

// ---- ACT 1 ----
log("ACT 1 · Leadership ratifies and pushes company goal v2");
await focus(L, "Act 1 · Leadership reviews the next company goal");
await press(L, "Company goal", { nav: true });
await sleep(HOLD);
await focus(L, "Act 1 · Ratify & push to every team");
await press(L, "Approve and send to teams");
await focus(P, "Product sees company goal v2 land, with one dependency unconfirmed");
await press(P, "Goals", { nav: true });
await sleep(HOLD * 1.5);

// ---- ACT 2 ----
log("ACT 2 · Jev re-matches agent sessions to the new goals");
await focus(L, "Act 2 · Where agent work is going: sessions re-match to the new goals");
await press(L, "Work", { nav: true });
await waitFor("re-matching against the new goal registry", async () => {
  const m = await api("/api/mappings", { headers: { cookie: jar } });
  return m.mappings?.length && m.mappings.every((x) => x.registry_version === m.registry_version && x.state !== "PENDING");
}, 90000);
await sleep(HOLD * 2);

// ---- ACT 3 ----
log("ACT 3 · Product and Security negotiate");
await focus(P, "Act 3 · Product opens the cross-team dependency");
await press(P, "Goals", { nav: true });
await focus(P, "The brief: ranked ways forward, evidence and what could disprove it");
await press(P, "See ways forward");
await focus(P, "Sparta: current plan FAILS, candidate PASSES the same checks");
await press(P, "Test in Scenario Studio");
await sleep(HOLD * 1.5);
await press(P, "Attach to proposal");
await focus(P, "Product sends the proposal, pinned to the tested plan");
await press(P, "Send proposal to");
await focus(S, "Security reviews the proposal to its own goal");
await S.reload({ waitUntil: "networkidle0" });
await press(S, "Your turn", { nav: true });
await press(S, "Review the proposal");
await sleep(HOLD);
await focus(S, "Security counters: protect P0 non-beta incidents");
await press(S, "Counter", { within: "button[aria-pressed]" });
await press(S, "Ask for changes", { exact: true });
await focus(P, "Product accepts the revised terms");
await P.reload({ waitUntil: "networkidle0" });
await press(P, "Your turn", { nav: true });
await press(P, "Review the changes");
await press(P, "Accept Security's changes and confirm what Product will do");
await focus(S, "Security approves its own goal revision");
await S.reload({ waitUntil: "networkidle0" });
await press(S, "Your turn", { nav: true });
await press(S, "Review and approve");
await press(S, "Approve the change to my goal");
await focus(S, "Agreed: Security goal revised by its owner");
await press(S, "Goals", { nav: true });
await focus(P, "Both owners see the same agreed version");
await press(P, "Goals", { nav: true });
await sleep(HOLD * 1.5);
const policy1 = await api("/api/policy/security");
log(`Align now authorizes ${policy1.plan} under Security goal ${policy1.goal_version} (${policy1.test_status})`);

// ---- ACT 4 ----
if (AGENT) {
  log("ACT 4 · Claude Code reads the agreement over MCP and runs it");
  await waitFor("Claude Code ready in tmux", async () => {
    const t = pane();
    if (/Teach auto mode|Do you trust/.test(t)) tmux("send-keys", "-t", TMUX, "Escape");
    return /auto mode|for shortcuts|❯/.test(t);
  }, 60000);
  showTerminal();
  const before = new Set(existsSync(EVIDENCE_DIR) ? readdirSync(EVIDENCE_DIR) : []);
  await sleep(1500);
  tmux("send-keys", "-t", TMUX, "Use the align MCP tools: which goals has my org ratified, and which plan is the Security triage agent authorized to run right now? Then run it with the exact command Align gives and report the Sparta result.");
  await sleep(500);
  tmux("send-keys", "-t", TMUX, "Enter");
  const ran = await waitFor("the agent's Sparta run (new evidence file)", () => {
    const now = readdirSync(EVIDENCE_DIR).filter((f) => !before.has(f));
    return now.length > 0;
  }, 300000);
  await sleep(4000);
  if (ran) {
    // A new file only proves a run happened. The verdict, plan and protected ticket are read from the evidence itself.
    const f = readdirSync(EVIDENCE_DIR).filter((x) => !before.has(x))[0];
    const expectPlan = (await api("/api/policy/security")).plan;
    const v = spawnSync("node", [path.join(ROOT, "scripts/verify-run.mjs"), path.join(EVIDENCE_DIR, f), "--expect", "PASS", "--plan", expectPlan], { encoding: "utf8" });
    log(`Agent run ${f}: ${v.stdout.trim().replace(/\n/g, " | ")}`);
    if (v.status !== 0) problems.push(`agent run did not verify: ${v.stdout.trim()}`);
  }
  await focus(L, "The agent's session appears on the Work map, matched to the goal it served");
  await L.reload({ waitUntil: "networkidle0" });
  await press(L, "Work", { nav: true });
  await sleep(HOLD * 2);
  await focus(L, "The decision record, then every Sparta run");
  await press(L, "Decisions", { nav: true });
  await press(L, "Agreement reached");
  await sleep(HOLD * 2);
  await press(L, "Scenario Studio", { nav: true });
  await sleep(HOLD * 2);
}

await focus(P, "Done · the people who own the goals agreed; the agent followed the agreement");
log(problems.length ? `Finished with ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}` : "Finished: all acts completed.");
if (HEADLESS) {
  await browser.close();
  process.exit(problems.length ? 1 : 0);
}
log("Windows stay open. Close them when done (Ctrl-C here closes the browser).");
await new Promise(() => {});
