// Regressions for the acycle2 "local" E2E report (several sessions on one machine toward one goal): a refused or failed
// edit counted once another session wrote its file, for Codex and for a Claude Code session before its first
// PostToolUse (A2-local-1, A2-local-2); the sibling-change note used up by a subagent's tool call (A2-local-3); one hold
// per sibling edit instead of one per file (A2-local-4); a failed `git commit` uploaded as a commit (A2-local-5); the
// git pass crediting a script's change again at commit, and an un-uploaded edit to another session after a sign-out
// (A2-local-6); a session started within seconds of another's pass invisible until a later pass (A2-local-7); and this
// machine's own items evicting other people's work from the team feed cache (A2-local-8).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { pathHash, repoIdentity, type Act, type PodFeed } from "../src/hooks/siblings.ts";
import { readJson } from "../src/shared/fsx.ts";
import { layout, localId } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, HOOK, makeEnv, runCli, waitFor, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const ctxText = (s: string): string => json(s)?.hookSpecificOutput?.additionalContext ?? "";
const denyText = (s: string): string => json(s)?.hookSpecificOutput?.permissionDecisionReason ?? "";

/** Every line of a session's activity file, as recorded. */
const rawActs = (home: string, lid: string): Act[] => {
  try {
    return fs
      .readFileSync(layout.activity(home, lid), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Act)
      .filter((a) => typeof a.at === "string");
  } catch {
    return [];
  }
};

async function world(extra: NodeJS.ProcessEnv = {}) {
  const fake = new FakeServer();
  await fake.start();
  cleanups.push(() => fake.stop());
  const t = makeEnv({ ALIGN_SERVER: fake.url, ...FAST, ...extra });
  cleanups.push(() => t.cleanup());
  const login = await runCli(t, ["login", "--name", "Test Mac"]);
  assert.equal(login.code, 0, login.stderr);
  return { fake, t };
}

function gitRepo(t: TestEnv, name: string): string {
  const dir = path.join(t.root, name);
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  const g = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });
  g("init", "-q");
  g("config", "user.email", "t@example.test");
  g("config", "user.name", "T");
  g("remote", "add", "origin", `https://github.example.edu/lab/${name}.git`);
  fs.writeFileSync(path.join(dir, "README.md"), "hi\n");
  g("add", "README.md");
  g("commit", "-qm", "init");
  return fs.realpathSync(dir);
}

/** How a session's hooks are installed: Claude Code with this build's plugin (PostToolUse, `--post-tool-use`), Claude
 *  Code with an older plugin (no PostToolUse), or Codex. */
type Kind = "new" | "old" | "codex";

interface S {
  sid: string;
  lid: string;
  key: string;
  kind: Kind;
  cwd: string;
}

const hk = (k: Kind) => (k === "codex" ? "codex" : "claude");

/** Run the installed hook as the harness would, with the plugin's arguments. */
function hook(t: TestEnv, s: S, event: string, input: Record<string, unknown>): string {
  const args = s.kind === "new" && event === "PreToolUse" ? ["--post-tool-use"] : [];
  const r = spawnSync(process.execPath, [HOOK, hk(s.kind), event, ...args], { input: JSON.stringify({ session_id: s.sid, cwd: s.cwd, turn_id: "t", ...input }), env: t.env, encoding: "utf8", timeout: 10_000 });
  return r.stdout;
}

let n = 0;
async function shared(t: TestEnv, cwd: string, kind: Kind = "new", goal = "Ship the v2"): Promise<S> {
  const sid = kind === "codex" ? `019a${String(++n).padStart(4, "0")}-0000-7000-8000-000000000000` : `${String(++n).padStart(8, "c")}-1111-2222-3333-444444444444`;
  const harness = kind === "codex" ? "codex" : "claude-code";
  const s: S = { sid, lid: localId(harness, sid), key: "", kind, cwd };
  hook(t, s, "SessionStart", { source: "startup" });
  hook(t, s, "UserPromptSubmit", { prompt_id: `${sid}-p0`, prompt: "start" });
  const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", goal, "--signals", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  const ctx = ctxFor(t);
  s.key = sessionKey(ctx.secret, "ws_acme", harness, sid);
  ctx.db.close();
  return s;
}

