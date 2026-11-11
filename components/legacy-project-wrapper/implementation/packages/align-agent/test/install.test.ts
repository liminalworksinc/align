// `align install` / `uninstall` against sandboxed CLAUDE_CONFIG_DIR and CODEX_HOME.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
import { FakeServer } from "./fake-server.ts";
import { makeEnv, runCli, type TestEnv } from "./helpers.ts";

const envs: TestEnv[] = [];
after(() => envs.forEach((e) => e.cleanup()));

const USER_SETTINGS = {
  model: "opus",
  permissions: { allow: ["Bash(npm test)"] },
  env: { MY_VAR: "keep", OTEL_METRICS_EXPORTER: "prometheus" },
  hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "/usr/local/bin/my-guard.sh", timeout: 10 }] }],
    Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
  },
};

function counts(settings: any, marker: string) {
  const out: Record<string, number> = {};
  for (const [ev, groups] of Object.entries(settings.hooks || {})) {
    out[ev] = (groups as any[]).flatMap((g) => g.hooks).filter((h: any) => String(h.command).includes(marker)).length;
  }
  return out;
}

describe("install", () => {
  test("Claude Code plugin + Codex merge, idempotent, user config untouched, uninstall reverts only Align changes", async () => {
    const t = makeEnv();
    envs.push(t);
    const settingsFile = path.join(t.claudeDir, "settings.json");
    fs.writeFileSync(settingsFile, JSON.stringify(USER_SETTINGS, null, 2));
    const toml = 'model = "gpt-6.1-sol"\n\n[features]\nfoo = true\n\n[hooks.state."/x/hooks.json:session_start:0:0"]\ntrusted_hash = "sha256:abc"\n';
    fs.writeFileSync(path.join(t.codexHome, "config.toml"), toml);

    const dry = await runCli(t, ["install", "--claude", "--codex", "--dry-run"]);
    assert.equal(dry.code, 0, dry.stderr);
    assert.match(dry.stdout, /Would install the Align plugin for Claude Code/);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), USER_SETTINGS, "dry run writes nothing");
    assert.equal(fs.existsSync(path.join(t.claudeDir, "skills", "align")), false);
    assert.equal(fs.existsSync(path.join(t.codexHome, "hooks.json")), false);

    const r1 = await runCli(t, ["install", "--claude", "--codex"]);
    assert.equal(r1.code, 0, r1.stderr);
    assert.match(r1.stdout, /trust them; Align never writes trust entries/);
    const r2 = await runCli(t, ["install", "--claude", "--codex"]);
    assert.equal(r2.code, 0, r2.stderr);

    const marker = path.join(t.home, "bin", "current", "hook.js");
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), USER_SETTINGS, "settings.json untouched: Claude Code gets a plugin instead");
    assert.equal(fs.readdirSync(t.claudeDir).some((f) => f.startsWith("settings.json.align-backup-")), false, "so no backup either");
    const plugin = path.join(t.claudeDir, "skills", "align");
    assert.equal(JSON.parse(fs.readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8")).name, "align");
    const ph = JSON.parse(fs.readFileSync(path.join(plugin, "hooks", "hooks.json"), "utf8"));
    assert.deepEqual(counts(ph, marker), { SessionStart: 1, UserPromptSubmit: 1, PreToolUse: 1, PostToolUse: 1, PostToolUseFailure: 1, Stop: 1, StopFailure: 1 }, "one Align handler per event after two installs");
    assert.equal(ph.hooks.PreToolUse[0].matcher, "*");
    assert.equal(ph.hooks.PostToolUse[0].matcher, "*", "PostToolUse confirms an edit ran (A1-local-1)");

    const codexHooks = JSON.parse(fs.readFileSync(path.join(t.codexHome, "hooks.json"), "utf8"));
    assert.deepEqual(counts(codexHooks, marker), { SessionStart: 1, UserPromptSubmit: 1, PreToolUse: 1, Stop: 1 });
    assert.equal(fs.readFileSync(path.join(t.codexHome, "config.toml"), "utf8"), toml, "config.toml untouched (no trust entries, no telemetry)");
    assert.match(r1.stdout, /No background process/);

    // Installed hook runs from ALIGN_HOME/bin/current and derives ALIGN_HOME from its own path.
    const current = path.join(t.home, "bin", "current");
    assert.ok(fs.lstatSync(current).isSymbolicLink());
    const env = { ...t.env };
    delete env.ALIGN_HOME;
    const run = spawnSync(process.execPath, [path.join(current, "hook.js"), "claude", "UserPromptSubmit"], { input: JSON.stringify({ session_id: "s1", prompt_id: "p1", prompt: "::align status" }), env, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).decision, "block");

    const status = await runCli(t, ["status"]);
    assert.match(status.stdout, /Claude Code installed; Codex installed/);
    assert.match(status.stdout, /hook file ok/);
    const doctor = await runCli(t, ["doctor"]);
    assert.match(doctor.stdout, /hook latency/);

    const un = await runCli(t, ["uninstall"]);
    assert.equal(un.code, 0, un.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), USER_SETTINGS, "settings still the user's original");
    assert.equal(fs.existsSync(plugin), false, "plugin folder removed");
    assert.equal(fs.existsSync(path.join(t.codexHome, "hooks.json")), false, "hooks.json Align created is removed when empty");
    assert.equal(fs.readFileSync(path.join(t.codexHome, "config.toml"), "utf8"), toml);
    assert.ok(fs.existsSync(t.home), "ledger kept without --purge");
    await runCli(t, ["uninstall", "--purge"]);
    assert.equal(fs.existsSync(t.home), false);
  });

  test("moves handlers an earlier Align merged into settings.json over to the plugin, keeping the user's own", async () => {
    const t = makeEnv();
    envs.push(t);
    const settingsFile = path.join(t.claudeDir, "settings.json");
    const legacy = { type: "command", command: `'/usr/bin/node' '${path.join(t.home, "bin", "current", "hook.js")}' claude Stop`, timeout: 5 };
    fs.writeFileSync(settingsFile, JSON.stringify({ ...USER_SETTINGS, hooks: { ...USER_SETTINGS.hooks, SessionStart: [{ hooks: [legacy] }] } }, null, 2));
    const r = await runCli(t, ["install", "--claude"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Removed 1 hook handlers an earlier Align added/);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), USER_SETTINGS, "legacy handler gone, user hooks kept");
    assert.ok(fs.readdirSync(t.claudeDir).some((f) => f.startsWith("settings.json.align-backup-")));
  });

  test("refuses to overwrite a skills/align folder that is not Align's", async () => {
    const t = makeEnv();
    envs.push(t);
    const theirs = path.join(t.claudeDir, "skills", "align");
    fs.mkdirSync(theirs, { recursive: true });
    fs.writeFileSync(path.join(theirs, "SKILL.md"), "---\nname: align\n---\nsomeone else's skill\n");
    const r = await runCli(t, ["install", "--claude"]);
    assert.notEqual(r.code, 0);
    assert.match(r.stdout + r.stderr, /is not Align's plugin/);
    assert.equal(fs.readFileSync(path.join(theirs, "SKILL.md"), "utf8"), "---\nname: align\n---\nsomeone else's skill\n");
  });
});

