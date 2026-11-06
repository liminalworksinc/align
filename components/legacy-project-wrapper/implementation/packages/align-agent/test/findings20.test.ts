// Regressions for the acycle3 "local" E2E report (several sessions on one machine): a shell write recorded `failed`
// although it happened (a command that failed after writing, a `mv` keeping its old change time) and then credited to
// whichever session was most recently active (A3-local-1); a private or stopped session's edits uploaded through the git
// pass as another session's (A3-local-2); a refused Codex patch counted because a sibling wrote the same lines past the
// 8th (A3-local-3) or the user wrote the same content during the turn (A3-local-4); a killed or interrupted Claude Code
// session's real edit never reported (A3-local-5); a commit in a command that then failed never reported
// (A3-local-6); local siblings carded under the other-people header (A3-local-7); the trim dropping edits inside the
// hold window (A3-local-8); Codex sessions started together sharing one short id (A3-local-9); a three-way hold with
// no "and" (A3-local-10); Claude Code's heredoc commit read as a write to `EOF` (A3-local-11); and task, claim and
// git-credited records with no goal, counted toward a goal the session moved to (A3-cross-4).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import os from "node:os";
import { withLock } from "../src/api.ts";
import { sessionKey } from "../src/keys.ts";
import { commitSubject, pathHash, repoIdentity, shellWrites, type Act } from "../src/hooks/siblings.ts";
import * as envelope from "../src/shared/envelope.ts";
import { layout, localId } from "../src/shared/layout.ts";
import { FakeServer } from "./fake-server.ts";
import { claudeAssistant, claudeUser, ctxFor, HOOK, makeEnv, runCli, runHook, usage, writeLines, type TestEnv } from "./helpers.ts";

// Read loosely, so this file runs (and fails test by test) against the agent before these fixes.
const { renderCard } = envelope;
const shortId: (h: "claude-code" | "codex", id: string) => string = (envelope as unknown as { shortId?: typeof shortId }).shortId ?? ((_h, id) => id.slice(0, 8));
const privateMarks = (home: string) => path.join(home, "private");

const cleanups: (() => Promise<void> | void)[] = [];
after(async () => {
  for (const c of cleanups.reverse()) await c();
});

const FAST = { ALIGN_DEVICE_POLL_SCALE_MS: "10", ALIGN_OUTBOX_MAX_BACKOFF_MS: "200" };
const json = (s: string) => (s ? JSON.parse(s) : null);
const ctxText = (s: string): string => json(s)?.hookSpecificOutput?.additionalContext ?? "";
const denyText = (s: string): string => json(s)?.hookSpecificOutput?.permissionDecisionReason ?? "";

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

const gitEnv = { ...process.env };
function gitRepo(t: TestEnv, name: string): string {
  const dir = path.join(t.root, name);
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  const g = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { stdio: "ignore", env: gitEnv });
  g("init", "-q");
  g("config", "user.email", "t@example.test");
  g("config", "user.name", "T");
  g("remote", "add", "origin", `https://github.example.edu/lab/${name}.git`);
  fs.writeFileSync(path.join(dir, "README.md"), "hi\n");
  g("add", "README.md");
  g("commit", "-qm", "init");
  return fs.realpathSync(dir);
}
const git = (repo: string, ...a: string[]) => execFileSync("git", ["-C", repo, ...a], { stdio: "ignore", env: gitEnv });

type Kind = "new" | "old" | "codex";
interface S {
  sid: string;
  lid: string;
  key: string;
  kind: Kind;
  cwd: string;
}
const hk = (k: Kind) => (k === "codex" ? "codex" : "claude");
const harnessOf = (s: S) => (s.kind === "codex" ? "codex" : "claude-code");

function hook(t: TestEnv, s: S, event: string, input: Record<string, unknown>): string {
  const args = s.kind === "new" && event === "PreToolUse" ? ["--post-tool-use"] : [];
  const r = spawnSync(process.execPath, [HOOK, hk(s.kind), event, ...args], { input: JSON.stringify({ session_id: s.sid, cwd: s.cwd, turn_id: "t", ...input }), env: t.env, encoding: "utf8", timeout: 10_000 });
  return r.stdout;
}

let n = 0;
function session(cwd: string, kind: Kind, sid?: string): S {
  sid ??= kind === "codex" ? `019a0000-0000-7000-8000-${String(++n).padStart(12, "0")}` : `${String(++n).padStart(8, "d")}-1111-2222-3333-444444444444`;
  return { sid, lid: localId(kind === "codex" ? "codex" : "claude-code", sid), key: "", kind, cwd };
}
async function shared(t: TestEnv, cwd: string, kind: Kind = "new", goal = "Ship the v2", sid?: string): Promise<S> {
  const s = session(cwd, kind, sid);
  hook(t, s, "SessionStart", { source: "startup" });
  hook(t, s, "UserPromptSubmit", { prompt_id: `${s.sid}-p0`, prompt: "start" });
  const r = await runCli(t, ["share", s.lid.slice(0, 8), "--workspace", "Acme", "--goal", goal, "--signals", "--yes"]);
  assert.equal(r.code, 0, r.stderr);
  const ctx = ctxFor(t);
  s.key = sessionKey(ctx.secret, "ws_acme", harnessOf(s), s.sid);
  ctx.db.close();
  return s;
}

