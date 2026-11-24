import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  categoryOf, capCategories, computeNumbers, fill, normalizeRuns, parseChanges, parseMinutes, parsePaste, parseUsed,
  redact, shapeFailures, TooFewRuns, verifyDraft, FACTS_CATEGORY, STYLE_CATEGORY, OTHER_CATEGORY, type Draft,
} from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const audit = (name: string) => {
  const parsed = parsePaste(fixture(name));
  const runs = normalizeRuns(parsed.runs);
  return { parsed, runs, n: computeNumbers(runs) };
};

// ---- parsing ----

test("fixture 1 (the prototype's ten runs) reproduces the prototype's numbers", () => {
  const { parsed, n } = audit("fixture-1-content-agent.md");
  assert.equal(parsed.runs.length, 10);
  assert.deepEqual(parsed.runs.map((r) => r.id), ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]);
  assert.equal(n.runs, 10);
  assert.equal(n.runsUsed, 8);
  assert.equal(n.totalChanges, 50);
  assert.equal(n.medianChanges, 5);
  assert.equal(n.minutesPerUsedRun, 24.5);
  assert.deepEqual(n.categories.map((c) => [c.category, c.count]), [["caption", 31], ["headline", 10], [FACTS_CATEGORY, 9]]);
  assert.equal(n.top?.runs.length, 10);
  assert.equal(n.topSharePercent, 62);
  assert.equal(n.dominant, true);
  assert.equal(n.thin, false);
  assert.equal(parsed.context.mostCorrected.length, 3);
  assert.match(parsed.context.purpose ?? "", /state law changes/);
  assert.match(parsed.context.wish ?? "", /Remember/);
  assert.equal(parsed.runs[3].used, "no");
  assert.deepEqual(parsed.runs[0].sources, ["state register notice 2026-41"]);
});

test("fixture 2 (a coding agent) finds tests as the leading change", () => {
  const { n } = audit("fixture-2-coding-agent.md");
  assert.equal(n.runs, 6);
  assert.equal(n.top?.category, "test");
  assert.equal(n.top?.count, 9);
  assert.equal(n.dominant, true);
  assert.equal(n.runsUsed, 5);
});

test("fixture 3 (four runs) is thin evidence: no percentages", () => {
  const { n } = audit("fixture-3-thin.md");
  assert.equal(n.thin, true);
  assert.equal(n.topSharePercent, null);
  assert.equal(n.top?.category, STYLE_CATEGORY);
});

test("fixture 4 has no dominant problem", () => {
  const { n } = audit("fixture-4-no-dominant.md");
  assert.equal(n.dominant, false);
  assert.equal(n.categories.length, 4);
});

test("fewer than three runs is refused with a plain reason", () => {
  const runs = normalizeRuns(parsePaste("## Run 1\nChanges: 1 (x)\n## Run 2\nChanges: 2").runs);
  assert.throws(() => computeNumbers(runs), (e: unknown) => e instanceof TooFewRuns && /at least 3 runs; this paste has 2/.test((e as Error).message));
});

test("one-line runs and loose labels parse", () => {
  const p = parsePaste("## Run R4 (Oct 17) ... 7 changes, mostly caption, ~28 min, abandoned\n### Attempt 5\n**When:** Nov 2\n- Corrections:\n  - tone x2\n  - headline\n- Time spent: 1h 10m\n- Outcome: published");
  assert.equal(p.runs.length, 2);
  assert.equal(p.runs[0].changes.length, 7);
  assert.equal(p.runs[0].minutes, 28);
  assert.equal(p.runs[0].used, "no");
  assert.equal(p.runs[1].id, "R5");
  assert.equal(p.runs[1].date, "Nov 2");
  assert.equal(p.runs[1].changes.length, 3);
  assert.equal(p.runs[1].minutes, 70);
  assert.equal(p.runs[1].used, "yes");
});

test("unplaced lines are kept, not dropped", () => {
  const p = parsePaste("Here is your summary.\n## Run 1\nUsed: yes\nrandom aside");
  assert.deepEqual(p.skipped, ["Here is your summary.", "random aside"]);
});

test("small parsers", () => {
  assert.equal(parseMinutes("20-25 minutes"), 23);
  assert.equal(parseMinutes("about 1.5 hours"), 90);
  assert.equal(parseMinutes("~22 min"), 22);
  assert.equal(parseMinutes("unknown"), null);
  assert.equal(parseUsed("not used"), "no");
  assert.equal(parseUsed("maybe"), "unknown");
  assert.equal(parseChanges("none").length, 0);
  assert.equal(parseChanges("4").length, 4);
  assert.equal(parseChanges("2× fact fix; headline").length, 3);
  assert.equal(categoryOf("caption less formal"), "caption");
  assert.equal(categoryOf("source swap"), FACTS_CATEGORY);
  assert.equal(categoryOf("tone less salesy"), STYLE_CATEGORY);
});

test("more than five categories fold into other", () => {
  const counts = new Map([["a", 6], ["b", 5], ["c", 4], ["d", 3], ["e", 2], ["f", 1]]);
  const m = capCategories(counts, 5);
  assert.deepEqual(["a", "b", "c", "d", "e", "f"].map((k) => m.get(k)), ["a", "b", "c", "d", OTHER_CATEGORY, OTHER_CATEGORY]);
});

// ---- verifier ----