// Which server an installed `align` signs in to (LIM-2504): the hosted one by default, the dev one only when asked.
const HOSTED = "https://align-pg-draft.fly.dev";
const DEV = "http://127.0.0.1:3100";

/** A sandbox as an installed build sees it: no ALIGN_SERVER. */
function installed(extra: NodeJS.ProcessEnv = {}): TestEnv {
  const t = makeEnv(extra);
  if (!("ALIGN_SERVER" in extra)) delete t.env.ALIGN_SERVER;
  envs.push(t);
  return t;
}

const configFile = (t: TestEnv) => path.join(t.home, "config.json");

describe("server default", () => {
  test("a fresh install uses the hosted server, and does not pin it in config.json", async () => {
    const t = installed();
    const r = await runCli(t, ["config"]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`server ${HOSTED.replace(/[.]/g, "\\.")}`));
    assert.doesNotMatch(r.stdout, /127\.0\.0\.1/);
    assert.equal("server_url" in JSON.parse(fs.readFileSync(configFile(t), "utf8")), false, "the build's default applies until a login chooses one");
  });

  test("ALIGN_DEV=1 picks the local dev server; ALIGN_SERVER still wins over it", async () => {
    const dev = await runCli(installed({ ALIGN_DEV: "1" }), ["config"]);
    assert.equal(dev.code, 0, dev.stderr);
    assert.match(dev.stdout, /server http:\/\/127\.0\.0\.1:3100/);
    const both = await runCli(installed({ ALIGN_DEV: "1", ALIGN_SERVER: "http://127.0.0.1:4999" }), ["config"]);
    assert.match(both.stdout, /server http:\/\/127\.0\.0\.1:4999/);
  });

  test("a server saved by an earlier build is kept", async () => {
    const t = installed();
    fs.mkdirSync(t.home, { recursive: true });
    fs.writeFileSync(configFile(t), JSON.stringify({ server_url: DEV }));
    const r = await runCli(t, ["config"]);
    assert.match(r.stdout, /server http:\/\/127\.0\.0\.1:3100/);
  });

  test("`align login --dev` with --server is refused before any pairing starts", async () => {
    const t = installed();
    const both = await runCli(t, ["login", "--dev", "--server", "http://127.0.0.1:4999"]);
    assert.notEqual(both.code, 0);
    assert.match(both.stderr, /--server <url> or --dev, not both/);
  });

  test("`align login` saves the server it signed in to, so later passes use it", async () => {
    const fake = new FakeServer({ accessTtl: 3600 });
    await fake.start();
    try {
      const t = installed({ ALIGN_DEVICE_POLL_SCALE_MS: "10" });
      const r = await runCli(t, ["login", "--server", fake.url, "--name", "Test Mac"]);
      assert.equal(r.code, 0, r.stderr);
      assert.equal(JSON.parse(fs.readFileSync(configFile(t), "utf8")).server_url, fake.url);
    } finally {
      await fake.stop();
    }
  });
});