let u = 0;
/** The edit tool call that writes `content` to `file` (a new file), as each harness makes it. */
function editCall(s: S, file: string, content: string): { tool: string; input: Record<string, unknown> } {
  if (s.kind === "codex") {
    const rel = path.relative(s.cwd, file);
    return { tool: "apply_patch", input: { command: `*** Begin Patch\n*** Add File: ${rel}\n${content.trimEnd().split("\n").map((l) => `+${l}`).join("\n")}\n*** End Patch\n` } };
  }
  return { tool: "Write", input: { file_path: file, content } };
}
/** PreToolUse of a tool call; returns its id and output. */
function pre(t: TestEnv, s: S, tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const id = `toolu_${++u}`;
  return { id, out: hook(t, s, "PreToolUse", { tool_name: tool, tool_input: input, tool_use_id: id, ...extra }) };
}
/** A tool call that ran: PreToolUse, the tool's effect, and PostToolUse where the harness has it installed. */
function ran(t: TestEnv, s: S, tool: string, input: Record<string, unknown>, effect: () => void = () => undefined, extra: Record<string, unknown> = {}): string {
  const { id, out } = pre(t, s, tool, input, extra);
  effect();
  if (s.kind === "new") hook(t, s, "PostToolUse", { tool_name: tool, tool_input: input, tool_use_id: id, ...extra });
  return out;
}
const stop = (t: TestEnv, s: S) => hook(t, s, "Stop", { stop_hook_active: false, last_assistant_message: "Done." });
const sync = async (t: TestEnv) => assert.equal((await runCli(t, ["sync"])).code, 0);
const editsOf = (fake: FakeServer, file: string) => fake.activity.filter((a) => a.kind === "edit" && a.mine && a.path === file);
const lastActive = (t: TestEnv, s: S, at: Date) => {
  const ctx = ctxFor(t);
  ctx.db.prepare("UPDATE sessions SET last_active=? WHERE local_id=?").run(at.toISOString(), s.lid);
  ctx.db.close();
};