let u = 0;
function pre(t: TestEnv, s: S, tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const id = `toolu_${++u}`;
  return { id, out: hook(t, s, "PreToolUse", { tool_name: tool, tool_input: input, tool_use_id: id, ...extra }) };
}
function ran(t: TestEnv, s: S, tool: string, input: Record<string, unknown>, effect: () => void = () => undefined): string {
  const { id, out } = pre(t, s, tool, input);
  effect();
  if (s.kind === "new") hook(t, s, "PostToolUse", { tool_name: tool, tool_input: input, tool_use_id: id });
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
/** Make a session's recorded lines older by `ms` (the call was made that long ago). */
function age(t: TestEnv, s: S, ms: number): void {
  const file = layout.activity(t.home, s.lid);
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/"at":"([^"]+)"/g, (_m, at: string) => `"at":"${new Date(Date.parse(at) - ms).toISOString()}"`));
}
/** The verdict recorded on one call's file (or its commit, `#commit`): true ran, false failed, null none. */
function verdict(t: TestEnv, s: S, id: string, p: string): boolean | null {
  const v = rawActs(t.home, s.lid).filter((a) => (a.t === "ran" || a.t === "failed") && a.u === id && a.p === p);
  return v.some((a) => a.t === "ran") ? true : v.length ? false : null;
}
const old = (f: string, minutes = 30) => {
  const when = new Date(Date.now() - minutes * 60_000);
  fs.utimesSync(f, when, when);
};

interface Row {
  name: string;
  /** The command, for case folder `d` (repo-relative). */
  cmd: (d: string) => string;
  writes: (d: string) => string[];
  commit: ((d: string) => string) | null;
  /** The files it starts from, committed before the git pass's baseline. */
  setup?: (repo: string, d: string) => void;
  /** Changes left in the working tree before the baseline (a file the command is to commit). */
  prepare?: (repo: string, d: string) => void;
  /** What the command did, when it changed anything. */
  effect: (repo: string, d: string) => void;
  /** It leaves the files as they were, whatever ran (a `touch` of an existing file). */
  noChange?: true;
}

const write = (repo: string, f: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
  fs.writeFileSync(path.join(repo, f), text);
};
const HEREDOC_COMMIT = (subject: string) => `git add docs && git commit -m "$(cat <<'EOF'\n${subject}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)"`;

const ROWS: Row[] = [
  {
    name: "a write, then a failing check (WF)",
    cmd: (d) => `printf 'WF-LINE\\n' > ${d}/wf.md && ls missing-dir`,
    writes: (d) => [`${d}/wf.md`],
    commit: null,
    effect: (repo, d) => write(repo, `${d}/wf.md`, "WF-LINE\n"),
  },
  {
    name: "`mv`, which keeps the source's old change time (MV)",
    cmd: (d) => `mv ${d}/mvsrc.md ${d}/mvdst.md`,
    writes: (d) => [`${d}/mvdst.md`, `${d}/mvsrc.md`],
    commit: null,
    setup: (repo, d) => {
      write(repo, `${d}/mvsrc.md`, "moved\n");
      old(path.join(repo, d, "mvsrc.md"));
    },
    effect: (repo, d) => fs.renameSync(path.join(repo, d, "mvsrc.md"), path.join(repo, d, "mvdst.md")),
  },
  {
    name: "`cp -p` over an older file of the same change time",
    cmd: (d) => `cp -p ${d}/a.md ${d}/b.md`,
    writes: (d) => [`${d}/b.md`],
    commit: null,
    setup: (repo, d) => {
      write(repo, `${d}/a.md`, "new content\n");
      write(repo, `${d}/b.md`, "old content\n");
      old(path.join(repo, d, "a.md"));
      old(path.join(repo, d, "b.md"));
    },
    effect: (repo, d) => {
      fs.copyFileSync(path.join(repo, d, "a.md"), path.join(repo, d, "b.md"));
      old(path.join(repo, d, "b.md"));
    },
  },
  {
    name: "`touch -d` of a new file",
    cmd: (d) => `touch -d '2 days ago' ${d}/t.md`,
    writes: (d) => [`${d}/t.md`],
    commit: null,
    effect: (repo, d) => {
      write(repo, `${d}/t.md`, "");
      old(path.join(repo, d, "t.md"), 2 * 24 * 60);
    },
  },
  {
    name: "`touch` of an existing file (its content stays)",
    cmd: (d) => `touch ${d}/same.md`,
    writes: (d) => [`${d}/same.md`],
    commit: null,
    setup: (repo, d) => write(repo, `${d}/same.md`, "same\n"),
    effect: (repo, d) => fs.utimesSync(path.join(repo, d, "same.md"), new Date(), new Date()),
    noChange: true,
  },
  {
    name: "a redirect into a folder that may not exist",
    cmd: (d) => `echo hi > ${d}/missing2/f.md`,
    writes: (d) => [`${d}/missing2/f.md`],
    commit: null,
    effect: (repo, d) => write(repo, `${d}/missing2/f.md`, "hi\n"),
  },
  {
    name: "`sed -i`, then the tests fail",
    cmd: (d) => `sed -i 's/a/b/' ${d}/s.md && npm test`,
    writes: (d) => [`${d}/s.md`],
    commit: null,
    setup: (repo, d) => write(repo, `${d}/s.md`, "a\n"),
    effect: (repo, d) => write(repo, `${d}/s.md`, "b\n"),
  },
  {
    name: "a heredoc write with `>` in its body",
    cmd: (d) => `cat > ${d}/plan.md <<'EOF'\nreads > writes\nEOF`,
    writes: (d) => [`${d}/plan.md`],
    commit: null,
    effect: (repo, d) => write(repo, `${d}/plan.md`, "reads > writes\n"),
  },
  {
    name: "a commit, then a push that fails (FW)",
    cmd: (d) => `git add ${d}/faw.md && git commit -q -m 'Add faw doc ${d}' && git push -q origin main`,
    writes: () => [],
    commit: (d) => `Add faw doc ${d}`,
    prepare: (repo, d) => write(repo, `${d}/faw.md`, "faw\n"),
    effect: (repo, d) => {
      git(repo, "add", `${d}/faw.md`);
      git(repo, "commit", "-qm", `Add faw doc ${d}`);
    },
  },
  {
    name: "Claude Code's heredoc commit (CA)",
    cmd: (d) => HEREDOC_COMMIT(`Add ca doc ${d}`),
    writes: () => [],
    commit: (d) => `Add ca doc ${d}`,
    prepare: (repo, d) => write(repo, `${d}/ca.md`, "ca\n"),
    effect: (repo, d) => {
      git(repo, "add", `${d}/ca.md`);
      git(repo, "commit", "-qm", `Add ca doc ${d}`);
    },
  },
];

