// End to end against test/fake-server.ts: CLI subprocesses, the built hooks, and repeated sync passes (what the hooks
// start in the background), run in-process so the tests can pace them.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { loadCredentials } from "../src/api.ts";
import { syncOnce } from "../src/sync.ts";
import { sessionKey } from "../src/keys.ts";
import { layout, localId } from "../src/shared/layout.ts";
import { readJson } from "../src/shared/fsx.ts";
import type { HotState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { pathHash, repoIdentity } from "../src/hooks/siblings.ts";
import { appendLines, claudeAssistant, claudeUser, ctxFor, makeEnv, rows, runCli, runHook, usage, waitFor, writeLines, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = {
  ALIGN_DEVICE_POLL_SCALE_MS: "10",
  ALIGN_OUTBOX_MAX_BACKOFF_MS: "200",
};

async function world(opts: { accessTtl?: number } = {}) {
  const fake = new FakeServer({ accessTtl: opts.accessTtl ?? 3600 });
  await fake.start();
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  cleanups.push(() => fake.stop());
  return { fake, t };
}

async function login(t: TestEnv): Promise<string> {
  const r = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(r.code, 0, r.stderr);
  return r.stdout;
}

/** Stand-in for hooks firing during a session: one sync pass every 100 ms until halted. */
async function startSyncing(t: TestEnv) {
  const ctx = ctxFor(t);
  let running = true;
  let busy: Promise<unknown> = Promise.resolve();
  const timer = setInterval(() => {
    busy = busy.then(() => (running ? syncOnce(ctx, { tailBudgetMs: 200 }).catch(() => undefined) : undefined));
  }, 100);
  const halt = async () => {
    if (!running) return;
    running = false;
    clearInterval(timer);
    await busy;
    ctx.db.close();
  };
  cleanups.push(halt);
  return { ctx, halt };
}

const hot = (t: TestEnv, sid: string) => readJson<HotState>(layout.hot(t.home, localId("claude-code", sid)));
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

describe("e2e", () => {
  test("login, share, usage, goal_version delta, binding_changed epoch, offline queue, stop latch, suspension", async () => {
    const { fake, t } = await world({ accessTtl: 122 });
    const loginOut = await login(t);
    const loginAt = Date.now();
    assert.match(loginOut, /BCDF-GHJK/);
    assert.match(loginOut, /Signed in as Sean/);
    assert.ok(fake.log.some((l) => l.path === "/api/v2/device/token" && l.status === 400), "polled through slow_down/pending");
    assert.ok(!fake.log.some((l) => l.origin), "agent never sends Origin");
    const creds = loadCredentials(t.home)!;
    assert.match(creds.device_id, /^dv_/);
    assert.equal(fs.statSync(layout.credentials(t.home)).mode & 0o777, 0o600);
    assert.equal(fs.statSync(layout.deviceKey(t.home)).mode & 0o777, 0o600);
    assert.ok(fs.existsSync(layout.feed(t.home, "ws_acme")));

    // A Claude session already running before the share.
    const SID = "aaaaaaaa-1111-2222-3333-444444444444";
    const cwd = path.join(t.root, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    assert.equal(runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd }).stdout, "");
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p1", prompt: "start work", cwd }).stdout, "");
    const transcript = path.join(t.claudeDir, "projects", "-repo", `${SID}.jsonl`);
    writeLines(transcript, [
      { ...claudeUser(SID, "p1", iso(1500)), cwd },
      { ...claudeAssistant(SID, "req_1", iso(1000), usage(10, 5, 100, 20, 0)), cwd, message: { ...claudeAssistant(SID, "req_1", iso(1000), usage(10, 5, 100, 20, 0)).message, content: [{ type: "text", text: "CANARY-TRANSCRIPT" }] } },
    ]);

    const { ctx, halt } = await startSyncing(t);
    const reply = (id: string) => appendLines(transcript, [{ ...claudeAssistant(SID, id, new Date().toISOString(), usage(100, 50, 1000, 10, 0)), cwd }]);

    // Share from session start, with preview and explicit confirmation.
    const share = await runCli(t, ["share", "--latest", "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(share.code, 0, share.stderr);
    assert.match(share.stdout, /Share preview\. Nothing has been uploaded yet\./);
    assert.match(share.stdout, /Never sent: prompts/);
    const skey = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
    await waitFor(() => fake.sessions.has(skey), 5000, "session PUT");
    const sess = fake.sessions.get(skey)!;
    assert.equal(sess.body.harness, "claude-code");
    assert.match(sess.body.repo_key, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!JSON.stringify(sess.body).includes(cwd), "no paths uploaded");
    await waitFor(() => fake.usage.size === 1, 5000, "first usage row");
    const firstEpoch = [...fake.epochs.values()][0];
    assert.equal(firstEpoch.goal_id, "g_ship");
    assert.equal([...fake.usage.values()][0].epoch_id, firstEpoch.epoch_id);
    assert.equal([...fake.usage.values()][0].basis, "api_usd", "no oauthAccount in the sandbox .claude.json");

    // First prompt after sharing: the goal arrives as a short delta.
    await waitFor(() => hot(t, SID)?.share?.state === "shared", 3000, "hot shared");
    const bound = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p1b", prompt: "continue", cwd }).stdout);
    assert.match(bound.hookSpecificOutput.additionalContext, /counts toward goal "Ship the v2 onboarding flow"/);

    // goal_version: received on durable write, delta on the next prompt, applied after injection.
    const g2 = fake.bumpGoal("ws_acme", "g_ship", { title: "Ship the v2 onboarding flow with SSO" });
    const d1 = fake.pushDirective({ ws: "ws_acme", kind: "goal_version", session_keys: [skey], goal: g2, binding: null });
    await waitFor(() => fake.receipts.some((r) => r.id === d1.id && r.state === "received"), 5000, "received d1");
    await waitFor(() => hot(t, SID)?.goal?.version === 2, 3000, "hot v2");
    const upd = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p2", prompt: "next", cwd }).stdout);
    assert.match(upd.hookSpecificOutput.additionalContext, /is now v2/);
    assert.ok(upd.hookSpecificOutput.additionalContext.length <= 300);
    await waitFor(() => fake.receipts.some((r) => r.id === d1.id && r.state === "applied"), 5000, "applied d1");
    assert.equal(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p2b", prompt: "quiet", cwd }).stdout, "");

    // binding_changed: new epoch opens at the next root turn; later usage carries it.
    const perf = fake.goals.get("ws_acme")!.find((g) => g.id === "g_perf")!;
    const d2 = fake.pushDirective({ ws: "ws_acme", kind: "binding_changed", session_keys: [skey], goal: perf, binding: { goal_id: "g_perf", effective: "next_root_turn", cause: "alignment:al_1" } });
    await waitFor(() => hot(t, SID)?.pending_binding?.goal_id === "g_perf", 5000, "pending binding");
    const sw = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p3", prompt: "switch", cwd }).stdout);
    assert.match(sw.hookSpecificOutput.additionalContext, /counts toward goal "Cut hook latency"/);
    const ep3 = await waitFor(() => [...fake.epochs.values()].find((e) => e.root_turn === "p3"), 5000, "epoch at p3");
    assert.equal(ep3.cause, `directive:${d2.id}`);
    assert.equal(ep3.goal_id, "g_perf");
    appendLines(transcript, [{ ...claudeUser(SID, "p3", new Date().toISOString()), cwd }]);
    reply("req_3");
    await waitFor(() => [...fake.usage.values()].some((u) => u.epoch_id === ep3.epoch_id), 5000, "usage in new epoch");
    await waitFor(() => fake.receipts.some((r) => r.id === d2.id && r.state === "applied"), 5000, "applied d2");
    assert.ok(![...fake.usage.values()].some((u) => JSON.stringify(u).includes("CANARY")), "no canary text in uploads");

    // Offline: usage and a directive queue up, then flush on reconnect.
    fake.setOffline(true);
    reply("req_4");
    const g3 = fake.bumpGoal("ws_acme", "g_perf", { status: "achieved" });
    const d3 = fake.pushDirective({ ws: "ws_acme", kind: "goal_version", session_keys: [skey], goal: g3, binding: null });
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(rows(ctx, "SELECT * FROM requests WHERE uploaded=0 AND finalized=1").length, 1, "req_4 waits locally");
    fake.setOffline(false);
    await waitFor(() => fake.usage.size === 3, 8000, "req_4 after reconnect");
    await waitFor(() => fake.receipts.some((r) => r.id === d3.id && r.state === "received"), 8000, "d3 after reconnect");

    // Stop latch: enforced receipt, PreToolUse denies; resume clears it.
    const d4 = fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [skey], goal: null, binding: null });
    await waitFor(() => fake.receipts.some((r) => r.id === d4.id && r.state === "enforced"), 5000, "enforced");
    const deny = JSON.parse(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash", tool_input: { command: "make deploy" } }).stdout);
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    const d5 = fake.pushDirective({ ws: "ws_acme", kind: "resume", session_keys: [skey], goal: null, binding: null });
    await waitFor(() => fake.receipts.some((r) => r.id === d5.id && r.state === "received"), 5000, "resume received");
    await waitFor(() => !fs.existsSync(layout.latch(t.home, localId("claude-code", SID))), 3000, "latch cleared");
    const resumed = JSON.parse(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash" }).stdout);
    assert.equal(resumed.hookSpecificOutput.permissionDecision, undefined, "tools allowed again");
    assert.match(resumed.hookSpecificOutput.additionalContext, /now v2 \(achieved\)/, "the update queued while offline lands at this tool call");
    assert.equal(runHook(t, "claude", "PreToolUse", { session_id: SID, tool_name: "Bash" }).stdout, "", "then 0 bytes");

    // binding_suspended: uploads stop; the user is told at the next prompt; the model hears the binding ended.
    const d6 = fake.pushDirective({ ws: "ws_acme", kind: "binding_suspended", session_keys: [skey], goal: null, binding: null });
    await waitFor(() => fake.receipts.some((r) => r.id === d6.id && r.state === "received"), 5000, "suspend received");
    const before = fake.usage.size;
    const hitsBefore = fake.log.filter((l) => l.path.endsWith("/usage")).length;
    reply("req_5");
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(fake.usage.size, before, "no upload while suspended");
    assert.equal(fake.log.filter((l) => l.path.endsWith("/usage")).length, hitsBefore, "no usage calls while suspended");
    const susp = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "p5", prompt: "go on", cwd }).stdout);
    assert.match(susp.systemMessage, /usage is paused/);
    assert.match(susp.hookSpecificOutput.additionalContext, /no longer bound/);
    await waitFor(() => fake.receipts.some((r) => r.id === d6.id && r.state === "applied"), 5000, "suspend applied");

    // Key-bound refresh ran with valid signatures (access TTL 122 s forces refresh after ~2 s).
    await new Promise((r) => setTimeout(r, Math.max(0, loginAt + 2500 - Date.now())));
    await runCli(t, ["sync"]);
    assert.ok(fake.refreshes > 0, "at least one signed refresh");
    assert.ok([...fake.devices.values()].every((d) => !d.revoked), "rotation never reused a refresh token");

    // Local ledger never stored canary text.
    const dbText = fs.readFileSync(layout.db(t.home)).toString("latin1");
    assert.ok(!dbText.includes("CANARY"), "no prompt or transcript text in align.db");
    await halt();
  });

  test("private session causes zero session or usage hits while signed in", async () => {
    const { fake, t } = await world();
    await login(t);
    const { halt, ctx } = await startSyncing(t);
    const SID = "bbbbbbbb-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: t.root });
    runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "q1", prompt: "private work", cwd: t.root });
    writeLines(path.join(t.claudeDir, "projects", "-p", `${SID}.jsonl`), [claudeUser(SID, "q1", iso(500)), claudeAssistant(SID, "req_p1", iso(400), usage(1, 1)), claudeAssistant(SID, "req_p2", iso(300), usage(2, 2))]);
    await waitFor(() => rows(ctx).length === 2, 3000, "local rows");
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(fake.sessionHits(), 0);
    assert.equal(fake.usage.size, 0);
    const list = await runCli(t, ["sessions"]);
    assert.match(list.stdout, /private/);
    assert.match(list.stdout, /estimate/);
    await halt();
  });

  test("in-session ::align share needs confirm, then shares from start; bind applies at the next root turn", async () => {
    const { fake, t } = await world();
    await login(t);
    const { ctx, halt } = await startSyncing(t);
    const SID = "dddddddd-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: t.root });
    writeLines(path.join(t.claudeDir, "projects", "-d", `${SID}.jsonl`), [claudeUser(SID, "d1", iso(900)), claudeAssistant(SID, "req_d1", iso(800), usage(2, 2))]);
    const preview = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x", prompt: "::align share Ship" }).stdout);
    assert.equal(preview.decision, "block");
    assert.match(preview.reason, /Type `::align share Ship confirm`/);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(fake.sessionHits(), 0, "preview alone uploads nothing");
    const ok = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x2", prompt: "::align share Ship confirm" }).stdout);
    assert.match(ok.reason, /sharing requested/);
    const skey = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
    await waitFor(() => fake.usage.size === 1, 5000, "usage from session start");
    assert.equal([...fake.epochs.values()][0].goal_id, "g_ship");
    // CLI bind: pending until the next root turn opens the epoch.
    const b = await runCli(t, ["bind", SID.slice(0, 8), "--goal", "g_perf"]);
    assert.equal(b.code, 0, b.stderr);
    assert.equal(fake.epochs.size, 1);
    const next = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "d2", prompt: "next" }).stdout);
    assert.match(next.hookSpecificOutput.additionalContext, /Cut hook latency/);
    const ep = await waitFor(() => [...fake.epochs.values()].find((e) => e.root_turn === "d2"), 5000, "epoch at d2");
    assert.equal(ep.cause, "manual");
    // In-session bind to a goal that needs alignment is refused locally.
    const refused = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x3", prompt: "::align bind Someone" }).stdout);
    assert.match(refused.reason, /needs an approved alignment/);
    void skey;
    await halt();
  });

  test("folder rule: CLI share --dir shares new sessions from start with the envelope; forks stay private; unshare --dir stops it", async () => {
    const { fake, t } = await world();
    await login(t);
    const repo = path.join(t.root, "repo-a");
    fs.mkdirSync(path.join(repo, "sub"), { recursive: true });
    const preview = await runCli(t, ["share", "--dir", repo, "--workspace", "ws_acme", "--goal", "g_ship"]);
    assert.match(preview.stdout, /Not changed/);
    assert.equal((await runCli(t, ["rules"])).stdout.trim(), "No folder rules. Every session is private until you share it.");
    const ok = await runCli(t, ["share", "--dir", repo, "--workspace", "ws_acme", "--goal", "g_ship", "--yes"]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match((await runCli(t, ["rules"])).stdout, /repo-a +-> +Acme \/ Ship/);
    const { ctx, halt } = await startSyncing(t);
    const SID = "ffffffff-1111-2222-3333-444444444444";
    const start = JSON.parse(runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: path.join(repo, "sub") }).stdout);
    assert.match(start.systemMessage, /shared with Acme for "Ship/);
    assert.match(start.hookSpecificOutput.additionalContext, /Ship/, "full envelope at startup from the folder rule");
    writeLines(path.join(t.claudeDir, "projects", "-f", `${SID}.jsonl`), [claudeUser(SID, "f1", new Date(Date.now() + 1000).toISOString()), claudeAssistant(SID, "req_f1", new Date(Date.now() + 2000).toISOString(), usage(2, 2))]);
    await waitFor(() => fake.usage.size === 1, 5000, "usage from session start");
    assert.equal([...fake.epochs.values()][0].goal_id, "g_ship");
    await waitFor(() => fs.existsSync(layout.hot(t.home, localId("claude-code", SID))), 5000, "hot state");
    const quiet = runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "f2", prompt: "go" });
    assert.equal(quiet.stdout, "", "envelope already in context: the first prompt adds 0 bytes");
    // A goal edit reaches sessions started afterwards in their first envelope (the feed is revalidated every pass).
    fake.bumpGoal("ws_acme", "g_ship", { title: "Ship the v2 onboarding flow, SSO first" });
    await waitFor(() => readJson<{ goals: { id: string; title: string }[] }>(layout.feed(t.home, "ws_acme"))?.goals.find((g) => g.id === "g_ship")?.title.includes("SSO first"), 5000, "feed revalidated");
    const fresh = JSON.parse(runHook(t, "claude", "SessionStart", { session_id: "ffff-fresh", source: "startup", cwd: repo }).stdout);
    assert.match(fresh.hookSpecificOutput.additionalContext, /SSO first/, "new session starts on the current goal version");
    const fork = runHook(t, "claude", "SessionStart", { session_id: "fork-1", source: "fork", cwd: repo });
    assert.ok(!fork.stdout.includes("additionalContext"), "forks stay private");
    const outside = runHook(t, "claude", "SessionStart", { session_id: "out-1", source: "startup", cwd: t.root });
    assert.ok(!outside.stdout.includes("shared with"), "sessions outside the folder stay private");
    const off = await runCli(t, ["unshare", "--dir", repo]);
    assert.match(off.stdout, /private again/);
    const after = runHook(t, "claude", "SessionStart", { session_id: "late-1", source: "startup", cwd: repo });
    assert.ok(!after.stdout.includes("shared with"));
    void ctx;
    await halt();
  });

  test("pod activity: uploaded inside the sync pass with names only under consent; another person's edit reaches the card; our own never echoes back", async () => {
    const { fake, t } = await world();
    await login(t);
    const mkRepo = (name: string) => {
      const dir = path.join(t.root, name);
      fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
      fs.mkdirSync(path.join(dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/feat/sso\n");
      fs.writeFileSync(path.join(dir, ".git", "config"), `[remote "origin"]\n\turl = git@github.example:acme/${name}.git\n`);
      return dir;
    };
    const named = mkRepo("app");
    const hashed = mkRepo("infra");
    const on = await runCli(t, ["share", "--dir", named, "--workspace", "ws_acme", "--goal", "g_ship", "--signals", "--yes"]);
    assert.equal(on.code, 0, on.stderr);
    assert.match(on.stdout, /Work signals ON: repo-relative paths of edited files, commit subjects, task labels and the branch name/);
    assert.match(on.stdout, /Never sent: prompts, responses, tool input or output\./);
    const off = await runCli(t, ["share", "--dir", hashed, "--workspace", "ws_acme", "--goal", "g_ship", "--yes"]);
    assert.match(off.stdout, /Work signals OFF: only keyed hashes of edited files are sent/);
    assert.match((await runCli(t, ["rules"])).stdout, /app +-> +Acme \/ Ship.*work signals on/);
    const { halt } = await startSyncing(t);
    const A = "a0a0a0a0-1111-2222-3333-444444444444";
    const B = "b0b0b0b0-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: A, source: "startup", cwd: named });
    runHook(t, "claude", "SessionStart", { session_id: B, source: "startup", cwd: hashed });
    await waitFor(() => hot(t, A)?.share?.state === "shared" && hot(t, B)?.share?.state === "shared", 5000, "both shared");
    runHook(t, "claude", "UserPromptSubmit", { session_id: A, prompt_id: "a1", prompt: "::align task SSO wiring", cwd: named });
    for (const [sid, cwd] of [[A, named], [B, hashed]]) {
      runHook(t, "claude", "PreToolUse", { session_id: sid, cwd, tool_name: "Edit", tool_input: { file_path: path.join(cwd, "src/sso.ts") } });
      runHook(t, "claude", "PreToolUse", { session_id: sid, cwd, tool_name: "Bash", tool_input: { command: 'git commit -am "Wire SSO callback"' } });
    }
    const kA = hot(t, A)!.share!.session_key;
    const kB = hot(t, B)!.share!.session_key;
    await waitFor(() => fake.activity.filter((i) => i.session_key === kA).length >= 4 && fake.activity.filter((i) => i.session_key === kB).length >= 2, 5000, "activity uploaded");
    const of = (k: string) => fake.activity.filter((i) => i.session_key === k);
    const idA = repoIdentity("ws_acme", named)!;
    assert.deepEqual(of(kA).find((i) => i.kind === "edit"), { ...of(kA).find((i) => i.kind === "edit"), path: "src/sso.ts", path_hash: pathHash(idA.repo_id, "src/sso.ts"), repo_id: idA.repo_id });
    assert.equal(of(kA).find((i) => i.kind === "commit").text, "Wire SSO callback");
    assert.deepEqual(of(kA).filter((i) => i.kind === "task").map((i) => i.text).sort(), ["SSO wiring", "branch feat/sso"]);
    const eB = of(kB).find((i) => i.kind === "edit");
    assert.equal(eB.path, null, "no consent: no path");
    assert.match(eB.path_hash, /^[a-f0-9]{32}$/);
    assert.equal(of(kB).find((i) => i.kind === "commit").text, null, "no consent: no commit subject");
    assert.ok(!of(kB).some((i) => i.kind === "task"), "no consent: no task or branch");
    assert.ok(!JSON.stringify(fake.activity).includes(t.root), "never an absolute path");

    // Yoonseo's machine edits the same file in the same repo (a different clone, same remote).
    fake.addRemoteActivity("ws_acme", { session_key: "y".repeat(43), user: { id: "u_yoon", name: "Yoonseo" }, kind: "edit", repo_id: idA.repo_id, path: "src/sso.ts", path_hash: pathHash(idA.repo_id, "src/sso.ts") });
    await waitFor(() => (readJson<{ items: { user: { name: string } }[] }>(layout.podFeed(t.home, "ws_acme"))?.items || []).some((i) => i.user.name === "Yoonseo"), 5000, "pod feed fetched");
    const card = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: A, prompt_id: "a2", prompt: "continue", cwd: named }).stdout).hookSpecificOutput.additionalContext as string;
    assert.match(card, /Yoonseo \(1 session, (just now|1 min ago)\): edited src\/sso\.ts \(yours too\)\./);
    assert.doesNotMatch(card, /Sean/, "this machine's own uploads are not shown back as someone else's");
    const pod = await runCli(t, ["pod", "--cwd", named]);
    assert.match(pod.stdout, /- Yoonseo \(1 session\), active (just now|1 min ago): overlaps your files: src\/sso\.ts/);
    await halt();
  });

  test("in-session ::align share --dir needs confirm, writes the rule and shares this session", async () => {
    const { fake, t } = await world();
    await login(t);
    const { halt } = await startSyncing(t);
    const repo = path.join(t.root, "repo-b");
    fs.mkdirSync(repo, { recursive: true });
    const SID = "eeeeeeee-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: repo });
    const pv = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x", cwd: repo, prompt: "::align share --dir Ship" }).stdout);
    assert.equal(pv.decision, "block");
    assert.match(pv.reason, /folder share preview/);
    assert.equal((await runCli(t, ["rules"])).stdout.includes("repo-b"), false);
    const ok = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x2", cwd: repo, prompt: "::align share --dir Ship confirm" }).stdout);
    assert.match(ok.reason, /now shared with Acme/);
    assert.match((await runCli(t, ["rules"])).stdout, /repo-b/);
    writeLines(path.join(t.claudeDir, "projects", "-e", `${SID}.jsonl`), [claudeUser(SID, "e1", new Date(Date.now() + 1000).toISOString()), claudeAssistant(SID, "req_e1", new Date(Date.now() + 2000).toISOString(), usage(2, 2))]);
    await waitFor(() => fake.usage.size === 1, 5000, "this session shared too");
    const next = runHook(t, "claude", "SessionStart", { session_id: "next-1", source: "clear", cwd: repo });
    assert.match(JSON.parse(next.stdout).systemMessage, /folder rule/, "/clear keeps sharing through the folder rule");
    const st = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x3", cwd: repo, prompt: "::align status" }).stdout);
    assert.match(st.reason, /Folder rule: /);
    const off = JSON.parse(runHook(t, "claude", "UserPromptSubmit", { session_id: SID, prompt_id: "x4", cwd: repo, prompt: "::align unshare --dir" }).stdout);
    assert.match(off.reason, /private again/);
    await halt();
  });

  test("stop-sharing and delete-history; revoked device signs out and local metering continues", async () => {
    const { fake, t } = await world();
    await login(t);
    const SID = "cccccccc-1111-2222-3333-444444444444";
    runHook(t, "claude", "SessionStart", { session_id: SID, source: "startup", cwd: t.root });
    const file = path.join(t.claudeDir, "projects", "-c", `${SID}.jsonl`);
    writeLines(file, [claudeUser(SID, "c1", iso(500)), claudeAssistant(SID, "req_c1", iso(400), usage(3, 3))]);
    const preview = await runCli(t, ["share", SID.slice(0, 8), "--workspace", "ws_acme", "--goal", "g_perf"]);
    assert.match(preview.stdout, /Not shared/, "without --yes and no TTY nothing is shared");
    assert.equal(fake.sessionHits(), 0);
    const denied = await runCli(t, ["share", SID.slice(0, 8), "--workspace", "ws_acme", "--goal", "g_theirs", "--yes"]);
    assert.notEqual(denied.code, 0);
    assert.match(denied.stderr, /not bindable/);
    const ok = await runCli(t, ["share", SID.slice(0, 8), "--workspace", "ws_acme", "--goal", "g_perf", "--alias", "align-repo", "--yes"]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match(ok.stdout, /is shared/);
    const ctx = ctxFor(t);
    const skey = sessionKey(ctx.secret, "ws_acme", "claude-code", SID);
    assert.equal(fake.sessions.get(skey)!.body.repo_alias, "align-repo");
    assert.equal(fake.usage.size, 1);
    const stop = await runCli(t, ["stop-sharing", SID.slice(0, 8)]);
    assert.equal(stop.code, 0, stop.stderr);
    assert.equal(fake.sessions.get(skey)!.state, "stopped");
    appendLines(file, [claudeAssistant(SID, "req_c2", iso(100), usage(4, 4))]);
    await runCli(t, ["sync"]);
    assert.equal(fake.usage.size, 1, "nothing after stop-sharing");
    const del = await runCli(t, ["delete-history", SID.slice(0, 8), "--yes"]);
    assert.equal(del.code, 0, del.stderr);
    assert.match(del.stdout, /totals will change/);
    assert.equal(fake.sessions.has(skey), false);
    assert.equal(fake.usage.size, 0);
    // Revocation: the next server call fails, the device is signed out, local metering keeps going.
    fake.revokeAll();
    await runCli(t, ["goals", "--refresh"]);
    assert.equal(loadCredentials(t.home)!.signed_out, true);
    appendLines(file, [claudeAssistant(SID, "req_c3", iso(50), usage(5, 5))]);
    const s = await runCli(t, ["sessions", "--json"]);
    const parsed = JSON.parse(s.stdout);
    const me = parsed.find((x: any) => x.native_id === SID);
    assert.equal(me.usage.reduce((a: number, u: any) => a + u.requests, 0), 3);
    const st = await runCli(t, ["status"]);
    assert.match(st.stdout, /signed out/);
    ctx.db.close();
  });
});
