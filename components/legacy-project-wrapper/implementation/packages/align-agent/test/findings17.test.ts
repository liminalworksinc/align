// Regressions for the acycle1 "local" E2E report (several sessions on one machine toward one goal): a refused edit
// reported as made once another session changed the file, and `git add` as an edit (A1-local-1); a commit re-crediting
// hook-seen edits `via: "git"` (A1-local-2); Claude Code never told which sibling changed a file (A1-local-3); a Codex
// shell read not counted as a read (A1-local-4); work toward a session's old goal counted toward the one it moved to,
// and the hold lagging a move until a sync (A1-local-5, A1-local-6); `align team` leaving out the newest session
// (A1-local-7); and a trim of the activity file losing uploads (A1-local-8). Also items of its "works but confusing":
// a busy card that names files, and parent and dependency context after a move.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { sessionKey } from "../src/keys.ts";
import { renderCard } from "../src/shared/envelope.ts";
import { localId, layout } from "../src/shared/layout.ts";
import * as sib from "../src/hooks/siblings.ts";
import { readActs, shellWrites, type Act } from "../src/hooks/siblings.ts";
import { FakeServer } from "./fake-server.ts";
import { ctxFor, makeEnv, runCli, runHook, touch, type TestEnv } from "./helpers.ts";

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

// Read loosely, so this file runs (and fails test by test) against the agent before these fixes.
const readPaths: (h: "claude-code" | "codex", tool: string, input: Record<string, unknown>, cwd: string) => string[] =
  (sib as unknown as { readPaths?: typeof readPaths }).readPaths ?? (() => []);
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

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const ctxText = (s: string): string => json(s)?.hookSpecificOutput?.additionalContext ?? "";

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

