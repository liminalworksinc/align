// R3 (founder ruling Nov 24: "caught mistakes first", ranked by how risky they are), minutes per run, and
// percentages with a referent (spec §2.6).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { computeNumbers, fill, normalizeRuns, parsePaste, verifyDraft, type Draft } from "../src/index.ts";

const audit = (name: string) => {
  const runs = normalizeRuns(parsePaste(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")).runs);
  return { runs, n: computeNumbers(runs) };
};
const base = (try_this: Draft["try_this"], why: Draft["why"]): Draft => ({ purpose: "An agent.", why, try_this, cannot_tell: [], how_you_will_know: "Compare changes per run, now {median_changes}." });

test("fixture 6 (the founder's dry run, anonymized): retry holds 19 of 46 changes, at least 40%", () => {
  const { n } = audit("fixture-6-founder-dryrun-anonymized.md");
  assert.equal(n.runs, 10);
  assert.equal(n.totalChanges, 46);
  assert.equal(n.top?.category, "retry");
  assert.equal(n.top?.count, 19);
  assert.equal(n.dominant, true);
});

test("fixture 6: the send mistake she caught outranks the retry category and the role drift with more runs", () => {
  const { runs, n } = audit("fixture-6-founder-dryrun-anonymized.md");
  const why: Draft["why"] = [
    { kind: "costs_time", category: "retry", claim: "{top_count} of {total_changes} changes asked for a redo.", runs: ["R3", "R5"], risk: null },
    { kind: "caught_by_person", claim: "It moved toward sending when only a draft was wanted.", runs: ["R4", "R5", "R9"], risk: "external" },
    { kind: "caught_by_person", claim: "It drifted from the role it was given.", runs: ["R3", "R5", "R6", "R10"], risk: "internal" },
  ];
  const guard = base({ text: "Add a rule that the agent drafts and waits for the word send before sending or acting.", category: null, addresses: "caught", finding: 1 }, why);
  assert.deepEqual(verifyDraft(guard, runs, n).failures, []);
  const drift = base({ ...guard.try_this, finding: 2 }, why);
  assert.ok(verifyDraft(drift, runs, n).failures.some((f) => f.includes("riskiest")));
  const retry = base({ text: "Ask what to change before redoing a draft.", category: "retry", addresses: "top_category", finding: null }, why);
  assert.ok(verifyDraft(retry, runs, n).failures.some((f) => f.includes("comes first")));
});

test("a send labelled internal is corrected to external", () => {
  const { runs, n } = audit("fixture-6-founder-dryrun-anonymized.md");
  const why: Draft["why"] = [
    { kind: "caught_by_person", claim: "It sent an email before approval.", runs: ["R4"], risk: "internal" },
    { kind: "working", claim: "Code reviews went well.", runs: ["R1"] },
  ];
  const d = base({ text: "Add a rule that it never sends without the word send.", category: null, addresses: "caught", finding: 0 }, why);
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.includes("risk is external")));
});

test("with equal risk, the caught finding with more runs wins", () => {
  const { runs, n } = audit("fixture-4-no-dominant.md");
  const why: Draft["why"] = [
    { kind: "caught_by_person", claim: "It cited the wrong source.", runs: ["R1", "R2"], risk: "internal" },
    { kind: "caught_by_person", claim: "It used the old template.", runs: ["R4", "R5", "R6"], risk: "internal" },
  ];
  assert.deepEqual(verifyDraft(base({ text: "Add the current template to its instructions.", category: null, addresses: "caught", finding: 1 }, why), runs, n).failures, []);
  assert.ok(verifyDraft(base({ text: "Add a source rule.", category: null, addresses: "caught", finding: 0 }, why), runs, n).failures.some((f) => f.includes("riskiest")));
});

test("no caught mistake: a category at 40% or more is addressed", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  const why: Draft["why"] = [
    { kind: "costs_time", category: "caption", claim: "{top_count} of {total_changes} changes were to the caption.", runs: ["R1"] },
    { kind: "working", claim: "Sources hold up.", runs: ["R2"] },
  ];
  assert.deepEqual(verifyDraft(base({ text: "Add a caption style rule.", category: "caption", addresses: "top_category", finding: null }, why), runs, n).failures, []);
});

test("coaching the person's feedback is refused while a change to the agent is available", () => {
  const { runs, n } = audit("fixture-4-no-dominant.md");
  const why: Draft["why"] = [
    { kind: "caught_by_person", claim: "It acted before it was asked to.", runs: ["R4", "R5"], risk: "internal" },
    { kind: "working", claim: "Summaries are short.", runs: ["R1"] },
  ];
  const d = base({ text: "Say what was wrong when you correct it, so the next audit can tell.", category: null, addresses: "caught", finding: 0 }, why);
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.startsWith("R7")));
});

test("nothing caught and nothing leads: no single change stands out", () => {
  const { runs, n } = audit("fixture-4-no-dominant.md");
  const why: Draft["why"] = [{ kind: "working", claim: "Runs are short.", runs: ["R1"] }, { kind: "working", claim: "Sources hold up.", runs: ["R2"] }];
  assert.deepEqual(verifyDraft(base({ text: "No single change stands out.", category: null, addresses: "none", finding: null }, why), runs, n).failures, []);
});

test("minutes per run is always reported; minutes per used run only when every run says whether it was used", () => {
  const six = audit("fixture-6-founder-dryrun-anonymized.md").n;
  assert.ok(six.minutesPerRun !== null && six.minutesPerRun > 0);
  assert.equal(six.minutesPerUsedRun, null);
  assert.equal(six.minutesPerUsedRunMissing, "10 of 10 runs do not say whether the result was used.");
  const one = audit("fixture-1-content-agent.md").n;
  assert.equal(one.minutesPerUsedRun, 24.5);
  assert.equal(one.minutesPerUsedRunMissing, null);
});

test("a percentage always says what it is a share of", () => {
  const { n } = audit("fixture-1-content-agent.md");
  assert.equal(fill("Captions took {top_share}.", n), "Captions took 62% of all changes.");
});
