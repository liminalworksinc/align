#!/usr/bin/env node
// LIM-2472 round 2: "Next" after a decision, wired from Home's ranked list into the integrated review drawer, proven by
// real clicks and keyboard. Seeds through the real API only (s/seed-agent.mjs, then b/seed.mjs on top).
//
//   node design/prototypes/lim-2472/b/next-checks.mjs <BASE> <OUT>
//
// Covers: decide, follow Next into a second review, decide again (owner at 1440, a team lead at 390); a Next that is a
// team ask closes the drawer and navigates; the list changing during a review; the fresh read failing (no link); Next
// never pre-selects a choice or sends anything; a decided row stays in place, greyed, until the filter changes; "Back to
// the list" returns focus to the row. Exit 1 on a failure.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seed } from "./seed.mjs";

const [BASE_ARG, OUT] = process.argv.slice(2);
if (!BASE_ARG || !OUT) {
  console.error("usage: node next-checks.mjs <BASE url> <OUT dir>");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../../../components/legacy-project-wrapper/implementation/package.json"));
const puppeteer = require("puppeteer-core");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
const failed = [];
// The last line always names what failed (or that the run stopped before the end), so a log cut off above still says it.
let finished = false;
process.on("exit", () => {
  if (!finished) console.log(`STOPPED before the end: ${pass} pass, ${fail} fail so far${failed.length ? `; failed: ${failed.join(" | ")}` : ""}`);
  else if (failed.length) console.log(`FAILED: ${failed.join(" | ")}`);
});
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  if (!ok) failed.push(name);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `  (${detail})`}`);
};

const tmp = mkdtempSync(path.join(os.tmpdir(), "lim2472-next-"));
const sa = spawnSync(process.execPath, [path.join(here, "../s/seed-agent.mjs"), BASE, path.join(tmp, "agent.json")], { encoding: "utf8" });
if (sa.status !== 0) {
  // seed-agent.mjs signs up fixed emails, so it can seed a data folder once: run each check against a server started on a
  // fresh, empty ALIGN_DATA_DIR. A failure here is the seed, not the product.
  console.error(`seed-agent.mjs failed; this check needs a server on a fresh ALIGN_DATA_DIR (the shared seed can run once per data folder).\n${sa.stderr || sa.stdout}`);
  process.exit(1);
}
const agent = JSON.parse(readFileSync(path.join(tmp, "agent.json"), "utf8"));
rmSync(tmp, { recursive: true, force: true });
const s = await seed(BASE, agent);
const W = `/api/v2/workspaces/${s.ws}`;
const HOME = `/app/w/${s.ws}`;

async function login(acct) {
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: acct.email, password: acct.password }) });
  return r.headers.getSetCookie().map((c) => {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    return { name: nv.slice(0, i), value: nv.slice(i + 1), domain: new URL(BASE).hostname, path: "/", httpOnly: true };
  });
}
async function apiAs(c, method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { origin: BASE, cookie: c.map((x) => `${x.name}=${x.value}`).join("; "), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-default-browser-check"] });
async function open(cookies, url, width = 1440, setup) {
  const p = await browser.newPage();
  await p.setCookie(...cookies);
  await p.setViewport({ width, height: width >= 1000 ? 900 : 844 });
  if (setup) await setup(p);
  await p.goto(BASE + url, { waitUntil: "networkidle0" });
  await p.waitForFunction(() => document.querySelector("h1")?.getAttribute("data-home-count") !== "reading", { timeout: 20000 }).catch(() => undefined);
  await sleep(500);
  return p;
}
const settle = async (p) => {
  await p.waitForNetworkIdle({ idleTime: 500, timeout: 15000 }).catch(() => undefined);
  await sleep(400);
};
/** Open the first Needs-you row whose action says `label`, by its row link. */
async function openRow(p, label) {
  const ok = await p.evaluate((l) => {
    const li = [...document.querySelectorAll('[data-needs] ol > li')].find((x) => [...x.querySelectorAll("a,button")].some((b) => b.textContent?.trim() === l));
    const a = li?.querySelector('a[href*="review="]');
    a?.click();
    return !!a;
  }, label);
  await settle(p);
  return ok;
}
/** Approve only from the drawer's footer (folded into "More actions" on a phone). */
async function approveOnly(p) {
  await p.evaluate(() => {
    const vis = (e) => e && e.offsetParent !== null;
    const direct = [...document.querySelectorAll("[data-decision]")].find((b) => /^Approve( only)?$/.test(b.getAttribute("data-decision") ?? "") && vis(b));
    if (direct) return direct.click();
    [...document.querySelectorAll("button")].find((b) => /More actions/.test(b.textContent ?? "") && vis(b))?.click();
  });
  await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll("[data-decision]")].find((b) => /^Approve( only)?$/.test(b.getAttribute("data-decision") ?? "") && b.offsetParent !== null)?.click());
  await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Review this decision/.test(b.textContent ?? "") && b.offsetParent !== null)?.click());
  await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Confirm: Approve/.test(b.textContent?.trim() ?? "") && b.offsetParent !== null)?.click());
  await sleep(1200);
  await settle(p);
}
const nextState = (p) =>
  p.evaluate(() => {
    const n = document.querySelector("[data-next]");
    const a = n?.querySelector("a[data-next-item]");
    return { kind: n?.getAttribute("data-next") ?? null, text: n?.textContent ?? "", href: a?.getAttribute("href") ?? null, review: a?.getAttribute("data-next-review") ?? null };
  });
const reviewId = (p) => p.evaluate(() => document.querySelector("[data-review]")?.getAttribute("data-review"));

try {
  const owner = await login(agent.accounts.owner);
  const mina = await login(s.people.mina);
  const rafi = await login(s.people.rafi);

  // ---- owner at 1440: decide, Next into a second review (nothing pre-selected, nothing sent), decide again ----
  {
    const p = await open(owner, HOME);
    check("owner: opened a decision from Needs you", await openRow(p, "Review"));
    const first = await reviewId(p);
    await approveOnly(p);
    let n = await nextState(p);
    check(`owner: after the decision, Next names the next row (${n.text.trim().slice(0, 80)})`, n.kind === "next" && !!n.href, JSON.stringify(n));
    await p.screenshot({ path: path.join(OUT, "next-owner-dark-1440.png"), fullPage: false });
    // Follow it by keyboard.
    let on = false;
    for (let i = 0; i < 60 && !on; i++) {
      await p.keyboard.press("Tab");
      on = await p.evaluate(() => !!document.activeElement?.closest("[data-next]") && document.activeElement?.tagName === "A");
    }
    await p.keyboard.press("Enter");
    await settle(p);
    const second = await reviewId(p);
    const pre = await p.evaluate(() => ({ confirm: !!document.querySelector("[data-confirm]"), pressed: [...document.querySelectorAll("[data-decision]")].some((b) => b.getAttribute("aria-pressed") === "true"), input: !!document.querySelector("[data-decision-input]"), url: location.search }));
    const secondCr = second ? (await apiAs(owner, "GET", `${W}/change-requests`)).waiting_on_me.concat([]).find(() => true) : null;
    check("owner: Next opened a second review, by keyboard, with nothing pre-selected and no choice in the link", !!second && second !== first && !pre.confirm && !pre.pressed && !pre.input && !/choice=/.test(pre.url), JSON.stringify({ first, second, ...pre }));
    void secondCr;
    // The second request is still as it was (Next sends nothing).
    const crs = await apiAs(owner, "GET", `${W}/change-requests`);
    const all = [...crs.waiting_on_me, ...crs.mine, ...crs.others];
    const two = all.find((c) => c.id === second);
    check("owner: following Next sent nothing (the second request is unchanged)", !!two && (two.state === "pending" || (two.state === "approved" && two.launch === "pending")), two ? `${two.state}/${two.launch}` : "not found");
    // Decide the second one too, then go back to the list.
    if (two?.can.approve) await approveOnly(p);
    else await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Launch v\d/.test(b.textContent?.trim() ?? "") && b.offsetParent !== null)?.click()).then(() => sleep(300)).then(() => p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Confirm: Launch/.test(b.textContent?.trim() ?? ""))?.click())).then(() => sleep(1200)).then(() => settle(p));
    n = await nextState(p);
    check("owner: the second decision also offers what's next", ["next", "none_actionable", "last"].includes(n.kind ?? ""), JSON.stringify(n));
    await p.evaluate(() => [...document.querySelectorAll("[data-next] button")].find((b) => /Back to the list/.test(b.textContent ?? ""))?.click());
    await settle(p);
    const back = await p.evaluate((id) => ({ open: !!document.querySelector('[role="dialog"]'), focus: document.activeElement?.getAttribute("href") ?? "", greyed: [...document.querySelectorAll('[data-needs] ol > li')].filter((li) => /You decided this just now/.test(li.textContent ?? "")).length, own: [...document.querySelectorAll('[data-needs] ol > li')].some((li) => li.querySelector(`a[href*=".${id}"]`) && /Decided/.test(li.textContent ?? "")) }), second);
    check("owner: Back to the list closes the drawer, focus lands on a row, the decided rows stay in place greyed", !back.open && /review=/.test(back.focus) && back.greyed >= 1, JSON.stringify(back));
    await p.screenshot({ path: path.join(OUT, "next-back-greyed-dark-1440.png"), fullPage: false });
    await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => /Done|Waiting/.test(b.textContent ?? ""))?.click());
    await sleep(300);
    await p.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => /Needs you/.test(b.textContent ?? ""))?.click());
    await sleep(300);
    const gone = await p.evaluate(() => [...document.querySelectorAll('[data-needs] ol > li')].filter((li) => /You decided this just now/.test(li.textContent ?? "")).length);
    check("owner: the greyed rows leave once the filter changes", gone === 0, `greyed=${gone}`);
    await p.close();
  }

  // ---- a team lead (Mina) at 390: decide her decisions, then Next is a team ask: the drawer closes and the page moves ----
  {
    const teams = (await apiAs(mina, "GET", "/api/v2/workspaces")).workspaces.find((w) => w.id === s.ws).teams;
    const lead = teams.find((t) => t.role === "lead");
    await apiAs(rafi, "POST", `${W}/asks`, { team_id: lead.id, text: "Could the reviews team cover the release review? (fictional)", from_label: "Platform", source: { kind: "manual", date: new Date().toISOString().slice(0, 10) } });
    const p = await open(mina, HOME, 390);
    let guard = 0;
    let n = { kind: null };
    check("lead (390): opened a decision", await openRow(p, "Review"));
    while (guard++ < 8) {
      // A decision where Approve is offered; an approved change Next leads to is launched instead (also a decision).
      const canApprove = await p.evaluate(() => [...document.querySelectorAll("[data-decision]")].some((b) => /^Approve( only)?$/.test(b.getAttribute("data-decision") ?? "")));
      if (canApprove) await approveOnly(p);
      else {
        await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Launch v\d/.test(b.textContent?.trim() ?? "") && b.offsetParent !== null)?.click());
        await sleep(300);
        await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Confirm: Launch/.test(b.textContent?.trim() ?? "") && b.offsetParent !== null)?.click());
        await sleep(1200);
        await settle(p);
      }
      n = await nextState(p);
      if (n.kind !== "next" || n.review !== "true") break;
      await p.evaluate(() => document.querySelector("[data-next] a[data-next-item]")?.click());
      await settle(p);
    }
    check(`lead (390): after her decisions, Next is the team ask, outside the review (${n.text.trim().slice(0, 70)})`, n.kind === "next" && n.review === "false" && /Team ask/.test(n.text), JSON.stringify(n));
    await p.screenshot({ path: path.join(OUT, "next-team-ask-dark-390.png"), fullPage: false });
    await p.evaluate(() => document.querySelector("[data-next] a[data-next-item]")?.click());
    await settle(p);
    const r = await p.evaluate(() => ({ dialog: !!document.querySelector('[role="dialog"]'), path: location.pathname }));
    check("lead (390): following a team ask closes the drawer and goes to Asks", !r.dialog && /\/asks$/.test(r.path), JSON.stringify(r));
    await p.close();
  }

  // ---- a requester (Jun) at 1440: accept a suggested change, then Next is his declined request ----
  {
    const jun = await login(s.people.theo);
    const p = await open(jun, HOME);
    check("requester: opened 'See the change'", await openRow(p, "See the change"));
    await p.evaluate(() => [...document.querySelectorAll("[data-decision]")].find((b) => b.getAttribute("data-decision") === "Accept the change" && b.offsetParent !== null)?.click());
    await sleep(300);
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Confirm: Accept the change/.test(b.textContent?.trim() ?? "") && b.offsetParent !== null)?.click());
    await sleep(1200);
    await settle(p);
    const n = await nextState(p);
    check(`requester: after accepting, Next is the declined request (${n.text.trim().slice(0, 70)})`, n.kind === "next" && /Declined/.test(n.text), JSON.stringify(n));
    await p.screenshot({ path: path.join(OUT, "next-requester-dark-1440.png"), fullPage: false });
    await p.close();
  }

  // ---- the list changes during a review ----
  {
    const gs = (await apiAs(owner, "GET", `${W}/goals`)).goals;
    const g1 = gs.find((g) => g.title === "Pass the security review");
    const g2 = gs.find((g) => g.title === "Every release carries its audit evidence");
    const a = await apiAs(rafi, "POST", `${W}/goals/${g1.id}/change-requests`, { base_version: g1.version, changes: { title: `${g1.title} (next check)` }, reason: "Next check (fictional)." });
    const p = await open(owner, `${HOME}?review=${g1.id}.${a.id}`);
    await sleep(800);
    await apiAs(rafi, "POST", `${W}/goals/${g2.id}/change-requests`, { base_version: g2.version, changes: { title: `${g2.title} (arrived meanwhile)` }, reason: "Arrived while the review was open (fictional)." });
    await approveOnly(p);
    const n = await nextState(p);
    check("list changed during the review: Next says so", /The list changed while you were here/.test(n.text), JSON.stringify(n));
    await p.close();
  }

  // ---- the fresh read fails: no link, a plain sentence ----
  {
    const gs = (await apiAs(owner, "GET", `${W}/goals`)).goals;
    const g = gs.find((x) => x.title === "Partner pilot ready for review");
    const a = await apiAs(rafi, "POST", `${W}/goals/${g.id}/change-requests`, { base_version: g.version, changes: { title: `${g.title} (fresh fails)` }, reason: "Fresh read fails (fictional)." });
    let armed = false;
    const p = await open(owner, `${HOME}?review=${g.id}.${a.id}`, 1440, async (pg) => {
      await pg.setRequestInterception(true);
      pg.on("request", (req) => (armed && req.method() === "GET" && new URL(req.url()).pathname === `${W}/change-requests` ? req.respond({ status: 500, contentType: "application/json", body: '{"error":"forced"}' }) : req.continue()));
    });
    armed = true;
    await approveOnly(p);
    const n = await nextState(p);
    check("fresh read failing: 'Align couldn't read what else waits on you.' and no Next link", n.kind === "unread" && !n.href && /couldn.t read what else waits on you/.test(n.text), JSON.stringify(n));
    await p.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${pass} pass, ${fail} fail`);
finished = true;
process.exitCode = fail ? 1 : 0;
