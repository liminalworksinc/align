// LIM-2472 workstream S: unit-style checks for the evidence facts EvidenceSummary renders.
//   node design/prototypes/lim-2472/s/evidence-facts.check.mjs [--seed <seed-agent out.json>]
// Fixed cases for the three seeded shapes (launched with a receipt, approved not launched, pending), then, with --seed,
// the same facts from a seeded Mode L server's real reads (signed in as its owner with the test password). Every fact
// is checked against the words no evidence may use. Exits 1 on any failure.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const lib = resolve("components/legacy-project-wrapper/implementation/app/app/_ui/ds/evidence-facts.mts");
const { changeFacts, goalFacts, FACT_WORD } = await import(pathToFileURL(lib).href);

// Claims about what an agent did or is, and "verified": Align never knows either from what it records.
const BANNED = /\b(followed|live|running|compliant|agents? (?:are |is )?on|applied|verified|is on v|has v\d)\b/i;
let failed = 0;
const say = (facts) => facts.map((f) => `${FACT_WORD[f.kind]} · ${f.short}`).join(" | ");
function expect(name, facts, firstKind, firstShort) {
  const bad = facts.flatMap((f) => [f.short, f.long]).filter((t) => BANNED.test(t));
  const ok = facts[0]?.kind === firstKind && facts[0]?.short === firstShort && bad.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${say(facts)}${bad.length ? `  banned: ${bad.join(" / ")}` : ""}`);
  if (!ok) console.log(`     expected first: ${FACT_WORD[firstKind]} · ${firstShort}`);
  for (const f of facts) console.log(`       ${FACT_WORD[f.kind]}: ${f.long}`);
}

const ev = (reported_as) => ({ reported_as });
const rev = (revision, evidence) => ({ revision, evidence });

expect(
  "launched, received by its one session, sent to one app, one agent link",
  changeFacts({ revision: 1, revisions: [rev(1, [ev("agent-reported")])], launch: "launched", version: 2 }, { delivery: { sessions: 1, received: 1, applied: 1 }, apps: { everyone: true, items: [{ id: "a" }] } }),
  "receipt",
  "v2 · 1 of 1 received",
);
expect(
  "launched, sent to one session that hasn't sent a receipt",
  changeFacts({ revision: 1, revisions: [rev(1, [])], launch: "launched", version: 3 }, { delivery: { sessions: 1, received: 0, applied: 0 }, apps: { everyone: true, items: [] } }),
  "unobserved",
  "v3 · 0 of 1 received",
);
expect(
  "launched, nothing sent yet",
  changeFacts({ revision: 1, revisions: [rev(1, [ev("self-reported")])], launch: "launched", version: 2 }, { delivery: null, apps: { everyone: false, items: [] } }),
  "self",
  "1 link",
);
expect("approved, not launched, no links", changeFacts({ revision: 1, revisions: [rev(1, [])], launch: "pending", version: null }), "unobserved", "no links");
expect(
  "pending, two agent links and one self-reported on the current revision (an older revision's link not counted)",
  changeFacts({ revision: 2, revisions: [rev(1, [ev("agent-reported")]), rev(2, [ev("agent-reported"), ev("agent-reported"), ev("self-reported")])], launch: null, version: null }),
  "reported",
  "2 links",
);
// One app read the goals after both launches but Align served it only goal A's launched version (…/value per launched
// request, lib/oauth/grants.ts appsSentGoalVersion): goal B's fact must stay Not observed. An app's single last_read_at
// never stands in for which goal's version it was sent.
const A = goalFacts({ allocation: null }, { version: 2, value: { delivery: null, apps: { everyone: true, items: [{ id: "app1" }] } } });
const B = goalFacts({ allocation: null }, { version: 4, value: { delivery: null, apps: { everyone: true, items: [] } } });
expect("two goals, one app read: goal A (sent)", A, "receipt", "v2 · 1 app");
expect("two goals, one app read: goal B (not sent)", B, "unobserved", "v4 · not sent yet");
if (B.some((f) => f.kind === "receipt")) {
  failed++;
  console.log("FAIL goal B carries a receipt it has no read for");
}
// quiet (goal lines): no fact of pure absence, but a launched version's Not observed delivery stays.
const idle = { allocation: { target_share: null, share_7d: 0, gap_7d: null, held: false } };
const quietIdle = goalFacts(idle, null, { quiet: true });
if (quietIdle.length) failed++;
console.log(`${quietIdle.length ? "FAIL" : "ok  "} quiet goal with no agent time and nothing launched: ${say(quietIdle) || "(no facts)"}`);
expect("quiet goal, launched v2 not sent yet, no agent time", goalFacts(idle, { version: 2, value: { delivery: null, apps: { everyone: true, items: [] } } }, { quiet: true }), "unobserved", "v2 · not sent yet");
expect("quiet goal, launched v2, 0 of 2 received", goalFacts(idle, { version: 2, value: { delivery: { sessions: 2, received: 0, applied: 0 }, apps: { everyone: true, items: [] } } }, { quiet: true }), "unobserved", "v2 · 0 of 2 received");
expect("decision row keeps no links", changeFacts({ revision: 1, revisions: [rev(1, [])], launch: null, version: null }), "unobserved", "no links");
expect("goal with 35% agent time and nothing launched", goalFacts({ allocation: { target_share: 40, share_7d: 35, gap_7d: -5, held: false } }, null), "reported", "35% agent time");
expect("goal with no agent time", goalFacts({ allocation: { target_share: null, share_7d: 0, gap_7d: null, held: false } }, null), "unobserved", "no agent time");

const at = process.argv.indexOf("--seed");
if (at > 0) {
  const seed = JSON.parse(readFileSync(process.argv[at + 1], "utf8"));
  const base = seed.base;
  const r = await fetch(`${base}/api/v2/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: seed.accounts.owner.email, password: seed.accounts.owner.password }),
  });
  if (r.status !== 200) throw new Error(`seeded sign-in: ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const get = async (p) => {
    const res = await fetch(`${base}${p}`, { headers: { cookie } });
    return res.ok ? res.json() : null;
  };
  console.log(`\nSeeded server ${base} (the seed's requests as they stand now; earlier walks may have decided them):`);
  for (const [name, id] of Object.entries(seed.change_requests)) {
    const groups = await get(`/api/v2/workspaces/${seed.ws}/change-requests`);
    const cr = [...(groups.waiting_on_me ?? []), ...(groups.mine ?? []), ...(groups.others ?? [])].find((c) => c.id === id);
    if (!cr) {
      console.log(`  ${name}: not readable`);
      continue;
    }
    const value = cr.launch === "launched" ? await get(`/api/v2/workspaces/${seed.ws}/goals/${cr.goal.id}/change-requests/${cr.id}/value`) : undefined;
    const facts = changeFacts(cr, value);
    const bad = facts.flatMap((f) => [f.short, f.long]).filter((t) => BANNED.test(t));
    if (bad.length) failed++;
    console.log(`  ${bad.length ? "FAIL" : "ok  "} ${name} (now ${cr.state}${cr.launch ? `, launch ${cr.launch}` : ""}): ${say(facts)}`);
  }
  const feed = await get(`/api/v2/workspaces/${seed.ws}/goals`);
  for (const g of feed?.goals ?? []) {
    const approved = await get(`/api/v2/workspaces/${seed.ws}/goals/${g.id}/change-requests?state=approved`);
    const cr = (approved?.change_requests ?? []).filter((c) => c.launch === "launched" && c.version).sort((a, b) => b.version - a.version)[0];
    const value = cr ? await get(`/api/v2/workspaces/${seed.ws}/goals/${g.id}/change-requests/${cr.id}/value`) : null;
    const facts = goalFacts(g, cr ? { version: cr.version, value } : null);
    const bad = facts.flatMap((f) => [f.short, f.long]).filter((t) => BANNED.test(t));
    if (bad.length) failed++;
    console.log(`  ${bad.length ? "FAIL" : "ok  "} goal "${g.title}": ${say(facts) || "(no facts)"}`);
  }
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
