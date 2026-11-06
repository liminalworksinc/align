// Regressions for the cycle-10 agent-side E2E report: one Identity line in `align status` (C10-1); a folder rule's
// workspace is the session's for `::align share` and `::align goals` (C10-2); a resume while a goal hold still blocks
// says so (C10-3); a held session whose share ended on the web is told the release still lifts the hold (C10-4); a
// login counts only the sessions it can share again (C10-5); a concurrent login keeps the machine's name (C10-6, here
// the poll's `replaces`; the name itself against the real server in scripts/test-agent-live.mjs); `align allocation`
// with a target and no shared time (C10-7); and the "works, but would confuse a developer" items of its section 5.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { latchWayOut } from "../src/shared/ended.ts";
import { localId, layout, spoolWrite } from "../src/shared/layout.ts";
import { loadCredentials } from "../src/api.ts";
import { kvSet } from "../src/db.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, waitFor, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const SIDE = { id: "ws_side", name: "Side Co", role: "owner", teams: [] };
const GOAL = "Ship the v2 onboarding flow";

async function world(opts: { side?: boolean } = {}) {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  if (opts.side) {
    fake.workspaces = [...fake.workspaces, SIDE];
    fake.goals.set("ws_side", [fake.goal("g_side", "Side quest tooling", 1, true)]);
  }
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

let n = 0;
const newSid = () => `${String(++n).padStart(8, "e")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
const keyOf = (t: TestEnv, sid: string, ws = "ws_acme") => {
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, ws, "claude-code", sid);
  ctx.db.close();
  return key;
};

/** A Claude Code session in a folder of its own, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const sid = newSid();
  const cwd = path.join(t.root, `repo-${n}`);
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  const r = await runCli(t, ["share", localId("claude-code", sid).slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  return { sid, cwd, key: keyOf(t, sid), lid: localId("claude-code", sid) };
}

const prompt = (t: TestEnv, sid: string, text: string, cwd: string) => json(runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `p${Math.random()}`, prompt: text, cwd }).stdout);
const start = (t: TestEnv, sid: string, source: string, cwd: string) => json(runHook(t, "claude", "SessionStart", { session_id: sid, source, cwd }).stdout);
const deny = (t: TestEnv, s: { sid: string; cwd: string }, tool = "Bash") =>
  json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: tool, tool_input: { command: "echo C10", file_path: "/x" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason as string | undefined;
const sync = async (t: TestEnv) => {
  const r = await runCli(t, ["sync"]);
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  return r;
};
const login = async (t: TestEnv, extra: NodeJS.ProcessEnv = {}) => {
  const l = await runCli(t, ["login", "--name", "Test Mac"], extra);
  assert.equal(l.code, 0, l.stderr);
  return l;
};
const identityLines = (stdout: string) => stdout.split("\n").filter((l) => l.startsWith("  Identity:"));

describe("C10-1: `align status` has exactly one Identity line", () => {
  test("signed in: one Identity line naming the person and device, never `signed out`; with a pairing note too, plus its Pairing line", async () => {
    const { fake, t } = await world();
    const r = await runCli(t, ["status"]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(identityLines(r.stdout), [`  Identity:   Sean <sean@example.test> device Test Mac (${loadCredentials(t.home)!.device_id}) on ${fake.url}`], r.stdout);
    assert.doesNotMatch(r.stdout, /signed out|local metering only/);
    // Two logins at once leave a note: still one Identity line, and the Pairing line after it.
    const from = fake.log.length;
    const slow = runCli(t, ["login", "--name", "Test Mac"], { ALIGN_DEVICE_POLL_SCALE_MS: "300" });
    await waitFor(() => fake.log.slice(from).some((l) => l.path === "/api/v2/device/authorize"), 10_000, "the slow login's authorize");
    await login(t);
    assert.equal((await slow).code, 0);
    const s = await runCli(t, ["status"]);
    const lines = s.stdout.split("\n");
    assert.equal(identityLines(s.stdout).length, 1, s.stdout);
    assert.doesNotMatch(s.stdout, /signed out|local metering only/);
    const at = lines.findIndex((l) => l.startsWith("  Identity:"));
    assert.match(lines[at + 1], /^ {2}Pairing: {4}Two `align login`s ran at once/, s.stdout);
  });

  test("signed out: one Identity line saying so, with or without a pairing note left behind", async () => {
    const { t } = await world();
    assert.equal((await runCli(t, ["logout"])).code, 0);
    const r = await runCli(t, ["status"]);
    assert.deepEqual(identityLines(r.stdout), ["  Identity:   signed out (you ran `align logout`); local metering only"], r.stdout);
    const ctx = ctxFor(t);
    kvSet(ctx.db, "pairing_replaced", JSON.stringify({ replaced: "dv_x", by: "dv_y", at: new Date().toISOString() }));
    ctx.db.close();
    const s = await runCli(t, ["status"]);
    assert.deepEqual(identityLines(s.stdout), ["  Identity:   signed out (you ran `align logout`); local metering only"], s.stdout);
    assert.doesNotMatch(s.stdout, /Pairing:/);
  });
});

describe("C10-2: in a folder with a rule, the rule's workspace is the session's", () => {
  test("two workspaces and no default: `::align goals` lists the rule's workspace, and `::align share <goal>` answers about that goal, before and after it can be bound", async () => {
    const { fake, t } = await world({ side: true });
    const dir = path.join(t.root, "rule-two");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const g = fake.goals.get("ws_acme")!.find((x) => x.id === "g_ship")!;
    g.bindable = false;
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const sid = newSid();
    assert.match(start(t, sid, "startup", dir)?.systemMessage ?? "", /Once it has one, type `::align share Ship the v2 onboarding flow` here/);
    const goals = prompt(t, sid, "::align goals", dir).reason as string;
    assert.match(goals, /^Align goals in Acme /, goals);
    assert.equal(prompt(t, sid, "::align share Ship", dir).reason, `Align: "${GOAL}" needs an approved alignment before sessions can count toward it.`);
    assert.equal(prompt(t, sid, "::align share Ship confirm", dir).reason, `Align: "${GOAL}" needs an approved alignment before sessions can count toward it.`);
    // It gets an alignment: the advised command shares the session in the rule's workspace.
    g.bindable = true;
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    assert.match(prompt(t, sid, "::align share Ship confirm", dir).reason, /^Align: sharing requested toward "Ship the v2 onboarding flow"/);
    await sync(t);
    const rows = json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[];
    assert.equal(rows.find((r) => r.local_id === localId("claude-code", sid))?.shared, "shared (Acme)");
    // Outside any rule folder the machine still can't tell which workspace.
    const other = path.join(t.root, "no-rule");
    fs.mkdirSync(other, { recursive: true });
    const sid2 = newSid();
    start(t, sid2, "startup", other);
    assert.match(prompt(t, sid2, "::align share Ship", other).reason, /reaches more than one workspace and none is the default/);
  });
});

describe("C10-3: a resume while a goal hold still blocks the tools", () => {
  test("stopped (the model saw it), held, then resumed: the user and the model are told the stop is lifted but the hold still blocks; the release is told later", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    assert.match(deny(t, A) ?? "", /was stopped from its Align workspace/);
    fake.holdGoal("ws_acme", "g_ship", [A.key], "HELD-C10");
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "resume", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    const said = start(t, A.sid, "resume", A.cwd)?.systemMessage ?? "";
    assert.ok(said.includes(`Align: this session was resumed from its Align workspace, so its stop is lifted, but the hold on "${GOAL}" still blocks its tools until it is released.`), said);
    assert.doesNotMatch(said, /tools work again/);
    const p = prompt(t, A.sid, "I resumed it. Run ls.", A.cwd);
    const ctx = p?.hookSpecificOutput?.additionalContext ?? "";
    assert.ok(ctx.includes(`[Align] This session was resumed from its Align workspace, so the stop no longer blocks its tools, but the hold on goal "${GOAL}" still blocks them until it is released. Tell the user and wait for instructions.`), ctx);
    assert.doesNotMatch(ctx, /Continue the user's task|no longer blocked/);
    assert.match(deny(t, A) ?? "", /paused all agents on goal "Ship the v2 onboarding flow": "HELD-C10"/);
    fake.releaseGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.hookSpecificOutput?.additionalContext ?? "", /released the hold on goal "Ship the v2 onboarding flow", so it no longer blocks tools/);
    assert.equal(deny(t, A), undefined);
  });

  test("a resume with no hold still says the tools work again, and tells the model to continue", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    deny(t, A);
    fake.pushDirective({ ws: "ws_acme", kind: "resume", session_keys: [A.key], goal: null, binding: null });
    await sync(t);
    const p = prompt(t, A.sid, "go on", A.cwd);
    assert.match(p?.systemMessage ?? "", /so its tools work again\./);
    assert.match(p?.hookSpecificOutput?.additionalContext ?? "", /its tools are no longer blocked\. Continue the user's task\./);
  });
});

describe("C10-4: a held session whose share was ended by Stop sharing on the web", () => {
  test("held, then Stop sharing on the web: notice, deny, `::align status`, `align latch status` and `align status` say the release still lifts the hold (or `align stop-sharing`), and the release does", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    fake.stopOnWeb(A.key);
    await sync(t);
    const way = (reader: "user" | "model") => latchWayOut(A.lid, false, reader, { goals: [GOAL], stopped: false });
    const notice = prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "";
    assert.ok(notice.endsWith(` It was held from the web, so ${way("user")}`), notice);
    assert.match(way("user"), /until the hold on "Ship the v2 onboarding flow" is released from the web \(a release still reaches this session though its sharing ended\), or until you run `align stop-sharing/);
    const why = deny(t, A) ?? "";
    assert.ok(why.includes(way("model")), why);
    assert.match(why, /Work resumes when they release it\./);
    assert.doesNotMatch(why, /can no longer be lifted from the web/);
    const status = prompt(t, A.sid, "::align status", A.cwd).reason as string;
    assert.ok(status.includes(`  Sharing ended: ${way("user")}`), status);
    assert.doesNotMatch(status, /no release can reach it/);
    const latch = (await runCli(t, ["latch", "status"])).stdout;
    assert.match(latch, /HELD on goal "Ship the v2 onboarding flow".*sharing ended \(the Align server no longer has this session's share\), but a release still reaches it: tools stay blocked until the hold/, latch);
    assert.doesNotMatch(latch, /only `align stop-sharing/);
    assert.match((await runCli(t, ["status"])).stdout, /Goal hold: {2}1 session\(s\) paused on "Ship the v2 onboarding flow"; 1 can still be released from the web/);
    fake.releaseGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    assert.equal(deny(t, A), undefined, "the release lifted it");
  });

  test("stopped and held, then Stop sharing on the web: the stop is said to hold (the session stays stopped, LIM-2441), the release to lift only the hold", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [A.key], goal: null, binding: null });
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    fake.stopOnWeb(A.key);
    await sync(t);
    const way = latchWayOut(A.lid, false, "model", { goals: [GOAL], stopped: true });
    assert.match(way, /^this session stays stopped: a stop set from its Align workspace holds after its sharing ends, and nothing lifts it from here now\. A new session is not stopped, so the user can start one to keep working\. A release of the hold on "Ship the v2 onboarding flow" \(which still reaches this session\) lifts only the hold\.$/);
    assert.ok((deny(t, A) ?? "").includes(way), deny(t, A));
    assert.ok((deny(t, A, "Read") ?? "").includes(way), "the hold's deny gives the same advice");
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", / It was stopped and held from the web, so this session stays stopped: /);
    assert.doesNotMatch(prompt(t, A.sid, "::align status", A.cwd).reason ?? "", /align stop-sharing [^`]+` in a terminal to unblock it\)/);
    fake.releaseGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    assert.match(deny(t, A) ?? "", /was stopped from its Align workspace/, "the stop still blocks");
  });

  test("held, Stop sharing on the web, then this machine paired again: no release reaches it, so only `align stop-sharing` is named, and the deny no longer promises the release", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    fake.stopOnWeb(A.key);
    await sync(t);
    await login(t);
    const why = deny(t, A) ?? "";
    assert.ok(why.includes(latchWayOut(A.lid, false, "model")), why);
    assert.match(why, /so this can no longer be lifted from the web/);
    assert.doesNotMatch(why, /Work resumes when they release it|release still reaches/);
    assert.match((await runCli(t, ["latch", "status"])).stdout, /so only `align stop-sharing [^`]+` unblocks it/);
  });
});

