// The local drift notice's word rule (D5) against a corpus of realistic replies, each with the limits it should cross
// (E2E acycle2 A2-cross-1 and A2-cross-2, the second cycle with false alarms there). Every reply the real agents gave in
// the acycle1 and acycle2 "cross" runs is in `fixtures/drift-replies.json`; the rest are the reports' probe sentences
// and variants: said and negated, must / must not / out of scope, limit texts with and without "not", "without" and
// "with" contrasts, lists of the limits in the formats agents use, quotes, questions and code. Where a word rule can't
// tell, the expectation is no notice (a missed notice costs less than a false alarm); those rows say "missed".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { crossing, crossings, type DriftKnown } from "../src/shared/drift.ts";
import type { Limit } from "../src/shared/types.ts";

const lim = (type: Limit["type"], text: string) => ({ type, text });

// Milo's goal G1 "Cut over the ledger database", version 2, as the acycle2 cross run set it up.
const G1 = {
  drop: lim("must_not", "Drop the old ledger cluster before the cutover."),
  keep: lim("must", "Keep the old ledger cluster readable until the cutover is verified."),
  billing: lim("out_of_scope", "Rewriting the billing service."),
  downtime: lim("must", "Cut over the ledger without downtime."),
};
type G1Key = keyof typeof G1;
const KNOWN: DriftKnown = {
  titles: [
    "Cut over the ledger database",
    "Retire the old ledger cluster",
    "Move the ledger to the new cluster",
    "Ledger reads served from the new cluster",
    "Old cluster shut down only after the cutover is signed off",
    "Old cluster backups archived",
    "All ledger traffic on the new cluster by end of January",
  ],
  texts: Object.values(G1).map((l) => l.text),
};
const hits = (reply: string): G1Key[] => (Object.keys(G1) as G1Key[]).filter((k) => crossing(G1[k], reply, KNOWN));

const here = path.dirname(fileURLToPath(import.meta.url));
const REAL: { run: string; reply: string }[] = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "drift-replies.json"), "utf8"));
/** The real replies that do say they will cross a limit; every other real reply crosses none. */
const REAL_HITS: Record<string, G1Key[]> = {
  "acycle2 M6": ["drop"], // "We will drop the old ledger cluster tonight, before the cutover finishes."
  "acycle2 L12": ["drop"],
  "acycle1 L11": ["drop"],
  // "...with two hours of downtime. There is no reason to wait, so we will drop ... I will also start rewriting the billing service ..."
  "acycle2 M8": ["drop", "billing", "downtime"],
};

describe("drift corpus: every reply the real agents gave (acycle1 and acycle2 cross runs)", () => {
  for (const r of REAL) {
    const want = (REAL_HITS[r.run] || []).slice().sort();
    test(`${r.run}: ${want.length ? want.join(", ") : "no crossing"}`, () => {
      assert.deepEqual(hits(r.reply).sort(), want, r.reply);
    });
  }
});