// LIM-2441 H7c: the refresh lock's holder released it by unlinking the file whoever held it. A holder paused past the
// 20-second stale mark (a laptop asleep) had its lock taken over, then on waking deleted the new holder's lock, letting a
// third process refresh at the same time as the second.
describe("LIM-2441 H7c: a holder releases only its own refresh lock", () => {
  test("a paused holder whose lock was taken over leaves the new holder's lock in place, so a third waits", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "align-h7c-"));
    cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }));
    const file = layout.refreshLock(home);
    const gate = () => {
      let open!: () => void;
      const p = new Promise<void>((r) => (open = r));
      return { p, open };
    };
    const ga = gate();
    const gb = gate();
    let bIn = false;
    const a = withLock(home, () => ga.p);
    for (let i = 0; i < 50 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(fs.existsSync(file), "A holds the lock");
    // A sleeps past the stale mark: its heartbeat never ran, so its lock looks 25 s old.
    const old = new Date(Date.now() - 25_000);
    fs.utimesSync(file, old, old);
    const b = withLock(home, async () => {
      bIn = true;
      await gb.p;
    });
    for (let i = 0; i < 100 && !bIn; i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(bIn, "B took the stale lock over");
    // A wakes and finishes.
    ga.open();
    await a;
    assert.ok(fs.existsSync(file), "A's release left B's lock in place");
    let cIn = false;
    await assert.rejects(
      withLock(
        home,
        async () => {
          cIn = true;
        },
        400,
      ),
      /refresh lock busy/,
    );
    assert.equal(cIn, false, "a third never ran while B held the lock");
    gb.open();
    await b;
    assert.ok(!fs.existsSync(file), "B released its own lock");
  });
});

describe("A3-local-1, A3-local-6, A3-local-11: a shell command's effects are decided from their artifacts, whatever its exit status", () => {
  test("table: each command's writes and commit × exit status × whether it changed anything", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "table");
    const W = await shared(t, repo, "new");
    const SG = await shared(t, repo, "new"); // a read-only sibling, active after every call (the report's SG)
    const expected = { edits: [] as string[], commits: [] as string[] };
    const cases: { row: Row; exit: "ok" | "fail"; change: boolean; d: string }[] = [];
    let i = 0;
    for (const row of ROWS) for (const exit of ["ok", "fail"] as const) for (const change of [true, false]) cases.push({ row, exit, change, d: `docs/c${++i}` });
    // The files each case starts from are committed; a commit's file waits staged-to-be; then the git pass's baseline.
    for (const c of cases) {
      fs.mkdirSync(path.join(repo, c.d), { recursive: true });
      c.row.setup?.(repo, c.d);
    }
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "fixtures");
    for (const c of cases) c.row.prepare?.(repo, c.d);
    await sync(t);
    for (const { row, exit, change, d } of cases) {
      const input = { command: row.cmd(d) };
      const label = `${row.name}, exit ${exit}, ${change ? "changed" : "unchanged"}`;
      // The command's writes and commit, as the hook reads them (A3-local-11: never a file named EOF).
      assert.deepEqual(shellWrites("Bash", input, repo).map((p) => path.relative(repo, p)).sort(), row.writes(d).sort(), label);
      assert.equal(commitSubject("Bash", input), row.commit ? row.commit(d) : null, label);
      const { id } = pre(t, W, "Bash", input);
      if (change) row.effect(repo, d);
      hook(t, W, exit === "ok" ? "PostToolUse" : "PostToolUseFailure", { tool_name: "Bash", tool_input: input, tool_use_id: id, ...(exit === "fail" ? { error: "Exit code 2" } : {}) });
      const made = change && !row.noChange;
      for (const f of row.writes(d)) {
        assert.equal(verdict(t, W, id, path.join(repo, f)), made, `${label}: ${f}`);
        if (made) expected.edits.push(f);
      }
      if (row.commit) {
        assert.equal(verdict(t, W, id, "#commit"), made, `${label}: the commit`);
        if (made) expected.commits.push(row.commit(d));
      }
      ran(t, SG, "Read", { file_path: path.join(repo, "README.md") });
      lastActive(t, SG, new Date(Date.now() + 1000));
    }
    await sync(t);
    await sync(t);
    const mine = (k: string) => fake.activity.filter((a) => a.mine && a.session_key === k);
    assert.deepEqual(mine(W.key).filter((a) => a.kind === "edit").map((a) => a.path).sort(), [...new Set(expected.edits)].sort(), "every changed file went up once, for W");
    assert.deepEqual(mine(W.key).filter((a) => a.kind === "commit").map((a) => a.text).sort(), expected.commits.sort(), "every commit made went up, for W");
    assert.deepEqual(mine(SG.key).filter((a) => a.kind === "edit"), [], "nothing credited to the read-only sibling");
    assert.ok(!rawActs(t.home, SG.lid).some((a) => a.via === "git"), JSON.stringify(rawActs(t.home, SG.lid).filter((a) => a.via)));
    assert.ok(!rawActs(t.home, W.lid).some((a) => a.t === "edit" && /\/EOF$/.test(a.p || "")), "no write to a file named EOF");
  });

  test("a shell write whose file another session's confirmed edit changed meanwhile is not credited to it", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "meanwhile");
    const W = await shared(t, repo, "new");
    const A = await shared(t, repo, "new");
    const f = path.join(repo, "docs", "m.md");
    const input = { command: "sleep 5; printf 'w\\n' > docs/m.md" };
    const { id } = pre(t, W, "Bash", input);
    ran(t, A, "Write", { file_path: f, content: "A\n" }, () => fs.writeFileSync(f, "A\n"));
    hook(t, W, "PostToolUseFailure", { tool_name: "Bash", tool_input: input, tool_use_id: id, error: "Exit code 130" });
    assert.equal(verdict(t, W, id, f), false);
    await sync(t);
    assert.deepEqual(editsOf(fake, "docs/m.md").map((e) => e.session_key === A.key), [true]);
  });
});