describe("A2-local-1, A2-local-2: an edit counts only on evidence that its own tool call made it", () => {
  for (const kind of ["new", "old", "codex"] as const) {
    const label = kind === "new" ? "Claude Code, this build's plugin" : kind === "old" ? "Claude Code, an older plugin (no PostToolUse)" : "Codex";
    test(`${label}: an edit that ran counts; one refused never does, also when another session then writes the file (other content, or the same) before or after its next hook`, async () => {
      const { fake, t } = await world();
      const repo = gitRepo(t, `m-${kind}`);
      // X's tool calls are all refused (so it never gets a PostToolUse); Y's edit runs.
      const X = await shared(t, repo, kind);
      const Y = await shared(t, repo, kind);
      // A, the other session, has this build's plugin: its edits are confirmed by its own PostToolUse.
      const A = await shared(t, repo, "new");
      const file = (name: string) => path.join(repo, "docs", name);

      // 2. Refused: X's first tool call, refused at the permission prompt. Nothing is written.
      const refused = editCall(X, file("plan.md"), "# Plan\nCut over reads first.\n");
      pre(t, X, refused.tool, refused.input);
      // 3. Refused, then A writes the same file with other content before X's next hook.
      const r3 = editCall(X, file("r3.md"), "X's line for r3\n");
      pre(t, X, r3.tool, r3.input);
      ran(t, A, "Write", { file_path: file("r3.md"), content: "A's line for r3\n" }, () => fs.writeFileSync(file("r3.md"), "A's line for r3\n"));
      // 4. Refused, then A writes exactly the content X was to write.
      const same = "export const cutover = true;\n";
      const r4 = editCall(X, file("r4.md"), same);
      pre(t, X, r4.tool, r4.input);
      ran(t, A, "Write", { file_path: file("r4.md"), content: same }, () => fs.writeFileSync(file("r4.md"), same));
      // 1. An edit that ran.
      const ok = editCall(Y, file("ok.md"), "Y wrote this\n");
      ran(t, Y, ok.tool, ok.input, () => fs.writeFileSync(file("ok.md"), "Y wrote this\n"));
      stop(t, X); // the turn ends: X's calls were refused
      stop(t, Y);
      // A writes plan.md after X's turn ended (the report's repro 1), other content and the same content alike.
      ran(t, A, "Write", { file_path: file("plan.md"), content: "# Plan\nCut over reads first.\n" }, () => fs.writeFileSync(file("plan.md"), "# Plan\nCut over reads first.\n"));
      await sync(t);
      await sync(t);

      const by = (name: string) => editsOf(fake, `docs/${name}`).map((e) => (e.session_key === X.key ? "X" : e.session_key === Y.key ? "Y" : e.session_key === A.key ? "A" : "?")).sort();
      assert.deepEqual(by("ok.md"), ["Y"], "the edit that ran goes up once, for its session");
      assert.deepEqual(by("plan.md"), ["A"], "refused first call: only A's write goes up");
      assert.deepEqual(by("r3.md"), ["A"], "refused, then another session's write: only A's");
      assert.deepEqual(by("r4.md"), ["A"], "refused, then the same content from another session: only A's");
      // Nor is X used to hold anyone: a Codex session that patches plan.md is held naming A only.
      const C = await shared(t, repo, "codex");
      const held = denyText(pre(t, C, "apply_patch", { command: "*** Begin Patch\n*** Update File: docs/plan.md\n@@\n-Cut over reads first.\n+Cut over writes first.\n*** End Patch\n" }).out);
      assert.match(held, new RegExp(`^Align: Claude Code session ${A.sid.slice(0, 8)}, working toward the same goal, edited docs/plan\\.md`));
      assert.doesNotMatch(held, new RegExp(X.sid.slice(0, 8)));
      // And `align team` names no edit of X's, and Y's ok.md.
      const team = (await runCli(t, ["team", "--cwd", repo])).stdout;
      assert.doesNotMatch(team, new RegExp(X.sid.slice(0, 8)), team);
      assert.match(team.split("\n").find((l) => l.includes(Y.sid.slice(0, 8))) || "", /edited docs\/ok\.md/, team);
    });
  }

  test("a shell write whose command failed never counts, though another session then creates its file (Claude Code PostToolUseFailure)", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "fail");
    const F = await shared(t, repo, "new");
    const A = await shared(t, repo, "new");
    const cmd = { command: "echo hi > docs/missing2/f.md" };
    const { id } = pre(t, F, "Bash", cmd);
    hook(t, F, "PostToolUseFailure", { tool_name: "Bash", tool_input: cmd, tool_use_id: id, error: "Exit code 1" });
    const f = path.join(repo, "docs", "missing2", "f.md");
    ran(t, A, "Write", { file_path: f, content: "made by A\n" }, () => {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, "made by A\n");
    });
    await sync(t);
    assert.deepEqual(editsOf(fake, "docs/missing2/f.md").map((e) => e.session_key === A.key), [true]);
    assert.ok(rawActs(t.home, F.lid).some((a) => a.t === "failed" && a.u === id), "recorded as failed");
  });
});

describe("A2-local-3: the sibling-change note reaches the main agent", () => {
  test("a subagent's tool calls neither get nor use up the note, and a subagent's re-read leaves the main agent to be told", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "sub");
    const B = await shared(t, repo, "new");
    const A = await shared(t, repo, "new");
    const db = path.join(repo, "src", "db.ts");
    fs.mkdirSync(path.dirname(db), { recursive: true });
    fs.writeFileSync(db, "export const db = 1;\n");
    ran(t, B, "Read", { file_path: db });
    ran(t, A, "Write", { file_path: db, content: "export const db = 2;\n" }, () => fs.writeFileSync(db, "export const db = 2;\n"));
    const agent = { agent_id: "a5282fc5", agent_type: "general-purpose" };
    assert.equal(ctxText(ran(t, B, "Bash", { command: "git log --oneline -3" }, undefined, agent)), "", "a subagent's call gets no note");
    assert.equal(ctxText(ran(t, B, "Read", { file_path: db }, undefined, agent)), "", "nor its re-read of the file");
    const note = ctxText(ran(t, B, "Read", { file_path: db }));
    assert.match(note, new RegExp(`^\\[Align\\] Claude Code session ${A.sid.slice(0, 8)}, working toward the same goal, edited src/db\\.ts less than a minute ago, after this session last read it\\.`));
    assert.equal(ctxText(ran(t, B, "Bash", { command: "ls" })), "", "told once");
  });
});

