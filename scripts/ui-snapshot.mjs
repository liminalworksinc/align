#!/usr/bin/env node
// Rendered-UI snapshot: drives a flow over HTTP and, at each stage, signs in each role in its own
// browser context, visits every nav view (plus the proposal review, decision record and run details when they
// exist at that stage) and writes <stage>-<role>-<view>.txt (document.body.innerText,
// clock times / durations / random ids masked) plus a PNG.
//
// Usage: node scripts/ui-snapshot.mjs <baseUrl> <outDir> [--flow northstar|custom] [--fixture file.json]
//                                     [--forbid <regex>]
// Start the server from an empty data/ (rm -f data/state.json): the Evidence view lists the audit log,
// which survives /api/reset, so a reused state.json never matches the baseline.
// Diff two runs with: diff -r -x '*.png' <outA> <outB>
// Chrome: CHROME_PATH, else /Applications/Google Chrome.app.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : dflt;
};
const flow = opt("flow", "northstar");
const fixture = opt("fixture", null);
const forbidSrc = opt("forbid", null);
const [baseArg, out] = args;
if (!baseArg || !out) {
  console.error("Usage: node scripts/ui-snapshot.mjs <baseUrl> <outDir> [--flow northstar|custom] [--fixture f] [--forbid re]");
  process.exit(2);
}
const BASE = baseArg.replace(/\/$/, "");
if (/:3100$/.test(BASE) && process.env.ALIGN_TEST_ALLOW_DEMO !== "1") {
  console.error("Refusing to run against port 3100 (the demo server).");
  process.exit(2);
}
if (flow === "custom" && !fixture) {
  console.error("--flow custom needs --fixture <scenario body json>");
  process.exit(2);
}
const forbid = forbidSrc ? new RegExp(forbidSrc, "i") : null;
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PASSCODES = {
  product: process.env.ALIGN_PRODUCT_PASSCODE || "product-demo",
  security: process.env.ALIGN_SECURITY_PASSCODE || "security-demo",
  leadership: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo",
};

const mask = (t) =>
  t
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM|am|pm)?\b/g, "<TIME>")
    .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)\b(\s+ago)?/g, "<DUR>")
    .replace(/\b\d+m\s?\d+s\b/g, "<DUR>")
    .replace(/\b(just now|a few seconds ago)\b/gi, "<DUR>")
    .replace(/\b(prop|push|a|run|sess|s)-[0-9a-f]{6,}\b/g, "$1-<ID>");

const jars = { product: "", security: "", leadership: "" };

