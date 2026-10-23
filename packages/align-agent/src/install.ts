// `align install` / `align uninstall`. Install adds hook handlers and nothing else: no telemetry settings, no login
// item. Claude Code gets a skills-directory plugin (CLAUDE_CONFIG_DIR/skills/align), which it loads in every session
// with no install step and no settings.json edit. Codex gets a minimal merge into hooks.json with a timestamped backup.
// ALIGN_HOME/install.json records what was added so uninstall reverts exactly that. Hooks run from
// ALIGN_HOME/bin/current, never from a git worktree.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Paths } from "./paths.ts";
import { layout } from "./shared/layout.ts";
import { readJson, writeFileAtomic, writeJsonAtomic } from "./shared/fsx.ts";

export const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Stop"] as const;

/** Claude Code runs StopFailure instead of Stop when a turn ends on an API error; Codex has no such event. */
export function hookEvents(harness: "claude" | "codex"): readonly string[] {
  return harness === "claude" ? [...HOOK_EVENTS, "StopFailure"] : HOOK_EVENTS;
}
export interface InstallOptions {
  claude: boolean;
  codex: boolean;
  dryRun: boolean;
  distDir: string;
  version: string;
  nodePath: string;
}

export interface InstallRecord {
  version: string;
  installed_at: string;
  node: string;
  hook_sha256: string;
  claude?: { plugin: string };
  codex?: { hooks: string; hooks_backup: string | null; hooks_created: boolean };
}

/** The Claude Code plugin folder. `claude plugin disable align@skills-dir` turns it off without uninstalling. */
export function pluginDir(paths: Paths): string {
  return path.join(paths.claudeDir, "skills", "align");
}

export function pluginHooksFile(paths: Paths): string {
  return path.join(pluginDir(paths), "hooks", "hooks.json");
}

function isOurPlugin(paths: Paths): boolean {
  try {
    return fs.readFileSync(pluginHooksFile(paths), "utf8").includes(path.join(paths.alignHome, "bin", "current", "hook.js"));
  } catch {
    return false;
  }
}

export function hookCommand(nodePath: string, alignHome: string, harness: "claude" | "codex", event: string): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return `${q(nodePath)} ${q(path.join(alignHome, "bin", "current", "hook.js"))} ${harness} ${event}`;
}

function isOurs(handler: unknown, alignHome: string): boolean {
  const cmd = handler && typeof handler === "object" ? (handler as Record<string, unknown>).command : null;
  return typeof cmd === "string" && cmd.includes(path.join(alignHome, "bin", "current", "hook.js"));
}

/** Remove our handlers from a hooks object (Claude settings.hooks or Codex hooks.json .hooks). Returns count removed. */
export function stripHooks(hooks: Record<string, unknown> | undefined, alignHome: string): number {
  if (!hooks || typeof hooks !== "object") return 0;
  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept: unknown[] = [];
    for (const g of groups) {
      if (!g || typeof g !== "object" || !Array.isArray((g as Record<string, unknown>).hooks)) {
        kept.push(g);
        continue;
      }
      const handlers = (g as { hooks: unknown[] }).hooks;
      const rest = handlers.filter((h) => !isOurs(h, alignHome));
      removed += handlers.length - rest.length;
      if (rest.length) kept.push({ ...(g as object), hooks: rest });
    }
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  return removed;
}

export function mergeHooks(hooks: Record<string, unknown>, alignHome: string, nodePath: string, harness: "claude" | "codex"): void {
  stripHooks(hooks, alignHome);
  for (const event of hookEvents(harness)) {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    const handler = { type: "command", command: hookCommand(nodePath, alignHome, harness, event), timeout: 5 };
    const group: Record<string, unknown> = event === "PreToolUse" ? { matcher: "*", hooks: [handler] } : { hooks: [handler] };
    groups.push(group);
    hooks[event] = groups;
  }
}

function backup(file: string, dryRun: boolean): string | null {
  if (!fs.existsSync(file)) return null;
  const dest = `${file}.align-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (!dryRun) fs.copyFileSync(file, dest);
  return dest;
}

function readJsonFile(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) return {};
  const v = JSON.parse(text);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${file} is not a JSON object`);
  return v as Record<string, unknown>;
}