describe("A2-local-4: several siblings changed a file: one hold names them all", () => {
  test("the edit is held once, naming every sibling, and the retry passes", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "hold");
    const N1 = await shared(t, repo, "new");
    const N2 = await shared(t, repo, "new");
    const X = await shared(t, repo, "codex");
    const f = path.join(repo, "src", "shared.ts");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    ran(t, N1, "Write", { file_path: f, content: "a\n" }, () => fs.writeFileSync(f, "a\n"));
    ran(t, N2, "Read", { file_path: f });
    assert.equal(ran(t, N2, "Edit", { file_path: f, old_string: "a", new_string: "b" }, () => fs.writeFileSync(f, "b\n")), "");
    const patch = { command: "*** Begin Patch\n*** Update File: src/shared.ts\n@@\n-b\n+x\n*** End Patch\n" };
    const held = denyText(pre(t, X, "apply_patch", patch).out);
    assert.match(held, new RegExp(`^Align: Claude Code session ${N1.sid.slice(0, 8)} edited src/shared\\.ts less than a minute ago and Claude Code session ${N2.sid.slice(0, 8)} edited src/shared\\.ts less than a minute ago, all working toward the same goal\\. Read the file again so you keep their changes, then retry this edit\\.$`));
    assert.equal(pre(t, X, "apply_patch", patch).out, "", "the retry passes");
  });
});

describe("A2-local-5: a commit counts only once it was made", () => {
  test("a failed `git commit -m` (PostToolUseFailure), a Codex commit that never ran, and one fed to an older plugin's hook never go up; a real Codex commit does", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "commits");
    const B = await shared(t, repo, "new");
    const C = await shared(t, repo, "codex");
    const O = await shared(t, repo, "old");
    const failed = { command: "git commit -m 'Cut over reads to the new cluster'" };
    const { id } = pre(t, B, "Bash", failed);
    hook(t, B, "PostToolUseFailure", { tool_name: "Bash", tool_input: failed, tool_use_id: id, error: "Exit code 1" });
    pre(t, C, "Bash", { command: "git commit -m 'Never ran'" });
    pre(t, O, "Bash", { command: "git commit -m 'Tweak db'" });
    stop(t, C);
    stop(t, O);
    // A card of another session names none of them.
    const D = await shared(t, repo, "new");
    assert.doesNotMatch(ctxText(hook(t, D, "UserPromptSubmit", { prompt_id: "d1", prompt: "go" })), /committed/);
    // Codex commits for real: the repo has it at its next hook.
    fs.writeFileSync(path.join(repo, "c.txt"), "c\n");
    pre(t, C, "Bash", { command: "git add c.txt && git commit -m 'Add c'" });
    execFileSync("git", ["-C", repo, "add", "c.txt"]);
    execFileSync("git", ["-C", repo, "commit", "-qm", "Add c"]);
    stop(t, C);
    await sync(t);
    const commits = fake.activity.filter((a) => a.kind === "commit" && a.mine).map((a) => a.text);
    assert.deepEqual(commits, ["Add c"]);
  });
});

