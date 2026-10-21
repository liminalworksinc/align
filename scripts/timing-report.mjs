#!/usr/bin/env node
// What Align measured vs what was estimated, kept separate. Quote this block in the video.
//   node scripts/timing-report.mjs [--json]
const ALIGN = process.env.ALIGN_URL || "http://localhost:3100";
// B1-6: signed out, /api/state carries only the sign-in labels, so read it as leadership.
const login = await fetch(`${ALIGN}/api/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ role: "leadership", passcode: process.env.ALIGN_LEADERSHIP_PASSCODE || "leadership-demo" }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((l) => l.split(";")[0]).join("; ");
if (login.status !== 200 || !cookie) {
  console.error(`sign-in as leadership failed: HTTP ${login.status}`);
  process.exit(1);
}
const s = await (await fetch(`${ALIGN}/api/state`, { headers: { cookie } })).json();
const t = s.timer ?? {};
const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, "0")} s` : `${Math.round(sec)} s`);
const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

const DECISIONS = new Set(["propose", "counter", "acknowledge", "ratify", "ratify_untested", "reject", "push_company_goal"]);
const touch = t.touchpoints ?? [];
const decisions = touch.filter((x) => DECISIONS.has(x.action));
const reviews = touch.filter((x) => !DECISIONS.has(x.action));
const elapsed = t.started_at && t.ended_at ? (Date.parse(t.ended_at) - Date.parse(t.started_at)) / 1000 : null;
const prep = (t.excluded_prep ?? []).reduce((a, p) => a + (p.seconds || 0), 0);
const manual = s.manual_baseline ?? [];
const manualMin = manual.reduce((a, m) => a + (m.est_minutes || 0), 0);
const people = [...new Set(decisions.map((d) => d.actor))];

const report = {
  measured: {
    elapsed_seconds: elapsed,
    started_at: t.started_at ?? null,
    ended_at: t.ended_at ?? null,
    human_decisions: decisions.length,
    people: people,
    reviews: reviews.length,
    touchpoints: touch.map((x) => ({ actor: x.actor, action: x.action, at: x.at })),
  },
  excluded_prep: { seconds: prep, runs: t.excluded_prep ?? [] },
  estimate: { minutes: manualMin, steps: manual, note: "operator-supplied estimate, not measured" },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log("ALIGN · TIME TO AGREEMENT");
console.log("");
console.log("MEASURED IN ALIGN (this session)");
if (elapsed === null) {
  console.log(`  not complete yet${t.started_at ? ` · started ${time(t.started_at)} · waiting for both owners to see the agreed version` : " · starts when someone views the company goal change"}`);
} else {
  console.log(`  ${fmt(elapsed)} from the company goal change being viewed (${time(t.started_at)}) to both owners seeing the agreed version (${time(t.ended_at)})`);
}
console.log(`  ${decisions.length} human decision(s) by ${people.length ? people.join(" + ") : "nobody yet"}; ${reviews.length} review step(s)`);
for (const x of touch) console.log(`    ${time(x.at)}  ${x.actor.padEnd(10)} ${x.action}`);
console.log("");
console.log("PREPARATION, NOT COUNTED ABOVE");
console.log(`  ${fmt(prep)} of Sparta test runs (${(t.excluded_prep ?? []).length} run(s)), done before the decision`);
console.log("");
console.log("ESTIMATED BY HAND (operator-supplied, not measured)");
console.log(`  ≈ ${manualMin} min across ${manual.length} steps`);
for (const m of manual) console.log(`    ${m.step}. ${m.description} · ≈${m.est_minutes} min`);
console.log("");
console.log("Say it as: measured elapsed time and the number of human decisions, next to an estimate. Not proven savings.");
