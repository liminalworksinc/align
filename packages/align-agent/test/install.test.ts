// `align install` / `uninstall` against sandboxed CLAUDE_CONFIG_DIR and CODEX_HOME.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, describe, test } from "node:test";
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
  test("merges, is idempotent, preserves user config, and uninstall reverts only Align changes", async () => {
    const t = makeEnv();
    envs.push(t);
    const settingsFile = path.join(t.claudeDir, "settings.json");
    fs.writeFileSync(settingsFile, JSON.stringify(USER_SETTINGS, null, 2));
    const toml = 'model = "gpt-6.1-sol"\n\n[features]\nfoo = true\n\n[hooks.state."/x/hooks.json:session_start:0:0"]\ntrusted_hash = "sha256:abc"\n';
    fs.writeFileSync(path.join(t.codexHome, "config.toml"), toml);

    const dry = await runCli(t, ["install", "--claude", "--codex", "--dry-run"]);
    assert.equal(dry.code, 0, dry.stderr);
    assert.match(dry.stdout, /Would merge Claude Code hooks/);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), USER_SETTINGS, "dry run writes nothing");
    assert.equal(fs.existsSync(path.join(t.codexHome, "hooks.json")), false);

    const r1 = await runCli(t, ["install", "--claude", "--codex"]);
    assert.equal(r1.code, 0, r1.stderr);
    assert.match(r1.stdout, /trust them; Align never writes trust entries/);
    const r2 = await runCli(t, ["install", "--claude", "--codex"]);
    assert.equal(r2.code, 0, r2.stderr);

    const marker = path.join(t.home, "bin", "current", "hook.js");
    const s = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    assert.equal(s.model, "opus");
    assert.deepEqual(s.permissions, USER_SETTINGS.permissions);
    assert.deepEqual(counts(s, marker), { PreToolUse: 1, Stop: 1, SessionStart: 1, UserPromptSubmit: 1 }, "one Align handler per event after two installs");
    assert.ok(s.hooks.PreToolUse.some((g: any) => g.matcher === "Bash" && g.hooks[0].command === "/usr/local/bin/my-guard.sh"), "user hook kept");
    assert.equal(s.hooks.PreToolUse.find((g: any) => JSON.stringify(g).includes(marker)).matcher, "*");
    assert.equal(s.env.MY_VAR, "keep");
    assert.deepEqual(s.env, USER_SETTINGS.env, "env untouched: Align adds no telemetry settings");
    assert.ok(fs.readdirSync(t.claudeDir).some((f) => f.startsWith("settings.json.align-backup-")));

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
    const s2 = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    assert.deepEqual(s2, USER_SETTINGS, "settings back to the user's original");
    assert.equal(fs.existsSync(path.join(t.codexHome, "hooks.json")), false, "hooks.json Align created is removed when empty");
    assert.equal(fs.readFileSync(path.join(t.codexHome, "config.toml"), "utf8"), toml);
    assert.ok(fs.existsSync(t.home), "ledger kept without --purge");
    await runCli(t, ["uninstall", "--purge"]);
    assert.equal(fs.existsSync(t.home), false);
  });
});