describe("A2-local-6: the git pass credits a change once, to the right session", () => {
  test("a script's change credited by one pass is not credited again when it is committed", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "script");
    const A = await shared(t, repo, "new");
    const B = await shared(t, repo, "new");
    await sync(t); // the baseline
    lastActive(t, A, new Date());
    fs.writeFileSync(path.join(repo, "docs", "trig1.md"), "written by a script\n");
    await sync(t);
    assert.equal(editsOf(fake, "docs/trig1.md").length, 1, "credited once by git");
    lastActive(t, B, new Date(Date.now() + 1000));
    execFileSync("git", ["-C", repo, "add", "-A"]);
    execFileSync("git", ["-C", repo, "commit", "-qm", "Commit the script's work"]);
    await sync(t);
    assert.equal(editsOf(fake, "docs/trig1.md").length, 1, "the commit credits nobody again");
    assert.ok(!rawActs(t.home, B.lid).some((a) => a.via === "git"), "nothing credited to B");
  });

  test("an edit a hook saw that waited to upload at `align logout` goes up for its own session, and the next sign-in's pass credits it to nobody", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "logout");
    const A = await shared(t, repo, "new");
    await sync(t); // the baseline
    const r = path.join(repo, "docs", "r.md");
    ran(t, A, "Write", { file_path: r, content: "A's change\n" }, () => fs.writeFileSync(r, "A's change\n"));
    assert.equal((await runCli(t, ["logout"])).code, 0);
    assert.deepEqual(editsOf(fake, "docs/r.md").map((e) => e.session_key === A.key), [true], "flushed at the sign-out, for A");
    assert.equal((await runCli(t, ["login", "--name", "Test Mac"])).code, 0);
    await sync(t);
    const M3 = await shared(t, repo, "new");
    lastActive(t, M3, new Date());
    await sync(t);
    await sync(t);
    assert.ok(!rawActs(t.home, M3.lid).some((a) => a.via === "git" && a.p === r), JSON.stringify(rawActs(t.home, M3.lid)));
    assert.equal(editsOf(fake, "docs/r.md").length, 1, "uploaded once");
  });
});

describe("A2-local-6: the git pass knows every session's hook-seen edits", () => {
  test("an edit of a session whose share stopped before a pass uploaded it is credited to nobody else", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "stopped");
    const P = await shared(t, repo, "new");
    const B = await shared(t, repo, "new");
    await sync(t); // the baseline
    const r2 = path.join(repo, "docs", "r2.md");
    ran(t, P, "Write", { file_path: r2, content: "P's change\n" }, () => fs.writeFileSync(r2, "P's change\n"));
    assert.equal((await runCli(t, ["stop-sharing", P.lid.slice(0, 8)])).code, 0);
    lastActive(t, B, new Date());
    await sync(t);
    assert.ok(!rawActs(t.home, B.lid).some((a) => a.via === "git"), JSON.stringify(rawActs(t.home, B.lid)));
    assert.equal(editsOf(fake, "docs/r2.md").length, 0, "nothing went up: P's share ended before");
  });
});