/** A git repo with a remote, so activity carries a repo id. */
function gitRepo(t: TestEnv, name: string): string {
  const dir = path.join(t.root, name);
  fs.mkdirSync(dir, { recursive: true });
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

interface S {
  sid: string;
  lid: string;
  key: string;
  h: "claude" | "codex";
  cwd: string;
}

let n = 0;
/** A session started in `cwd` and shared from the terminal toward `goal`. */
async function shared(t: TestEnv, cwd: string, h: "claude" | "codex" = "claude", goal = "Ship the v2"): Promise<S> {
  const sid = h === "codex" ? `019a0000-0000-7000-8000-${String(++n).padStart(12, "0")}` : `${String(++n).padStart(8, "c")}-1111-2222-3333-444444444444`;
  const harness = h === "codex" ? "codex" : "claude-code";
  runHook(t, h, "SessionStart", { session_id: sid, source: "startup", cwd });
  runHook(t, h, "UserPromptSubmit", { session_id: sid, prompt_id: `${sid}-p0`, turn_id: `${sid}-t0`, prompt: "start", cwd });
  const r = await runCli(t, ["share", localId(harness, sid).slice(0, 8), "--workspace", "Acme", "--goal", goal, "--signals", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  const ctx = ctxFor(t);
  const key = sessionKey(ctx.secret, "ws_acme", harness, sid);
  ctx.db.close();
  return { sid, lid: localId(harness, sid), key, h, cwd };
}

let u = 0;
const pre = (t: TestEnv, s: S, tool: string, input: Record<string, unknown>, id = `toolu_${++u}`) => ({
  id,
  out: runHook(t, s.h, "PreToolUse", { session_id: s.sid, cwd: s.cwd, turn_id: "t", tool_name: tool, tool_input: input, tool_use_id: id }).stdout,
});
const post = (t: TestEnv, s: S, tool: string, input: Record<string, unknown>, id: string, failed = false) =>
  runHook(t, s.h, failed ? "PostToolUseFailure" : "PostToolUse", { session_id: s.sid, cwd: s.cwd, tool_name: tool, tool_input: input, tool_use_id: id }).stdout;
/** A Claude Code tool call that ran: PreToolUse, the tool (`effect`), PostToolUse. */
function ranTool(t: TestEnv, s: S, tool: string, input: Record<string, unknown>, effect: () => void = () => undefined): string {
  const { id, out } = pre(t, s, tool, input);
  effect();
  post(t, s, tool, input, id);
  return out;
}
const prompt = (t: TestEnv, s: S, text: string) =>
  runHook(t, s.h, "UserPromptSubmit", { session_id: s.sid, prompt_id: `p${Math.random()}`, turn_id: `t${Math.random()}`, prompt: text, cwd: s.cwd }).stdout;
const sync = async (t: TestEnv) => assert.equal((await runCli(t, ["sync"])).code, 0);
const edits = (fake: FakeServer) => fake.activity.filter((a) => a.kind === "edit" && a.mine);
const lastActive = (t: TestEnv, s: S, at: Date) => {
  const ctx = ctxFor(t);
  ctx.db.prepare("UPDATE sessions SET last_active=? WHERE local_id=?").run(at.toISOString(), s.lid);
  ctx.db.close();
};

describe("A1-local-1: an edit counts only when its own tool call ran", () => {
  test("a refused Claude Code edit is never uploaded, carded or used to hold, however the file changes later; `git add` is no edit", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "r1");
    const A = await shared(t, repo);
    const B = await shared(t, repo);
    const file = path.join(repo, "docs", "r.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "base\n");
    touch(file, new Date(Date.now() - 60_000));
    // B reads the file (its PostToolUse hook runs), then tries to edit it; the user refuses: no PostToolUse.
    ranTool(t, B, "Read", { file_path: file });
    pre(t, B, "Edit", { file_path: file, old_string: "base", new_string: "B-change" });
    // B stages a file: nothing in it changes.
    ranTool(t, B, "Bash", { command: "git add README.md" });
    await new Promise((r) => setTimeout(r, 30));
    // A reads and edits the same file; the edit runs.
    ranTool(t, A, "Read", { file_path: file });
    ranTool(t, A, "Edit", { file_path: file, old_string: "base", new_string: "A-change" }, () => fs.writeFileSync(file, "A-change\n"));
    touch(path.join(repo, "README.md"));
    await sync(t);
    await sync(t);
    const up = edits(fake);
    assert.deepEqual(
      up.map((e) => [e.session_key === A.key ? "A" : e.session_key === B.key ? "B" : "?", e.path]),
      [["A", "docs/r.md"]],
      `only A's edit goes up (${JSON.stringify(up)})`,
    );
    assert.ok(!readActs(t.home, B.lid).some((a) => a.t === "edit"), "B made no edit, for its siblings either");
    // A Codex session toward the same goal is held in A's name, not B's.
    const X = await shared(t, repo, "codex");
    const held = json(pre(t, X, "apply_patch", { command: "*** Begin Patch\n*** Update File: docs/r.md\n@@\n-A-change\n+X\n*** End Patch\n" }).out);
    assert.match(held.hookSpecificOutput.permissionDecisionReason, new RegExp(`^Align: Claude Code session ${A.sid.slice(0, 8)}, working toward the same goal, edited docs/r\\.md`));
    const card = ctxText(prompt(t, X, "next"));
    assert.doesNotMatch(card, new RegExp(B.sid.slice(0, 8)), "B's refused edit is in no card");
  });

  test("a shell write counts once its command ran and its file changed; one that exited non-zero never does (E2E acycle2 A2-local-2); nor a refused one in a session with no PostToolUse hook", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "r1b");
    const A = await shared(t, repo);
    ranTool(t, A, "Read", { file_path: path.join(repo, "README.md") });
    const cmd = { command: "printf 'q\\n' > out.txt; false" };
    const { id } = pre(t, A, "Bash", cmd);
    fs.writeFileSync(path.join(repo, "out.txt"), "q\n");
    post(t, A, "Bash", cmd, id, true);
    ranTool(t, A, "Bash", { command: "printf 'r\\n' > ok.txt" }, () => fs.writeFileSync(path.join(repo, "ok.txt"), "r\n"));
    // A refused shell write in a Codex session (no PostToolUse hook): its file never appears.
    const C = await shared(t, repo, "codex");
    pre(t, C, "Bash", { command: "echo x > never.txt" });
    await sync(t);
    assert.deepEqual(edits(fake).map((e) => e.path), ["ok.txt"]);
  });
});

