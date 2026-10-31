#!/usr/bin/env node
// The Connect dialog's terminal lines (lib/paste-lines.ts) run in sh, bash and zsh with hostile company names and URLs:
// nothing a workspace or a request controls may run as shell or as the `node -e` script. `codex` and `claude` are stubs
// that record their arguments; `node` is the real one, so the hooks script really writes .claude/settings.local.json.
// Usage: node scripts/test-paste-lines.mjs
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BRIEF_HOOKS, claudeCodeLine, codexLine, CODEX_RULE, safeMcpUrl } from "../lib/paste-lines.ts";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${String(detail).slice(0, 400)}`}`);
}

const SHELLS = ["/bin/sh", "/bin/bash", "/bin/zsh"].filter((s) => existsSync(s));
const URL = "http://127.0.0.1:3331/api/mcp";
const HOSTILE = [
  `Acme"; touch PWNED_dq; echo "`,
  "$(touch PWNED_sub)",
  "`touch PWNED_bt`",
  "'; touch PWNED_sq; '",
  "Robert'); touch PWNED_paren #",
  "x\ntouch PWNED_nl\n",
  "!! !$ ${IFS} $HOME \\ %s %n %%",
  "‮emaN‬ ​; touch PWNED_bidi",
  `"); require("fs").writeFileSync("PWNED_js","x"); ("`,
  "A".repeat(500) + "; touch PWNED_long",
  "",
];