function writeJsonFile(file: string, value: unknown): void {
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600;
  writeFileAtomic(file, JSON.stringify(value, null, 2) + "\n", mode);
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

export function sha256File(file: string): string | null {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

export function install(paths: Paths, o: InstallOptions): { lines: string[]; record: InstallRecord } {
  const home = paths.alignHome;
  const lines: string[] = [];
  const say = (s: string) => lines.push(s);
  const prev = readJson<InstallRecord>(layout.install(home));
  const record: InstallRecord = {
    version: o.version,
    installed_at: new Date().toISOString(),
    node: o.nodePath,
    hook_sha256: sha256File(path.join(o.distDir, "hook.js")) || "",
    ...(prev?.claude ? { claude: prev.claude } : {}),
    ...(prev?.codex ? { codex: prev.codex } : {}),
  };
  const binDir = path.join(home, "bin", o.version);
  const current = path.join(home, "bin", "current");
  say(`${o.dryRun ? "Would copy" : "Copying"} ${o.distDir} to ${binDir} and point ${current} at it.`);
  if (!o.dryRun) {
    fs.rmSync(binDir, { recursive: true, force: true });
    copyDir(o.distDir, binDir);
    fs.writeFileSync(path.join(binDir, "package.json"), JSON.stringify({ type: "module", name: "align-agent-runtime", version: o.version }) + "\n");
    const tmp = `${current}.tmp-${process.pid}`;
    fs.rmSync(tmp, { force: true });
    fs.symlinkSync(binDir, tmp);
    fs.renameSync(tmp, current);
  }

  if (o.claude) {
    const dir = pluginDir(paths);
    if (fs.existsSync(dir) && !isOurPlugin(paths)) throw new Error(`${dir} exists and is not Align's plugin; move it and run align install again`);
    const hooks: Record<string, unknown> = {};
    mergeHooks(hooks, home, o.nodePath, "claude");
    say(`${o.dryRun ? "Would install" : "Installed"} the Align plugin for Claude Code at ${dir} (hooks ${hookEvents("claude").join(", ")}; PreToolUse matcher "*"). New sessions load it; \`claude plugin disable align@skills-dir\` turns it off.`);
    if (!o.dryRun) {
      fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
      fs.mkdirSync(path.join(dir, "hooks"), { recursive: true });
      writeJsonFile(path.join(dir, ".claude-plugin", "plugin.json"), {
        name: "align",
        description: "Gives shared sessions their Align goal and enforces stops from the Align workspace. Hooks only.",
        version: o.version,
        author: { name: "Liminal" },
      });
      writeJsonFile(pluginHooksFile(paths), { hooks });
    }
    // Handlers an earlier Align merged into settings.json would run a second time next to the plugin's.
    const file = path.join(paths.claudeDir, "settings.json");
    if (fs.existsSync(file)) {
      const settings = readJsonFile(file);
      const removed = stripHooks(settings.hooks as Record<string, unknown>, home);
      if (removed) {
        if (settings.hooks && !Object.keys(settings.hooks as object).length) delete settings.hooks;
        const b = backup(file, o.dryRun);
        if (!o.dryRun) writeJsonFile(file, settings);
        say(`${o.dryRun ? "Would remove" : "Removed"} ${removed} hook handlers an earlier Align added to ${file} (backup ${b}).`);
      }
    }
    record.claude = { plugin: dir };
  }

  if (o.codex) {
    const hooksFile = path.join(paths.codexHome, "hooks.json");
    const existedBefore = fs.existsSync(hooksFile);
    const doc = readJsonFile(hooksFile);
    const hooks = (doc.hooks && typeof doc.hooks === "object" ? doc.hooks : {}) as Record<string, unknown>;
    mergeHooks(hooks, home, o.nodePath, "codex");
    doc.hooks = hooks;
    const hb = backup(hooksFile, o.dryRun);
    say(`${o.dryRun ? "Would merge" : "Merged"} Codex hooks (SessionStart, UserPromptSubmit, PreToolUse matcher "*", Stop) into ${hooksFile}${hb ? `; backup ${hb}` : ""}.`);
    say("  Codex will list the new hooks as needing review. Open /hooks in Codex and trust them; Align never writes trust entries.");
    const configFile = path.join(paths.codexHome, "config.toml");
    if (fs.existsSync(configFile) && /^\s*hooks\s*=\s*false/m.test(fs.readFileSync(configFile, "utf8"))) {
      say("  Warning: config.toml sets hooks = false under [features]; Codex will not run any hooks until that is removed.");
    }
    if (!o.dryRun) {
      fs.mkdirSync(paths.codexHome, { recursive: true });
      writeJsonFile(hooksFile, doc);
    }
    record.codex = {
      hooks: hooksFile,
      hooks_backup: prev?.codex?.hooks_backup ?? hb ?? null,
      hooks_created: prev?.codex ? prev.codex.hooks_created : !existedBefore,
    };
  }

  if (!o.dryRun) writeJsonAtomic(layout.install(home), record);
  return { lines, record };
}

export function uninstall(paths: Paths, opts: { purge: boolean }): string[] {
  const home = paths.alignHome;
  const lines: string[] = [];
  const rec = readJson<InstallRecord>(layout.install(home));
  if (isOurPlugin(paths)) {
    fs.rmSync(pluginDir(paths), { recursive: true, force: true });
    lines.push(`Removed the Align plugin for Claude Code (${pluginDir(paths)}).`);
  }
  const claudeFile = path.join(paths.claudeDir, "settings.json");
  if (fs.existsSync(claudeFile)) {
    const s = readJsonFile(claudeFile);
    const removed = stripHooks(s.hooks as Record<string, unknown>, home);
    if (s.hooks && !Object.keys(s.hooks as object).length) delete s.hooks;
    if (removed) {
      const b = backup(claudeFile, false);
      writeJsonFile(claudeFile, s);
      lines.push(`Removed ${removed} Align hook handlers from ${claudeFile} (backup ${b}).`);
    }
  }
  const codexHooks = rec?.codex?.hooks || path.join(paths.codexHome, "hooks.json");
  if (fs.existsSync(codexHooks)) {
    const d = readJsonFile(codexHooks);
    const removed = stripHooks(d.hooks as Record<string, unknown>, home);
    if (removed) {
      const b = backup(codexHooks, false);
      const createdByUs = !!rec?.codex?.hooks_created;
      const empty = Object.keys(d).every((k) => k === "hooks") && !Object.keys((d.hooks as object) || {}).length;
      if (createdByUs && empty) fs.rmSync(codexHooks, { force: true });
      else writeJsonFile(codexHooks, d);
      lines.push(`Removed ${removed} Align hook handlers from ${codexHooks}${createdByUs && empty ? " (file deleted; Align created it)" : ""} (backup ${b}).`);
    }
  }
  if (opts.purge) {
    fs.rmSync(home, { recursive: true, force: true });
    lines.push(`Deleted ${home} (local ledger, keys and tokens).`);
  } else {
    fs.rmSync(path.join(home, "bin"), { recursive: true, force: true });
    fs.rmSync(layout.install(home), { force: true });
    lines.push(`Kept ${home} (local ledger and keys). Use --purge to delete it.`);
  }
  if (!lines.length) lines.push("Nothing to remove.");
  return lines;
}
