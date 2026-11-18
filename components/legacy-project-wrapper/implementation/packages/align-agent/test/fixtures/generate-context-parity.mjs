// Regenerate from the package directory: node test/fixtures/generate-context-parity.mjs HEAD~1
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertPortable, createSandbox } from "./context-parity.mjs";
import { recordContextParity } from "./record-context-parity.mjs";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const revision = process.argv[2];
assert.ok(revision, "supply the pre-accounting baseline commit explicitly");
const sandbox = createSandbox();
try {
  // Only these generation-time git commands read the selected repository. They use no personal git configuration.
  const git = (args) => execFileSync("git", args, { cwd: pkg, env: { ...sandbox.env, PATH: process.env.PATH } });
  const repo = git(["rev-parse", "--show-toplevel"]).toString().trim();
  const sourceCommit = git(["rev-parse", `${revision}^{commit}`]).toString().trim();
  const prefix = path.relative(repo, path.join(pkg, "src"));
  const archive = git(["-C", repo, "archive", sourceCommit, prefix]);
  execFileSync("tar", ["-x", "-C", sandbox.root], { input: archive, env: { ...sandbox.env, PATH: process.env.PATH } });
  fs.writeFileSync(path.join(sandbox.root, "package.json"), '{"type":"module"}\n');
  const reference = pathToFileURL(path.join(sandbox.root, prefix, "hooks/handlers.ts")).href;
  const cases = await recordContextParity(reference);
  const fixture = { sourceCommit, timezone: "UTC", cases };
  assertPortable(fixture, [os.homedir(), repo, os.userInfo().username]);
  const output = path.join(pkg, "test/fixtures/context-parity.json");
  fs.writeFileSync(output, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Recorded ${cases.length} hook returns from ${sourceCommit}; ${fs.statSync(output).size} bytes`);
} finally { sandbox.cleanup(); }