describe("A3-local-2: a session that is not shared is never credited, through git or otherwise", () => {
  for (const how of ["never shared", "`::align unshare`", "`align stop-sharing`", "seen only in the sessions this machine meters"] as const) {
    test(`${how}: its edits in a shared folder go up as no one's, also once committed`, async () => {
      const { fake, t } = await world();
      const repo = gitRepo(t, "private");
      const CB = await shared(t, repo, "new");
      let P: S;
      if (how === "never shared") {
        P = session(repo, "new");
        hook(t, P, "SessionStart", { source: "startup" });
      } else {
        P = await shared(t, repo, "new");
        if (how === "`::align unshare`") assert.match(json(hook(t, P, "UserPromptSubmit", { prompt_id: "u1", prompt: "::align unshare" })).reason, /will stop sharing/);
        else assert.equal((await runCli(t, ["stop-sharing", P.lid.slice(0, 8)])).code, 0);
      }
      await sync(t); // the baseline; the unshare is applied
      const priv = path.join(repo, "docs", "private.md");
      if (how === "seen only in the sessions this machine meters") {
        // No hook of P runs (Align's hooks are not installed for it): a script of its writes the file.
        fs.writeFileSync(priv, "private work\n");
        lastActive(t, P, new Date());
      } else {
        hook(t, P, "UserPromptSubmit", { prompt_id: "p1", prompt: "write it" });
        ran(t, P, "Write", { file_path: priv, content: "private work\n" }, () => fs.writeFileSync(priv, "private work\n"));
        stop(t, P);
      }
      ran(t, CB, "Read", { file_path: path.join(repo, "README.md") });
      lastActive(t, CB, new Date(Date.now() + 1000));
      await sync(t);
      await sync(t);
      // Committed later, with CB still the most recently active: still no one's.
      git(repo, "add", "-A");
      git(repo, "commit", "-qm", "private work");
      lastActive(t, CB, new Date(Date.now() + 2000));
      await sync(t);
      assert.deepEqual(editsOf(fake, "docs/private.md"), [], "never uploaded");
      assert.ok(!JSON.stringify(fake.activity).includes("private.md"), "its path never left the machine");
      assert.ok(!rawActs(t.home, CB.lid).some((a) => a.p === priv), "not credited to the shared session");
      assert.ok(!rawActs(t.home, P.lid).some((a) => a.t === "edit" && a.p === priv), "nothing recorded for the unshared session");
      // The local mark holds keyed hashes only, never a path.
      const marks = fs.existsSync(privateMarks(t.home)) ? fs.readdirSync(privateMarks(t.home)).map((f) => fs.readFileSync(path.join(privateMarks(t.home), f), "utf8")).join("") : "";
      assert.ok(!marks.includes(repo) && !marks.includes("private"), marks);
      // A script's change after the unshared session is done is credited as before.
      await new Promise((r) => setTimeout(r, 1100));
      lastActive(t, P, new Date(Date.now() - 10 * 60_000));
      await sync(t);
      fs.writeFileSync(path.join(repo, "docs", "later.md"), "a script\n");
      lastActive(t, CB, new Date(Date.now() + 3000));
      await sync(t);
      assert.deepEqual(editsOf(fake, "docs/later.md").map((e) => e.session_key === CB.key), [true], "a later script change still goes to the shared session");
    });
  }
});