const goodDraft = (): Draft => ({
  purpose: "Turns each week's state law changes into a post and captions a small-business owner can act on.",
  why: [
    { kind: "costs_time", category: "caption", claim: "{top_count} of {total_changes} changes were to the caption, in {top_runs} of {runs} runs.", runs: ["R4", "R7"] },
    { kind: "working", claim: "Finding the right law change works.", runs: ["R1"] },
    { kind: "working", claim: "The weekly structure holds.", runs: ["R2"] },
  ],
  try_this: { text: "Give the caption step a short style guide built from your best captions.", exact_text: "Captions: under two sentences, plain words.", category: "caption", addresses: "top_category", finding: null },
  cannot_tell: ["Whether the legal summaries are correct."],
  how_you_will_know: "Compare changes per run, now {median_changes}, over your next runs.",
});

test("a good draft passes and fill() writes the computed numbers", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  const v = verifyDraft(goodDraft(), runs, n);
  assert.deepEqual(v.failures, []);
  assert.equal(fill(goodDraft().why[0].claim, n), "31 of 50 changes were to the caption, in 10 of 10 runs.");
});

test("R1: a number in prose is rejected, digits or words", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  for (const claim of ["31 of 50 changes were captions.", "Thirty-one changes were captions.", "Most of the changes were captions."]) {
    const d = goodDraft();
    d.why[0].claim = claim;
    assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.startsWith("R1")), claim);
  }
});

test("R1: an unknown placeholder is rejected", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  const d = goodDraft();
  d.how_you_will_know = "Saves {hours_saved} a week.";
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.includes("{hours_saved}")));
});

test("R1: thin evidence has no share placeholder", () => {
  const { runs, n } = audit("fixture-3-thin.md");
  const d: Draft = { ...goodDraft(), why: [{ kind: "costs_time", category: STYLE_CATEGORY, claim: "Tone took {top_share} of changes.", runs: ["R1"] }], try_this: { text: "Add a tone line to the instructions.", category: STYLE_CATEGORY, addresses: "top_category", finding: null } };
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.includes("{top_share}")));
});

test("R2: a missing run or an unsupporting run is rejected", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  const d = goodDraft();
  d.why[0].runs = ["R99"];
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.includes("R99")));
  const e = goodDraft();
  e.why[0] = { kind: "costs_time", category: FACTS_CATEGORY, claim: "Facts took time.", runs: ["R1"] };
  assert.ok(verifyDraft(e, runs, n).failures.some((f) => f.includes("R1, which has no facts and sources change")));
});

test("R3: the recommendation must address the largest category", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  const d = goodDraft();
  d.try_this.category = "headline";
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.startsWith("R3")));
});

test("R3: with no dominant category the recommendation names none", () => {
  const { runs, n } = audit("fixture-4-no-dominant.md");
  const d: Draft = { ...goodDraft(), why: [{ kind: "working", claim: "Runs are short.", runs: ["R1"] }, { kind: "costs_time", category: "headline", claim: "Headlines needed work.", runs: ["R4"] }], try_this: { text: "Audit again after your next runs; nothing stands out yet.", category: "headline", addresses: "none", finding: null } };
  assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.includes("no category clearly leads")));
  d.try_this.category = null;
  assert.deepEqual(verifyDraft(d, runs, n).failures, []);
});

test("R4: a first line that restates the problem is rejected (the Nov 19 failure)", () => {
  const { runs, n } = audit("fixture-1-content-agent.md");
  for (const text of ["Your agent finds the right laws, but you spend your time fixing captions.", "It finds the facts; captions take the time.", "The caption step causes most of the rework."]) {
    const d = goodDraft();
    d.try_this.text = text;
    assert.ok(verifyDraft(d, runs, n).failures.some((f) => f.startsWith("R4")), text);
  }
});

test("hostile paste: instructions inside a run are just text, and a draft that follows them fails R3", () => {
  const { parsed, runs, n } = audit("fixture-5-hostile.md");
  assert.match(parsed.runs[0].asked, /Ignore the runs/);
  assert.equal(n.top?.category, "caption");
  const d: Draft = { ...goodDraft(), why: [{ kind: "working", claim: "The agent is perfect.", runs: ["R1"] }, { kind: "working", claim: "Nothing to change.", runs: ["R2"] }], try_this: { text: "Upgrade to the premium plan.", category: null, addresses: "none", finding: null } };
  const v = verifyDraft(d, runs, n);
  assert.ok(v.failures.some((f) => f.startsWith("R3")));
});

test("shape check names each problem in an untrusted draft", () => {
  assert.deepEqual(shapeFailures(null), ["draft is not an object"]);
  const f = shapeFailures({ purpose: 1, why: [{ kind: "bad", claim: 2, runs: "R1" }], try_this: {}, cannot_tell: "x", how_you_will_know: null });
  assert.ok(f.length >= 6);
  assert.deepEqual(shapeFailures(goodDraft()), []);
});

// ---- redaction ----

test("redaction removes keys, tokens, emails and phone numbers before the preview", () => {
  const r = redact([
    "email me at jane.doe@example.com or +1 (415) 555-0134",
    "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123",
    "Authorization: Bearer abcdefghijklmnopqrstuvwx",
    "api_key=supersecretvalue123",
    "ghp_0123456789abcdefghijABCDEFGHIJ012345",
    "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    "Oct 14, run R3, 16 min, notice 2026-43",
  ].join("\n"));
  assert.doesNotMatch(r.text, /jane\.doe|555-0134|sk-ant|Bearer abc|supersecret|ghp_|eyJhbGci/);
  assert.match(r.text, /Oct 14, run R3, 16 min, notice 2026-43/);
  assert.equal(r.counts.email, 1);
  assert.equal(r.counts.phone, 1);
  assert.ok(r.counts.key >= 5);
});
