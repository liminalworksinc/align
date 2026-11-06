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
  rule("viewer, role known: Work offers no connection", !v.includes("Connect one"), clip(v, "Connected apps"));
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
  rule("member with no app: says what they can see", t.includes("None of your AI apps is connected") && t.includes("none of yours is connected"), d);
  rule('member with no app: no "No app yet"', !t.includes("No app yet"), clip(t, "Align sent it to"));
  rule("member with no app: the delivery row is about their own apps", t.includes(OWN_ONLY), clip(t, "Align sent it to"));

  const appsPath = `/app/w/${WS}/apps`;
  const a = await read(m, appsPath);
  rule("Apps, member with no app: no workspace-wide sentence", !a.includes("No AI apps are connected to this workspace") && !a.includes("Nothing is reading"), clip(a, "Your apps"));
  rule("Apps, member with no app: may connect one", a.includes("Connect one above"), clip(a, "Your apps"));
  rule("Apps, member with no app: says what they can see", a.includes("None of your AI apps is connected.") && a.includes("You see your own apps here; workspace owners see everyone's."), clip(a, "Your apps"));
  const r = await read(seed.accounts.viewer, appsPath, (p) => p.route(new RegExp(`/api/v2/workspaces/${WS}$`), (x) => x.fulfill(BOOM)));
  const roleDown = (p) => p.route(new RegExp(`/api/v2/workspaces/${WS}$`), (x) => x.fulfill(BOOM));
  const wm = await read(m, `/app/w/${WS}/work?goal=${GOAL}`, roleDown);
  rule("Work, member, role unread: no offer", !wm.includes("Connect one") && wm.includes("No AI app you can see is connected."), clip(wm, "Connected apps"));
  rule("Work, member, role known: may connect one", t.includes("Connect one"), clip(t, "Connected apps"));
  const am = await read(m, appsPath, roleDown);
  rule("Apps, member, role unread: no offer", !am.includes("Connect one above") && !am.includes("Add Align's MCP server"), clip(am, "Your apps"));
  rule("Apps, member, role unread: says so, not Loading", am.includes("Couldn't read your role in this workspace just now. Reload to try again.") && !am.includes("Loading…"), clip(am, "Connect an AI app"));
  {
    const ctx = await signedIn(m);
    const page = await ctx.newPage();
    await page.route(new RegExp(`/api/v2/workspaces/${WS}$`), async (x) => { await new Promise((r) => setTimeout(r, 2500)); await x.continue().catch(() => {}); });
    await page.goto(BASE + appsPath, { waitUntil: "commit" });
    await page.getByText("Connect an AI app").first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const pending = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
    await ctx.close();
    rule("Apps, role read pending: keeps Loading", pending.includes("Loading…") && !pending.includes("Couldn't read your role"), clip(pending, "Connect an AI app"));
  }
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
  rule('owner, a real empty list: Work keeps "No AI apps connected"', t.includes("No AI apps connected") && t.includes("none is connected"), clip(t, "Connected apps"));
  const roleDown = (p) => p.route(new RegExp(`/api/v2/workspaces/${ws}$`), (r) => r.fulfill(BOOM));
  const wu = await read(o, `/app/w/${ws}/work?goal=${cr.goal.id}`, roleDown);
  rule("Work, role unread: never the owner's sentences", !wu.includes("No AI apps connected") && !wu.includes("Nothing has read this workspace's goals") && !wu.includes("none is connected") && !wu.includes("Connect one"), clip(wu, "Connected apps"));
  rule("Work, role unread: the role-free sentence", wu.includes("No AI app you can see is connected.") && wu.includes("none you can see is connected") && !wu.includes("None of your AI apps") && wu.includes("Workspace owners see everyone's apps; others see their own.") && !wu.includes("You see your own apps"), clip(wu, "Connected apps"));
  const au = await read(o, `/app/w/${ws}/apps`, roleDown);
  rule("Apps, role unread: never the owner's sentences", !au.includes("No AI apps are connected to this workspace") && !au.includes("Nothing is reading") && !au.includes("Connect one above") && !au.includes("Add Align's MCP server") && au.includes("None of your AI apps is connected."), clip(au, "Your apps"));
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
  const offers = (await page.locator("main").first().innerText()).includes("Create a goal");
  const first = page.locator("main a, main button").filter({ hasText: /^Set the first goal$/ });
  const n = await first.count();
  if (role === "viewer") rule('viewer, no goals: no "Create a goal" or "Set the first goal"', n === 0 && !offers, { n, offers });
  else {
    rule(`${role}, no goals: offers "Set the first goal"`, n === 1, { n });
    if (n) {
      await first.first().click();
      await page.getByText("New goal", { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
      const form = { newGoal: await page.getByText("New goal", { exact: true }).count(), create: await page.getByRole("button", { name: "Create goal" }).count(), url: page.url().replace(BASE, "").replace(ws2, "<ws>") };
      rule(`${role}: a real click reaches the New goal form`, form.newGoal >= 1 && form.create === 1 && form.url.includes("/goals"), form);
    }
  }
  await ctx.close();
}
// First run on an unread /home: goals unknown, so no card and none of its sentences, in a workspace that has goals.
{
  // The seeded workspace is a sample, where the card's heading differs ("Look around first", "Two ways to start").
  const FIRST_RUN = ["Look around first", "Look around a made-up company", "Explore a sample", "Two ways to start", "Nothing here yet", "A workspace owner or member adds the goals", "Connect one agent", "Connect your agent", "Viewers can't connect", "Viewers can’t connect", "No AI app is connected"];
  const signIn = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: H, body: JSON.stringify({ email: seed.accounts.owner.email, password: seed.accounts.owner.password }) });
  const cookie = signIn.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const member = await acct("Pat Member");
  const inv = await call(cookie, "POST", `/api/v2/workspaces/${WS}/invites`, { email: member.email, role: "member" });
  await call(member.cookie, "POST", `/api/v2/invites/${inv.token}/accept`, {});
  const viewer = await acct("Kai Viewer");
  const inv2 = await call(cookie, "POST", `/api/v2/workspaces/${WS}/invites`, { email: viewer.email, role: "viewer" });
  await call(viewer.cookie, "POST", `/api/v2/invites/${inv2.token}/accept`, {});
  const path = `/app/w/${WS}`;
  const broke = (p) => p.route(new RegExp(`/workspaces/${WS}/home$`), (r) => r.fulfill(BOOM));
  for (const [role, a] of [["viewer", viewer], ["member with no app", member]]) {
    const t = await read(a, path, broke);
    rule(`first run, /home fails, ${role}: no card, none of its sentences`, !FIRST_RUN.some((x) => t.includes(x)), FIRST_RUN.filter((x) => t.includes(x)));
  }
  // An owner in a workspace that isn't a sample and has a goal
  const lead = await acct("Dee Owner");
  const ws3 = (await call(lead.cookie, "POST", "/api/v2/workspaces", { name: "Real" })).id;
  const made = await call(lead.cookie, "POST", `/api/v2/workspaces/${ws3}/goals`, { title: "A real goal", level: "company" });
  rule("first run: the owner's workspace has a goal", !!made.id || !!made.goal?.id, made);
  const leadPath = `/app/w/${ws3}`;
  const down = await read(lead, leadPath, (p) => p.route(new RegExp(`/workspaces/${ws3}/home$`), (r) => r.fulfill(BOOM)));
  rule("first run, /home fails, owner outside a sample: no card, none of its sentences", !FIRST_RUN.some((x) => down.includes(x)), FIRST_RUN.filter((x) => down.includes(x)));
  const up = await read(lead, leadPath);
  rule("first run, real reads, owner with a goal: keeps the compact card", up.includes("Connect your agent"), up.slice(0, 200));

  const real = await read(member, path);
  rule("first run, real reads, member with no app: keeps the compact card", real.includes("Connect your agent"), real.slice(0, 200));
  const none = await read(viewer, path);
  rule("first run, real reads, viewer with goals: no card", !FIRST_RUN.some((x) => none.includes(x)), FIRST_RUN.filter((x) => none.includes(x)));
  const full = await read(people.owner, `/app/w/${ws2}`);
  rule("first run, real reads, owner with no goals: keeps the full card", full.includes("Connect one agent"), full.slice(0, 200));
  const empty = await read(people.viewer, `/app/w/${ws2}`);
  rule("first run, real reads, viewer with no goals: the one line", empty.includes("This workspace has no goals yet. A workspace owner or member sets them.") && !empty.includes("Set the first goal"), empty.slice(0, 200));
}

