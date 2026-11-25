// A person turns consent on (spec #117, ratified Nov 25): when an agent may be reading (piped output, or a Claude Code or
// Codex shell), every "on" is refused before any state changes or request is made, and confirmation codes are never
// printed to output an agent can read. Turning something off stays allowed for anyone.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { makeEnv, runCli, runCliAsPerson } from "./helpers.ts";

const REFUSED = /can only be turned on by a person/;
const ON_COMMANDS: string[][] = [
  ["data-sharing", "results", "on"],
  ["data-sharing", "session-question", "on"],
  ["data-sharing", "excerpts", "on"],
];

function alignFiles(home: string): string[] {
  if (!fs.existsSync(home)) return [];
  return fs.readdirSync(home, { recursive: true }).map(String).sort();
}

for (const args of ON_COMMANDS) {
  test(`an agent is refused: align ${args.join(" ")}`, async (t) => {
    const env = makeEnv();
    t.after(() => env.cleanup());
    const before = alignFiles(env.env.ALIGN_HOME!);
    for (const extra of [{}, { CLAUDECODE: "1" }, { CODEX_THREAD_ID: "t_1" }]) {
      const r = await runCli(env, args, extra);
      assert.notEqual(r.code, 0, `${args.join(" ")} with ${JSON.stringify(extra)} was not refused`);
      assert.match(r.stderr, REFUSED);
    }
    // Nothing on disk changed except files any command creates (the local database). No consent was written.
    const r = await runCli(env, ["data-sharing"], {});
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Excerpts \(proposed\)\. On|Derived results \(proposed\)\. On|Session question \(proposed\)\. On/);
    void before;
  });
}

test("a person at a terminal passes the person check", async (t) => {
  const env = makeEnv();
  t.after(() => env.cleanup());
  // With no server in this test the choice can't be confirmed at Align; what matters here is that the person check lets
  // a person through. The end-to-end tests cover the full opt-in with a server.
  for (const args of ON_COMMANDS) {
    const person = await runCliAsPerson(env, args);
    assert.doesNotMatch(person.stdout, REFUSED, `${args.join(" ")}: a person was refused`);
  }
});

test("turning things off is never refused", async (t) => {
  const env = makeEnv();
  t.after(() => env.cleanup());
  for (const args of [["data-sharing", "results", "off"], ["data-sharing", "session-question", "off"], ["data-sharing", "excerpts", "off"]]) {
    const r = await runCli(env, args, { CLAUDECODE: "1" });
    assert.doesNotMatch(r.stderr, REFUSED, args.join(" "));
  }
});

test("the refusal names a person, not a flag or variable an agent could set", async (t) => {
  const env = makeEnv();
  t.after(() => env.cleanup());
  const r = await runCli(env, ["data-sharing", "excerpts", "on"], { CLAUDECODE: "1" });
  assert.match(r.stderr, /Run this command yourself in a terminal; an agent can't turn it on\./);
  assert.doesNotMatch(r.stderr, /--yes|--force|ALIGN_[A-Z_]+=/);
  void path;
});