describe("A1-local-2: a commit does not re-credit edits a hook saw", () => {
  test("committing a hook-seen edit (from a terminal or by the agent) credits nobody else and uploads it once", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "r2");
    const A = await shared(t, repo);
    const B = await shared(t, repo);
    await sync(t); // the git pass's baseline
    const cut = path.join(repo, "src", "cutover.ts");
    fs.mkdirSync(path.dirname(cut), { recursive: true });
    ranTool(t, A, "Write", { file_path: cut, content: "x" }, () => fs.writeFileSync(cut, "export const b = 2;\n"));
    // Passes keep running for a while (each looks back 5 seconds for edits hooks just recorded).
    await sync(t);
    await new Promise((r) => setTimeout(r, 5200));
    await sync(t);
    // B is the session most recently active; the person commits everything in a terminal.
    prompt(t, B, "go on");
    lastActive(t, B, new Date());
    execFileSync("git", ["-C", repo, "add", "-A"]);
    execFileSync("git", ["-C", repo, "commit", "-qm", "Commit A's work"]);
    await sync(t);
    // The agent commits its own write.
    const x = path.join(repo, "src", "x.ts");
    ranTool(t, A, "Write", { file_path: x, content: "x" }, () => fs.writeFileSync(x, "x\n"));
    await sync(t);
    await new Promise((r) => setTimeout(r, 5200));
    await sync(t);
    ranTool(t, A, "Bash", { command: "git add src/x.ts && git commit -m 'Add x'" }, () => {
      execFileSync("git", ["-C", repo, "add", "src/x.ts"]);
      execFileSync("git", ["-C", repo, "commit", "-qm", "Add x"]);
    });
    await sync(t);
    await sync(t);
    const up = edits(fake).map((e) => [e.session_key === A.key ? "A" : "B", e.path]);
    assert.deepEqual(up, [["A", "src/cutover.ts"], ["A", "src/x.ts"]], JSON.stringify(up));
    assert.ok(!rawActs(t.home, B.lid).some((a) => a.via === "git"), "nothing credited to B via git");
    // A script's later change of a committed file is still found (once the pass's 5-second window for edits a hook just
    // recorded is past).
    await new Promise((r) => setTimeout(r, 5200));
    await sync(t);
    fs.writeFileSync(cut, "export const b = 3;\n");
    lastActive(t, B, new Date());
    await sync(t);
    const git = [...rawActs(t.home, A.lid), ...rawActs(t.home, B.lid)].filter((a) => a.via === "git").map((a) => path.basename(a.p!));
    assert.deepEqual(git, ["cutover.ts"], JSON.stringify([rawActs(t.home, A.lid), rawActs(t.home, B.lid)]));
  });
});

describe("A1-local-3: Claude Code hears which session changed a file it read", () => {
  test("at its next tool call, or its next prompt within the card's throttle, once each; the edit hold stays for an edit without a read", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "r3");
    const A = await shared(t, repo);
    const B = await shared(t, repo);
    const file = path.join(repo, "src", "cutover.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const b = 2;\n");
    // B saw a card a moment ago (so its throttle is on), then reads the file.
    prompt(t, B, "start work");
    ranTool(t, B, "Read", { file_path: file });
    await new Promise((r) => setTimeout(r, 20));
    // A changes it. Claude Code would refuse B's Edit now with its own error, before any hook runs.
    ranTool(t, A, "Read", { file_path: file });
    ranTool(t, A, "Edit", { file_path: file, old_string: "2", new_string: "20" }, () => fs.writeFileSync(file, "export const b = 20;\n"));
    const want = new RegExp(`^\\[Align\\] Claude Code session ${A.sid.slice(0, 8)}, working toward the same goal, edited src/cutover\\.ts less than a minute ago, after this session last read it\\. Read the file again before editing it`);
    // The next tool call, whatever it is (here the re-read after Claude Code's refusal), carries the note, once.
    const note = ctxText(ranTool(t, B, "Read", { file_path: file }));
    assert.match(note, want);
    assert.equal(ranTool(t, B, "Bash", { command: "ls" }), "", "told once");
    // The same at a prompt, whatever the card's 10-minute throttle.
    ranTool(t, A, "Edit", { file_path: file, old_string: "20", new_string: "21" }, () => fs.writeFileSync(file, "export const b = 21;\n"));
    const told = ctxText(prompt(t, B, "edit it"));
    assert.match(told, /edited src\/cutover\.ts less than a minute ago, after this session last read it/);
    assert.equal(prompt(t, B, "again"), "", "once");
  });
});