function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), "align-paste-"));
  const bin = path.join(root, "bin");
  const work = path.join(root, "work");
  mkdirSync(bin);
  mkdirSync(work);
  for (const name of ["codex", "claude"]) {
    const f = path.join(bin, name);
    // Each call appends its arguments, one per line, then a separator.
    writeFileSync(f, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done >> "${root}/${name}.args"\necho --- >> "${root}/${name}.args"\n`);
    chmodSync(f, 0o755);
  }
  return { root, bin, work };
}

function run(shell, line, box) {
  const env = { PATH: `${box.bin}:${process.env.PATH}`, HOME: box.root, CODEX_HOME: path.join(box.root, "codex"), LANG: "en_US.UTF-8" };
  mkdirSync(env.CODEX_HOME, { recursive: true });
  const args = shell.endsWith("zsh") ? ["-f", "-c", line] : ["-c", line];
  execFileSync(shell, args, { cwd: box.work, env, stdio: ["ignore", "pipe", "pipe"] });
}

/** Every file under dir, recursively. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const pwned = (box) => walk(box.root).filter((f) => /PWNED/.test(path.basename(f)));
const argsOf = (box, name) => {
  const f = path.join(box.root, `${name}.args`);
  return existsSync(f) ? readFileSync(f, "utf8").split("---\n").filter(Boolean).map((c) => c.replace(/\n$/, "").split("\n")) : [];
};

// ---- URLs ----
for (const good of [URL, "https://align-test.fly.dev/api/mcp", "http://[::1]:3000/api/mcp", "http://localhost:3000/api/mcp"])
  check(`a URL Align makes is accepted: ${good}`, safeMcpUrl(good) === good && codexLine(good) !== null && claudeCodeLine(good) !== null);
for (const bad of [
  "https://a.example/api/mcp'; touch PWNED; '",
  "https://a.example/api/mcp$(touch PWNED)",
  "https://a.example/api/mcp`id`",
  "https://a.example/api/mcp\ntouch PWNED",
  "https://a.example/api/mcp; touch PWNED",
  "https://a.example/other",
  "javascript:alert(1)//api/mcp",
  "https://user:pw@a.example/api/mcp",
])
  check(`a URL Align couldn't have made shows no command: ${JSON.stringify(bad)}`, safeMcpUrl(bad) === null && codexLine(bad) === null && claudeCodeLine(bad) === null);

// ---- the hooks script is a constant with no single quote, so shq() leaves it whole ----
check("the hooks script has no single quote and no workspace value", !BRIEF_HOOKS.includes("'") && claudeCodeLine(URL).endsWith(`node -e '${BRIEF_HOOKS}'`));

// ---- Codex line: a fixed rule, no workspace or company name, added once per machine, in every shell ----
// follow-up review L1: no name reaches the global AGENTS.md. codexLine takes only the URL, and the dialog passes nothing
// else; the hostile names are checked against the command and the file anyway.
const dialog = readFileSync(path.join(process.cwd(), "components/ConnectAI.tsx"), "utf8");
check(
  "the Codex line takes only the URL (no company name parameter), and the dialog passes only the URL",
  codexLine.length === 1 && /codexLine\(url\)/.test(dialog) && !/codexLine\([^)]*,/.test(dialog) && !/company/.test(dialog),
  (dialog.match(/codexLine\([^)]*\)/g) ?? []).join(" "),
);
const OLD_RULE = "- For any work for Harbor's teams, check Align first: call the align MCP server's align_get_directives and align_get_accepted_plan before planning.";
for (const shell of SHELLS) {
  for (const prior of ["", "# my own rules\n- Be brief.\n", `${OLD_RULE}\n`]) {
    const box = sandbox();
    try {
      const agentsFile = path.join(box.root, "codex", "AGENTS.md");
      mkdirSync(path.dirname(agentsFile), { recursive: true });
      if (prior) writeFileSync(agentsFile, prior);
      const line = codexLine(URL);
      run(shell, line, box);
      run(shell, line, box); // twice, as if a second workspace ran it: the same fixed rule, added once
      const agents = readFileSync(agentsFile, "utf8");
      const calls = argsOf(box, "codex");
      check(
        `${path.basename(shell)} codex line, AGENTS.md ${prior ? JSON.stringify(prior.slice(0, 24)) : "absent"}: the fixed rule is added once, word for word, after what was there; codex gets only the URL`,
        pwned(box).length === 0 && agents === `${prior}${CODEX_RULE}\n` && calls.length === 2 && calls.every((c) => JSON.stringify(c) === JSON.stringify(["mcp", "add", "align", "--url", URL])),
        `agents=${JSON.stringify(agents)} calls=${JSON.stringify(calls)}`,
      );
    } catch (e) {
      check(`${path.basename(shell)} codex line ran`, false, e.stderr?.toString() || e.message);
    } finally {
      rmSync(box.root, { recursive: true, force: true });
    }
  }
}
const cmd = codexLine(URL);
check(
  "no hostile company name reaches the Codex command or the rule (the rule is fixed text naming no company)",
  HOSTILE.every((c) => !c.trim() || !cmd.includes(c)) && !/PWNED|Robert|Acme|emaN/.test(cmd) && !/Harbor|company/i.test(CODEX_RULE),
  cmd,
);

// ---- Claude Code line: the real node writes the hooks, once, and nothing else runs ----
for (const shell of SHELLS) {
  const box = sandbox();
  try {
    const line = claudeCodeLine(URL);
    run(shell, line, box);
    run(shell, line, box);
    const settings = JSON.parse(readFileSync(path.join(box.work, ".claude", "settings.local.json"), "utf8"));
    const ups = settings.hooks?.UserPromptSubmit ?? [];
    const compact = settings.hooks?.SessionStart ?? [];
    const calls = argsOf(box, "claude");
    const hookOk = (h, ev) => h.length === 1 && h[0].hooks?.[0]?.type === "mcp_tool" && h[0].hooks[0].tool === "align_get_brief" && h[0].hooks[0].input?.event === ev && h[0].hooks[0].input?.session === "${session_id}";
    check(
      `${path.basename(shell)} claude code line: claude gets only the URL, both hooks are written once, nothing else runs`,
      pwned(box).length === 0 &&
        hookOk(ups, "UserPromptSubmit") &&
        hookOk(compact, "SessionStart") &&
        compact[0].matcher === "compact" &&
        calls.length === 4 &&
        JSON.stringify(calls[0]) === JSON.stringify(["mcp", "add", "--transport", "http", "--scope", "user", "align", URL]) &&
        JSON.stringify(calls[1]) === JSON.stringify(["mcp", "login", "align"]),
      `pwned=${pwned(box)} settings=${JSON.stringify(settings)} calls=${JSON.stringify(calls)}`,
    );
    // A settings file that isn't plain JSON is left as it is.
    const f = path.join(box.work, ".claude", "settings.local.json");
    writeFileSync(f, "{ not json");
    run(shell, line, box);
    check(`${path.basename(shell)} claude code line: a settings file that isn't plain JSON is left as it is`, readFileSync(f, "utf8") === "{ not json");
  } catch (e) {
    check(`${path.basename(shell)} claude code line ran`, false, e.stderr?.toString() || e.message);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
}

console.log(`\ntest-paste-lines: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
