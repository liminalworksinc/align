#!/usr/bin/env node
// LIM-2472 concept B: seed a fictional workspace through the real v2 API, so the decision desk has rows in every state.
// Needs a Mode L server started with ALIGN_TEST_IDP=1 (test accounts by email + password). Every write is an ordinary
// API call made as the person it names; nothing touches the database directly.
//
//   node design/prototypes/lim-2472/b/seed.mjs http://127.0.0.1:3802 [--on <seed-agent out.json>]
//
// With --on, it layers onto the workspace design/prototypes/lim-2472/s/seed-agent.mjs made (devices, bound sessions, a
// launched request with received and applied receipts, apps that connect and read): that workspace's owner plays Dana
// (the owner who decides), and the other people are invited into it. Without it, Dana and the workspace are new.
// Prints one JSON line: the workspace ids and each person's email and password, for shots.mjs and for signing in by hand.
// Each run makes new accounts (a run suffix in every email), so it can run again against the same server.

const BASE = (process.argv[2] || process.env.BASE || "").replace(/\/$/, "");

function cookieOf(setCookies) {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function call(base, method, path, { cookie, body } = {}) {
  const headers = { origin: base };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return { json, setCookies: res.headers.getSetCookie?.() ?? [] };
}

export async function seed(base, on = null) {
  const run = Date.now().toString(36);
  const people = {};
  const signIn = async (key, acct) => {
    const r = await call(base, "POST", "/api/v2/auth/sign-in/email", { body: { email: acct.email, password: acct.password } });
    people[key] = { id: r.json.user.id, name: acct.name, email: acct.email, password: acct.password, cookie: cookieOf(r.setCookies) };
    return people[key];
  };
  const signUp = async (key, name) => {
    const email = `${key}-${run}@fictional.test`;
    const password = `pw-${key}-${run}-fictional`;
    const r = await call(base, "POST", "/api/v2/auth/sign-up/email", { body: { name, email, password } });
    people[key] = { id: r.json.user.id, name, email, password, cookie: cookieOf(r.setCookies) };
    return people[key];
  };
  // Fictional people. Dana owns the workspace and is the person the screenshots sign in as.
  const dana = on ? await signIn("dana", on.accounts.owner) : await signUp("dana", "Dana Okafor");
  const rafi = await signUp("rafi", "Rafi Haddad");
  const mina = await signUp("mina", "Mina Torres");
  const theo = await signUp("theo", "Jun Okada");
  const vic = await signUp("vic", "Vic Moreau");
  const eli = await signUp("eli", "Eli Brandt");

  const as = (p) => (method, path, body) => call(base, method, path, { cookie: p.cookie, body }).then((r) => r.json);
  const D = as(dana);

  const ws = on ? on.ws : (await D("POST", "/api/v2/workspaces", { name: "Kestrel Works (fictional)" })).id;
  const W = `/api/v2/workspaces/${ws}`;
  for (const [p, role] of [
    [rafi, "member"],
    [mina, "member"],
    [theo, "member"],
    [vic, "viewer"],
  ]) {
    const inv = await D("POST", `${W}/invites`, { email: p.email, role });
    await as(p)("POST", `/api/v2/invites/${inv.token}/accept`, {});
  }
  const product = (await D("POST", `${W}/teams`, { name: "Reviews" })).id;
  const platform = (await D("POST", `${W}/teams`, { name: "Platform" })).id;
  await D("POST", `${W}/teams/${product}/members`, { user_id: mina.id, role: "lead" });
  await D("POST", `${W}/teams/${product}/members`, { user_id: theo.id, role: "member" });
  await D("POST", `${W}/teams/${platform}/members`, { user_id: rafi.id, role: "lead" });

  const goal = (p, body) => as(p)("POST", `${W}/goals`, { visibility: "workspace", ...body });
  const gOnboard = await goal(dana, { title: "New customers reach a first approved plan in one day", level: "company", measures: [{ text: "Median time to first approved plan", target: "1 day" }] });
  const gAudit = await goal(dana, { title: "Every release carries its audit evidence", level: "company", measures: [{ text: "Releases with linked evidence", target: "100%" }] });
  const gPilot = await goal(dana, { title: "Partner pilot ready for review", level: "company", measures: [{ text: "Pilot partners signed", target: "3" }] });
  const gQueue = await goal(mina, { title: "Reviewer queue under 48 hours", visibility: "team", team_id: product, measures: [{ text: "Median review wait", target: "48h" }] });
  const gDocs = await goal(mina, { title: "Docs answer the top ten setup questions", measures: [{ text: "Setup questions answered in docs", target: "10" }] });
  const gCi = await goal(rafi, { title: "CI under ten minutes", measures: [{ text: "p50 CI time", target: "10m" }] });

  const cr = (p, g, changes, reason) => as(p)("POST", `${W}/goals/${g.id}/change-requests`, { base_version: g.version, changes, reason });
  const act = (p, g, c, action, body) => as(p)("POST", `${W}/goals/${g.id}/change-requests/${c.id}/${action}`, body);
  const evidence = (p, g, c, e) => as(p)("POST", `${W}/goals/${g.id}/change-requests/${c.id}/evidence`, { revision: 1, ...e });

  // 1. Waiting on Dana: Rafi asks to add a measure to Dana's onboarding goal, with two evidence links.
  const c1 = await cr(rafi, gOnboard, { measures: [...gOnboard.measures, { text: "Setup steps a new customer repeats", target: "0" }] }, "Two pilot teams redid setup twice last week; tracking it makes the one-day goal honest.");
  await evidence(rafi, gOnboard, c1, { kind: "pr", url: "https://example.test/kestrel/web/pull/412", label: "Setup retry logging (fictional)" });
  await evidence(rafi, gOnboard, c1, { kind: "dashboard", url: "https://example.test/kestrel/dash/setup", label: "Setup funnel (fictional)" });

  // 2. Approved, not launched, waiting on Dana to launch: Mina's change to the pilot goal, approved only.
  const c2 = await cr(mina, gPilot, { title: "Partner pilot ready for review with two signed partners", measures: [{ ...gPilot.measures[0], target: "2" }] }, "Two partners is what legal can review this quarter.");
  await act(dana, gPilot, c2, "approve", { revision: 1, note: "Approved; launching after the partner call." });

  // 3. Waiting on Mina (others, for Dana): Theo asks to change Mina's queue goal.
  await cr(theo, gQueue, { measures: [{ ...gQueue.measures[0], target: "36h" }] }, "The audit team needs a tighter window before the quarterly review.");

  // 4. Dana's own request, waiting on Mina.
  await cr(dana, gDocs, { title: "Docs answer the top fifteen setup questions", measures: [{ ...gDocs.measures[0], target: "15" }] }, "Support logged five more repeat questions this month.");

  // 5. Launched: Rafi's change to the audit goal, approved and launched by Dana in one step.
  const c5 = await cr(rafi, gAudit, { measures: [...gAudit.measures, { text: "Approvals recorded with a reviewer note", target: "100%" }] }, "Reviewers asked to see why each approval was given.");
  await evidence(rafi, gAudit, c5, { kind: "doc", url: "https://example.test/kestrel/docs/review-notes", label: "Reviewer notes proposal (fictional)" });
  await act(dana, gAudit, c5, "approve_and_launch", { revision: 1, note: null });
  // 5b. A second request with evidence waiting on Dana (the audit goal, now at v2), so the Desk's one-click "Approve only"
  // has two eligible rows (two clicks in one tick can be tried on different rows).
  const audit2 = (await as(mina)("GET", `${W}/goals/${gAudit.id}`)).goal;
  const c5b = await cr(mina, audit2, { title: "Every release carries its audit evidence and a named reviewer" }, "Auditors want a name on each release review.");
  await evidence(mina, audit2, c5b, { kind: "doc", url: "https://example.test/kestrel/docs/named-reviewer", label: "Named reviewer note (fictional)" });

  // 6. Declined: Theo's request on the onboarding goal.
  const c6 = await cr(theo, gOnboard, { title: "New customers reach a first approved plan in one hour" }, "One hour would make a stronger launch story.");
  await act(dana, gOnboard, c6, "reject", { revision: 1, reason: "One hour isn't something we can measure yet." });

  // 7. Countered, waiting on Theo: Rafi suggests a different target on his CI goal.
  const c7 = await cr(theo, gCi, { measures: [{ ...gCi.measures[0], target: "5m" }] }, "Five-minute CI would let the product team ship twice a day.");
  await act(rafi, gCi, c7, "counter", { revision: 1, changes: { measures: [{ ...gCi.measures[0], target: "8m" }] }, note: "Eight minutes is reachable this quarter; five needs new runners." });

  // A clean person with an empty workspace, for the first-run screens.
  const empty = (await as(eli)("POST", "/api/v2/workspaces", { name: "Eli's workspace" })).id;
  // The fictional sample workspace, for the first-run "explore a sample" path.
  const sample = (await as(eli)("POST", "/api/v2/workspaces/sample", {})).id;

  const out = { base, ws, empty, sample, layered: !!on, agent_accounts: on?.accounts ?? null, people: Object.fromEntries(Object.entries(people).map(([k, p]) => [k, { id: p.id, name: p.name, email: p.email, password: p.password }])) };
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--on");
  const on = i > 0 ? JSON.parse((await import("node:fs")).readFileSync(process.argv[i + 1], "utf8")) : null;
  if (!BASE || BASE === "--on") {
    console.error("usage: node seed.mjs <base url, e.g. http://127.0.0.1:3802>");
    process.exit(2);
  }
  seed(BASE, on).then(
    (o) => console.log(JSON.stringify(o)),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