describe("A1-local-4: a shell read counts as a read", () => {
  test("`cat`, `sed -n`, `head`, `less` and `git diff <path>` are reads; a Codex session that read the file is not held", async () => {
    const r = (command: string) => readPaths("codex", "Bash", { command }, "/r").map((p) => p.replace("/r/", ""));
    assert.deepEqual(r("cat NOTES.md"), ["NOTES.md"]);
    assert.deepEqual(r("sed -n '1,80p' src/a.ts | head -5"), ["src/a.ts"]);
    assert.deepEqual(r("head -n 20 b.md && less c.md; git diff -- d.ts"), ["20", "b.md", "c.md", "d.ts"]);
    assert.deepEqual(r("cat > e.md <<'EOF'\nx\nEOF"), [], "a write is not a read");
    assert.deepEqual(r("sed -i 's/a/b/' f.md; echo $X"), []);
    assert.deepEqual(shellWrites("Bash", { command: "cat NOTES.md" }, "/r"), []);
    const { t } = await world();
    const repo = gitRepo(t, "r4");
    const A = await shared(t, repo);
    const C = await shared(t, repo, "codex");
    const notes = path.join(repo, "NOTES.md");
    ranTool(t, A, "Write", { file_path: notes, content: "a" }, () => fs.writeFileSync(notes, "a\n"));
    await new Promise((r) => setTimeout(r, 20));
    pre(t, C, "Bash", { command: "cat NOTES.md" });
    assert.equal(pre(t, C, "apply_patch", { command: "*** Begin Patch\n*** Update File: NOTES.md\n@@\n-a\n+c\n*** End Patch\n" }).out, "", "read through the shell since: not held");
  });
});

describe("A1-local-5 and A1-local-6: a session that moves to another goal", () => {
  test("its work toward its earlier goal is neither shown nor held toward the new one; from its next prompt it holds and is held as a sibling, before any sync", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "r5");
    const A = await shared(t, repo);
    const E = await shared(t, repo, "codex", "Cut hook latency");
    const db = path.join(repo, "src", "db.ts");
    const shared2 = path.join(repo, "src", "shared.ts");
    fs.mkdirSync(path.dirname(db), { recursive: true });
    // E edits src/db.ts toward its own goal; A edits src/shared.ts toward "Ship the v2".
    pre(t, E, "apply_patch", { command: "*** Begin Patch\n*** Add File: src/db.ts\n+x\n*** End Patch\n" });
    fs.writeFileSync(db, "x\n");
    ranTool(t, A, "Write", { file_path: shared2, content: "a" }, () => fs.writeFileSync(shared2, "a\n"));
    // E moves to "Ship the v2" in the session; its next prompt opens the new binding. No sync runs.
    assert.match(json(prompt(t, E, "::align bind Ship the v2")).reason, /from your next prompt this session counts toward "Ship the v2 onboarding flow"/);
    const bound = ctxText(prompt(t, E, "carry on"));
    assert.match(bound, /From this turn this session counts toward goal "Ship the v2 onboarding flow"/);
    // A6: E's patch of the file A just changed is held, from this prompt on.
    const held = json(pre(t, E, "apply_patch", { command: "*** Begin Patch\n*** Update File: src/shared.ts\n@@\n-a\n+e\n*** End Patch\n" }).out);
    assert.match(held?.hookSpecificOutput?.permissionDecisionReason ?? "", new RegExp(`Claude Code session ${A.sid.slice(0, 8)}, working toward the same goal, edited src/shared\\.ts`));
    // A5: E's earlier edit toward its old goal is not work toward this one: A's card does not name it, A's edit of it is
    // not held. E's new work is.
    const notes = path.join(repo, "NOTES.md");
    pre(t, E, "apply_patch", { command: "*** Begin Patch\n*** Add File: NOTES.md\n+n\n*** End Patch\n" });
    fs.writeFileSync(notes, "n\n");
    const card = ctxText(prompt(t, A, "next"));
    assert.match(card, /Codex session 019a0000 \(active just now\): edited NOTES\.md\./, card);
    assert.doesNotMatch(card, /src\/db\.ts/);
    assert.equal(pre(t, A, "Edit", { file_path: db, old_string: "x", new_string: "y" }).out, "", "E's edit toward its old goal holds nothing here");
  });

  test("after a move the bound note names the new goal's parents and dependencies", async () => {
    const { fake, t } = await world();
    const goals = fake.goals.get("ws_acme")!;
    const perf = goals.find((g) => g.id === "g_perf")!;
    perf.contributes_to = [{ id: "g_ship", title: "Ship the v2 onboarding flow", version: 1, reviewed_version: 1, stale: false }];
    assert.equal((await runCli(t, ["goals", "--refresh"])).code, 0);
    const repo = gitRepo(t, "r5b");
    const A = await shared(t, repo);
    prompt(t, A, "::align bind Cut hook latency");
    const bound = ctxText(prompt(t, A, "go"));
    assert.match(bound, /\[Align\] This goal contributes to "Ship the v2 onboarding flow" \(v1\); their changes also arrive as \[Align\] notes\. No added authority\./, bound);
  });
});