async function call(role, method, path, body, { allow = [] } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (role && jars[role]) headers.cookie = jars[role];
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get("set-cookie");
  if (role && sc) jars[role] = sc.split(";")[0];
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (res.status >= 300 && !allow.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return { status: res.status, json };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
const violations = [];
let files = 0;

async function capture(page, name) {
  const text = mask(await page.evaluate(() => document.body.innerText));
  const f = `${out}/${name}`;
  writeFileSync(`${f}.txt`, text + "\n");
  await page.screenshot({ path: `${f}.png` });
  files++;
  const m = forbid && text.match(forbid);
  if (m) violations.push(`${name}: "${m[0]}"`);
}

// [file suffix, nav item, where to look, text the button must contain]
const DEEP = [
  // A proposal card (yours or another team's); never leadership's company-goal or launch card.
  ["review", "Your turn", 'section[aria-label="Waiting on you"] button, section[aria-label="Waiting on others"] button', /(Review the proposal|Review the changes|Review and approve|Propose a change|Open)$/],
  ["record", "Decisions", "main button", /Approved by /],
  ["run-details", "Scenario Studio", "main button", /^Run details$/],
];

/** Click a nav item, then the first enabled button in `within` whose text matches; false when there is none. */
async function openDeep(page, nav, within, match) {
  const clicked = await page.evaluate(
    (nav) => {
      const norm = (t) => t.replace(/\s+/g, " ").trim();
      const item = [...document.querySelectorAll("nav[aria-label=Main] button")].find((b) => !b.disabled && norm(b.innerText).startsWith(nav));
      if (!item) return false;
      item.click();
      return true;
    },
    nav,
  );
  if (!clicked) return false;
  await new Promise((r) => setTimeout(r, 800));
  return page.evaluate(
    (within, src) => {
      const re = new RegExp(src);
      const norm = (t) => t.replace(/\s+/g, " ").trim();
      const el = [...document.querySelectorAll(within)].find((b) => !b.disabled && re.test(norm(b.innerText)));
      if (!el) return false;
      el.click();
      return true;
    },
    within,
    match.source,
  );
}

async function shoot(stage, roles) {
  mkdirSync(out, { recursive: true });
  const { hostname } = new URL(BASE);
  for (const role of roles) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.emulateTimezone("America/Los_Angeles");
    const [name, ...v] = jars[role].split("=");
    await ctx.setCookie({ name, value: v.join("="), domain: hostname, path: "/" });
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("nav[aria-label=Main] button");
    const n = (await page.$$("nav[aria-label=Main] button")).length;
    for (let i = 0; i < n; i++) {
      const btn = (await page.$$("nav[aria-label=Main] button"))[i];
      // The nav label: pre-v6 nav marked it span.font-semibold; the v6 rail (LIM-2424) bolds the whole button, so take
      // the first span's first line (a count badge or a "no sandbox" note never comes first).
      const label = (
        await btn.evaluate((b) => (b.querySelector("span.font-semibold") ?? b.querySelector("span span") ?? b).innerText.split("\n")[0].trim())
      )
        .replace(/\W+/g, "-")
        .toLowerCase();
      await btn.click();
      await new Promise((r) => setTimeout(r, 800));
      await capture(page, `${stage}-${role}-${label}`);
    }
    // Screens a nav item doesn't land on, each captured when it exists at this stage (LIM-2424 v6 review):
    // the proposal review (opened from its Your turn card), the decision record (Decisions -> the agreed item) and a
    // run's details (Scenario Studio -> Run details).
    for (const [name, nav, within, match] of DEEP) {
      if (!(await openDeep(page, nav, within, match))) continue;
      // Opening a deep screen can itself write (Run details marks evidence_opened), and the audit list shows it only
      // after the next /api/state poll (1.5 s). Let the writes settle, then wait one full poll, so the capture never
      // depends on which side of a poll it lands.
      await new Promise((r) => setTimeout(r, 800));
      await page.waitForNetworkIdle({ idleTime: 300, timeout: 5000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1700));
      await capture(page, `${stage}-${role}-${name}`);
    }
    await ctx.close();
  }
}

const ALL = ["product", "security", "leadership"];
const PS = ["product", "security"];

try {
  for (const r of ALL) await call(r, "POST", "/api/session", { role: r, passcode: PASSCODES[r] });

  if (flow === "northstar") {
    await call("leadership", "POST", "/api/reset", { confirm: "reset" });
    await shoot("0-fresh", ALL);
    await call("leadership", "POST", "/api/org/push", {});
    await shoot("1-org-pushed", ALL);
    const state = (await call("product", "GET", "/api/state")).json;
    const sims = (await call("product", "GET", "/api/simulations")).json?.simulations ?? [];
    const simRefs = sims.filter((r) => (r.plan_id === "p-throughput" || r.plan_id === "p-beta") && r.scenario === "normal").map((r) => r.id);
    const prop = (
      await call("product", "POST", "/api/proposals", {
        plan_id: "p-beta",
        plan_version: 1,
        simulation_refs: simRefs,
        proposed_measure_text: "Beta incidents triaged per launch-readiness policy within 24h",
        rationale: "CEO KR2 makes beta readiness the priority",
        reciprocal_commitment: "Product tags beta issues obs-beta at intake and publishes beta scope",
      })
    ).json;
    await shoot("2-pending-security", ALL);
    const params = state.plans.find((x) => x.plan_id === "p-beta" && x.plan_version === 1)?.params;
    await call("security", "POST", `/api/proposals/${prop.id}/counter`, {
      proposed_measure_text: "Beta incidents triaged within 24h; P0 within 4h",
      rationale: "Tighten P0 window",
      changes_plan: false,
      plan_params: params,
    });
    await shoot("3-countered", PS);
    await call("product", "POST", `/api/proposals/${prop.id}/acknowledge`, {});
    await shoot("4-acknowledged", PS);
    await call("security", "POST", `/api/proposals/${prop.id}/counter`, {
      proposed_measure_text: "Beta incidents triaged within 24h; P0 within 4h; protected tickets untouched",
      rationale: "Changes the executable plan's protected set",
      changes_plan: false,
      plan_params: { ...params, protected_set: [...(params?.protected_set ?? []), "All P1 incidents"] },
    });
    await call("product", "POST", `/api/proposals/${prop.id}/acknowledge`, {});
    await shoot("5-stale-acknowledged", PS);
    await call("security", "POST", `/api/proposals/${prop.id}/accept`, { rationale: "Agreed; will rerun", accept_untested: true });
    await shoot("6-ratified", ALL);
    await call("leadership", "POST", "/api/reset", { confirm: "reset" });
  } else if (flow === "custom") {
    const body = JSON.parse(readFileSync(fixture, "utf8"));
    await call("leadership", "POST", "/api/scenario", { ...body, confirm: "replace" });
    await shoot("0-setup", ALL);
    const prop = (
      await call("product", "POST", "/api/proposals", {
        proposed_measure_text: "Requested change to the owning team's measure",
        rationale: "The company goal changed",
        reciprocal_commitment: "The asking team commits to its side of the change",
      })
    ).json;
    await shoot("2-pending", ALL);
    await call("security", "POST", `/api/proposals/${prop.id}/counter`, {
      proposed_measure_text: "Requested change, with the owning team's revision",
      rationale: "Owner asks for changes",
      changes_plan: false,
    });
    await shoot("3-countered", PS);
    await call("product", "POST", `/api/proposals/${prop.id}/acknowledge`, {});
    await shoot("4-acknowledged", PS);
    const refused = await call("security", "POST", `/api/proposals/${prop.id}/accept`, { rationale: "Approve" }, { allow: [409] });
    if (refused.status !== 409) throw new Error(`custom accept without accept_untested returned ${refused.status}, expected 409`);
    await call("security", "POST", `/api/proposals/${prop.id}/accept`, { rationale: "Approve", accept_untested: true });
    await shoot("6-ratified", ALL);
  } else {
    throw new Error(`Unknown --flow ${flow}`);
  }
} finally {
  await browser.close();
}

console.log(`${files} views captured to ${out}`);
if (violations.length) {
  console.log(`FORBID ${violations.length} violation(s):\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
