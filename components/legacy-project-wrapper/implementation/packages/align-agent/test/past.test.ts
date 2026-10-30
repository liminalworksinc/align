// `align share --dir <folder> --past <days>`: the v2 replacement of v1's import script (scripts/align-import-sessions.mjs,
// test-import-sessions.mjs). Already-metered local sessions whose own recorded folders are the folder or inside it are
// shared from their start after a preview; sibling prefixes, sessions with no folder, sessions that later worked
// elsewhere and private sessions elsewhere stay local; and an import never backdates a session the server already holds.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { localId } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, codexMeta, codexTaskStarted, codexTur, codexTurnContext, ctxFor, makeEnv, runCli, tok, usage, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const H = 3_600_000;

/** A Claude Code session filed under `project`, every line naming `cwd` (or none), with one request. */
function claude(t: TestEnv, project: string, sid: string, cwd: string | null, startMsAgo: number, laterCwd?: string) {
  const base = Date.now() - startMsAgo;
  const at = (ms: number) => new Date(base + ms).toISOString();
  const withCwd = (row: Record<string, unknown>, c: string | null) => ({ ...row, cwd: c ?? undefined });
  writeLines(path.join(t.claudeDir, "projects", project, `${sid}.jsonl`), [
    withCwd(claudeUser(sid, `${sid}-p1`, at(0)), cwd),
    withCwd(claudeAssistant(sid, `req_${sid}_1`, at(60_000), usage(10, 5)), cwd),
    ...(laterCwd ? [withCwd(claudeUser(sid, `${sid}-p2`, at(120_000)), laterCwd), withCwd(claudeAssistant(sid, `req_${sid}_2`, at(180_000), usage(3, 3)), laterCwd)] : []),
  ]);
  return at(0);
}

/** A Codex rollout in `cwd`. */
function codex(t: TestEnv, sid: string, cwd: string, startMsAgo: number) {
  const base = Date.now() - startMsAgo;
  const at = (ms: number) => new Date(base + ms).toISOString();
  const meta = codexMeta(sid, sid);
  writeLines(path.join(t.codexHome, "sessions", "2026", "10", "28", `rollout-${sid}.jsonl`), [
    { ...meta, timestamp: at(0), payload: { ...meta.payload, cwd } },
    { ...codexTurnContext("turn-1", "gpt-6.1-sol", at(1000)), payload: { ...codexTurnContext("turn-1", "gpt-6.1-sol").payload, cwd } },
    codexTaskStarted("turn-1", at(500)),
    codexTur(`resp_${sid}`, sid, sid, "turn-1", tok(100, 0, 20), at(2000)),
  ]);
  return at(0);
}