describe("A1-local-7: `align team` from a terminal", () => {
  test("lists every session in the folder, the most recently active one too", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "r7");
    const D = await shared(t, repo);
    const A = await shared(t, repo);
    ranTool(t, D, "Write", { file_path: path.join(repo, "d.txt"), content: "d" }, () => fs.writeFileSync(path.join(repo, "d.txt"), "d\n"));
    ranTool(t, A, "Write", { file_path: path.join(repo, "a.txt"), content: "a" }, () => fs.writeFileSync(path.join(repo, "a.txt"), "a\n"));
    lastActive(t, D, new Date(Date.now() - 60_000));
    lastActive(t, A, new Date());
    const r = await runCli(t, ["team", "--cwd", repo]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`Claude Code session ${A.sid.slice(0, 8)} \\(this machine\\), active just now: edited a\\.txt`));
    assert.match(r.stdout, new RegExp(`Claude Code session ${D.sid.slice(0, 8)} \\(this machine\\), active just now: edited d\\.txt`));
  });
});

describe("A1-local-8: trimming the activity file", () => {
  test("drops only uploaded lines: a burst of 1,200 shell edits all go up for their own session, once, and later lines after a trim too", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "r8");
    const A = await shared(t, repo);
    const D = await shared(t, repo);
    await sync(t);
    ranTool(t, D, "Write", { file_path: path.join(repo, "first.txt"), content: "f" }, () => fs.writeFileSync(path.join(repo, "first.txt"), "f\n"));
    await sync(t);
    const gen = path.join(repo, "gen");
    fs.mkdirSync(gen);
    const names = Array.from({ length: 1200 }, (_, i) => `gen/g${String(i + 1).padStart(4, "0")}.txt`);
    ranTool(t, D, "Bash", { command: `touch ${names.join(" ")}` }, () => names.forEach((f) => fs.writeFileSync(path.join(repo, f), "")));
    assert.ok(fs.statSync(layout.activity(t.home, D.lid)).size > 128 * 1024, "past the trim size");
    lastActive(t, A, new Date());
    await sync(t);
    const mine = (key: string) => edits(fake).filter((e) => e.session_key === key);
    assert.equal(mine(D.key).length, 1201, "every edit of D went up");
    assert.equal(new Set(mine(D.key).map((e) => e.path)).size, 1201, "once each");
    assert.equal(mine(A.key).length, 0, "none credited to A");
    // The next record trims what went up; what comes after still goes up exactly once.
    const before = fs.statSync(layout.activity(t.home, D.lid)).size;
    ranTool(t, D, "Write", { file_path: path.join(repo, "after.txt"), content: "z" }, () => fs.writeFileSync(path.join(repo, "after.txt"), "z\n"));
    assert.ok(fs.statSync(layout.activity(t.home, D.lid)).size < before, "trimmed");
    assert.match(fs.readFileSync(layout.activity(t.home, D.lid), "utf8"), /^\{"t":"base","b":\d+\}\n/);
    await sync(t);
    await sync(t);
    assert.deepEqual(mine(D.key).slice(1201).map((e) => e.path), ["after.txt"]);
    assert.equal(mine(A.key).length, 0);
  });
});

describe("works but confusing", () => {
  test("a card with three busy senders still names files", () => {
    const s = (id: string, k: number, harness: "claude-code" | "codex" = "claude-code") => ({
      harness,
      id,
      minutes_ago: 0,
      files: Array.from({ length: k }, (_, i) => `src/${id.slice(0, 2)}${i}.ts`),
      commits: ["Raise a to 10"],
    });
    const card = renderCard([s("619aae10", 7), s("ddd1199f", 10), s("019a0000", 3, "codex")])!;
    assert.ok(card.length <= 300, String(card.length));
    assert.match(card, /edited src\/610\.ts/);
    assert.match(card, /edited src\/dd0\.ts/);
    assert.doesNotMatch(card, /edited \d+ files/);
  });

  test("activity lines carry the goal they were recorded toward", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "rg");
    const A = await shared(t, repo);
    ranTool(t, A, "Read", { file_path: path.join(repo, "README.md") });
    const acts = rawActs(t.home, A.lid).filter((a: Act) => a.t === "read");
    assert.deepEqual(acts.map((a) => a.g), ["g_ship"]);
  });
});
