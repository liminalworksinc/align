// Regressions for the cycle-11 agent-side E2E report. C11-1 to C11-4 are one pattern: a notice about a share that
// ended, worded when the share ended, which a later login, re-pairing or `/me` left stale against the deny. Notices about
// a share's state are now worded when they are shown, from the state the deny is worked out from (`shareNotice`); the
// randomized check of that is test/sharestate-property.test.ts. Here: each finding as the report ran it (C11-1 a login
// that can't read the ended shares; C11-2 a workspace given back on the Devices page; C11-3 a lost workspace back with a
// new login; C11-4 a re-pairing that takes the release away), the multi-workspace answers of `::align goals`, `::align
// bind` and `::align share` (C11-6), and the "works, but would confuse a developer" items of its section 5. C11-5 (two
// logins approved at the same moment) is the server's: scripts/test-v2.mjs "device (E2E-AGENT cycle 11 C11-5)".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { latchNoticeTail, latchWayOut } from "../src/shared/ended.ts";
import { localId, layout } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, waitFor, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const ACME = { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] };
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
const newSid = () => `${String(++n).padStart(8, "c")}-1111-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
const keyOf = (t: TestEnv, sid: string, ws = "ws_acme") => {
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, ws, "claude-code", sid);
  ctx.db.close();
  return key;
};

/** A Claude Code session in a folder of its own, seen by the CLI (its SessionStart and a prompt), not shared. */
function session(t: TestEnv) {
  const sid = newSid();
  const cwd = path.join(t.root, `repo-${n}`);
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  return { sid, cwd, key: keyOf(t, sid), lid: localId("claude-code", sid) };
}

/** The same, shared from the terminal in Acme toward "Ship the v2". */
async function shared(t: TestEnv) {
  const s = session(t);
  const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  return s;
}

type S = { sid: string; cwd: string; lid: string; key: string };
const prompt = (t: TestEnv, s: S, text = "go on") => json(runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${Math.random()}`, prompt: text, cwd: s.cwd }).stdout);
const said = (t: TestEnv, s: S) => (prompt(t, s)?.systemMessage ?? "") as string;
const deny = (t: TestEnv, s: S, tool = "Bash") =>
  json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: tool, tool_input: { command: "echo C11", file_path: "/x" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason as string | undefined;
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
const stop = (fake: FakeServer, s: S) => fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [s.key], goal: null, binding: null });
const spooledShares = (t: TestEnv) =>
  fs
    .readdirSync(layout.spool(t.home))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(layout.spool(t.home), f), "utf8")))
    .filter((r) => r.type === "command" && r.command === "share");
/** As lib/v2/lifecycle.ts when a workspace owner removes the person: the device loses the workspace, and the server ends
 *  their sessions in it (`member_removed`). */
const removeFromAcme = (fake: FakeServer) => {
  fake.workspaces = fake.workspaces.filter((w) => w.id !== "ws_acme");
  for (const [k, s] of fake.sessions) if (s.ws === "ws_acme" && s.state === "shared") fake.removeAndReAdd(k);
};

describe("C11-1: a login that can't read the ended shares, for sessions not prompted since the sign-out", () => {
  test("no session is shown the sign-out notice while signed in again; `::align share` in one stopped on the web asks for nothing; after the read one stays stopped and the other can be shared again", async () => {
    const { fake, t } = await world();
    const Y3 = await shared(t);
    const Y4 = await shared(t);
    await sync(t);
    fake.stopOnWeb(Y4.key);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    // Neither is prompted while signed out: their sign-out notice was worded at the logout.
    fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
    await login(t);
    for (const s of [Y3, Y4]) {
      const msg = said(t, s);
      assert.doesNotMatch(msg, /signed out of Align|`::align share`|signed in to Align again/, msg);
    }
    assert.equal(prompt(t, Y4, "::align share confirm").reason, "Align: this machine is signed in to Align again, but has not yet heard from the Align server whether this session's sharing was stopped on the web meanwhile (a session stopped there is not shared again), so nothing was asked for. Run `align sync` in a terminal, then type `::align share` here again.");
    assert.equal(spooledShares(t).length, 0, "nothing spooled");
    fake.failCalls = null;
    await sync(t);
    const y4 = said(t, Y4);
    assert.match(y4, /^Align: this session's sharing was stopped \(Stop sharing on the web\), so it stays stopped/, y4);
    assert.doesNotMatch(y4, /sharing failed/);
    assert.match(said(t, Y3), /^Align: this machine is signed in to Align again\. To share this session again, type `::align share` here \(it counts toward "Ship the v2 onboarding flow" again\)\.$/);
    assert.match(prompt(t, Y4, "::align share confirm").reason, /it stays stopped/);
  });

  test("stopped from the web as well: while the ended shares are unread nothing is told, and once read the notice gives the deny's way out", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    stop(fake, A);
    await sync(t);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
    await login(t);
    assert.doesNotMatch(said(t, A), /align login|stop-sharing|::align share/);
    fake.failCalls = null;
    await sync(t);
    const msg = said(t, A);
    assert.ok(msg.endsWith(latchNoticeTail(A.lid, true)), msg);
    assert.ok((deny(t, A) ?? "").includes(latchWayOut(A.lid, true, "model")), deny(t, A));
  });
});

