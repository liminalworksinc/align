#!/usr/bin/env node
// The Connect dialog's terminal lines (lib/paste-lines.ts) run in sh, bash and zsh with hostile company names and URLs:
// nothing a workspace or a request controls may run as shell or as the `node -e` script. `codex` and `claude` are stubs
// that record their arguments; `node` is the real one, so the hooks script really writes .claude/settings.local.json.
// Usage: node scripts/test-paste-lines.mjs
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BRIEF_HOOKS, claudeCodeLine, codexCompanyName, codexLine, CODEX_MARKER, safeMcpUrl } from "../lib/paste-lines.ts";

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
  check(`a URL Align makes is accepted: ${good}`, safeMcpUrl(good) === good && codexLine(good, "Acme") !== null && claudeCodeLine(good) !== null);
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
  check(`a URL Align couldn't have made shows no command: ${JSON.stringify(bad)}`, safeMcpUrl(bad) === null && codexLine(bad, "Acme") === null && claudeCodeLine(bad) === null);

// ---- the hooks script is a constant with no single quote, so shq() leaves it whole ----
check("the hooks script has no single quote and no workspace value", !BRIEF_HOOKS.includes("'") && claudeCodeLine(URL).endsWith(`node -e '${BRIEF_HOOKS}'`));

// ---- Codex line: hostile company names, in every shell ----
for (const shell of SHELLS) {
  for (const company of HOSTILE) {
    const box = sandbox();
    try {
      const line = codexLine(URL, company);
      run(shell, line, box);
      run(shell, line, box); // twice: the rule is added once
      const agents = readFileSync(path.join(box.root, "codex", "AGENTS.md"), "utf8");
      const name = codexCompanyName(company);
      const want = `- For any work for ${name}'s teams, ${CODEX_MARKER}: call the align MCP server's align_get_directives and align_get_accepted_plan before planning. Its dates and commitments replace older documents.\n`;
      const calls = argsOf(box, "codex");
      check(
        `${path.basename(shell)} codex line, company ${JSON.stringify(company.slice(0, 40))}: nothing runs, the rule is written once, word for word, and codex gets only the URL`,
        pwned(box).length === 0 && agents === want && calls.length === 2 && calls.every((c) => JSON.stringify(c) === JSON.stringify(["mcp", "add", "align", "--url", URL])),
        `pwned=${pwned(box)} agents=${JSON.stringify(agents)} calls=${JSON.stringify(calls)}`,
      );
    } catch (e) {
      check(`${path.basename(shell)} codex line, company ${JSON.stringify(company.slice(0, 40))} ran`, false, e.stderr?.toString() || e.message);
    } finally {
      rmSync(box.root, { recursive: true, force: true });
    }
  }
}
check("a company name keeps only letters, digits, spaces and . & ' -, at most 60 characters", HOSTILE.every((c) => /^[\p{L}\p{N} .&'-]{1,60}$/u.test(codexCompanyName(c))) && codexCompanyName("") === "this company");

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
