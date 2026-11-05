// LIM-2472 Home "Needs you" model check: seeds a workspace through the real API (the shared agent seed, then concept B's
// seed on top), makes the four reads the model uses as the owner, a member and a viewer, and prints each person's rows
// in ranked order with their phase, kind, cause, since (and its field), evidence counts and action.
//
//   node design/prototypes/lim-2472/b/needs-check.mts <BASE>
//
// BASE: a Mode L server started with ALIGN_TEST_IDP=1 and a fresh ALIGN_DATA_DIR. Exit 1 if a rule below fails.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNeeds, latestLaunches, rankNote, REQ_GOALS_MAX, SENT_GOALS_MAX, type Need } from "../../../../components/legacy-project-wrapper/implementation/app/app/_ui/home/needs.ts";
// @ts-expect-error plain .mjs seed
import { seed } from "./seed.mjs";

const BASE = (process.argv[2] ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("usage: node needs-check.mts <BASE>");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(path.join(os.tmpdir(), "lim2472-needs-"));
const out = path.join(tmp, "agent.json");
const sa = spawnSync(process.execPath, [path.join(here, "../s/seed-agent.mjs"), BASE, out], { encoding: "utf8" });
if (sa.status !== 0) {
  console.error(sa.stderr || sa.stdout);
  process.exit(1);
}
const agent = JSON.parse(readFileSync(out, "utf8"));
rmSync(tmp, { recursive: true, force: true });
const s = await seed(BASE, agent);

async function cookieFor(a: { email: string; password: string }) {
  const r = await fetch(`${BASE}/api/v2/auth/sign-in/email`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: a.email, password: a.password }) });
  if (!r.ok) throw new Error(`sign-in ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
async function get(cookie: string, p: string) {
  const r = await fetch(BASE + p, { headers: { cookie } });
  return r.ok ? r.json() : null;
}

let failed = 0;
const rule = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
};


const people: [string, { email: string; password: string; name: string }][] = [
  ["owner", agent.accounts.owner],
  ["member", agent.accounts.member],
  ["viewer", agent.accounts.viewer],
];
const W = `/api/v2/workspaces/${s.ws}`;
for (const [role, acct] of people) {
  const cookie = await cookieFor(acct);
  const me = (await get(cookie, "/api/v2/me"))?.user?.id;
  const cr = await get(cookie, `${W}/change-requests`);
  const asks = await get(cookie, `${W}/asks?state=open,accepted,done,declined`);
  const al = await get(cookie, `${W}/alignments`);
  const home = await get(cookie, `${W}/home`);
  // REQ: requests to agents on up to REQ_GOALS_MAX active goals, own goals first (as needs-list.tsx reads them).
  const goals = ((await get(cookie, `${W}/goals`))?.goals ?? []).filter((g: { status: string }) => g.status === "active");
  goals.sort((a: { owner: { id: string }; id: string }, b: { owner: { id: string }; id: string }) => Number(b.owner.id === me) - Number(a.owner.id === me) || a.id.localeCompare(b.id));
  const pick = goals.slice(0, REQ_GOALS_MAX);
  // SENT: the value read of the latest launch per goal, as needs-list.tsx reads it.
  const crs = cr ? [...cr.waiting_on_me, ...cr.mine, ...cr.others] : [];
  const launches = latestLaunches(crs).slice(0, SENT_GOALS_MAX);
  const sends = await Promise.all(launches.map(async (c) => ({ goal: { id: c.goal.id, title: c.goal.title }, cr: c.id, version: c.version!, launched_at: c.launch_decided_at!, current_version: c.goal.version, apps: (await get(cookie, `${W}/goals/${c.goal.id}/change-requests/${c.id}/value`))?.apps?.items ?? [] })));
  const reqs = (await Promise.all(pick.map(async (g: { id: string; title: string }) => ({ goal: { id: g.id, title: g.title }, requests: (await get(cookie, `${W}/goals/${g.id}/requests`))?.requests ?? [] }))));
  const { rows, unknown, notices } = buildNeeds({
    ws: s.ws,
    me,
    crs: cr ? [...cr.waiting_on_me, ...cr.mine, ...cr.others] : null,
    asks: asks?.asks ?? null,
    alignments: al ? [...al.waiting_on_me, ...al.mine, ...al.others] : null,
    apps: home?.apps?.items ?? null,
    requests: reqs,
    sends,
  });
  console.log(`rank note: ${rankNote(goals.length - pick.length)}`);
  console.log(`== ${role} (${acct.name}): ${rows.length} rows, ${notices.length} notice(s)${unknown.length ? `, unknown: ${unknown.join(", ")}` : ""}`);
  for (const n of notices) console.log(`  notice            ${n.kind} ${n.app.name} | connected by ${n.connected_by.name} | ${n.action.label}`);
  for (const r of rows) {
    const ev = Object.entries(r.evidence).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
    console.log(`  ${r.phase.padEnd(17)} ${r.kind.padEnd(10)} ${r.goal?.title ?? "(no goal)"} | ${r.cause} | since ${r.since ? `${r.since.at} (${r.since.field})` : "none"} | evidence: ${ev} | ${r.action ? `action: ${r.action.label} -> ${r.action.opens}` : r.who ?? "no action"}${r.review ? ` | ${r.review}` : ""}`);
  }
  const needs = rows.filter((r: Need) => r.phase === "needs_you");
  rule(`${role}: every Needs-you row has an action and a since`, needs.every((r) => r.action && r.since));
  rule(`${role}: no row outside Needs you has an action`, rows.filter((r) => r.phase !== "needs_you").every((r) => !r.action));
  const order = ["launch", "decide", "returned", "agent_declined", "team_ask", "alignment", "app_behind"];
  rule(`${role}: Needs you is in kind order, oldest first within a kind`, needs.every((r, i) => i === 0 || order.indexOf(needs[i - 1].kind) < order.indexOf(r.kind) || (needs[i - 1].kind === r.kind && (needs[i - 1].since?.at ?? "") <= (r.since?.at ?? ""))));
  if (role === "member") rule("member (seeded): the never-read app Theo connected is a notice, not a Needs-you row", needs.length === 0 && notices.length === 1 && notices[0]!.kind === "app_never_read");
  if (role === "viewer") rule("viewer: nothing needs a viewer (viewers can't act)", needs.length === 0);
  if (role === "owner") {
    rule("owner: at least one launch, one decision and one app row", ["launch", "decide", "app_behind"].every((k) => needs.some((r) => r.kind === k)));
    // seed-agent's app read the security goal after its launch; concept B's seed launched the audit goal afterwards.
    const appRows = rows.filter((r) => r.kind === "app_behind");
    rule("owner (seeded): no app row for the security goal, whose v2 Align sent the reading app", !appRows.some((r) => r.goal?.title === "Pass the security review" && /Claude Code/.test(r.cause)));
    rule("owner (seeded): an app row for the audit goal, launched after that app's read", appRows.some((r) => r.goal?.title === "Every release carries its audit evidence" && /not sent v2 to Claude Code/.test(r.cause)));
  }
  console.log("");
}
// ---- model rules on fixed inputs (no server): the audit's cases ----
const person = (id: string) => ({ id, name: id.toUpperCase() });
const crOf = (o: Record<string, unknown>) =>
  ({ id: "cr", goal: { id: "gA", title: "A", version: 2 }, state: "approved", revision: 1, base_version: 1, behind: false, requester: person("req"), changes: {}, reason: "r", revisions: [{ revision: 1, created_at: "2026-01-01T00:00:00Z", evidence: [] }], approvers: [person("me")], launchers: [person("me")], approved_by: person("me"), version: 2, launch: "launched", launch_decided_at: "2026-01-02T00:00:00Z", decided_at: "2026-01-02T00:00:00Z", can: {}, waiting_on_me: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", ...o }) as never;
const app = { id: "app1", name: "App", connected_by: person("me"), approved_at: "2026-01-01T00:00:00Z", last_used_at: "2026-01-05T00:00:00Z", last_read_at: "2026-01-05T00:00:00Z" };
const A = crOf({ id: "crA" });
const B = crOf({ id: "crB", goal: { id: "gB", title: "B", version: 2 }, launch_decided_at: "2026-01-03T00:00:00Z" });
const two = buildNeeds({ ws: "w", me: "me", crs: [A, B], asks: [], alignments: [], apps: [app], sends: [
  { goal: { id: "gA", title: "A" }, cr: "crA", version: 2, launched_at: "2026-01-02T00:00:00Z", apps: [{ id: "app1" }] },
  { goal: { id: "gB", title: "B" }, cr: "crB", version: 2, launched_at: "2026-01-03T00:00:00Z", apps: [] },
] }).rows.filter((r) => r.kind === "app_behind");
rule("model: an app that read only goal A after goal B launched keeps B's row and has none for A", two.some((r) => r.goal?.id === "gB") && !two.some((r) => r.goal?.id === "gA"));
rule("model: a not-sent row is one short sentence with one Not observed chip", two.every((r) => /^Align has not sent v\d+ to [^.;]+\.$/.test(r.cause) && r.evidence.not_observed === 1 && r.evidence.receipt === 0));
const fresh = buildNeeds({ ws: "w", me: "me", crs: [], asks: [], alignments: [], apps: [{ ...app, last_read_at: null }], sends: [] });
rule("model: an app Align has recorded no goal read from is a notice (See apps), never a row or a count", fresh.rows.length === 0 && fresh.notices.length === 1 && fresh.notices[0]!.action.label === "See apps");
const pend = crOf({ id: "crP", state: "pending", launch: null, version: null, launch_decided_at: null, decided_at: null, approved_by: null, updated_at: "2026-02-01T00:00:00Z", can: { approve: true }, waiting_on_me: true, revisions: [{ revision: 1, created_at: "2026-01-10T00:00:00Z", evidence: [] }] });
const p = buildNeeds({ ws: "w", me: "me", crs: [pend], asks: [], alignments: [], apps: [] }).rows[0]!;
rule("model: a decision waits from its latest revision, not from updated_at (adding evidence doesn't restart it)", p.since?.at === "2026-01-10T00:00:00Z");
const loop = crOf({ id: "crL", launch: "pending", version: null, launch_decided_at: null, dependency_loop: "A dependency it adds would close a loop.", can: {} });
const l = buildNeeds({ ws: "w", me: "me", crs: [loop], asks: [], alignments: [], apps: [] }).rows[0];
rule("model: an approved change that would close a dependency loop shows, waiting on nobody, with the reason", !!l && l.phase === "waiting_on_others" && /Nobody can launch/.test(l.who ?? ""));
const t1 = crOf({ id: "crT1", launch: "pending", version: null, launch_decided_at: null, decided_at: null, can: { launch: true } });
const t2 = crOf({ id: "crT2", goal: { id: "gB", title: "B", version: 1 }, launch: "pending", version: null, launch_decided_at: null, decided_at: "2026-01-04T00:00:00Z", can: { launch: true } });
const ord = buildNeeds({ ws: "w", me: "me", crs: [t1, t2], asks: [], alignments: [], apps: [] }).rows.filter((r) => r.kind === "launch").map((r) => r.key);
rule("model: a row with no recorded time sorts last within its kind", ord[0] === "cr:crT2" && ord[1] === "cr:crT1");
const dec = buildNeeds({ ws: "w", me: "me", crs: [], asks: [], alignments: [], apps: [], requests: [
  { goal: { id: "gA", title: "A" }, requests: [
    { id: "r1", type: "switch_goal", sender: person("me"), state: "answered", sessions: [{ session_key: "k1", owner: person("dev"), repo_alias: "web", harness: "claude-code", state: "declined", updated_at: "2026-01-06T00:00:00Z" }] },
    { id: "r2", type: "checkpoint", sender: person("other"), state: "answered", sessions: [{ session_key: "k2", owner: person("dev"), repo_alias: null, harness: "codex", state: "declined", updated_at: "2026-01-06T00:00:00Z" }] },
  ] },
] }).rows;
rule("model: my request a session declined is one Agent-reported row; someone else's request isn't mine to act on", dec.length === 1 && dec[0]!.kind === "agent_declined" && dec[0]!.evidence.agent_reported === 1 && /claude-code in web declined your switch goal request/.test(dec[0]!.cause) && !/blocked|stuck/i.test(dec[0]!.cause));
const newer = buildNeeds({ ws: "w", me: "me", crs: [], asks: [], alignments: [], apps: [app], sends: [{ goal: { id: "gA", title: "A" }, cr: "crA", version: 4, launched_at: "2026-01-02T00:00:00Z", apps: [], current_version: 5 }] }).rows.filter((r) => r.kind === "app_behind");
rule("model: when the goal has a newer version than the launch checked, the row names the current version", newer.length === 1 && /not sent v4/.test(newer[0]!.cause) && /now at v5/.test(newer[0]!.cause));

process.exitCode = failed ? 1 : 0;