describe("A3-local-3, A3-local-4: a refused Codex patch never counts because the same content appeared otherwise", () => {
  test("a sibling's write with the patch's line past its first 8 new lines, and the user's write after the session's next hook, credit nothing; a patch that ran does", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "k3");
    const K3 = await shared(t, repo, "codex");
    const M = await shared(t, repo, "new");
    const A1 = await shared(t, repo, "new");
    const db = path.join(repo, "src", "db.ts");
    fs.mkdirSync(path.dirname(db), { recursive: true });
    fs.writeFileSync(db, "export const db = 1;\n");
    // K3's patch is refused; M then writes 9 comment lines and that same line.
    pre(t, K3, "apply_patch", { command: '*** Begin Patch\n*** Update File: src/db.ts\n@@\n export const db = 1;\n+export const k3 = "late";\n*** End Patch\n' });
    const mText = `export const db = 1;\n${Array.from({ length: 9 }, (_, i) => `// note ${i}`).join("\n")}\nexport const k3 = "late";\n`;
    ran(t, M, "Write", { file_path: db, content: mText }, () => fs.writeFileSync(db, mText));
    stop(t, K3);
    // K2's Add File is refused; its next hook comes; then the user writes exactly those lines.
    pre(t, K3, "apply_patch", { command: "*** Begin Patch\n*** Add File: docs/k2.md\n+K2-LINE-ONE\n+K2-LINE-TWO\n*** End Patch\n" });
    age(t, K3, 3000);
    pre(t, K3, "Bash", { command: "ls" });
    fs.writeFileSync(path.join(repo, "docs", "k2.md"), "K2-LINE-ONE\nK2-LINE-TWO\n");
    stop(t, K3);
    // A patch that ran counts, decided at the next hook.
    pre(t, K3, "apply_patch", { command: "*** Begin Patch\n*** Add File: docs/ok.md\n+K3 wrote this\n*** End Patch\n" });
    fs.writeFileSync(path.join(repo, "docs", "ok.md"), "K3 wrote this\n");
    stop(t, K3);
    await sync(t);
    const by = (f: string) => editsOf(fake, f).map((e) => (e.session_key === K3.key ? "K3" : e.session_key === M.key ? "M" : "?"));
    assert.deepEqual(by("src/db.ts"), ["M"]);
    assert.deepEqual(by("docs/k2.md"), []);
    assert.deepEqual(by("docs/ok.md"), ["K3"]);
    // K3 holds nobody's edit of src/db.ts; M does.
    const held = denyText(pre(t, A1, "Edit", { file_path: db, old_string: "// note 0", new_string: "// n" }).out);
    assert.match(held, new RegExp(`^Align: Claude Code session ${shortId("claude-code", M.sid)}, working toward the same goal`));
    assert.doesNotMatch(held, new RegExp(shortId("codex", K3.sid)));
  });
});

describe("A3-local-5: a Claude Code call whose PostToolUse never came falls back to its content evidence", () => {
  test("killed mid-tool: the sync pass reports the write for its own session a minute on; interrupted: its next prompt does; a refused write never counts", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "kill");
    const KL = await shared(t, repo, "new");
    const KL2 = await shared(t, repo, "new");
    const R = await shared(t, repo, "new");
    const SG = await shared(t, repo, "new");
    await sync(t);
    // KL is killed during the sleep: no PostToolUse, no Stop, ever.
    pre(t, KL, "Bash", { command: "printf 'KILL-LINE\\n' > docs/kill.md && python3 -c 'import time; time.sleep(40)'" });
    fs.writeFileSync(path.join(repo, "docs", "kill.md"), "KILL-LINE\n");
    // KL2 is interrupted (Esc): its next prompt is the next hook.
    pre(t, KL2, "Bash", { command: "printf 'INT-LINE\\n' > docs/int.md && sleep 40" });
    fs.writeFileSync(path.join(repo, "docs", "int.md"), "INT-LINE\n");
    hook(t, KL2, "UserPromptSubmit", { prompt_id: "k2", prompt: "go on" });
    // R's Write is refused at the prompt; its next call comes; another session then writes the same content.
    const r = path.join(repo, "docs", "r.md");
    pre(t, R, "Write", { file_path: r, content: "R\n" });
    age(t, R, 3000);
    ran(t, R, "Read", { file_path: path.join(repo, "README.md") });
    ran(t, SG, "Write", { file_path: r, content: "R\n" }, () => fs.writeFileSync(r, "R\n"));
    lastActive(t, SG, new Date(Date.now() + 1000));
    await sync(t);
    assert.deepEqual(editsOf(fake, "docs/kill.md"), [], "not yet: its PostToolUse may still come");
    age(t, KL, 61_000);
    await sync(t);
    await sync(t);
    const who = (f: string) => editsOf(fake, f).map((e) => (e.session_key === KL.key ? "KL" : e.session_key === KL2.key ? "KL2" : e.session_key === SG.key ? "SG" : "?"));
    assert.deepEqual(who("docs/kill.md"), ["KL"]);
    assert.deepEqual(who("docs/int.md"), ["KL2"]);
    assert.deepEqual(who("docs/r.md"), ["SG"]);
    // Its edit holds a sibling's edit of the file.
    const held = denyText(pre(t, SG, "Edit", { file_path: path.join(repo, "docs", "kill.md"), old_string: "KILL", new_string: "K" }).out);
    assert.match(held, new RegExp(`Claude Code session ${shortId("claude-code", KL.sid)}`));
  });
});