describe("C10-5: a login that replaces a live pairing counts only the sessions it can share again", () => {
  test("two shared, one stopped on the web: one offered `::align share`, the other said to stay stopped", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await shared(t);
    await sync(t);
    fake.stopOnWeb(A.key);
    const l = await login(t);
    assert.match(
      l.stdout,
      /^2 session\(s\) shared from this machine's earlier sign-in stopped sharing: 1 can be shared again \(`::align share` in the session\); 1 stay stopped \(their sharing was stopped with Stop sharing on the web\)\.$/m,
      l.stdout,
    );
    // None stopped on the web: the line is as before.
    await sync(t);
    const again = await login(t);
    assert.doesNotMatch(again.stdout, /stopped sharing:/);
  });
});

describe("C10-6: two `align login`s at once", () => {
  test("the second login's poll names the device the first one paired (the one it replaces now), not the one signed in when it started", async () => {
    const { fake, t } = await world();
    const first = loadCredentials(t.home)!.device_id;
    const from = fake.log.length;
    const slow = runCli(t, ["login", "--name", "Test Mac"], { ALIGN_DEVICE_POLL_SCALE_MS: "300" });
    await waitFor(() => fake.log.slice(from).some((l) => l.path === "/api/v2/device/authorize"), 10_000, "the slow login's authorize");
    await login(t);
    const meanwhile = loadCredentials(t.home)!.device_id;
    assert.notEqual(meanwhile, first);
    assert.equal((await slow).code, 0);
    assert.equal(fake.replacesSeen[fake.replacesSeen.length - 1], meanwhile, JSON.stringify(fake.replacesSeen));
  });
});

