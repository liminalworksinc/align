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
import { createHash } from "node:crypto";
import { AGENT_DIR, AGENT_RELEASE, AGENT_REPO, agentInstallLine, agentTarball, claudeCodeLine, codexLine, HOSTED_ORIGIN, safeMcpUrl, shq } from "../lib/paste-lines.ts";

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
// The align CLI line (LIM-2504). The switch: no release is set in the committed file, so the Apps tab shows the
// build-from-source line and never a release link that would 404. With a release: a pinned, versioned URL (never
// `latest`) and a sha256 check before npm installs the file. Plain `align login` on the hosted server, `--server
// '<origin>'` anywhere else, nothing for a URL Align couldn't have made; the view builds it from the checked MCP URL.
const BYTES = "pretend tarball bytes\n";
const REL = { version: "0.2.0", sha256: createHash("sha256").update(BYTES).digest("hex") };
const PINNED = `${AGENT_REPO}/releases/download/agent-v0.2.0/liminal-align-agent-0.2.0.tgz`;
const src = agentInstallLine(URL);
check(
  "the align CLI switch is off in the committed file: no release, so the source line (clone, build, install), never a release URL",
  AGENT_RELEASE === null && src?.kind === "source" &&
    src.line === `git clone --depth 1 ${AGENT_REPO}.git && cd ${AGENT_DIR} && npm ci && npm run build && npm install -g . && align install && align login --server 'http://127.0.0.1:3331'` &&
    !/releases/.test(src.line),
  JSON.stringify(src),
);
const rel = agentInstallLine(URL, REL);
check(
  "with a release: the pinned versioned URL, a sha256 check that runs before npm, npm installs the checked file, and never `latest`",
  rel?.kind === "release" &&
    rel.line === `curl -fsSLO ${PINNED} && echo '${REL.sha256}  liminal-align-agent-0.2.0.tgz' | shasum -a 256 -c && npm install -g ./liminal-align-agent-0.2.0.tgz && align install && align login --server 'http://127.0.0.1:3331'` &&
    !/latest/.test(rel.line) && agentTarball(REL)?.url === PINNED,
  JSON.stringify(rel),
);
check(
  "a release that isn't well formed (version or sha256) falls back to the source line",
  [{ version: "0.2", sha256: REL.sha256 }, { version: "0.2.0;x", sha256: REL.sha256 }, { version: "0.2.0", sha256: "abc" }, { version: "0.2.0", sha256: REL.sha256.toUpperCase() }].every((r) => agentInstallLine(URL, r)?.kind === "source"),
);
check(
  "on the hosted server both lines end with a plain align login; a bad URL gives no line; the view builds it from apps.data.url",
  agentInstallLine(`${HOSTED_ORIGIN}/api/mcp`)?.line.endsWith("&& align install && align login") === true &&
    agentInstallLine(`${HOSTED_ORIGIN}/api/mcp`, REL)?.line.endsWith("&& align install && align login") === true &&
    agentInstallLine("http://evil.test/api/mcp; touch x") === null && agentInstallLine("http://evil.test/api/mcp; touch x", REL) === null &&
    /agentInstallLine\(apps\.data\.url\)/.test(view),
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
// ---- the release line in every shell: curl, npm and align are stubs; shasum is the real one ----
for (const shell of SHELLS) {
  for (const [label, sha, expectInstall] of [["matching checksum", REL.sha256, true], ["tampered tarball (checksum differs)", createHash("sha256").update("other bytes").digest("hex"), false]]) {
    const box = sandbox();
    try {
      for (const name of ["npm", "align"]) {
        const f = path.join(box.bin, name);
        writeFileSync(f, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a"; done >> "${box.bin}/${name}.args"\necho --- >> "${box.bin}/${name}.args"\n`);
        chmodSync(f, 0o755);
      }
      // curl -fsSLO <url>: writes the URL's last segment into the current folder.
      writeFileSync(path.join(box.bin, "curl"), `#!/bin/sh\nfor a in "$@"; do u="$a"; done\nprintf '%s' ${shq(BYTES)} > "\${u##*/}"\n`);
      chmodSync(path.join(box.bin, "curl"), 0o755);
      const line = agentInstallLine(URL, { version: "0.2.0", sha256: sha }).line;
      let failedLine = false;
      try {
        run(shell, line, box);
      } catch {
        failedLine = true;
      }
      const npm = argsOf(box, "npm");
      const al = argsOf(box, "align");
      check(
        `${path.basename(shell)}: release line with a ${label}: ${expectInstall ? "npm installs ./liminal-align-agent-0.2.0.tgz, then align install and align login --server" : "the line stops at shasum; npm and align never run"}`,
        expectInstall
          ? !failedLine && JSON.stringify(npm) === JSON.stringify([["install", "-g", "./liminal-align-agent-0.2.0.tgz"]]) && JSON.stringify(al) === JSON.stringify([["install"], ["login", "--server", "http://127.0.0.1:3331"]])
          : failedLine && npm.length === 0 && al.length === 0,
        `failed=${failedLine} npm=${JSON.stringify(npm)} align=${JSON.stringify(al)}`,
      );
    } finally {
      rmSync(box.root, { recursive: true, force: true });
    }
  }
}
check(`at least sh and bash were tried (${SHELLS.join(", ")})`, SHELLS.length >= 2, SHELLS.join(","));

console.log(`\ntest-paste-lines: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
