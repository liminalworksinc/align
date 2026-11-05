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
import { buildNeeds, RANK_NOTE, type Need } from "../../../../components/legacy-project-wrapper/implementation/app/app/_ui/home/needs.ts";
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

console.log(`rank note: ${RANK_NOTE}\n`);
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
  const { rows, unknown } = buildNeeds({
    ws: s.ws,
    me,
    crs: cr ? [...cr.waiting_on_me, ...cr.mine, ...cr.others] : null,
    asks: asks?.asks ?? null,
    alignments: al ? [...al.waiting_on_me, ...al.mine, ...al.others] : null,
    apps: home?.apps?.items ?? null,
  });
  console.log(`== ${role} (${acct.name}): ${rows.length} rows${unknown.length ? `, unknown: ${unknown.join(", ")}` : ""}`);
  for (const r of rows) {
    const ev = Object.entries(r.evidence).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
    console.log(`  ${r.phase.padEnd(17)} ${r.kind.padEnd(10)} ${r.goal?.title ?? "(no goal)"} | ${r.cause} | since ${r.since ? `${r.since.at} (${r.since.field})` : "none"} | evidence: ${ev} | ${r.action ? `action: ${r.action.label} -> ${r.action.opens}` : r.who ?? "no action"}${r.review ? ` | ${r.review}` : ""}`);
  }
  const needs = rows.filter((r: Need) => r.phase === "needs_you");
  rule(`${role}: every Needs-you row has an action and a since`, needs.every((r) => r.action && r.since));
  rule(`${role}: no row outside Needs you has an action`, rows.filter((r) => r.phase !== "needs_you").every((r) => !r.action));
  const order = ["launch", "decide", "returned", "team_ask", "alignment", "app_behind"];
  rule(`${role}: Needs you is in kind order, oldest first within a kind`, needs.every((r, i) => i === 0 || order.indexOf(needs[i - 1].kind) < order.indexOf(r.kind) || (needs[i - 1].kind === r.kind && (needs[i - 1].since?.at ?? "") <= (r.since?.at ?? ""))));
  if (role === "viewer") rule("viewer: nothing needs a viewer (viewers can't act)", needs.length === 0);
  if (role === "owner") rule("owner: at least one launch, one decision and one app row", ["launch", "decide", "app_behind"].every((k) => needs.some((r) => r.kind === k)));
  console.log("");
}
process.exitCode = failed ? 1 : 0;