describe("A2-local-7: a session a folder rule shares at its start counts from its first tool call", () => {
  test("its edits are recorded and held, and hold others, before any pass makes its share; the pass credits them to it", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "rule");
    const rule = await runCli(t, ["share", "--dir", repo, "--workspace", "Acme", "--goal", "Ship the v2", "--signals", "--yes"]);
    assert.equal(rule.code, 0, rule.stderr);
    await sync(t); // the git baseline
    const mk = (i: number): S => {
      const sid = `${String(900 + i).padStart(8, "s")}-1111-2222-3333-444444444444`;
      return { sid, lid: localId("claude-code", sid), key: "", kind: "new", cwd: repo };
    };
    const S1 = mk(1);
    const S2 = mk(2);
    hook(t, S1, "SessionStart", { source: "startup" });
    hook(t, S2, "SessionStart", { source: "startup" }); // no pass runs in between (ALIGN_NO_AUTOSTART)
    assert.equal(fs.existsSync(layout.hot(t.home, S2.lid)), false, "no pass made its share yet");
    const s2 = path.join(repo, "docs", "s2.md");
    ran(t, S2, "Write", { file_path: s2, content: "S2's work\n" }, () => fs.writeFileSync(s2, "S2's work\n"));
    assert.ok(rawActs(t.home, S2.lid).some((a) => a.t === "edit" && a.p === s2), "recorded");
    const held = denyText(pre(t, S1, "Edit", { file_path: s2, old_string: "S2's work", new_string: "S1's" }).out);
    assert.match(held, new RegExp(`^Align: Claude Code session ${S2.sid.slice(0, 8)}, working toward the same goal, edited docs/s2\\.md`));
    lastActive(t, S1, new Date(Date.now() + 1000));
    await sync(t);
    await sync(t);
    const ctx = ctxFor(t);
    const k2 = sessionKey(ctx.secret, "ws_acme", "claude-code", S2.sid);
    ctx.db.close();
    assert.deepEqual(editsOf(fake, "docs/s2.md").map((e) => e.session_key === k2), [true], "uploaded once, for S2");
    assert.ok(!rawActs(t.home, S1.lid).some((a) => a.via === "git"), "nothing credited to S1 through git");
    assert.equal(fs.existsSync(layout.activityStarting(t.home, S2.lid)), false, "the pass that made the share removed the stand-in");
  });

  test("while the pass that made its share waits for the server to take it (pending), its edits are still recorded and held", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "pending");
    const rule = await runCli(t, ["share", "--dir", repo, "--workspace", "Acme", "--goal", "Ship the v2", "--signals", "--yes"]);
    assert.equal(rule.code, 0, rule.stderr);
    const S: S = { sid: "88888888-1111-2222-3333-444444444444", lid: localId("claude-code", "88888888-1111-2222-3333-444444444444"), key: "", kind: "new", cwd: repo };
    hook(t, S, "SessionStart", { source: "startup" });
    fake.offline = true;
    await runCli(t, ["sync"]);
    assert.equal(readJson<{ share?: { state?: string } }>(layout.hot(t.home, S.lid))?.share?.state, "pending");
    assert.equal(fs.existsSync(layout.activityStarting(t.home, S.lid)), false, "the pass applied the start share");
    const f = path.join(repo, "docs", "p.md");
    ran(t, S, "Write", { file_path: f, content: "pending work\n" }, () => fs.writeFileSync(f, "pending work\n"));
    assert.ok(rawActs(t.home, S.lid).some((a) => a.t === "edit" && a.p === f), "recorded");
    fake.offline = false;
    const O: S = { sid: "019a8888-0000-7000-8000-000000000000", lid: localId("codex", "019a8888-0000-7000-8000-000000000000"), key: "", kind: "codex", cwd: repo };
    hook(t, O, "SessionStart", { source: "startup" });
    assert.match(denyText(pre(t, O, "apply_patch", { command: "*** Begin Patch\n*** Update File: docs/p.md\n@@\n-pending work\n+other\n*** End Patch\n" }).out), new RegExp(`Claude Code session ${S.sid.slice(0, 8)}`));
    await sync(t);
    const ctx = ctxFor(t);
    const key = sessionKey(ctx.secret, "ws_acme", "claude-code", S.sid);
    ctx.db.close();
    assert.deepEqual(editsOf(fake, "docs/p.md").map((e) => e.session_key === key), [true], "uploaded once shared");
  });

  test("its SessionStart always starts a pass, even right after another session's pass started", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "rule2");
    const rule = await runCli(t, ["share", "--dir", repo, "--workspace", "Acme", "--goal", "Ship the v2", "--yes"]);
    assert.equal(rule.code, 0, rule.stderr);
    await runCli(t, ["sync"]);
    // Another session's pass was spawned a moment ago (the 3-second gap) and just finished.
    fs.writeFileSync(layout.spawnLock(t.home), String(Date.now()));
    const env = { ...t.env };
    delete env.ALIGN_NO_AUTOSTART;
    const sid = "77777777-1111-2222-3333-444444444444";
    spawnSync(process.execPath, [HOOK, "claude", "SessionStart"], { input: JSON.stringify({ session_id: sid, source: "startup", cwd: repo }), env, encoding: "utf8", timeout: 10_000 });
    const lid = localId("claude-code", sid);
    await waitFor(() => readJson<{ share?: { state?: string } }>(layout.hot(t.home, lid))?.share?.state === "shared", 8000, "its share made by a pass");
    await waitFor(() => !fs.existsSync(path.join(t.home, "sync.lock")), 8000, "the pass done");
  });
});