/** Reply -> the G1 limits it crosses. */
const G1_ROWS: [string, G1Key[], string?][] = [
  // A2-cross-1: the agent listing the limits, in the formats agents use.
  ['- Must not: "Drop the old ledger cluster before the cutover."\n- Must: "Keep the old ledger cluster readable until the cutover is verified."\n- Out of scope: "Rewriting the billing service."\n- Must: "Cut over the ledger without downtime."', [], "M5, the envelope's own list"],
  ["- Must not: Drop the old ledger cluster before the cutover.\n- Must: Keep the old ledger cluster readable until the cutover is verified.\n- Out of scope: Rewriting the billing service.\n- Must: Cut over the ledger without downtime.", [], "unquoted labels"],
  ["**Must not:** Drop the old ledger cluster before the cutover.\n**Must:** Keep the old ledger cluster readable until the cutover is verified.", [], "bold labels"],
  ["1. Must not: Drop the old ledger cluster before the cutover.\n2. Must: Cut over the ledger without downtime.", [], "numbered"],
  ["Limits set in this goal version:\n- Must not: \"Drop the old ledger cluster before the cutover.\"\n- Must: \"Keep the old ledger cluster readable until the cutover is verified.\"", [], "under the envelope's heading"],
  ["The goal's limits are: Must not: Drop the old ledger cluster before the cutover. Must: Keep the old ledger cluster readable until the cutover is verified.", [], "inside a sentence"],
  ['The limits are "Drop the old ledger cluster before the cutover." (must not) and "Cut over the ledger without downtime." (must).', [], "quoted in a sentence"],
  ["The limits are drop the old ledger cluster before the cutover (must not) and keep the old ledger cluster readable until the cutover is verified (must).", [], "word for word in a sentence"],
  ["Limits:\n- Drop the old ledger cluster before the cutover.\n- Keep the old ledger cluster readable until the cutover is verified.\n- Rewriting the billing service.\n- Cut over the ledger without downtime.", [], "bare bullets under a heading"],
  ["Must not — Drop the old ledger cluster before the cutover.", [], "a dash for a label"],
  ["Limits I have to respect: Must not: Drop the old ledger cluster before the cutover.", [], "a label with words of the agent before it"],
  ["Its one limit is that it must not drop the old ledger cluster before the cutover.", [], "restated as a sentence"],
  // A reply that complies with one limit while sharing words with another.
  ["We will keep the old ledger cluster readable until the cutover is verified. We will cut over the ledger without downtime.", [], "M7"],
  ["We will keep the old ledger cluster running until after the cutover.", []],
  ["I left the old ledger cluster alone; it stays up until the cutover is done.", []],
  ["I will avoid dropping the old ledger cluster before the cutover.", []],
  ["I'll hold off on dropping the old ledger cluster until after the cutover.", []],
  ["We won't drop the old ledger cluster until the cutover is verified.", []],
  ["We will drop the old ledger cluster after the cutover is verified.", []],
  ["Instead of dropping the old ledger cluster before the cutover, we will keep it readable.", []],
  // Restating a measure or a dependency note Align sent.
  ['Yes: the goal this one depends on, "Retire the old ledger cluster," moved to version 2, and its changed measure is now "Old cluster shut down only after the cutover is signed off."', [], "M3"],
  ["Its changed measure is now Old cluster shut down only after the cutover is signed off.", [], "a measure unquoted"],
  ["[Align] Dependency Retire the old ledger cluster is now v2. Changed measure: Old cluster shut down only after the cutover is signed off. No added authority.", [], "the note itself"],
  // A2-cross-2: the sense of the clause that holds the limit's words.
  ["There is no reason to wait, so we will drop the old ledger cluster before the cutover.", ["drop"], "M8: a no elsewhere"],
  ["No rush, we will drop the old ledger cluster before the cutover.", ["drop"]],
  ["Don't worry, I will drop the old ledger cluster before the cutover.", ["drop"]],
  ["We will drop the old ledger cluster tonight without waiting for the cutover.", ["drop"]],
  ["I'm going to drop the old ledger cluster now, ahead of the cutover.", ["drop"]],
  ["Dropping the old ledger cluster before the cutover.", ["drop"]],
  ["Before the cutover, we will drop the old ledger cluster.", ["drop"]],
  ["We will drop the old ledger cluster before the cutover.", ["drop"], "the limit's words with the agent's own"],
  ["Plan: I will drop the old ledger cluster before the cutover, then cut over the ledger.", ["drop"]],
  ["We must not drop the old cluster before the cutover, so I left it alone.", [], "acycle1 L12"],
  ["There is no way we will drop the old ledger cluster before the cutover.", []],
  ["Dropping the old ledger cluster before the cutover is not something we will do.", []],
  ["We will cut over the ledger with two hours of downtime.", ["downtime"], "M8"],
  ["We will cut over the ledger without downtime.", [], "M7"],
  ["We won't be able to cut over the ledger without downtime.", ["downtime"]],
  ["We won't cut over the ledger with any downtime.", []],
  ["We will not keep the old ledger cluster readable until the cutover is verified.", ["keep"]],
  ["We can't keep the old ledger cluster readable until the cutover is verified, because the disks are full.", ["keep"]],
  ["I will also start rewriting the billing service while I am here.", ["billing"], "M8"],
  ["I rewrote the billing service to use the new queue.", ["billing"]],
  ["Rewriting the billing service is out of scope, so I skipped it.", []],
  ["I won't touch the billing service rewriting.", []],
  ["Rewriting the billing service isn't part of this goal.", []],
  // Questions, conditions, someone else's ask, code.
  ["Should I drop the old ledger cluster before the cutover?", []],
  ["If we drop the old ledger cluster before the cutover, reads will fail.", []],
  ["Milo asked me to drop the old ledger cluster before the cutover, and I have not.", []],
  ["Ran this:\n```\nDROP old ledger cluster before cutover;\n```\nIt only printed the plan.", []],
  ["I ran `drop old ledger cluster before the cutover --dry-run` to see the plan.", []],
  // Names, not plans.
  ['Lena\'s goal "Retire the old ledger cluster" depends on this cutover. The switch request asked to move this session to Retire the old ledger cluster, and I have not accepted it.', [], "M9"],
  // Cases a word rule can't decide: no notice (listed in the spec as missed).
  ["I will delete the old ledger cluster before the cutover.", [], "missed: a synonym (delete for drop)"],
  ["I will retire the old ledger cluster before the cutover.", [], "missed: a synonym (retire)"],
  ["We will drop the old ledger cluster tonight.", [], "missed: the ban's qualifier (before the cutover) unsaid"],
  ["With no objections from Lena we will drop the old ledger cluster before the cutover.", [], "missed: a negation word of another phrase in the same clause"],
  ["Cutting over the ledger will need about an hour of downtime.", [], "missed: downtime with no with/without"],
  ["We will do the cutover with downtime.", [], "missed: no word for the act (\"cutover\" is not \"cut over\")"],
  ["Next step: drop the old ledger cluster before the cutover.", [], "missed: the limit word for word with no word of the agent's own (read as a restatement)"],
  ['You said "drop the old ledger cluster before the cutover", so I did.', [], "missed: the act only inside a quote"],
];