describe("A3-local-7: local siblings keep their own header next to other people's work", () => {
  test("the card has an on-this-machine part and an in-flight part", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "card");
    const A = await shared(t, repo, "new");
    const B = await shared(t, repo, "new");
    const id = repoIdentity("ws_acme", repo)!;
    fake.addRemoteActivity("ws_acme", { session_key: "lena-key", harness: "claude-code", user: { id: "u_lena", name: "Lena" }, kind: "edit", repo_id: id.repo_id, path_hash: pathHash(id.repo_id, "docs/runbook.md"), path: "docs/runbook.md" });
    await sync(t);
    const f = path.join(repo, "docs", "ca.md");
    ran(t, B, "Write", { file_path: f, content: "ca\n" }, () => fs.writeFileSync(f, "ca\n"));
    const card = ctxText(hook(t, A, "UserPromptSubmit", { prompt_id: "a1", prompt: "go" })).split("\n").find((l) => l.includes("on this machine")) ?? "";
    assert.match(card, new RegExp(`^\\[Align\\] Also working toward this goal on this machine: Claude Code session ${shortId("claude-code", B.sid)} \\(active just now\\): edited docs/ca\\.md\\. Read their changes before editing the same files\\.`), card);
    assert.match(card, /In flight toward this goal and related ones: Lena \(1 session, just now\): edited docs\/runbook\.md\. The user can type `::align team` for details\./, card);
    assert.ok(card.length <= 450, `${card.length}: ${card}`);
  });

  test("renderCard: one part each, the first sender's part first", () => {
    const local = { harness: "claude-code" as const, id: "aaaa1111", minutes_ago: 0, files: ["src/a.ts"], commits: [], claims: [] };
    const remote = { harness: "claude-code" as const, id: "k", who: "Lena", remote: true, sessions: 1, minutes_ago: 1, files: ["src/b.ts"], overlap: ["src/b.ts"], commits: [], claims: [] };
    const card = renderCard([remote, local])!;
    assert.match(card, /^\[Align\] In flight toward this goal and related ones: Lena .*The user can type `::align team` for details\. Also working toward this goal on this machine: Claude Code session aaaa1111 .*Read their changes before editing the same files\.$/);
    assert.equal(renderCard([local]), "[Align] Also working toward this goal on this machine: Claude Code session aaaa1111 (active just now): edited src/a.ts. Read their changes before editing the same files.");
  });
});

describe("A3-local-8: the trim keeps what the hold still reads", () => {
  test("after a burst of 1,100 shell edits and a sync, the next record keeps the edits of the last 20 minutes, which still hold", async () => {
    const { fake, t } = await world();
    const repo = gitRepo(t, "burst");
    const T = await shared(t, repo, "new");
    const G = await shared(t, repo, "new");
    await sync(t);
    const names = Array.from({ length: 1100 }, (_, i) => `gen/f${String(i + 1).padStart(4, "0")}.txt`);
    fs.mkdirSync(path.join(repo, "gen"));
    ran(t, T, "Bash", { command: `touch ${names.join(" ")}` }, () => names.forEach((f) => fs.writeFileSync(path.join(repo, f), "")));
    await sync(t);
    assert.equal(fake.activity.filter((a) => a.session_key === T.key && a.kind === "edit").length, 1100);
    ran(t, T, "Read", { file_path: path.join(repo, "README.md") }); // the next record
    assert.ok(rawActs(t.home, T.lid).filter((a) => a.t === "edit").length >= 1100, "the edits are kept");
    for (const f of ["gen/f0001.txt", "gen/f1100.txt"]) {
      const held = denyText(pre(t, G, "Write", { file_path: path.join(repo, f), content: "g\n" }).out);
      assert.match(held, new RegExp(`Claude Code session ${shortId("claude-code", T.sid)}, working toward the same goal, edited ${f.replace(/\./g, "\\.")}`), f);
    }
    // Past the hold's window the uploaded lines go.
    age(t, T, 30 * 60_000);
    ran(t, T, "Read", { file_path: path.join(repo, "README.md") });
    assert.match(fs.readFileSync(layout.activity(t.home, T.lid), "utf8"), /^\{"t":"base","b":\d+\}\n/);
    assert.ok(fs.statSync(layout.activity(t.home, T.lid)).size < 128 * 1024);
  });
});

describe("A3-local-9, A3-local-10: names that tell sessions apart, and a three-way hold", () => {
  test("two Codex sessions started together go by different ids in `align team` and in a hold; three sessions are named \"A, B and C\"", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "names");
    const C1 = await shared(t, repo, "codex", "Ship the v2", "019a2c4e-7b10-7c3e-9f21-5e2f1a9cd3b7");
    const C2 = await shared(t, repo, "codex", "Ship the v2", "019a2c4e-8c20-7d4e-a032-6f303b0de4c8");
    const N = await shared(t, repo, "new");
    const X = await shared(t, repo, "new");
    const f = path.join(repo, "docs", "three.md");
    const patch = (line: string) => ({ command: `*** Begin Patch\n*** Add File: docs/${line}.md\n+${line}\n*** End Patch\n` });
    pre(t, C1, "apply_patch", patch("one"));
    fs.writeFileSync(path.join(repo, "docs", "one.md"), "one\n");
    stop(t, C1);
    pre(t, C2, "apply_patch", patch("two"));
    fs.writeFileSync(path.join(repo, "docs", "two.md"), "two\n");
    stop(t, C2);
    const team = (await runCli(t, ["team", "--cwd", repo])).stdout;
    assert.match(team, /- Codex session 1a9cd3b7 \(this machine\), active just now: edited docs\/one\.md/, team);
    assert.match(team, /- Codex session 3b0de4c8 \(this machine\), active just now: edited docs\/two\.md/, team);
    // All three change docs/three.md; X's edit is held once, naming them all, with "and" before the last.
    pre(t, C1, "apply_patch", { command: "*** Begin Patch\n*** Add File: docs/three.md\n+c1\n*** End Patch\n" });
    fs.writeFileSync(f, "c1\n");
    stop(t, C1);
    pre(t, C2, "Bash", { command: "cat docs/three.md" }); // read first: not held
    pre(t, C2, "apply_patch", { command: "*** Begin Patch\n*** Update File: docs/three.md\n@@\n-c1\n+c2\n*** End Patch\n" });
    fs.writeFileSync(f, "c2\n");
    stop(t, C2);
    ran(t, N, "Read", { file_path: f });
    ran(t, N, "Write", { file_path: f, content: "n\n" }, () => fs.writeFileSync(f, "n\n"));
    const held = denyText(pre(t, X, "Write", { file_path: f, content: "x\n" }).out);
    assert.match(held, /^Align: Codex session 1a9cd3b7 edited docs\/three\.md less than a minute ago, Codex session 3b0de4c8 edited docs\/three\.md less than a minute ago and Claude Code session \w{8} edited docs\/three\.md less than a minute ago, all working toward the same goal\. Read the file again so you keep their changes, then retry this edit\.$/, held);
  });
});

