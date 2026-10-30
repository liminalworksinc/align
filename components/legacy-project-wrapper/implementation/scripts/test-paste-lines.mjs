#!/usr/bin/env node
// The Apps tab's terminal lines (lib/paste-lines.ts) run in sh, bash and zsh (each one installed here): only the URL
// reaches `claude` and `codex` (stubs that record their arguments), nothing a request controls runs as shell, and the
// lines write no file (no hooks, no settings, no AGENTS.md). Hostile strings go through shq() in every shell and come
// back byte for byte. No server.
// Usage: node scripts/test-paste-lines.mjs   (from the implementation directory)
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { claudeCodeLine, codexLine, safeMcpUrl, shq } from "../lib/paste-lines.ts";

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${String(detail).slice(0, 400)}`}`);
}

const SHELLS = ["/bin/sh", "/bin/bash", "/bin/zsh", "/usr/bin/zsh"].filter((s) => existsSync(s));
const URL = "http://127.0.0.1:3331/api/mcp";
const HOSTILE = [
  `Acme"; touch PWNED_dq; echo "`,
  "$(touch PWNED_sub)",
  "`touch PWNED_bt`",
  "'; touch PWNED_sq; '",
  "Robert'); touch PWNED_paren #",
  "x\ntouch PWNED_nl\n",
  "!! !$ ${IFS} $HOME \\ %s %n %%",
  "‮maN‬ ​; touch PWNED_bidi",
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
    // Each call appends its arguments, one per line, then a separator, outside the work folder.
    writeFileSync(f, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done >> "${bin}/${name}.args"\necho --- >> "${bin}/${name}.args"\n`);
    chmodSync(f, 0o755);
  }
  return { root, bin, work };
}

function run(shell, line, box) {
  const env = { PATH: `${box.bin}:${process.env.PATH}`, HOME: box.root, CODEX_HOME: path.join(box.root, ".codex"), LANG: "C.UTF-8" };
  const args = shell.endsWith("zsh") ? ["-f", "-c", line] : ["-c", line];
  return execFileSync(shell, args, { cwd: box.work, env, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

/** Every file under dir, recursively. */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const pwned = (box) => walk(box.root).filter((f) => /PWNED/.test(path.basename(f)));
const argsOf = (box, name) => {
  const f = path.join(box.bin, `${name}.args`);
  return existsSync(f) ? readFileSync(f, "utf8").split("---\n").filter(Boolean).map((c) => c.replace(/\n$/, "").split("\n")) : [];
};

// ---- URLs ----
for (const good of [URL, "https://align-test.fly.dev/api/mcp", "http://[::1]:3000/api/mcp", "http://localhost:3000/api/mcp", "http://invalid.invalid/api/mcp"])
  check(`a URL Align makes is accepted, single-quoted in both lines: ${good}`, safeMcpUrl(good) === good && codexLine(good) === `codex mcp add align --url '${good}'` && claudeCodeLine(good) === `claude mcp add --transport http --scope user align '${good}'; claude mcp login align`);
for (const bad of [
  "https://a.example/api/mcp'; touch PWNED; '",
  "https://a.example/api/mcp$(touch PWNED)",
  "https://a.example/api/mcp`id`",
  "https://a.example/api/mcp\ntouch PWNED",
  "https://a.example/api/mcp; touch PWNED",
  "https://a.example/other",
  "javascript:alert(1)//api/mcp",
  "https://user:pw@a.example/api/mcp",
  "http://127.0.0.1:3100;touch${IFS}x/api/mcp",
])
  check(`a URL Align couldn't have made shows no command: ${JSON.stringify(bad)}`, safeMcpUrl(bad) === null && codexLine(bad) === null && claudeCodeLine(bad) === null);

// ---- the Apps tab passes only the URL; the builders take nothing else ----
const view = readFileSync(path.join(process.cwd(), "app/app/w/[ws]/apps/view.tsx"), "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");
const calls = view.match(/(?:claudeCodeLine|codexLine)\([^)]*\)/g) ?? [];
check(
  "the Apps tab calls each line builder once with only the URL; the builders take one parameter; no workspace or company name reaches them",
  codexLine.length === 1 && claudeCodeLine.length === 1 && calls.length === 2 && calls.every((c) => /^(?:claudeCodeLine|codexLine)\(apps\.data\.url\)$/.test(c)) && !/company/i.test(view),
  calls.join(" "),
);
check("the lines carry no hooks, settings file or agent instruction file", ![claudeCodeLine(URL), codexLine(URL)].some((l) => /AGENTS|hooks|settings|node -e|printf|>>/.test(l)), claudeCodeLine(URL));

// ---- in every shell: each line run twice, only the URL reaches the stub, nothing else runs or is written ----
for (const shell of SHELLS) {
  const box = sandbox();
  try {
    for (let i = 0; i < 2; i++) {
      run(shell, claudeCodeLine(URL), box);
      run(shell, codexLine(URL), box);
    }
    const cl = argsOf(box, "claude");
    const cx = argsOf(box, "codex");
    const written = walk(box.root).filter((f) => !f.startsWith(box.bin + path.sep));
    check(
      `${path.basename(shell)}: the Claude Code line gives claude only [mcp add --transport http --scope user align URL] then [mcp login align], twice; the Codex line gives codex only [mcp add align --url URL], twice; no file is written`,
      pwned(box).length === 0 &&
        written.length === 0 &&
        cl.length === 4 &&
        [0, 2].every((i) => JSON.stringify(cl[i]) === JSON.stringify(["mcp", "add", "--transport", "http", "--scope", "user", "align", URL]) && JSON.stringify(cl[i + 1]) === JSON.stringify(["mcp", "login", "align"])) &&
        cx.length === 2 &&
        cx.every((c) => JSON.stringify(c) === JSON.stringify(["mcp", "add", "align", "--url", URL])),
      `written=${JSON.stringify(written)} claude=${JSON.stringify(cl)} codex=${JSON.stringify(cx)}`,
    );
    // shq: hostile strings come back exactly, and nothing runs.
    const wrong = HOSTILE.filter((h) => run(shell, `printf '%s' ${shq(h)}`, box) !== h);
    check(`${path.basename(shell)}: shq() keeps ${HOSTILE.length} hostile strings whole (quotes, $(), backticks, newlines, !, bidi) and runs none of them`, wrong.length === 0 && pwned(box).length === 0, JSON.stringify(wrong));
  } catch (e) {
    check(`${path.basename(shell)} lines ran`, false, e.stderr?.toString() || e.message);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
}
check(`at least sh and bash were tried (${SHELLS.join(", ")})`, SHELLS.length >= 2, SHELLS.join(","));

console.log(`\ntest-paste-lines: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