// Home's first second: an empty workspace never flashes the list or a count; a list with rows isn't held back.
{
  const watch = async (account, path, route) => {
    const ctx = await signedIn(account);
    await ctx.addInitScript(() => {
      window.__seen = { h1: [], listShown: false, rowsWithoutList: false };
      const tick = () => {
        const h = document.querySelector("main h1")?.innerText?.trim();
        if (h && window.__seen.h1.at(-1) !== h) window.__seen.h1.push(h);
        const shown = [...document.querySelectorAll("[data-needs], [data-needs-loading]")].some((e) => e.getClientRects().length > 0);
        if (shown) window.__seen.listShown = true;
        if (h && /^\d+ things? need/.test(h) && !shown) window.__seen.rowsWithoutList = true;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const page = await ctx.newPage();
    if (route) await route(page);
    await page.goto(BASE + path, { waitUntil: "commit" });
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    const seen = await page.evaluate(() => window.__seen);
    const text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
    await ctx.close();
    return { ...seen, text };
  };
  const empty = await watch(people.owner, `/app/w/${ws2}`);
  rule("Home, empty workspace: the list never shows", !empty.listShown, empty.h1);
  rule('Home, empty workspace: H1 never "Needs you" or "Nothing needs you"', !empty.h1.includes("Needs you") && !empty.h1.includes("Nothing needs you") && empty.h1.at(-1) === "No goals here yet", empty.h1);
  const rows = await watch(seed.accounts.owner, `/app/w/${WS}`);
  rule("Home, with rows: the list shows with its count", rows.listShown && !rows.rowsWithoutList && /^\d+ things? need/.test(rows.h1.at(-1) ?? ""), rows.h1);
  const down = await watch(seed.accounts.owner, `/app/w/${WS}`, (p) => p.route(new RegExp(`/workspaces/${WS}/home$`), (r) => r.fulfill(BOOM)));
  rule("Home, /home fails: the list or its couldn't-read line shows", down.listShown || /couldn't read/i.test(down.text), { h1: down.h1, text: down.text.slice(0, 160) });
  rule("Home, /home fails: the H1 settles", down.h1.at(-1) !== "Home", down.h1);
  const emptyDown = await watch(people.owner, `/app/w/${ws2}`, (p) => p.route(new RegExp(`/workspaces/${ws2}/home$`), (r) => r.fulfill(BOOM)));
  rule("Home, empty workspace, /home fails: not hidden for good", emptyDown.listShown || /couldn't read/i.test(emptyDown.text), { h1: emptyDown.h1, text: emptyDown.text.slice(0, 160) });
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