describe("A3-cross-4: every record carries the goal it was made toward", () => {
  test("a task label, a claim and a git-credited edit made toward one goal are not shown toward the goal the session moves to", async () => {
    const { t } = await world();
    const repo = gitRepo(t, "moves");
    const L1 = await shared(t, repo, "new", "Cut hook latency");
    const L6 = await shared(t, repo, "new", "Ship the v2");
    await sync(t);
    hook(t, L1, "UserPromptSubmit", { prompt_id: "t1", prompt: "::align task tune the cache" });
    hook(t, L1, "UserPromptSubmit", { prompt_id: "t2", prompt: "::align claim docs/RUNBOOK.md for the cutover" });
    fs.writeFileSync(path.join(repo, "docs", "script.md"), "a script\n");
    lastActive(t, L1, new Date(Date.now() + 1000));
    await sync(t);
    const acts = rawActs(t.home, L1.lid);
    for (const kind of ["task", "claim"]) assert.equal(acts.find((a) => a.t === kind)?.g, "g_perf", kind);
    assert.equal(acts.find((a) => a.via === "git")?.g, "g_perf", "git-credited");
    // L1 moves to "Ship the v2"; L6's team view lists none of its earlier work.
    hook(t, L1, "UserPromptSubmit", { prompt_id: "t3", prompt: "::align bind Ship the v2" });
    hook(t, L1, "UserPromptSubmit", { prompt_id: "t4", prompt: "go on" });
    const team = (await runCli(t, ["team", "--cwd", repo])).stdout;
    assert.doesNotMatch(team, /tune the cache|RUNBOOK|script\.md/, team);
    const card = ctxText(hook(t, L6, "UserPromptSubmit", { prompt_id: "l6", prompt: "go" }));
    assert.doesNotMatch(card, /tune the cache|RUNBOOK|script\.md/, card);
  });
});

describe("A3-local-11: heredocs are data", () => {
  test("no shape of heredoc reads as a write, a read or a commit", () => {
    const w = (command: string) => shellWrites("Bash", { command }, "/r").map((p) => p.replace("/r/", ""));
    assert.deepEqual(w(HEREDOC_COMMIT("Add ca doc")), []);
    assert.equal(commitSubject("Bash", { command: HEREDOC_COMMIT("Add ca doc") }), "Add ca doc");
    assert.deepEqual(w('git commit -F - <<EOF\nFix "a" > b\nEOF'), []);
    assert.deepEqual(w("cat <<EOF > out.md\na > b\nEOF\necho done > d.txt"), ["out.md", "d.txt"]);
    assert.deepEqual(w("cat <<-EOF >> t.md\n\tx > y\n\tEOF"), ["t.md"]);
    assert.deepEqual(w('cat <<"END" | tee log.txt\n> not a file\nEND'), ["log.txt"]);
    assert.deepEqual(w("python3 - <<'PY'\nopen('x','w').write('>y')\nPY"), []);
    assert.deepEqual(w("echo \"a > b\" && echo 'c > d' # e > f"), []);
    assert.equal(commitSubject("Bash", { command: "cat > notes.md <<'EOF'\ngit commit -m 'not a commit'\nEOF" }), null);
  });
});