describe("align share --dir --past", () => {
  test("shares only sessions whose own folders are inside the folder, from their start, after confirmation; never backdates", async () => {
    const fake = new FakeServer();
    await fake.start();
    const t = makeEnv({ ALIGN_SERVER: fake.url, ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" });
    cleanups.push(() => t.cleanup(), () => fake.stop());
    const work = path.join(t.root, "work");
    const app = path.join(work, "app");
    for (const d of [app, path.join(app, "sub"), path.join(work, "app-secret"), path.join(work, "app.v2")]) fs.mkdirSync(d, { recursive: true });
    const appReal = fs.realpathSync(app);
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);

    // In: the folder, a sub-folder, and a Codex session in the folder.
    const s1 = claude(t, "-work-app", "c1c1c1c1-0000-0000-0000-000000000001", app, 30 * H);
    const s2 = claude(t, "-work-app-sub", "c2c2c2c2-0000-0000-0000-000000000002", path.join(app, "sub"), 20 * H);
    const x1 = codex(t, "x1x1x1x1-0000-0000-0000-000000000001", app, 10 * H);
    // Out: sibling prefixes (review M2), a Codex session next door, no cwd, a session filed under app whose lines say
    // app-secret, one that later worked in app-secret, and one older than the window.
    claude(t, "-work-app-secret", "c3c3c3c3-0000-0000-0000-000000000003", path.join(work, "app-secret"), 5 * H);
    claude(t, "-work-app-v2", "c4c4c4c4-0000-0000-0000-000000000004", path.join(work, "app.v2"), 5 * H);
    codex(t, "x2x2x2x2-0000-0000-0000-000000000002", path.join(work, "app-secret"), 5 * H);
    claude(t, "-work-app", "c5c5c5c5-0000-0000-0000-000000000005", null, 5 * H);
    claude(t, "-work-app", "c6c6c6c6-0000-0000-0000-000000000006", path.join(work, "app-secret"), 5 * H);
    claude(t, "-work-app", "c7c7c7c7-0000-0000-0000-000000000007", app, 4 * H, path.join(work, "app-secret"));
    claude(t, "-work-app", "c8c8c8c8-0000-0000-0000-000000000008", app, 5 * 24 * H);

    // c1 was shared live earlier from a later point ("from now"); then this machine lost its record of that share.
    const live = await runCli(t, ["share", "c1c1c1c1", "--workspace", "ws_acme", "--goal", "g_ship", "--from", "now", "--yes"]);
    assert.equal(live.code, 0, live.stderr);
    {
      const ctx = ctxFor(t);
      const lid = localId("claude-code", "c1c1c1c1-0000-0000-0000-000000000001");
      for (const table of ["shares", "epochs", "outbox"]) ctx.db.prepare(`DELETE FROM ${table} WHERE local_id=?`).run(lid);
      ctx.db.prepare("UPDATE requests SET uploaded=0, epoch_id=NULL WHERE local_id=?").run(lid);
      ctx.db.close();
    }
    const liveEpochs = [...fake.epochs.values()].length;
    assert.equal(fake.sessions.size, 1);

    // Preview: the count line, by start time and harness; no prompt text; nothing uploaded without --yes.
    const args = ["share", "--dir", app, "--past", "3", "--workspace", "ws_acme", "--goal", "g_ship"];
    const preview = await runCli(t, args);
    assert.equal(preview.code, 0, preview.stderr);
    assert.match(preview.stdout, new RegExp(`^3 session\\(s\\) in ${appReal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} from the last 3 days: 2 Claude Code, 1 Codex$`, "m"));
    const listed = preview.stdout.split("\n").filter((l) => /^ {2}\d{4}-\d\d-\d\d \d\d:\d\d {2}(Claude Code|Codex)/.test(l));
    assert.deepEqual(listed.map((l) => l.trim().split(/\s+/).pop()), [localId("claude-code", "c1c1c1c1-0000-0000-0000-000000000001"), localId("claude-code", "c2c2c2c2-0000-0000-0000-000000000002"), localId("codex", "x1x1x1x1-0000-0000-0000-000000000001")].map((l) => l.slice(0, 8)), "oldest first");
    assert.doesNotMatch(preview.stdout, /synthetic prompt/, "no prompt text");
    assert.match(preview.stdout, /Not changed\. Run again with --yes/);
    assert.equal(fake.sessions.size, 1, "without --yes nothing is uploaded");
    assert.equal((await runCli(t, ["rules"])).stdout.includes(appReal), false, "and no folder rule");

    // Confirmed: c2 and x1 are shared from their start; c1's earlier epoch is refused (epoch_overlap) and skipped.
    const ok = await runCli(t, [...args, "--yes"]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match(ok.stdout, /Shared 2 past session\(s\) from their start\./);
    assert.match(ok.stdout, /1 refused by the server: it already holds that session's history from a later start, so it is not backdated\. Skipped\./);
    assert.match((await runCli(t, ["rules"])).stdout, /app +-> +Acme \/ Ship/, "the folder rule is written too");
    const ctx = ctxFor(t);
    const key = (h: "claude-code" | "codex", sid: string) => sessionKey(ctx.secret, "ws_acme", h, sid);
    const k2 = key("claude-code", "c2c2c2c2-0000-0000-0000-000000000002");
    const kx = key("codex", "x1x1x1x1-0000-0000-0000-000000000001");
    const k1 = key("claude-code", "c1c1c1c1-0000-0000-0000-000000000001");
    assert.deepEqual([...fake.sessions.keys()].sort(), [k1, k2, kx].sort(), "sessions outside the folder caused zero server requests");
    const epochOf = (k: string) => [...fake.epochs.values()].filter((e) => e.session_key === k);
    assert.equal(epochOf(k2)[0].starts_at, s2, "from the session's own start");
    assert.equal(epochOf(kx)[0].starts_at, x1);
    assert.equal(fake.sessions.get(k2)!.body.started_at, s2);
    assert.equal(epochOf(k1).length, 1, "the live share's epoch only");
    assert.ok(epochOf(k1)[0].starts_at > s1, "c1 keeps its later start on the server");
    assert.equal([...fake.epochs.values()].length, liveEpochs + 2);
    assert.ok(fake.log.some((l) => l.path.endsWith("/epochs") && l.status === 409), "the server refused the earlier epoch");
    assert.ok(![...fake.usage.values()].some((u) => u.session_key === k1 && u.epoch_id !== epochOf(k1)[0].epoch_id), "no usage under a refused epoch");
    ctx.db.close();

    // Again: everything there was already shared, so nothing is sent.
    const hits = fake.sessionHits();
    const again = await runCli(t, [...args, "--yes"]);
    assert.match(again.stdout, /^0 session\(s\) in .* from the last 3 days: 0 Claude Code, 0 Codex$/m);
    assert.match(again.stdout, /Skipped 3 that were shared before \(an earlier share is never backdated\)\./);
    assert.equal(fake.sessionHits(), hits);

    // Bad input.
    assert.match((await runCli(t, ["share", "--past", "3", "--workspace", "ws_acme", "--goal", "g_ship"])).stderr, /--past needs --dir/);
    assert.match((await runCli(t, ["share", "--dir", app, "--past", "15", "--workspace", "ws_acme", "--goal", "g_ship"])).stderr, /1 to 14/);
  });
});
