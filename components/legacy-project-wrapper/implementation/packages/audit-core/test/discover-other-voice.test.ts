// Discovery on a different voice (coordinator note Nov 24): terse, different vocabulary, a non-coding agent (a
// support-reply agent). The habit families and rule shapes were tuned on one founder's logs; this records what they
// find on someone else, so the known limit is measured, not assumed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverRules } from "../src/local/discover.ts";
import type { Session } from "../src/local/read.ts";

const T0 = Date.parse("2026-11-20T10:00:00Z");
const s = (n: number, ...texts: string[]): Session => ({
  id: `v${n}`, tool: "claude", project: "support", cwd: null, touched: [], ownCommits: [],
  turns: texts.map((t, i) => ({ text: t, detectText: t, ts: "", long: false, at: T0 + (n * 100 + i) * 60_000 })),
  activity: [], usage: [],
});

// Terse operator of a customer-support reply agent: no coding words, no "verify", lots of shorthand.
const sessions = [
  s(1, "draft replies for the 12 open tickets", "never quote refund amounts in the reply", "pls no emojis"),
  s(2, "reply to the angry one first", "Never quote refund amounts. Ops does that.", "shorter"),
  s(3, "go thru the queue", "dont quote refund amounts!!", "ok good"),
  s(4, "tickets again", "always cc ops on billing ones", "no emojis pls"),
  s(5, "do the billing tickets", "always cc ops on billing tickets", "nope, you quoted a refund amount again"),
  s(6, "queue", "Always CC ops for billing.", "looks fine"),
];

test("a terse non-coding operator: what discovery finds", () => {
  const rules = discoverRules(sessions, (id, i) => id === "v5" && i === 2);
  const byLabel = Object.fromEntries(rules.map((r) => [r.label, r]));
  // Found: the prohibition stated in three sessions, with the later correction counted as a break.
  const refund = rules.find((r) => /refund/i.test(r.label));
  assert.ok(refund, `expected the refund rule, found: ${Object.keys(byLabel).join(" | ") || "nothing"}`);
  assert.equal(refund.sessions, 3);
  assert.equal(refund.laterBreaks, 1);
  // Known limit, recorded: "always cc ops on billing" (3 sessions) is found only if its wording overlaps enough;
  // "no emojis pls" (2 sessions, two words) is below the bar and is not found.
  const cc = rules.find((r) => /\bcc\b|ops/i.test(r.label));
  assert.ok(cc, "the always-cc rule should be found");
  assert.ok(!rules.some((r) => /emoji/i.test(r.label)), "two-word rules in two sessions are below the bar");
});
