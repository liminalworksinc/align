// LIM-2472 workstream S: unit-style checks for the evidence facts EvidenceSummary renders.
//   node design/prototypes/lim-2472/s/evidence-facts.check.mjs [--seed <seed-agent out.json>]
// Fixed cases for the three seeded shapes (launched with a receipt, approved not launched, pending), then, with --seed,
// the same facts from a seeded Mode L server's real reads (signed in as its owner with the test password). Every fact
// is checked against the words no evidence may use. Exits 1 on any failure.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const lib = resolve("components/legacy-project-wrapper/implementation/app/app/_ui/ds/evidence-facts.mts");
const { changeFacts, deliveryStatement, goalFacts, hasEvidence, sentToLine, NOT_LOADED, FACT_WORD } = await import(pathToFileURL(lib).href);

// Claims about what an agent did or is, and "verified": Align never knows either from what it records.
const BANNED = /\b(followed|live|running|compliant|agents? (?:are |is )?on|applied|verified|released|is on v|has v\d)\b/i;
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
// Absences are not evidence: no links and no agent time give no chip; hasEvidence lets the consumer say so in words.
function none(name, facts, extra = true) {
  const ok = facts.length === 0 && extra;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${say(facts) || "(no facts)"}`);
}
const bare = { revision: 1, revisions: [rev(1, [])], launch: "pending", version: null };
none("approved, not launched, no links: no chip, hasEvidence false", changeFacts(bare), hasEvidence(bare) === false);
none("pending, no links: no chip", changeFacts({ ...bare, launch: null }));
none("a link on an older revision only: hasEvidence false", [], hasEvidence({ revision: 2, revisions: [rev(1, [ev("self-reported")]), rev(2, [])] }) === false);
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
expect("two goals, one app read: goal B (not sent)", B, "unobserved", "v4 · no session or app yet");
if (B.some((f) => f.kind === "receipt")) {
  failed++;
  console.log("FAIL goal B carries a receipt it has no read for");
}
// quiet (goal lines): no fact of pure absence, but a launched version's Not observed delivery stays.
const idle = { allocation: { target_share: null, share_7d: 0, gap_7d: null, held: false } };
const quietIdle = goalFacts(idle, null, { quiet: true });
if (quietIdle.length) failed++;
console.log(`${quietIdle.length ? "FAIL" : "ok  "} quiet goal with no agent time and nothing launched: ${say(quietIdle) || "(no facts)"}`);
expect("quiet goal, launched v2 to no session or app, no agent time", goalFacts(idle, { version: 2, value: { delivery: null, apps: { everyone: true, items: [] } } }, { quiet: true }), "unobserved", "v2 · no session or app yet");
expect("quiet goal, launched v2, 0 of 2 received", goalFacts(idle, { version: 2, value: { delivery: { sessions: 2, received: 0, applied: 0 }, apps: { everyone: true, items: [] } } }, { quiet: true }), "unobserved", "v2 · 0 of 2 received");
expect("launch that targeted no session, no app since", changeFacts({ revision: 1, revisions: [rev(1, [])], launch: "launched", version: 5 }, { delivery: { sessions: 0, received: 0, applied: 0 }, apps: { everyone: true, items: [] } }), "unobserved", "v5 · no session or app yet");
expect("launch that targeted no session, one app sent it", changeFacts({ revision: 1, revisions: [rev(1, [])], launch: "launched", version: 5 }, { delivery: null, apps: { everyone: true, items: [{ id: "a" }] } }), "receipt", "v5 · 1 app");
{
  const f = changeFacts({ revision: 1, revisions: [rev(1, [])], launch: "launched", version: 5 }, { delivery: null, apps: { everyone: true, items: [{ id: "a" }] } });
  const ok = f[1]?.kind === "unobserved" && f[1]?.short === "v5 · no session on this goal";
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ...and says no session on this goal: ${say(f)}`);
}
expect("goal with 35% agent time and nothing launched", goalFacts({ allocation: { target_share: 40, share_7d: 35, gap_7d: -5, held: false } }, null), "reported", "35% of reported agent time, 7 days");
none("goal with no agent time, not quiet: no fact", goalFacts({ allocation: { target_share: null, share_7d: 0, gap_7d: null, held: false } }, null));

// "I launched it. Did it reach them?": one sentence, counts only, never past "received", and a failed read said as one.
function says(name, text, want) {
  const ok = text === want && !BANNED.test(text);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} statement, ${name}: ${text}`);
  if (!ok) console.log(`     expected: ${want}`);
}
const app = (id, name) => ({ id, name });
says("1 of 2 received, one named app (owner)", deliveryStatement(3, { delivery: { sessions: 2, received: 1, applied: 1 }, apps: { everyone: true, items: [app("a", "Claude Code")] } }), "Align sent v3 to 2 sessions; 1 has sent a receipt. Claude Code was sent it when it read the goals.");
says("all received, no app (member)", deliveryStatement(3, { delivery: { sessions: 1, received: 1, applied: 0 }, apps: { everyone: false, items: [] } }), "Align sent v3 to 1 session; it has sent a receipt. None of your connected apps has been sent it in a goal read yet.");
says("none received, two apps (member)", deliveryStatement(2, { delivery: { sessions: 3, received: 0, applied: 0 }, apps: { everyone: false, items: [app("a", "Claude Code"), app("b", "Codex")] } }), "Align sent v2 to 3 sessions; none has sent a receipt yet. Your Claude Code and Codex were sent it when they read the goals.");
says("no session, no app", deliveryStatement(2, { delivery: null, apps: { everyone: true, items: [] } }), "No session was on this goal when v2 was launched. No connected app has been sent it in a goal read yet.");
says("the read failed", deliveryStatement(2, null), "Align couldn't read where v2 was sent. Reload to try again.");

// Work's "Align sent it to" row: loading says nothing yet, a failed read says it couldn't load, never "No app yet".
function line(name, got, want) {
  const ok = got === want && !/not read|No app yet/i.test(want === null ? "" : name.includes("empty") ? "" : String(got));
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} sent-to, ${name}: ${JSON.stringify(got)}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(want)}`);
}
line("loading", sentToLine({ loading: true, failed: false, apps: null }), null);
line("failed", sentToLine({ loading: false, failed: true, apps: null }), NOT_LOADED);
line("empty (a read that found none)", sentToLine({ loading: false, failed: false, apps: { everyone: true, items: [] } }), "No app yet. Align sends it when a connected app next reads the goals.");
line("non-empty, member", sentToLine({ loading: false, failed: false, apps: { everyone: false, items: [{ id: "a" }, { id: "b" }] } }), "2 connected apps (yours; owners see everyone's)");
if (/not read/i.test(NOT_LOADED)) (failed++, console.log(`FAIL NOT_LOADED says "not read": ${NOT_LOADED}`));

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
