// Regressions for the cycle-6 agent-side E2E report: a session whose shared history was deleted, shared again from its
// start (C6-1); a stopped session whose lost workspace came back, told "only `align stop-sharing`" by its deny (C6-2); a
// removal the device never saw, worded as a permanent stop (C6-3); and the "works, but would confuse a developer" items
// of its section 5.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { layout, localId } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, makeEnv, runCli, runHook, usage, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);

async function world() {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

let n = 0;
/** A Claude Code session in a folder of its own, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const sid = `${String(++n).padStart(8, "c")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  const cwd = path.join(t.root, `repo-${n}`);
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  const r = await runCli(t, ["share", localId("claude-code", sid).slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, "ws_acme", "claude-code", sid);
  ctx.db.close();
  return { sid, cwd, key, lid: localId("claude-code", sid) };
}

/** One finished turn in the session's transcript, made `lagMs` after now. Returns the request's time. */
function turn(t: TestEnv, s: { sid: string; cwd: string }, req: string, lagMs = 0): string {
  const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
  const at = Date.now() + lagMs;
  const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(10, 5)), cwd: s.cwd }];
  if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  else writeLines(file, lines);
  return new Date(at + 50).toISOString();
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sync = async (t: TestEnv) => assert.equal((await runCli(t, ["sync"])).code, 0);
/** The server's usage rows of one session. */
const serverRows = (fake: FakeServer, key: string) => [...fake.usage.values()].filter((u) => u.session_key === key);
/** The server's epochs of one session. */
const serverEpochs = (fake: FakeServer, key: string) => [...fake.epochs.values()].filter((e) => e.session_key === key);

describe("C6-1: a session whose shared history was deleted is shared again from now, never from its start", () => {
  test("shared, signed out for a turn, shared again, its history deleted (204), then `align share --yes`: the preview counts from now and nothing made before the re-share goes up", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_d1_shared");
    await sync(t);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    await sleep(20);
    turn(t, A, "req_d1_signed_out");
    await sleep(20);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    prompt(t, A.sid, "::align share confirm", A.cwd);
    await sync(t);
    const lastBefore = turn(t, A, "req_d1_shared_again");
    await sync(t);
    assert.equal(serverRows(fake, A.key).length, 2, "the turn made while signed out did not go up");

    const del = await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"]);
    assert.equal(del.code, 0, del.stderr);
    assert.equal(serverRows(fake, A.key).length, 0);
    await sleep(20);
    const r = await runCli(t, ["share", A.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Counting: {3}from now \(/);
    assert.match(r.stdout, /This session was shared before, so this share counts from now\./);
    assert.match(r.stdout, / 0 finalized request rows now/);
    await sync(t);
    assert.equal(serverRows(fake, A.key).length, 0, "no row made before the re-share goes up");
    const after = turn(t, A, "req_d1_after", 50);
    await sleep(80);
    await sync(t);
    const rows = serverRows(fake, A.key);
    assert.equal(rows.length, 1, "only the turn after the re-share");
    const epochs = serverEpochs(fake, A.key);
    assert.equal(epochs.length, 1);
    assert.ok(epochs[0].starts_at > lastBefore && epochs[0].starts_at <= after, "the new epoch starts at the re-share");
    const ctx = ctxFor(t);
    const local = ctx.db.prepare("SELECT request_key, ts, uploaded, epoch_id FROM requests WHERE local_id=? ORDER BY ts").all(A.lid) as { ts: string; uploaded: number; epoch_id: string | null }[];
    ctx.db.close();
    assert.deepEqual(
      local.map((x) => x.uploaded),
      [0, 0, 0, 1],
      "only the turn after the re-share went up again",
    );
    assert.ok(local.filter((x) => x.ts < epochs[0].starts_at).every((x) => x.epoch_id === null), "rows dated before the re-share have no epoch");
  });

  test("stopped, then its history deleted on the web (410): a folder rule turned on in it leaves it private, `::align share` previews \"counts from now\", and `--past` names a deletion on the web", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    turn(t, A, "req_d2_shared");
    await sync(t);
    assert.equal((await runCli(t, ["stop-sharing", A.lid.slice(0, 8)])).code, 0);
    fake.deleteOnWeb(A.key);
    const del = await runCli(t, ["delete-history", A.lid.slice(0, 8), "--yes"]);
    assert.equal(del.code, 0, del.stderr);
    assert.match(del.stdout, /already deleted on the server/);

    const dir = prompt(t, A.sid, "::align share --dir confirm", A.cwd);
    assert.match(dir.reason, /This session stays private: its sharing was stopped \(or its history deleted\)\./);
    await sync(t);
    assert.ok(!fake.sessions.has(A.key), "the folder rule did not share the stopped session again");

    const preview = prompt(t, A.sid, "::align share", A.cwd);
    assert.match(preview.reason, /counts from now\./);

    const past = await runCli(t, ["share", "--dir", A.cwd, "--past", "3", "--workspace", "Acme", "--goal", "Ship the v2"]);
    assert.equal(past.code, 0, past.stderr);
    assert.match(past.stdout, /Skipped 1 whose shared history was deleted \(on the web or with `align delete-history`\); `align share <session>` shares one again, counting from now, if you want\./);
  });
});
