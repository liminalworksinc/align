#!/usr/bin/env node
// LIM-2472: a failed read never reads as an absence on Work, and Home offers "Create a goal" only to someone who can.
//   node design/prototypes/lim-2472/integration/work-delivery.check.mjs <seed-agent out.json>
// Against a seeded Mode L server (ALIGN_TEST_IDP=1). The security goal is launched in the seed. A 500 on its …/value (or on
// its approved change requests) must not say "No app yet", "not sent" or "nothing launched"; a real empty list still does.
// Exits 1 on any failure. Playwright from PLAYWRIGHT_MODULE (default /tmp/pw/node_modules/playwright/index.mjs).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync(process.argv[2], "utf8"));
const BASE = seed.base;
const WS = seed.ws;
const GOAL = seed.goals.security;
const H = { "content-type": "application/json", origin: BASE };
const NOT_READ = "Couldn't load this just now"; // r2-review-work: NOT_LOADED in ds/evidence-facts.mts (was "Not read just now")
const OWN_ONLY = "None of your apps yet (owners see everyone's)."; // r2-review-work: sentToLine's non-owner empty case
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright/index.mjs");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome", headless: true });
let failed = 0;
const rule = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `: ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const BOOM = { status: 500, contentType: "application/json", body: '{"error":"x","message":"Boom."}' };

async function signedIn(a) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const r = await ctx.request.post(`${BASE}/api/v2/auth/sign-in/email`, { data: { email: a.email, password: a.password }, headers: { origin: BASE } });
  if (!r.ok()) throw new Error(`sign-in ${r.status()}`);
  return ctx;
}
const work = (account, route) => read(account, `/app/w/${WS}/work?goal=${GOAL}`, route);
async function read(account, path, route) {
  const ctx = await signedIn(account);
  const page = await ctx.newPage();
  if (route) await route(page);
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
  await ctx.close();
  return text;
}
const clip = (t, s) => { const i = t.indexOf(s); return i < 0 ? t.slice(0, 200) : t.slice(Math.max(0, i - 80), i + 200); };

for (const role of ["owner", "member"]) {
  const a = seed.accounts[role];
  const t = await work(a, (p) => p.route(/\/change-requests\/[^/]+\/value$/, (r) => r.fulfill(BOOM)));
  const d = clip(t, "Align sent it to");
  rule(`${role}, …/value fails: no "No app yet"`, !t.includes("No app yet"), d);
  rule(`${role}, …/value fails: no "not sent"`, !/not sent/i.test(t), d);
  rule(`${role}, …/value fails: no "Align sent it v" receipt`, !/Align sent it v\d+ [A-Z]/.test(t), d);
  rule(`${role}, …/value fails: says it was not read`, t.includes(NOT_READ), d);
  const u = await work(a, (p) => p.route(/\/change-requests\?state=approved$/, (r) => r.fulfill(BOOM)));
  const e = clip(u, "Connected apps");
  rule(`${role}, approved read fails: no "Nothing launched"`, !/Nothing (is )?launched/.test(u), e);
  rule(`${role}, approved read fails: says it was not read`, u.includes(NOT_READ), e);
}
{
  const t = await work(seed.accounts.owner);
  rule("owner, reads answer: names the connected app", /Align sent it to \d+ connected app/.test(t) && !t.includes(NOT_READ), clip(t, "Align sent it to"));
  // A viewer's list is their own apps: truly empty in the seed, though the owner's app was sent the version.
  const v = await work(seed.accounts.viewer);
  rule("viewer, their own list empty: says so, not the workspace's", !v.includes("No app yet") && v.includes(OWN_ONLY) && !v.includes(NOT_READ), clip(v, "Align sent it to"));
}

// Home on a workspace with no goals
const acct = async (name) => {
  const a = { name, email: `w-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`, password: `pw-${randomBytes(12).toString("base64url")}` };
  const r = await fetch(`${BASE}/api/v2/auth/sign-up/email`, { method: "POST", headers: H, body: JSON.stringify(a) });
  if (!r.ok) throw new Error(`sign-up ${r.status}`);
  a.cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return a;
};
const call = async (cookie, method, path, body) => (await fetch(BASE + path, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined })).json();
// A member's apps read lists only their own: an empty list says nothing about the workspace. The seed's owner app has read the goals.
{
  const signIn = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: H, body: JSON.stringify({ email: seed.accounts.owner.email, password: seed.accounts.owner.password }) });
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const apps = (await call(cookie, "GET", `/api/v2/workspaces/${WS}/apps`)).apps ?? [];
  rule("seed: the owner sees an app that has read the goals", apps.some((x) => x.last_read_at), apps.length);
  const m = await acct("Noor Member");
  const inv = await call(cookie, "POST", `/api/v2/workspaces/${WS}/invites`, { email: m.email, role: "member" });
  await call(m.cookie, "POST", `/api/v2/invites/${inv.token}/accept`, {});
  const t = await work(m);
  const d = clip(t, "Connected apps");
  rule('member with no app: no "No AI apps connected"', !t.includes("No AI apps connected"), d);
  rule('member with no app: no "Nothing has read this workspace\'s goals"', !t.includes("Nothing has read this workspace's goals"), d);
  rule('member with no app: no "none is connected"', !t.includes("none is connected"), d);
  rule("member with no app: says what they can see", t.includes("No AI app you can see is connected") && t.includes("none you can see is connected"), d);
  rule('member with no app: no "No app yet"', !t.includes("No app yet"), clip(t, "Align sent it to"));
  rule("member with no app: the delivery row is about their own apps", t.includes(OWN_ONLY), clip(t, "Align sent it to"));

  const appsPath = `/app/w/${WS}/apps`;
  const a = await read(m, appsPath);
  rule("Apps, member with no app: no workspace-wide sentence", !a.includes("No AI apps are connected to this workspace") && !a.includes("Nothing is reading"), clip(a, "Your apps"));
  rule("Apps, member with no app: says what they can see", a.includes("None of your AI apps is connected here.") && a.includes("You see your own apps; workspace owners see everyone's."), clip(a, "Your apps"));
  const r = await read(seed.accounts.viewer, appsPath, (p) => p.route(new RegExp(`/api/v2/workspaces/${WS}$`), (x) => x.fulfill(BOOM)));
  rule("Apps, role unread: offers nothing", !r.includes("Connect one above") && !r.includes("No AI apps are connected to this workspace"), clip(r, "Your apps"));

  // The goal page's sessions, on a goal the person doesn't own
  const goalPath = `/app/w/${WS}/goals/${seed.goals.company}`;
  const f = await read(seed.accounts.member, goalPath, (p) => p.route(new RegExp(`/api/v2/workspaces/${WS}/sessions$`), (x) => x.fulfill(BOOM)));
  rule('goal page, sessions read fails: no "no shared sessions"', !f.includes("no shared sessions"), clip(f, "Your shared sessions"));
  rule("goal page, sessions read fails: says it couldn't read them", f.includes("Couldn't read your sessions just now. Reload to try again."), clip(f, "Your shared sessions"));
  const e = await read(m, goalPath);
  rule("goal page, a real empty read: keeps today's sentence", e.includes("You have no shared sessions in this workspace. Share one with align share."), clip(e, "Your shared sessions"));
}

// An owner with a real empty list: a launched goal in their own sample, no app anywhere.
{
  const o = await acct("Lee Owner");
  const sample = await call(o.cookie, "POST", "/api/v2/workspaces/sample", {});
  const ws = sample.workspace?.id ?? sample.id;
  const groups = await call(o.cookie, "GET", `/api/v2/workspaces/${ws}/change-requests`);
  const cr = [...(groups.waiting_on_me ?? []), ...(groups.mine ?? []), ...(groups.others ?? [])].find((c) => c.state === "pending");
  await call(o.cookie, "POST", `/api/v2/workspaces/${ws}/goals/${cr.goal.id}/change-requests/${cr.id}/approve_and_launch`, { revision: cr.revision, note: "Check." });
  const t = await read(o, `/app/w/${ws}/work?goal=${cr.goal.id}`);
  rule('owner, a real empty list: Work keeps "No app yet"', t.includes("No app yet") && !t.includes(OWN_ONLY), clip(t, "Align sent it to"));
  const a = await read(o, `/app/w/${ws}/apps`);
  rule("owner, a real empty list: Apps keeps the workspace-wide wording", a.includes("No AI apps are connected to this workspace.") && a.includes("Nothing is reading this workspace's goals through an app yet.") && !a.includes("None of your AI apps"), clip(a, "Everyone's apps"));
}

const owner = await acct("Sam Owner");
const ws2 = (await call(owner.cookie, "POST", "/api/v2/workspaces", { name: "Empty" })).id;
const people = { owner };
for (const role of ["member", "viewer"]) {
  const a = await acct(`Ari ${role}`);
  const inv = await call(owner.cookie, "POST", `/api/v2/workspaces/${ws2}/invites`, { email: a.email, role });
  await call(a.cookie, "POST", `/api/v2/invites/${inv.token}/accept`, {});
  people[role] = a;
}
for (const [role, a] of Object.entries(people)) {
  const ctx = await signedIn(a);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/app/w/${ws2}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const link = page.locator("main a", { hasText: "Create a goal" });
  const n = await link.count();
  if (role === "viewer") rule('viewer, no goals: no "Create a goal"', n === 0, { n });
  else {
    rule(`${role}, no goals: keeps "Create a goal"`, n === 1, { n });
    if (n) {
      await link.first().click();
      await page.getByText("New goal", { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
      rule(`${role}: the link reaches a way to create one`, (await page.getByRole("button", { name: "Create goal" }).count()) === 1, page.url().replace(BASE, ""));
    }
  }
  await ctx.close();
}
// "Since you last looked": no "Nothing changed" for a source it didn't read. Each new tab compares with the last visit.
{
  const ctx = await signedIn(seed.accounts.owner);
  const visit = async (route) => {
    const page = await ctx.newPage();
    if (route) await route(page);
    await page.goto(`${BASE}/app/w/${WS}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    const text = (await page.locator("[data-since]").first().innerText()).replace(/\s+/g, " ");
    await page.close();
    return text;
  };
  await visit();
  const CHANGED = "Nothing changed since your last visit.";
  for (const [name, pattern, source] of [
    ["change requests", new RegExp(`/workspaces/${WS}/change-requests$`), "change requests"],
    ["home", new RegExp(`/workspaces/${WS}/home$`), "goals or connected apps"],
    ["a goal's versions", new RegExp(`/workspaces/${WS}/goals/[^/]+$`), "goal versions"],
  ]) {
    const t = await visit((p) => p.route(pattern, (r) => r.fulfill(BOOM)));
    rule(`Since, ${name} read fails: says it couldn't read it`, t.includes(`Align couldn't read the ${source} just now`), t);
    rule(`Since, ${name} read fails: no "Nothing changed"`, !t.includes(CHANGED), t);
    rule(`Since, ${name} read fails: no empty-timeline fallback`, !t.includes("Nothing recorded yet"), t);
  }
  const all = await visit();
  rule('Since, every read answers and no events: "Nothing changed"', all.includes(CHANGED) && !all.includes("couldn't read"), all);
  await ctx.close();
}
await browser.close();
process.exitCode = failed ? 1 : 0;
console.log(failed ? `${failed} failed` : "all passed");