describe("A2-local-8: this machine's own items never evict other people's work from the feed cache", () => {
  test("1,000 of this machine's items after another person's edit: the cache keeps the edit and the edit note is given", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "feed");
    const M = await shared(t, repo, "new");
    const id = repoIdentity("ws_acme", repo)!;
    fake.addRemoteActivity("ws_acme", { session_key: "lena-key", harness: "claude-code", user: { id: "u_lena", name: "Lena" }, kind: "edit", repo_id: id.repo_id, path_hash: pathHash(id.repo_id, "src/db.ts"), path: "src/db.ts" });
    for (let i = 0; i < 1000; i++) fake.addRemoteActivity("ws_acme", { session_key: M.key, harness: "claude-code", mine: true, user: { id: fake.user.id, name: fake.user.name }, kind: "edit", repo_id: id.repo_id, path_hash: pathHash(id.repo_id, `gen/f${i}.ts`), path: `gen/f${i}.ts` });
    await sync(t);
    const feed = readJson<PodFeed>(layout.podFeed(t.home, "ws_acme"))!;
    assert.ok(feed.items.some((i) => i.user.name === "Lena"), "Lena's edit kept");
    assert.ok(!feed.items.some((i) => i.session_key === M.key), "this machine's own items are not kept");
    const db = path.join(repo, "src", "db.ts");
    fs.mkdirSync(path.dirname(db), { recursive: true });
    fs.writeFileSync(db, "x\n");
    ran(t, M, "Read", { file_path: db });
    assert.match(ctxText(pre(t, M, "Edit", { file_path: db, old_string: "x", new_string: "y" }).out), /Lena, working toward the same goal, edited src\/db\.ts/);
  });
});

describe("A2-local-1: `align status` and `align doctor` say when the Claude Code plugin is older", () => {
  test("this build's plugin passes --post-tool-use to PreToolUse; an older one (5 events, or 7 without the flag) is named, with what it means and `align install`", async () => {
    const t = makeEnv();
    cleanups.push(() => t.cleanup());
    assert.equal((await runCli(t, ["install", "--claude"])).code, 0);
    const file = path.join(t.claudeDir, "skills", "align", "hooks", "hooks.json");
    const hooks = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.match(JSON.stringify(hooks.hooks.PreToolUse), /hook\.js' claude PreToolUse --post-tool-use/);
    assert.match((await runCli(t, ["status"])).stdout, /Hooks: {6}Claude Code installed;/);
    assert.match((await runCli(t, ["doctor"])).stdout, /OK {4}claude hooks {5}installed/);
    const older = "edits in its sessions are confirmed from the files' content, not by Claude Code; run `align install`";
    // The previous build's plugin: 7 events, no flag.
    const noFlag = JSON.parse(JSON.stringify(hooks));
    noFlag.hooks.PreToolUse[0].hooks[0].command = noFlag.hooks.PreToolUse[0].hooks[0].command.replace(" --post-tool-use", "");
    fs.writeFileSync(file, JSON.stringify(noFlag));
    assert.ok((await runCli(t, ["status"])).stdout.includes(`Claude Code installed by an older Align (${older});`));
    assert.ok((await runCli(t, ["doctor"])).stdout.includes(`WARN  claude hooks     installed by an older Align (${older})`));
    // An older one still: no PostToolUse at all.
    delete noFlag.hooks.PostToolUse;
    delete noFlag.hooks.PostToolUseFailure;
    fs.writeFileSync(file, JSON.stringify(noFlag));
    assert.ok((await runCli(t, ["status"])).stdout.includes(`Claude Code partial (5/7; ${older});`));
    assert.equal((await runCli(t, ["install", "--claude"])).code, 0);
    assert.match((await runCli(t, ["status"])).stdout, /Hooks: {6}Claude Code installed;/);
  });
});
