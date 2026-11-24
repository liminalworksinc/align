// R7 (founder ruling Nov 24: "yes"): the recommendation always changes the agent, never the person.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { computeNumbers, normalizeRuns, parsePaste, verifyDraft, type Draft } from "../src/index.ts";

const audit = (name: string) => {
  const runs = normalizeRuns(parsePaste(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")).runs);
  return { runs, n: computeNumbers(runs) };
};
const draft = (try_this: Draft["try_this"], why: Draft["why"]): Draft => ({ purpose: "An agent.", why, try_this, cannot_tell: [], how_you_will_know: "Compare changes per run, now {median_changes}." });
const r7 = (d: Draft, name: string) => {
  const { runs, n } = audit(name);
  return verifyDraft(d, runs, n).failures.filter((f) => f.startsWith("R7"));
};

const captionWhy: Draft["why"] = [
  { kind: "costs_time", category: "caption", claim: "{top_count} of {total_changes} changes were to the caption.", runs: ["R1"] },
  { kind: "working", claim: "Sources hold up.", runs: ["R2"] },
];
const caughtWhy: Draft["why"] = [
  { kind: "caught_by_person", claim: "It moved toward sending when only a draft was wanted.", runs: ["R4", "R5"], risk: "external" },
  { kind: "working", claim: "Code reviews went well.", runs: ["R1"] },
];

test("person-subject recommendations are refused when a category leads", () => {
  for (const text of ["Give clearer feedback on the captions.", "Be more specific when you ask for caption changes.", "Label each correction with what was wrong."]) {
    assert.ok(r7(draft({ text, category: "caption", addresses: "top_category", finding: null }, captionWhy), "fixture-1-content-agent.md").length, text);
  }
});

test("person-subject recommendations are refused for a caught mistake too", () => {
  for (const text of ["Tell the agent exactly what is wrong before it acts.", "Write your requests so it knows not to send."]) {
    assert.ok(r7(draft({ text, category: null, addresses: "caught", finding: 0 }, caughtWhy), "fixture-6-founder-dryrun-anonymized.md").length, text);
  }
});

test("coaching hidden in exact_text is refused", () => {
  const d = draft({ text: "Add this line to the caption step.", exact_text: "Before redoing, the user should say what was wrong.", category: "caption", addresses: "top_category", finding: null }, captionWhy);
  assert.ok(r7(d, "fixture-1-content-agent.md").length, "an instruction that puts the work on the user is still coaching the person");
  const e = draft({ ...d.try_this, exact_text: "Be more specific in your corrections." }, captionWhy);
  assert.ok(r7(e, "fixture-1-content-agent.md").length);
  const agentSide = draft({ ...d.try_this, exact_text: "Before redoing a caption, state in one line what you will change." }, captionWhy);
  assert.equal(r7(agentSide, "fixture-1-content-agent.md").length, 0, "the agent-side version of the same fix passes");
});

test("agent changes pass: an instruction, a guard, a permission", () => {
  assert.equal(r7(draft({ text: "Add a caption style rule to the agent's instructions.", exact_text: "Keep captions to two sentences.", category: "caption", addresses: "top_category", finding: null }, captionWhy), "fixture-1-content-agent.md").length, 0);
  assert.equal(r7(draft({ text: "Add a rule that the agent drafts and waits for the word send before sending.", category: null, addresses: "caught", finding: 0 }, caughtWhy), "fixture-6-founder-dryrun-anonymized.md").length, 0);
  assert.equal(r7(draft({ text: "Remove the agent's permission to send email; let it save drafts only.", category: null, addresses: "caught", finding: 0 }, caughtWhy), "fixture-6-founder-dryrun-anonymized.md").length, 0);
});

test("nothing stands out: no recommendation, no exact text, no coaching fallback", () => {
  const why: Draft["why"] = [{ kind: "working", claim: "Runs are short.", runs: ["R1"] }, { kind: "working", claim: "Sources hold up.", runs: ["R2"] }];
  const ok = draft({ text: "No single change stands out.", exact_text: null, category: null, addresses: "none", finding: null }, why);
  const { runs, n } = audit("fixture-4-no-dominant.md");
  assert.deepEqual(verifyDraft(ok, runs, n).failures, []);
  const withText = draft({ ...ok.try_this, exact_text: "Add a note field." }, why);
  assert.ok(r7(withText, "fixture-4-no-dominant.md").length);
});
