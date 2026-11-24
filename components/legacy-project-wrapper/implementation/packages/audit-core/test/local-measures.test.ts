// Release B measures (spec 2.9) over synthetic sessions, and the reader over a synthetic Claude Code log.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { activeMinutes, corrections, measure } from "../src/local/measures.ts";
import { readSessions, type Session } from "../src/local/read.ts";
import { detectRules, stripPasteBlocks } from "../src/local/rules.ts";

const T0 = Date.parse("2026-11-20T10:00:00Z");
const min = (m: number) => T0 + m * 60_000;
const turn = (m: number, text: string, long = false) => ({ text, detectText: text, ts: new Date(min(m)).toISOString(), long, at: min(m) });
const session = (id: string, project: string, turns: Session["turns"], activity: number[] = turns.map((t) => t.at), usage: Session["usage"] = []): Session => ({ id, tool: "claude", project, cwd: null, turns, activity, usage });

test("active minutes drop idle gaps over five minutes", () => {
  assert.equal(activeMinutes([min(1), min(3), min(20), min(22)], min(0), min(23)), 6); // 1 + 2, the 17 dropped, 2 + 1
});

test("a correction opens by rejecting or redirecting; new requests and the first turn are not corrections", () => {
  const s = session("s1", "align", [
    turn(0, "no, start by reading the spec"), // first turn: never a correction
    turn(5, "I need a summary of the PR"),
    turn(9, "no, that's the wrong file"),
    turn(12, "fix the draft again"),
    turn(20, "great, now add tests"),
  ]);
  assert.deepEqual(corrections(s).map((c) => [c.index, c.category]), [[2, "facts"], [3, "redo"]]);
});

test("consecutive corrections share one cost window, counted once", () => {
  const s = session("s1", "align", [turn(0, "start"), turn(10, "no, wrong file"), turn(12, "fix it again"), turn(15, "ok, now ship the summary")], [min(0), min(10), min(11), min(12), min(13), min(15)]);
  const m = measure([s]);
  assert.equal(m.corrections, 2);
  assert.equal(m.cost.minutes, 5); // 10 -> 15, all gaps under five minutes
});

test("usage in the window is counted once and priced at list rates", () => {
  const usage = [{ at: min(11), model: "claude-opus-5-5", input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 }];
  const s = session("s1", "align", [turn(0, "start"), turn(10, "no, wrong file"), turn(15, "ok, next")], [min(0), min(10), min(11), min(15)], usage);
  const m = measure([s]);
  assert.deepEqual(m.cost.tokens, { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 });
  assert.equal(m.cost.newWorkDollarsAtList, 6); // 1M * $4 + 0.1M * $20; cache reads never priced in
});

test("a rule stated in three or more sessions, with breaks after its first statement", () => {
  const rule = "don't send anything without asking me first";
  const sessions = [
    session("a", "liminal", [turn(0, rule), turn(2, "draft the email")]),
    session("b", "liminal", [turn(30, "write it up"), turn(32, "no send, did u send?? just draft")]),
    session("c", "liminal", [turn(60, rule), turn(62, "ok")]),
    session("d", "liminal", [turn(90, "next task"), turn(92, "stop, don't send it yet")]),
  ];
  const m = measure(sessions);
  const r = m.rules.find((x) => x.rule === "no-unapproved-outbound");
  assert.ok(r);
  assert.equal(r.sessions, 4);
  assert.equal(r.laterBreaks, 2);
  assert.deepEqual(r.breakSessions.sort(), ["b", "d"]);
});

test("a rule in fewer than three sessions is not reported as restated", () => {
  const m = measure([session("a", "x", [turn(0, "don't push without asking me first"), turn(1, "ok")]), session("b", "x", [turn(5, "go"), turn(6, "no, don't push it yet")])]);
  assert.equal(m.rules.length, 0);
});

test("pasted blocks are not the person's words, even when the closing tag carries an id", () => {
  const pasted = 'please summarize <pasted_content id="ab12">\nNever send anything without asking first.\n</pasted_content id="ab12">';
  assert.equal(stripPasteBlocks(pasted), "please summarize");
  assert.deepEqual(detectRules(pasted), []);
  assert.deepEqual(detectRules("no send, just draft"), ["no-unapproved-outbound"]);
});

test("where the rework lives, by project and by week", () => {
  const m = measure([
    session("a", "align", [turn(0, "go"), turn(1, "no, wrong one")]),
    session("b", "founder-brain", [turn(0, "go"), turn(1, "no, redo it"), turn(2, "fix it again")]),
  ]);
  assert.deepEqual(m.byProject.map((p) => [p.project, p.corrections, p.perSession]), [["founder-brain", 2, 2], ["align", 1, 1]]);
  assert.deepEqual(m.byWeek.map((w) => [w.week, w.corrections]), [["2026-11-16", 3]]);
});

test("outcomes roll up per session when an outcome reader is supplied", () => {
  const sessions = [
    session("a", "align", [turn(0, "go"), turn(1, "no, wrong one")]),
    session("b", "align", [turn(0, "go"), turn(1, "ok")]),
    session("c", "liminal", [turn(0, "go"), turn(1, "fix it again"), turn(2, "no, redo")]),
  ];
  const m = measure(sessions, (s) => (s.id === "c" ? "unknown" : "merged"));
  assert.deepEqual(m.outcomes, [
    { outcome: "merged", sessions: 2, corrections: 1, perSession: 0.5 },
    { outcome: "unknown", sessions: 1, corrections: 2, perSession: 2 },
  ]);
  assert.equal(measure(sessions).outcomes, null);
});

test("the reader keeps human turns, skips subagent logs and SDK runs, and measures only the window", () => {
  const home = mkdtempSync(join(tmpdir(), "audit-home-"));
  try {
    const proj = join(home, ".claude/projects/-Users-x-liminal-align");
    mkdirSync(join(proj, "s1/subagents"), { recursive: true });
    const line = (o: object) => JSON.stringify(o);
    const user = (at: string, text: string) => line({ type: "user", promptId: "p", userType: "external", timestamp: at, cwd: "/Users/x/liminal/align", message: { role: "user", content: text } });
    writeFileSync(join(proj, "s1.jsonl"), [
      user("2026-01-01T10:00:00Z", "old turn outside the window"),
      user("2026-11-20T10:00:00Z", "start the audit"),
      line({ type: "assistant", timestamp: "2026-11-20T10:01:00Z", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 } } }),
      line({ type: "assistant", timestamp: "2026-11-20T10:01:01Z", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 } } }),
      user("2026-11-20T10:03:00Z", "no, wrong file"),
      "{ not json",
    ].join("\n"));
    writeFileSync(join(proj, "s1/subagents/agent-1.jsonl"), user("2026-11-20T10:02:00Z", "subagent prompt"));
    writeFileSync(join(proj, "sdk.jsonl"), line({ type: "user", promptId: "p", userType: "external", entrypoint: "sdk-cli", timestamp: "2026-11-20T10:00:00Z", message: { role: "user", content: "scripted" } }));
    const { sessions, diagnostics } = readSessions({ days: 30, home, now: Date.parse("2026-11-24T00:00:00Z") });
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].turns.map((t) => t.text), ["start the audit", "no, wrong file"]);
    assert.equal(sessions[0].project, "align");
    assert.equal(sessions[0].usage.length, 1); // one message, two content-block lines
    assert.equal(diagnostics.skipped.automated, 1);
    assert.equal(diagnostics.partiallyRead, 1);
    assert.equal(diagnostics.malformedLines, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