describe("C11-2: a workspace given back on the Devices page", () => {
  test("sessions stopped for good or still blocked are never told to `align share` them there; a never-shared one is; each notice gives its deny's way out", async () => {
    const { fake, t } = await world({ side: true });
    const E1 = await shared(t);
    const E2 = await shared(t);
    const W = await shared(t);
    const H = await shared(t);
    const P = session(t);
    await sync(t);
    fake.stopOnWeb(W.key);
    stop(fake, H);
    await sync(t);
    fake.stopOnWeb(H.key);
    await sync(t);
    fake.stopOnWeb(E2.key);
    // A new pairing that reaches only Side Co.
    fake.workspaces = [SIDE];
    await login(t);
    for (const s of [E1, E2, W, H, P]) prompt(t, s);
    // Ledger, er, Acme given to this device on the Devices page: the next pass picks it up.
    fake.workspaces = [ACME, SIDE];
    const r = await sync(t);
    assert.match(r.stdout, /This machine can now reach Acme in Align/);
    const e2 = said(t, E2);
    assert.match(e2, /^Align: this session's sharing was stopped \(Stop sharing on the web\), so it stays stopped/, e2);
    assert.doesNotMatch(e2, /can now reach|To share this session there/, e2);
    for (const s of [W, H]) assert.doesNotMatch(said(t, s), /can now reach|To share this session there|align share [A-Za-z0-9_-]{8} --workspace/);
    const why = deny(t, H) ?? "";
    // H was stopped from the web: the stop holds after its sharing ends (LIM-2441).
    assert.ok(why.includes(latchWayOut(H.lid, false, "model", null, {}, true)), why);
    assert.match(said(t, P), new RegExp(`^Align: this machine can now reach Acme in Align\\. To share this session there, run \`align share ${P.lid.slice(0, 8)} --workspace "Acme" --goal <goal>\` in a terminal\\.$`));
    assert.match(said(t, E1), /^Align: this machine can reach Acme in Align again\. To share this session there again, type `::align share` here|^Align: this machine is signed in to Align again\. To share this session again, type `::align share` here/);
  });
});

describe("C11-3: a share ended by a lost workspace, back through a new `align login`", () => {
  test("the session is told it can be shared there again, in its deny's words, at a prompt and on resume; never the stale `no longer have access`", async () => {
    const { fake, t } = await world();
    const Z1 = await shared(t);
    const Z2 = await shared(t);
    await sync(t);
    stop(fake, Z1);
    await sync(t);
    removeFromAcme(fake);
    await sync(t);
    const lost = said(t, Z1);
    assert.match(lost, /you no longer have access to Acme in Align/);
    assert.ok(lost.endsWith(latchNoticeTail(Z1.lid, false, null, {}, true)), lost);
    assert.equal((await runCli(t, ["logout"])).code, 0);
    fake.workspaces = [ACME];
    await login(t);
    const back = said(t, Z1);
    assert.equal(back, `Align: this machine can reach Acme in Align again. To share this session there again, type \`::align share\` here (it counts toward "${GOAL}" again).${latchNoticeTail(Z1.lid, true)}`);
    assert.ok((deny(t, Z1) ?? "").includes(latchWayOut(Z1.lid, true, "model")), deny(t, Z1));
    const resumed = (json(runHook(t, "claude", "SessionStart", { session_id: Z2.sid, source: "resume", cwd: Z2.cwd }).stdout)?.systemMessage ?? "") as string;
    assert.match(resumed, /^Align: this machine can reach Acme in Align again\. To share this session there again, type `::align share` here/, resumed);
    assert.doesNotMatch(resumed, /no longer have access/);
    assert.match(prompt(t, Z1, "::align share confirm").reason, /^Align: sharing requested toward "Ship the v2 onboarding flow"/);
    await sync(t);
    assert.equal(fake.sessions.get(Z1.key)?.state, "shared");
  });
});

describe("C11-4: a held session whose share was ended on the web, then this machine paired again", () => {
  test("not yet told: its notice names only `align stop-sharing`, as the deny, `::align status` and `align latch status` do", async () => {
    const { fake, t } = await world();
    const H = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [H.key]);
    await sync(t);
    assert.match(deny(t, H) ?? "", /paused all agents/);
    fake.stopOnWeb(H.key);
    await sync(t);
    await login(t);
    const msg = said(t, H);
    assert.doesNotMatch(msg, /a release still reaches this session/, msg);
    assert.ok(msg.endsWith(latchNoticeTail(H.lid, false)), msg);
    assert.ok((deny(t, H) ?? "").includes(latchWayOut(H.lid, false, "model")), deny(t, H));
    assert.match(prompt(t, H, "::align status").reason, /Sharing ended, so no release can reach it/);
    assert.match((await runCli(t, ["latch", "status"])).stdout, /so only `align stop-sharing [^`]+` unblocks it/);
  });

  test("told that a release still reaches it, then paired again: told once more that only `align stop-sharing` frees it", async () => {
    const { fake, t } = await world();
    const H = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [H.key]);
    await sync(t);
    fake.stopOnWeb(H.key);
    await sync(t);
    assert.match(said(t, H), /a release still reaches this session/);
    assert.equal(said(t, H), "", "told once");
    await login(t);
    const again = said(t, H);
    assert.ok(again.endsWith(latchNoticeTail(H.lid, false)), again);
    assert.doesNotMatch(again, /a release still reaches/);
    assert.equal(said(t, H), "", "and once");
  });
});

describe("C11-6: a two-workspace device with no default", () => {
  test("`::align goals` outside a rule folder gives the multi-workspace answer; another workspace's goal named in `::align bind` or `::align share` is said to be that workspace's", async () => {
    const { fake, t } = await world({ side: true });
    const A1 = session(t);
    const goals = prompt(t, A1, "::align goals").reason as string;
    assert.match(goals, /^Align: this machine reaches more than one workspace and none is the default, so `::align goals` can't tell which this session's is\. Run `align goals` in a terminal/, goals);
    assert.doesNotMatch(goals, /no cached goals/);
    // p2: shared in Acme by a folder rule.
    const dir = path.join(t.root, "rule-acme");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const P2 = { sid: newSid(), cwd: dir, lid: "", key: "" };
    P2.lid = localId("claude-code", P2.sid);
    runHook(t, "claude", "SessionStart", { session_id: P2.sid, source: "startup", cwd: dir });
    await sync(t);
    assert.equal(prompt(t, P2, "::align bind Side").reason, `Align: "Side quest tooling" is a goal of Side Co, and this session is shared with Acme, so it counts only toward Acme's goals. \`::align goals\` lists them.`);
    // p1: in a rule folder whose goal needs an alignment, so the session stays private.
    const dir2 = path.join(t.root, "rule-private");
    fs.mkdirSync(dir2, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir2, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.bindable = false;
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const P1 = { sid: newSid(), cwd: dir2, lid: "", key: "" };
    P1.lid = localId("claude-code", P1.sid);
    runHook(t, "claude", "SessionStart", { session_id: P1.sid, source: "startup", cwd: dir2 });
    const share = prompt(t, P1, "::align share Side").reason as string;
    assert.equal(
      share,
      `Align: "Side quest tooling" is a goal of Side Co, and \`::align share\` here shares this session with Acme (this folder's rule shares sessions there). To share it toward that goal, run \`align share ${P1.lid.slice(0, 8)} --workspace "Side Co" --goal "Side quest tooling"\` in a terminal.`,
    );
    assert.doesNotMatch(share, /no cached goal matches/);
    // A goal no workspace has is still "no cached goal".
    assert.match(prompt(t, P1, "::align share Nothing like it").reason, /no cached goal matches "Nothing like it"/);
  });
});

describe("cycle 11, section 5: works, but would confuse a developer", () => {
  test("`align sync` after a revoke on the web says why it is signed out", async () => {
    const { fake, t } = await world();
    fake.revokeAll();
    const r = await runCli(t, ["sync"]);
    assert.match(r.stdout, /^Signed out: nothing uploaded\. This machine is signed out because this device was revoked on the web \(Devices page\); run `align login` to sign in again\.$/m, r.stdout);
  });

  test("`align login --name` of only invisible characters and spaces is refused here, before a pairing starts", async () => {
    const { fake, t } = await world();
    const from = fake.log.length;
    const r = await runCli(t, ["login", "--name", "​  ⁠"]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /the device name was refused: it is blank/);
    assert.ok(!fake.log.slice(from).some((l) => l.path === "/api/v2/device/authorize"), "no pairing started");
  });

  test("a folder rule's start toward a held goal says it is held, to the user and the model", async () => {
    const { fake, t } = await world();
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const dir = path.join(t.root, "rule-held");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const out = json(runHook(t, "claude", "SessionStart", { session_id: newSid(), source: "startup", cwd: dir }).stdout);
    assert.match(out.systemMessage, /^Align: shared with Acme for "Ship the v2 onboarding flow" \(folder rule for [^)]+\)\. That goal is on hold \(all agents on it were paused from its Align workspace\), so this session's tools stay blocked until the hold is released\./);
    assert.match(out.hookSpecificOutput.additionalContext, /\[Align\] All agents on goal "Ship the v2 onboarding flow" were paused from its Align workspace \(a goal hold\), so this session's tools are blocked until the hold is released\./);
  });

  test("`::align bind <other goal>` on a held session: the model's bound note says the old goal's hold still blocks", async () => {
    const { fake, t } = await world();
    fake.goals.get("ws_acme")!.push(fake.goal("g_docs", "Write the docs", 1, true));
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const A = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    prompt(t, A, "::align bind Write");
    const ctx = prompt(t, A)?.hookSpecificOutput?.additionalContext ?? "";
    assert.match(ctx, /\[Align\] From this turn this session counts toward goal "Write the docs"/);
    assert.ok(ctx.includes(`[Align] The hold on goal "${GOAL}" still blocks this session's tools until it is released: moving to another goal does not lift it. Tell the user and wait for instructions.`), ctx);
  });

  test("one message, one state: a release that lifts a hold whose share ended leaves no stale `stay blocked until the hold is released` next to it", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    fake.stopOnWeb(A.key);
    await sync(t);
    fake.releaseGoal("ws_acme", "g_ship", [A.key]);
    await sync(t);
    const msg = said(t, A);
    assert.match(msg, /this session's sharing was stopped \(Stop sharing on the web\)/);
    assert.match(msg, /released the hold/);
    assert.doesNotMatch(msg, /tools stay blocked/, msg);
    assert.equal(deny(t, A), undefined);
  });

  test("`::align status` after a pass that could not reach the server says so", async () => {
    const { fake, t } = await world();
    const A = await shared(t);
    await sync(t);
    fake.setOffline(true);
    assert.equal((await runCli(t, ["sync"])).code, 1);
    assert.match(prompt(t, A, "::align status").reason, /^ {2}Last sync: \d+ s ago; the Align server could not be reached \(since \d+ s ago: .+\), so queued work waits on this machine$/m);
    fake.setOffline(false);
    await sync(t);
    assert.match(prompt(t, A, "::align status").reason, /^ {2}Last sync: \d+ s ago$/m);
  });

  test("`align allocation`: the no-shared-time line comes before the columns, and `--week` has the columns too", async () => {
    const { fake, t } = await world();
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.allocation = { target_share: 50, share_7d: 0, gap_7d: null, held: false };
    const r = await runCli(t, ["allocation", "--refresh"]);
    const lines = r.stdout.split("\n");
    const none = lines.findIndex((l) => l === "  No shared agent time in the last 7 days yet.");
    const head = lines.findIndex((l) => /^ {2}SHARE {3}TARGET GAP {14}GOAL$/.test(l));
    assert.ok(none > 0 && head === none + 1, r.stdout);
    const w = await runCli(t, ["allocation", "--week", "2026-10-26"]);
    assert.equal(w.code, 0, w.stderr);
    const wl = w.stdout.split("\n");
    const wnone = wl.findIndex((l) => l === "  No shared agent time that week.");
    assert.ok(wnone > 0 && /^ {2}SHARE {3}TARGET GAP {14}GOAL$/.test(wl[wnone + 1]), w.stdout);
  });

  test("`align bind --help` and `align share --help` show their usage; `--past` with no number says it needs one", async () => {
    const { t } = await world();
    const b = await runCli(t, ["bind", "--help"]);
    assert.equal(b.code, 0, b.stderr);
    assert.match(b.stdout, /^ {2}align bind <session> --goal <ref\|none>$/m);
    assert.doesNotMatch(b.stdout + b.stderr, /no session matches/);
    const s = await runCli(t, ["share", "--help"]);
    assert.equal(s.code, 0, s.stderr);
    assert.match(s.stdout, /^ {2}align share <session\|--latest>/m);
    assert.match(s.stdout, /also share that folder's sessions of the last 1 to 14 days/);
    const p = await runCli(t, ["share", "--dir", t.root, "--past", "--workspace", "Acme", "--goal", "none"]);
    assert.equal(p.code, 1);
    assert.match(p.stderr, /^align: --past needs a value \(`align share \.\.\. --past <value>`\)/);
    assert.doesNotMatch(p.stderr, /ambiguous/);
  });
});

void waitFor;