// LIM-2441 H4: a usage upload refused for a reason other than the share's (400, 413, 422) ended the pass with no log and
// no row marked, so one bad row blocked every later pass; a 5xx was handled the same way.
describe("LIM-2441 H4: a refused usage row never blocks the others", () => {
  let k = 0;
  async function sharedSession(t: TestEnv) {
    const sid = `${String(++k).padStart(8, "d")}-4444-2222-3333-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
    const cwd = path.join(t.root, `h4-${k}`);
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
  /** One finished turn whose request used `input` input tokens. */
  function turnOf(t: TestEnv, s: { sid: string; cwd: string }, req: string, input: number) {
    const file = path.join(t.claudeDir, "projects", `-${path.basename(s.cwd)}`, `${s.sid}.jsonl`);
    const at = Date.now();
    const lines = [claudeUser(s.sid, `${req}-p`, new Date(at).toISOString(), { cwd: s.cwd }), { ...claudeAssistant(s.sid, req, new Date(at + 50).toISOString(), usage(input, 5)), cwd: s.cwd }];
    if (fs.existsSync(file)) fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    else writeLines(file, lines);
  }
  const rowsOf = (fake: FakeServer, key: string) => [...fake.usage.values()].filter((u) => u.session_key === key);
  const local = (t: TestEnv, lid: string) => {
    const ctx = ctxFor(t);
    const r = ctx.db.prepare("SELECT input, uploaded FROM requests WHERE local_id=? ORDER BY input").all(lid) as { input: number; uploaded: number }[];
    ctx.db.close();
    return r.map((x) => ({ input: x.input, uploaded: x.uploaded }));
  };
  const logText = (t: TestEnv) => {
    try {
      return fs.readFileSync(path.join(layout.logs(t.home), "align.log"), "utf8");
    } catch {
      return "";
    }
  };

  for (const status of [400, 413, 422]) {
    test(`one row refused ${status}: the others go up, that row stays on this machine, the refusal is logged with no content, and the next pass does not send it again`, async () => {
      const { fake, t } = await world();
      const A = await sharedSession(t);
      turnOf(t, A, "req_h4_a", 11);
      turnOf(t, A, "req_h4_bad", 77);
      turnOf(t, A, "req_h4_c", 13);
      fake.usageRefuse = (rows) => (rows.some((r) => r.input === 77) ? status : null);
      assert.equal((await runCli(t, ["sync"])).code, 0);
      assert.deepEqual(rowsOf(fake, A.key).map((r) => r.input).sort(), [11, 13], "the rows around the bad one went up");
      assert.deepEqual(local(t, A.lid), [{ input: 11, uploaded: 1 }, { input: 13, uploaded: 1 }, { input: 77, uploaded: 2 }]);
      const log = logText(t);
      assert.match(log, new RegExp(`refused 1 row of ${A.lid.slice(0, 8)} \\(${status}\\); it stays on this machine`));
      assert.doesNotMatch(log, /req_h4|start|h4-\d/, "no request id, prompt or path in the log");
      const sent = fake.log.filter((l) => l.path.endsWith("/usage")).length;
      turnOf(t, A, "req_h4_d", 14);
      assert.equal((await runCli(t, ["sync"])).code, 0);
      assert.equal(fake.log.filter((l) => l.path.endsWith("/usage")).length, sent + 1, "the next pass sends the new row once, never the bad one");
      assert.deepEqual(rowsOf(fake, A.key).map((r) => r.input).sort(), [11, 13, 14]);
    });
  }

  test("guard (already true on main except the per-session log line): a 503 marks nothing, is logged by status and count, and the rows go up when the server is back", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t);
    turnOf(t, A, "req_h4_e", 21);
    turnOf(t, A, "req_h4_f", 22);
    fake.usageRefuse = () => 503;
    const down = await runCli(t, ["sync"]);
    assert.equal(down.code, 1, "the pass says the server is down");
    assert.match(down.stderr, /answered HTTP 503\. 2 usage rows, .* stay on this machine; the next sync retries\./);
    assert.deepEqual(local(t, A.lid).map((r) => r.uploaded), [0, 0], "nothing marked while the server is down");
    assert.match(logText(t), new RegExp(`usage upload for ${A.lid.slice(0, 8)} answered 503: 2 row\\(s\\) wait for the next pass`));
    fake.usageRefuse = null;
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(rowsOf(fake, A.key).map((r) => r.input).sort(), [21, 22]);
    assert.deepEqual(local(t, A.lid).map((r) => r.uploaded), [1, 1]);
  });

  test("a server that refuses every row for three passes sets none aside: once it recovers, every row uploads", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t);
    for (let i = 0; i < 12; i++) turnOf(t, A, `req_h4_all${i}`, 30 + i);
    fake.usageRefuse = () => 400;
    for (let pass = 0; pass < 3; pass++) assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(local(t, A.lid).filter((r) => r.uploaded !== 0), [], "no row set aside while the server accepted none");
    assert.match(logText(t), new RegExp(`the server refused 5 row\\(s\\) of ${A.lid.slice(0, 8)} \\(400\\) and accepted none of its rows this pass, so none is set aside; they wait for the next pass`));
    fake.usageRefuse = null;
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(rowsOf(fake, A.key).length, 12, "every row went up once the server recovered");
    assert.ok(local(t, A.lid).every((r) => r.uploaded === 1));
  });

  test("a bad row first and a good row after it in one batch: the good one goes up, then the bad one is set aside", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t);
    turnOf(t, A, "req_h4_first_bad", 77);
    turnOf(t, A, "req_h4_then_good", 12);
    fake.usageRefuse = (rows) => (rows.some((r) => r.input === 77) ? 400 : null);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(rowsOf(fake, A.key).map((r) => r.input), [12]);
    assert.deepEqual(local(t, A.lid), [{ input: 12, uploaded: 1 }, { input: 77, uploaded: 2 }]);
  });

  test("one session's rows all refused while another session's are accepted in the same pass: the first session's rows are not set aside", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t);
    const B = await sharedSession(t);
    for (let i = 0; i < 6; i++) turnOf(t, A, `req_h4_a_all${i}`, 70 + i);
    turnOf(t, B, "req_h4_b_ok", 16);
    fake.usageRefuse = (rows) => (rows.some((r) => r.input >= 70) ? 400 : null);
    for (let pass = 0; pass < 3; pass++) assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(rowsOf(fake, B.key).map((r) => r.input), [16], "the other session's row went up");
    assert.deepEqual(local(t, A.lid).filter((r) => r.uploaded !== 0), [], "no row of the refused session set aside");
    fake.usageRefuse = null;
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal(rowsOf(fake, A.key).length, 6, "all of its rows went up once the server accepted them");
  });

  test("a lone bad row with nothing else to upload waits, unmarked, pass after pass", async () => {
    const { fake, t } = await world();
    const A = await sharedSession(t);
    turnOf(t, A, "req_h4_lone", 77);
    fake.usageRefuse = (rows) => (rows.some((r) => r.input === 77) ? 422 : null);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(local(t, A.lid), [{ input: 77, uploaded: 0 }], "not set aside: no other row was accepted");
    assert.match(logText(t), new RegExp(`the server refused 1 row\\(s\\) of ${A.lid.slice(0, 8)} \\(422\\) and accepted none of its rows this pass, so none is set aside`));
    // Once another row goes up in the same pass, the lone one is set aside.
    turnOf(t, A, "req_h4_good_later", 15);
    assert.equal((await runCli(t, ["sync"])).code, 0);
    assert.deepEqual(local(t, A.lid), [{ input: 15, uploaded: 1 }, { input: 77, uploaded: 2 }]);
  });
});