describe("C10-7: `align allocation` for a goal with a target in a workspace with no shared time", () => {
  test("shows the target, that there is no shared time yet, and never `no target`", async () => {
    const { fake, t } = await world();
    const g = fake.goals.get("ws_acme")!.find((x) => x.id === "g_ship")!;
    g.allocation = { target_share: 50, share_7d: 0, gap_7d: null, held: false };
    const r = await runCli(t, ["allocation", "--refresh"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^ {2}No shared agent time in the last 7 days yet\.$/m);
    assert.match(r.stdout, /0%\s+50%\s+no shared time\s+Ship the v2 onboarding flow/);
    assert.doesNotMatch(r.stdout, /no target\s+Ship/);
  });
});

describe("cycle 10, section 5: works, but would confuse a developer", () => {
  test("`align login` that can't read the ended shares tells no session it is signed in again until a pass has read them", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    const B = await shared(t);
    await sync(t);
    fake.stopOnWeb(A.key);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    prompt(t, A.sid, "go on", A.cwd);
    prompt(t, B.sid, "go on", B.cwd);
    fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
    await login(t);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, undefined, "A is not told `::align share`");
    fake.failCalls = null;
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", /stays stopped/);
    assert.match(prompt(t, B.sid, "go on", B.cwd)?.systemMessage ?? "", /^Align: this machine is signed in to Align again\. To share this session again, type `::align share` here/);
  });

  test("a login replacing the live pairing that can't read the ended shares offers `::align share` to none of them yet", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await shared(t);
    await sync(t);
    fake.stopOnWeb(A.key);
    fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
    const l = await login(t);
    assert.match(l.stdout, /^2 session\(s\) shared from this machine's earlier sign-in stopped sharing; the next sync tells each session whether `::align share` shares it again\.$/m, l.stdout);
    assert.equal(prompt(t, A.sid, "go on", A.cwd)?.systemMessage, undefined, "nothing offers `::align share` before the ended shares are read");
    fake.failCalls = null;
    await sync(t);
    assert.match(prompt(t, A.sid, "go on", A.cwd)?.systemMessage ?? "", /stays stopped/);
  });

  test("`::align status` in the first seconds of a folder rule's share says it is on its way, with its goal", async () => {
    const { fake, t } = await world();
    const dir = path.join(t.root, "rule-early");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const sid = newSid();
    assert.match(start(t, sid, "startup", dir)?.systemMessage ?? "", /^Align: shared with Acme/);
    const s = prompt(t, sid, "::align status", dir).reason as string;
    assert.match(s, /^ {2}Sharing: {2}pending with Acme \(folder rule; the next sync shares it\)$/m, s);
    assert.match(s, /^ {2}Goal: {5}Ship the v2 onboarding flow \(v1, active\)$/m, s);
    assert.match(s, /^ {2}In context: goal v1$/m, s);
    await sync(t);
    assert.match(prompt(t, sid, "::align status", dir).reason, /^ {2}Sharing: {2}shared with Acme$/m);
    void fake;
  });

  test("`::align bind <other goal>` and `align bind` on a held session say the old goal's hold still blocks the tools", async () => {
    const { fake, t } = await world();
    fake.goals.get("ws_acme")!.push(fake.goal("g_docs", "Write the docs", 1, true));
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const A = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    assert.equal(
      prompt(t, A.sid, "::align bind Write", A.cwd).reason,
      `Align: from your next prompt this session counts toward "Write the docs". The hold on "${GOAL}" still blocks this session's tools until it is released: moving to another goal does not lift it.`,
    );
    const r = await runCli(t, ["bind", A.lid.slice(0, 8), "--goal", "Write"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /takes effect at the session's next prompt\. The hold on "Ship the v2 onboarding flow" still blocks this session's tools until it is released/);
  });

  test("`align login --name` with only blanks is refused here in words, before a pairing starts", async () => {
    const { fake, t } = await world();
    const from = fake.log.length;
    const r = await runCli(t, ["login", "--name", "   "]);
    assert.equal(r.code, 2);
    assert.equal(r.stderr.trim(), "align: the device name was refused: it is blank (nothing is left once spaces and invisible characters are dropped). Pass another with `align login --name <name>`.");
    assert.ok(!fake.log.slice(from).some((l) => l.path === "/api/v2/device/authorize"), "no pairing started");
  });

  test("the spool is ingested by one process at a time: a held lock leaves the records to its holder; a stale one is taken over", async () => {
    const { t } = await world();
    const sid = newSid();
    spoolWrite(t.home, { type: "session_start", harness: "claude-code", native_id: sid, cwd: t.root, source: "startup", transcript_path: null, model: null, api_key_env: false, cloud_provider_env: false, ts: new Date().toISOString() } as never);
    const lock = path.join(layout.spool(t.home), ".ingest.lock");
    fs.mkdirSync(lock);
    await runCli(t, ["status"]);
    assert.equal(fs.readdirSync(layout.spool(t.home)).filter((f) => f.endsWith(".json")).length, 1, "left to the lock's holder");
    const old = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, old, old);
    await runCli(t, ["status"]);
    assert.equal(fs.readdirSync(layout.spool(t.home)).filter((f) => f.endsWith(".json")).length, 0, "a stale lock is taken over");
    assert.ok(!fs.existsSync(lock), "and released");
    const log = fs.existsSync(path.join(t.home, "logs", "align.log")) ? fs.readFileSync(path.join(t.home, "logs", "align.log"), "utf8") : "";
    assert.doesNotMatch(log, /spool .* failed/);
  });
});