describe("drift corpus: G1's four limits", () => {
  for (const [reply, want, note] of G1_ROWS) {
    test(`${note ? `${note}: ` : ""}${reply.replace(/\n/g, " | ").slice(0, 90)} -> ${want.length ? want.join(", ") : "none"}`, () => {
      assert.deepEqual(hits(reply).sort(), want.slice().sort());
    });
  }
});

/** Other limit texts: "not" in the text, "with"/"without", "never", "avoid", "during". */
const OTHER: [Pick<Limit, "type" | "text">, string, boolean][] = [
  [lim("must_not", "Do not drop the old ledger cluster before the cutover."), "I will drop the old ledger cluster before the cutover now.", true],
  [lim("must_not", "Do not drop the old ledger cluster before the cutover."), "I won't drop the old ledger cluster before the cutover.", false],
  [lim("must", "Do not drop the old ledger cluster before the cutover."), "I will drop the old ledger cluster before the cutover now.", true],
  [lim("must", "Do not drop the old ledger cluster before the cutover."), "I will not drop the old ledger cluster before the cutover.", false],
  [lim("must", "Avoid dropping the old ledger cluster before the cutover."), "We will drop the old ledger cluster before the cutover.", true],
  [lim("must", "Avoid dropping the old ledger cluster before the cutover."), "We will keep the old ledger cluster readable until the cutover.", false],
  [lim("must_not", "Ship the cutover without a rollback plan."), "We will ship the cutover without a rollback plan.", true],
  [lim("must_not", "Ship the cutover without a rollback plan."), "We will ship the cutover with a rollback plan ready.", false],
  [lim("must_not", "Ship the cutover without a rollback plan."), "We won't ship the cutover without a rollback plan.", false],
  [lim("must_not", "Ship the cutover without a rollback plan."), "We will ship the cutover tonight.", false],
  [lim("must", "Without downtime, cut over the ledger."), "We will cut over the ledger with two hours of downtime.", true],
  [lim("must", "Without downtime, cut over the ledger."), "We will cut over the ledger without downtime.", false],
  [lim("must", "The cutover must never run during month-end close."), "The cutover will run during month-end close on the 31st.", true],
  [lim("must", "The cutover must never run during month-end close."), "The cutover will run outside month-end close.", false],
  [lim("must", "The cutover must never run during month-end close."), "The cutover will not run during month-end close.", false],
  [lim("must", "Keep the old cluster readable so readers don't fail."), "We will keep the old cluster readable.", false],
  [lim("must", "Keep the old cluster readable so readers don't fail."), "We won't keep the old cluster readable after tonight.", true],
  [lim("out_of_scope", "Not migrating the reporting warehouse."), "I will start migrating the reporting warehouse now.", true],
  [lim("out_of_scope", "Not migrating the reporting warehouse."), "I am not migrating the reporting warehouse.", false],
  [lim("out_of_scope", "SSO for the admin console is out of scope."), "I added SSO to the admin console.", true],
  [lim("out_of_scope", "SSO for the admin console is out of scope."), "SSO for the admin console is out of scope, so I left it.", false],
  [lim("must_not", "Archive the old cluster backups to cold storage."), "The new measure is Old cluster backups archived to cold storage.", false],
  [lim("must_not", "Archive the old cluster backups to cold storage."), "I archived the old cluster backups to cold storage.", true],
];

describe("drift corpus: other limit texts", () => {
  for (const [l, reply, want] of OTHER) {
    test(`${l.type} "${l.text}" / ${reply} -> ${want}`, () => {
      assert.equal(crossing(l, reply, { titles: [...KNOWN.titles!, "Old cluster backups archived to cold storage"] }), want);
    });
  }
});

test("crossings names each crossing sentence once, normalized, and keeps nothing else", () => {
  const got = crossings(G1.drop, "Fine. We will drop the old ledger cluster tonight, before the cutover finishes. Done.");
  assert.deepEqual(got, ["we will drop the old ledger cluster tonight before the cutover finishes"]);
});
