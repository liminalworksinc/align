// The local report (slice 3b): ranking (founder ruling Nov 24: the rule she keeps restating leads), what is sent, and
// the checks on the model's draft.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiscoveredRule } from "../src/local/discover.ts";
import type { Measures } from "../src/local/measures.ts";
import { localPayload, pickTarget, reportLines, standingMentions, verifyLocalDraft } from "../src/local/report.ts";

test("a rule already in the standing instructions needs a mechanism, and why may not claim outcome effects", () => {
  const t = pickTarget([verify], [])!;
  assert.equal(standingMentions(t, "## Verify before asserting\n- check status at the source\nunrelated"), 2);
  const text = { text: "Add a verification rule to the global instructions.", exact_text: "Verify before relying on anything.", where: "the global instructions file", why: "You stop restating it." };
  assert.ok(verifyLocalDraft(text, true).some((f) => /mechanism/.test(f)));
  const hook = { ...text, text: "Add a hook that blocks a done claim until a check runs.", exact_text: "A pre-send hook runs before the agent reports done and blocks it when no source was opened." };
  assert.deepEqual(verifyLocalDraft(hook, true), []);
  assert.ok(verifyLocalDraft({ ...hook, why: "More sessions get merged." }, true).some((f) => /outcomes/.test(f)));
});

const rule = (label: string, known: boolean, statements: number, sessions: number, laterBreaks = 0): DiscoveredRule =>
  ({ label, known, statements, sessions, laterBreaks, breakSessions: [] });
const verify = rule("verify before relying on it", true, 30, 14, 1);
const mine = rule("Don't edit .literate or", false, 4, 4);
const send = { rule: "no-unapproved-outbound", label: "don't send, post or push without a go", sessions: 3, laterBreaks: 2 } as unknown as Measures["rules"][number];

const m = {
  sessions: 36, corrections: 78, byCategory: { style: 0, facts: 5, redo: 33, scope: 16, other: 24 },
  cost: { minutes: 428, correctionsCounted: 78 }, rules: [send],
  byProject: [{ project: "align", sessions: 5, corrections: 8, perSession: 1.6 }], byWeek: [],
  outcomes: [{ outcome: "merged", sessions: 21, corrections: 49, perSession: 2.3 }, { outcome: "committed", sessions: 6, corrections: 25, perSession: 4.2 }],
} as unknown as Measures;

test("the most-restated code-labelled rule leads, above a risky rule broken twice", () => {
  const t = pickTarget([mine, verify], m.rules);
  assert.equal(t?.label, "verify before relying on it");
  assert.equal(t?.why, "restated");
});

test("with no restated rule, the riskiest broken rule leads (caught mistakes first)", () => {
  assert.equal(pickTarget([mine], m.rules)?.why, "broken_external");
  assert.equal(pickTarget([], []), null);
});

test("the payload carries no sentence in the person's own words", () => {
  const p = localPayload(m, [verify, mine], pickTarget([verify, mine], m.rules)!, "more goals, higher quality");
  assert.ok(!p.includes(".literate"));
  assert.equal(JSON.parse(p).other_restated_rules, 1);
});

test("report lines: restating is the cost, breaks are a floor, outcomes are an observation", () => {
  const lines = reportLines(m, [verify, mine], pickTarget([verify, mine], m.rules)).join("\n");
  assert.match(lines, /stated "verify before relying on it" 30 times across 14 sessions/);
  assert.match(lines, /at least 1/);
  assert.match(lines, /Observation, not a cause/);
});

test("the draft is checked: no numbers, opens with an action, changes the agent not the person", () => {
  const ok = { text: "Add a verification rule to the instructions every agent loads.", exact_text: "Before you state that something is done, sent or merged, check it at the source.", where: "the global instructions file", why: "You stop restating it and get more done." };
  assert.deepEqual(verifyLocalDraft(ok), []);
  assert.ok(verifyLocalDraft({ ...ok, why: "You restated it 30 times." }).some((f) => f.startsWith("R1")));
  assert.ok(verifyLocalDraft({ ...ok, text: "The agents forget it." }).some((f) => f.startsWith("R4")));
  assert.ok(verifyLocalDraft({ ...ok, text: "Be more specific when you correct." }).some((f) => f.startsWith("R7")));
});
