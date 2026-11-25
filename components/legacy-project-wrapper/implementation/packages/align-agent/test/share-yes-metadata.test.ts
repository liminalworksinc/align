// Founder ruling, Wed Nov 25 (relayed by the reconciliation session): "align share --yes does not need a person". Agents
// keep using `align share --yes` with no person check. The condition on that ruling, proved here: whatever an agent runs
// with `share --yes`, nothing above metadata leaves the machine without a valid grant (spec #117), at any capability
// level a person may have turned on.
//
// Two parts:
// - HARD today: the session's words never leave. No prompt, transcript text, secret or folder path appears in any request
//   body, at any level.
// - PENDING until the grant side lands (Sean's half of LIM-2529): no call to an above-metadata route (work signals,
//   analysis, model check, excerpts) without a grant. The agent has no grants yet, so at a level a person turned on these
//   routes may still be called. They print as todo unless ALIGN_ENFORCE_TRANSFER=1, which makes them hard (as #122).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { loadCredentials } from "../src/api.ts";
import { setResultsEnabled } from "../src/analysis.ts";
import { syncOnce } from "../src/sync.ts";
import { record } from "../src/hooks/siblings.ts";
import { localId } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runCliAsPerson, runHook, usage, writeLines } from "./helpers.ts";

const ENFORCE = process.env.ALIGN_ENFORCE_TRANSFER === "1";
const ABOVE_METADATA = /\/(work-signals|analysis|model-check|excerpts)$/;

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

type Level = "none" | "results" | "excerpts" | "results+excerpts";
const LEVELS: Level[] = ["none", "results", "excerpts", "results+excerpts"];

async function shareAsAgent(level: Level, asPerson = false) {
  const fake = new FakeServer({ accessTtl: 3600 });
  await fake.start();
  const t = makeEnv({ ALIGN_SERVER: fake.url, ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" });
  cleanups.push(() => t.cleanup());
  cleanups.push(() => fake.stop());
  assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);

  // Canaries, assembled at runtime so no scanner flags this file.
  const prompt = ["CANARY", "PROMPT", "7f3a"].join("-");
  const reply = ["CANARY", "TRANSCRIPT", "9c1e"].join("-");
  const secret = ["sk", "ant", "api03", "Q".repeat(40)].join("-");
  const SID = "bbbbbbbb-1111-2222-3333-555555555555";
  const cwd = path.join(t.root, "private-client-repo");
  fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".git", "HEAD"), "ref: refs/heads/main\n");
  const edited = path.join(cwd, ["CANARY", "FILE", "4d2b"].join("-") + ".ts");
  fs.writeFileSync(edited, "test data");
  runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p1", prompt: `${prompt} ${secret}`, cwd });
  const transcript = path.join(t.claudeDir, "projects", "-private-client-repo", `${SID}.jsonl`);
  const asst = claudeAssistant(SID, "req_1", new Date(Date.now() - 1000).toISOString(), usage(10, 5, 100, 20, 0));
  writeLines(transcript, [
    { ...claudeUser(SID, "p1", new Date(Date.now() - 1500).toISOString()), cwd, message: { role: "user", content: `${prompt} ${secret}` } },
    { ...asst, cwd, message: { ...asst.message, content: [{ type: "text", text: `${reply} ${secret}` }] } },
  ]);

  // The capability level a PERSON turned on earlier (set here directly, as the person's own command would).
  const ctx = ctxFor(t);
  if (level.includes("results")) assert.equal(await setResultsEnabled(ctx, true), "saved");
  if (level.includes("excerpts")) fake.excerptConsent.add(loadCredentials(t.home)!.device_id);

  if (asPerson) {
    const person = await runCliAsPerson(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--signals", "--yes"]);
    assert.equal(person.code, 0, person.stdout + person.stderr);
  } else {
  // An agent may not add --signals (naming files is above metadata): refused before anything is sent.
  const withSignals = await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--signals", "--yes"], { CLAUDECODE: "1" });
  assert.notEqual(withSignals.code, 0, "an agent turned on work signals through share --signals");
  assert.match(withSignals.stderr, /can only be turned on by a person/);
  // The agent: plain `share --yes` from an agent's shell. No person check, by the founder's ruling.
  const share = await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--yes"], { CLAUDECODE: "1" });
  assert.equal(share.code, 0, share.stderr);
  }
  // Work happens after the share: an edited file, the activity work signals would name.
  const lid = localId("claude-code", SID);
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 0) record(t.home, lid, [{ t: "edit", p: edited, at: new Date().toISOString(), g: "g_ship", via: "git" }]);
    await syncOnce(ctx, { tailBudgetMs: 200 }).catch(() => undefined);
  }
  ctx.db.close();
  return { fake, canaries: [prompt, reply, secret, cwd, path.basename(edited)] };
}

for (const level of LEVELS) {
  test(`share --yes by an agent: the session's words never leave (level: ${level})`, async () => {
    const { fake, canaries } = await shareAsAgent(level);
    assert.ok(fake.raw.some((r) => r.path.includes("/sessions/")), "the share itself reached the server (metadata)");
    for (const c of canaries) {
      const hit = fake.raw.find((r) => r.text.includes(c));
      assert.equal(hit, undefined, `level ${level}: ${hit?.method} ${hit?.path} carried private content`);
    }
  });

  test(`share --yes by an agent: no above-metadata route without a grant (level: ${level})`, { todo: !ENFORCE && level !== "none" ? "PEND: grants are Sean's half of LIM-2529; ALIGN_ENFORCE_TRANSFER=1 makes this hard" : false }, async () => {
    const { fake } = await shareAsAgent(level);
    const calls = fake.log.filter((l) => ABOVE_METADATA.test(l.path) && l.method !== "GET");
    assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [], `level ${level}: sent above metadata with no grant`);
  });
}

// Positive control: the same detector sees file names leave when a PERSON shares with --signals, so the checks above
// cannot pass merely because nothing was ever going to be sent.
test("control: a person's share --signals does name files, and the detector sees it", async () => {
  const { fake, canaries } = await shareAsAgent("none", true);
  assert.ok(fake.log.some((l) => ABOVE_METADATA.test(l.path) && l.method !== "GET"), "no work-signals call seen");
  assert.ok(fake.raw.some((r) => r.text.includes(canaries[4])), "the edited file's name was not seen leaving");
});
