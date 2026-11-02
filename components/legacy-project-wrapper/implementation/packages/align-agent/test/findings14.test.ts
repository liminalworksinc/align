// Regressions for the cycle-13 agent-side E2E report: C13-2 (a session told of a goal hold by its envelope never told of
// the release).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { renderHot } from "../src/hot.ts";
import { sessionKey } from "../src/keys.ts";
import { latchWayOut } from "../src/shared/ended.ts";
import { readJson, writeJsonAtomic } from "../src/shared/fsx.ts";
import { localId, layout } from "../src/shared/layout.ts";
import type { InjectedState } from "../src/shared/types.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const ACME = { id: "ws_acme", name: "Acme", role: "owner", teams: [{ id: "pod_core", name: "Core", role: "lead" }] };
const SIDE = { id: "ws_side", name: "Side Co", role: "owner", teams: [] };
const GOAL = "Ship the v2 onboarding flow";
const AGAIN = `Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here (it counts toward "${GOAL}" again).`;
const SHARE_CHANGED = "Align: this session's sharing changed; run `align sessions` in a terminal for what it is now, and `align latch status` if its tools are blocked.";
/** The words an agent from before notices were worded when shown stored at a sign-out. */
const OLD_OUT = `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here (it counts toward "${GOAL}" again).`;
const RELOGIN = "a new sign-in on this machine (`align login`) ended its share from the earlier sign-in";

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

type S = { sid: string; cwd: string; lid: string; key: string };

function session(t: TestEnv, cwd = path.join(t.root, `repo-${n + 1}`)): S {
  const sid = newSid();
  fs.mkdirSync(cwd, { recursive: true });
  runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, "claude", "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, prompt: "start", cwd });
  return { sid, cwd, key: keyOf(t, sid), lid: localId("claude-code", sid) };
}

async function shared(t: TestEnv): Promise<S> {
  const s = session(t);
  const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  return s;
}

const prompt = (t: TestEnv, s: S, text = "go on") => json(runHook(t, "claude", "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${Math.random()}`, prompt: text, cwd: s.cwd }).stdout);
const said = (t: TestEnv, s: S) => (prompt(t, s)?.systemMessage ?? "") as string;
const deny = (t: TestEnv, s: S) =>
  (json(runHook(t, "claude", "PreToolUse", { session_id: s.sid, tool_name: "Bash", tool_input: { command: "echo C13" }, cwd: s.cwd }).stdout)?.hookSpecificOutput?.permissionDecisionReason ?? "") as string;
const sync = async (t: TestEnv) => {
  const r = await runCli(t, ["sync"]);
  assert.equal(r.code, 0, `${r.stdout}\n${r.stderr}`);
  return r;
};
const login = async (t: TestEnv) => {
  const l = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(l.code, 0, l.stderr);
  return l;
};
const logout = async (t: TestEnv) => {
  const r = await runCli(t, ["logout"]);
  assert.equal(r.code, 0, r.stderr);
  return r;
};
const unreadLogin = async (fake: FakeServer, t: TestEnv) => {
  fake.failCalls = (_m: string, p: string) => p === "/api/v2/directives";
  await login(t);
};
const stop = (fake: FakeServer, s: S) => fake.pushDirective({ ws: "ws_acme", kind: "stop", session_keys: [s.key], goal: null, binding: null });
const injected = (t: TestEnv, s: S) => readJson<InjectedState>(layout.injected(t.home, s.lid));
const sessionRow = async (t: TestEnv, s: S) => (json((await runCli(t, ["sessions", "--json"])).stdout) as { local_id: string; shared: string }[]).find((r) => r.local_id === s.lid)?.shared ?? "";

describe("C13-2: a session told of a goal hold by its envelope", () => {
  async function heldRuleSession() {
    const { fake, t } = await world();
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: true };
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const dir = path.join(t.root, "rule-held");
    fs.mkdirSync(dir, { recursive: true });
    assert.equal((await runCli(t, ["share", "--dir", dir, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"])).code, 0);
    const sid = newSid();
    const start = json(runHook(t, "claude", "SessionStart", { session_id: sid, source: "startup", cwd: dir }).stdout);
    assert.match(start.hookSpecificOutput.additionalContext, /\[Align\] All agents on goal "Ship the v2 onboarding flow" were paused/);
    const s: S = { sid, cwd: dir, lid: localId("claude-code", sid), key: keyOf(t, sid) };
    assert.deepEqual(injected(t, s)?.holds_told, ["g_ship"], "the envelope's hold counts as told to the model");
    return { fake, t, s };
  }
  const unheld = (fake: FakeServer) => {
    fake.goals.get("ws_acme")!.find((g) => g.id === "g_ship")!.allocation = { target_share: null, share_7d: 0, gap_7d: null, held: false };
  };

  test("the release that reaches it is told to the model, with no hold deny in between", async () => {
    const { fake, t, s } = await heldRuleSession();
    await sync(t);
    fake.holdGoal("ws_acme", "g_ship", [s.key], null, { id: "u_lena", name: "Lena" });
    await sync(t);
    assert.equal(prompt(t, s)?.hookSpecificOutput?.additionalContext ?? "", "", "nothing new while held");
    fake.releaseGoal("ws_acme", "g_ship", [s.key], { id: "u_lena", name: "Lena" });
    unheld(fake);
    await sync(t);
    const out = prompt(t, s, "Try again: run the shell command: ls");
    assert.match(out?.systemMessage ?? "", /Align: Lena released the hold on "Ship the v2 onboarding flow"/);
    assert.ok(String(out?.hookSpecificOutput?.additionalContext ?? "").includes(`[Align] Lena released the hold on goal "${GOAL}", so it no longer blocks tools.`), JSON.stringify(out));
    assert.equal(deny(t, s), "");
    assert.equal(prompt(t, s)?.hookSpecificOutput?.additionalContext ?? "", "", "once");
  });

  test("a hold released before it reached the session is told as released, from the cached goals", async () => {
    const { fake, t, s } = await heldRuleSession();
    unheld(fake);
    await sync(t);
    const out = prompt(t, s);
    assert.ok(String(out?.hookSpecificOutput?.additionalContext ?? "").includes(`[Align] The hold on goal "${GOAL}" was released, so it no longer blocks tools.`), JSON.stringify(out));
  });
});
