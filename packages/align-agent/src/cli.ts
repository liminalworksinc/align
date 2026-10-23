#!/usr/bin/env node
// `align` CLI. Works offline for local metering; server features need `align login`.
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { api, loadCredentials, markSignedOut, rawRequest, saveCredentials, signedIn, type Credentials } from "./api.ts";
import { openCtx, saveConfig, type Ctx } from "./context.ts";
import { loadFeed, loadMe, refreshFeed, refreshMe, resolveGoal, resolveWorkspace } from "./goals.ts";
import { getShare } from "./hot.ts";
import { HOOK_EVENTS, install, sha256File, uninstall, type InstallRecord } from "./install.ts";
import { generateDeviceKey } from "./keys.ts";
import { applyShare, bind, deleteHistory, planShare, renderPreview, stopSharing } from "./share.ts";
import { gitInfo } from "./shared/anchors.ts";
import { readJson } from "./shared/fsx.ts";
import { matchRule, readRules, realDir, removeRule, setRule } from "./shared/rules.ts";
import { layout } from "./shared/layout.ts";
import type { Goal } from "./shared/types.ts";
import { flushOutbox, ingestSpool, outboxDepth, syncOnce, uploadUsage } from "./sync.ts";
import { tailAll } from "./tailer.ts";
import { VERSION } from "./version.ts";

const out = (s = ""): void => {
  process.stdout.write(s + "\n");
};
const err = (s: string): void => {
  process.stderr.write(s + "\n");
};
class UsageError extends Error {}

const HELP = `align ${VERSION}: Align local agent

  align login [--server <url>] [--name <device name>]
  align logout
  align status
  align sessions [--all] [--json]
  align goals [--workspace <name|id>] [--refresh] [--json]
  align share --dir [<folder>] --workspace <name|id> --goal <ref|none> [--yes]   share every new session started in a folder
  align share <session|--latest> [--cwd [dir]] --workspace <name|id> --goal <ref|none> [--alias <name>] [--from start|now] [--yes]
  align unshare --dir [<folder>]
  align rules
  align stop-sharing <session>
  align delete-history <session> [--yes]
  align bind <session> --goal <ref|none>
  align latch status
  align install [--claude] [--codex] [--dry-run]
  align uninstall [--purge]
  align sync                   (hooks also run this in the background, one pass each)
  align doctor

<session> is a local id, a native session id prefix, or "latest".`;

// ---------- helpers ----------
/**
 * The node binary hooks should call. process.execPath is fully resolved (for Homebrew, a versioned Cellar path that
 * disappears on `brew upgrade`), so prefer the first `node` on PATH that resolves to the same binary.
 */
function stableNodePath(env: NodeJS.ProcessEnv): string {
  let real = process.execPath;
  try {
    real = fs.realpathSync(process.execPath);
  } catch {
    /* keep execPath */
  }
  for (const dir of (env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const cand = path.join(dir, "node");
    try {
      if (fs.realpathSync(cand) === real) return cand;
    } catch {
      /* not here */
    }
  }
  return process.execPath;
}

function prepare(ctx: Ctx): void {
  ingestSpool(ctx);
  tailAll(ctx, Number(ctx.env.ALIGN_CLI_TAIL_BUDGET_MS || 20_000));
}

interface SessionListRow {
  local_id: string;
  harness: string;
  native_id: string;
  cwd: string | null;
  started_at: string | null;
  last_active: string | null;
}

function resolveSession(ctx: Ctx, ref: string | undefined, opts: { latest?: boolean; cwd?: string | null } = {}): SessionListRow {
  if (opts.latest || ref === "latest") {
    let rows = ctx.db.prepare("SELECT * FROM sessions ORDER BY last_active DESC LIMIT 200").all() as unknown as SessionListRow[];
    if (opts.cwd) {
      const want = realpath(opts.cwd);
      rows = rows.filter((r) => r.cwd && (realpath(r.cwd) === want || realpath(r.cwd).startsWith(want + path.sep)));
    }
    if (!rows.length) throw new UsageError("no local sessions found yet");
    return rows[0];
  }
  if (!ref) throw new UsageError("missing <session>; use a session id, a prefix, or --latest");
  const rows = ctx.db
    .prepare("SELECT * FROM sessions WHERE local_id=? OR native_id=? OR local_id LIKE ? OR native_id LIKE ? ORDER BY last_active DESC")
    .all(ref, ref, `${ref}%`, `${ref}%`) as unknown as SessionListRow[];
  const exact = rows.filter((r) => r.local_id === ref || r.native_id === ref);
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new UsageError(`no session matches "${ref}"`);
  throw new UsageError(`"${ref}" matches ${rows.length} sessions; use more characters`);
}

function realpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

async function confirm(question: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(a.trim());
  } finally {
    rl.close();
  }
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function fmtUsd(micros: number): string {
  return `$${(micros / 1e6).toFixed(2)}`;
}

function shortTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function repoLabel(ctx: Ctx, s: SessionListRow, wsId: string | null): string {
  if (!s.cwd) return "-";
  if (wsId) {
    const alias = ctx.db.prepare("SELECT alias FROM repo_aliases WHERE workspace_id=? ORDER BY rowid DESC").all(wsId) as { alias: string }[];
    const info = gitInfo(s.cwd);
    const root = info ? realpath(info.toplevel) : realpath(s.cwd);
    const hit = ctx.db.prepare("SELECT alias FROM repo_aliases WHERE workspace_id=? AND repo_root=?").get(wsId, root) as { alias: string } | undefined;
    if (hit) return hit.alias;
    void alias;
  }
  const info = gitInfo(s.cwd);
  return info ? info.name : path.basename(s.cwd);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function needLogin(ctx: Ctx): Promise<void> {
  if (!signedIn(ctx.home)) throw new UsageError("not signed in; run `align login` (local metering keeps working without it)");
}

async function tryFlush(ctx: Ctx): Promise<void> {
  try {
    await flushOutbox(ctx);
    await uploadUsage(ctx);
    await flushOutbox(ctx);
  } catch (e) {
    ctx.log(`flush failed: ${(e as Error).message}`);
  }
}

function distDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

// ---------- commands ----------
async function cmdLogin(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { server: { type: "string" }, name: { type: "string" } }, allowPositionals: false });
  const server = (values.server || ctx.config.server_url).replace(/\/$/, "");
  const deviceName = values.name || ctx.config.device_name || `${os.userInfo().username}'s ${os.hostname().replace(/\.local$/, "")}`;
  const key = generateDeviceKey(ctx.home);
  const a = await rawRequest(server, "POST", "/api/v2/device/authorize", { body: { device_name: deviceName, public_key: key.publicKeyB64 } });
  if (a.status !== 200 || !a.json?.device_code) throw new Error(`device authorize failed: ${a.status} ${a.json?.error || ""}`);
  const { device_code, user_code, verification_uri } = a.json;
  let interval = Number(a.json.interval || 5);
  const expiresAt = Date.now() + Number(a.json.expires_in || 600) * 1000;
  out(`To connect this device, open ${verification_uri} and enter the code ${user_code}`);
  if (!ctx.env.ALIGN_NO_BROWSER && process.platform === "darwin") execFile("open", [verification_uri], () => undefined);
  const scale = Number(ctx.env.ALIGN_DEVICE_POLL_SCALE_MS || 1000);
  for (;;) {
    if (Date.now() > expiresAt) throw new Error("the code expired; run `align login` again");
    await new Promise((r) => setTimeout(r, interval * scale));
    const t = await rawRequest(server, "POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code } });
    if (t.status === 200 && t.json?.access_token) {
      const creds: Credentials = {
        server_url: server,
        device_id: t.json.device_id,
        access_token: t.json.access_token,
        access_expires_at: new Date(Date.now() + Number(t.json.expires_in || 3600) * 1000).toISOString(),
        refresh_token: t.json.refresh_token,
        user: t.json.user || null,
      };
      saveCredentials(ctx.home, creds);
      saveConfig(ctx.home, { server_url: server });
      ctx.config.server_url = server;
      break;
    }
    const code = t.json?.error;
    if (code === "authorization_pending") continue;
    if (code === "slow_down") {
      interval += 5;
      continue;
    }
    if (code === "access_denied") throw new Error("the request was denied in the browser");
    if (code === "expired_token") throw new Error("the code expired; run `align login` again");
    throw new Error(`device token failed: ${t.status} ${code || ""}`);
  }
  const me = await refreshMe(ctx);
  out(`Signed in as ${me.user.name} <${me.user.email}> on device ${me.device?.name || deviceName}.`);
  for (const w of me.workspaces) {
    out(`  workspace ${w.name} (${w.id}), role ${w.role}`);
    try {
      await refreshFeed(ctx, w.id);
    } catch {
      /* feed later */
    }
  }
}

async function cmdLogout(ctx: Ctx): Promise<void> {
  const c = loadCredentials(ctx.home);
  if (!c) return out("Not signed in.");
  if (!c.signed_out) {
    try {
      await api(ctx, "DELETE", "/api/v2/devices/self");
    } catch {
      /* best effort; tokens are wiped locally either way */
    }
  }
  markSignedOut(ctx.home, "logout");
  fs.rmSync(layout.deviceKey(ctx.home), { force: true });
  out("Signed out. Tokens and the device key were removed; local metering continues.");
}

function installState(ctx: Ctx): { claude: string; codex: string; hash: string } {
  const rec = readJson<InstallRecord>(layout.install(ctx.home));
  const marker = path.join(ctx.home, "bin", "current", "hook.js");
  const count = (file: string, key: (j: any) => any) => {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      const hooks = key(j) || {};
      return HOOK_EVENTS.filter((e) => JSON.stringify(hooks[e] || []).includes(marker)).length;
    } catch {
      return 0;
    }
  };
  const c = count(path.join(ctx.paths.claudeDir, "settings.json"), (j) => j.hooks);
  const x = count(path.join(ctx.paths.codexHome, "hooks.json"), (j) => j.hooks);
  const installed = sha256File(marker);
  const hash = !rec ? "not installed" : !installed ? "missing" : installed === rec.hook_sha256 ? "ok" : "modified since install";
  const n = HOOK_EVENTS.length;
  return { claude: c === n ? "installed" : c ? `partial (${c}/${n})` : "not installed", codex: x === n ? "installed (trust them in Codex /hooks)" : x ? `partial (${x}/${n})` : "not installed", hash };
}

async function cmdStatus(ctx: Ctx): Promise<void> {
  ingestSpool(ctx);
  const c = loadCredentials(ctx.home);
  const st = installState(ctx);
  const last = readJson<{ at: string; ms: number }>(layout.lastSync(ctx.home));
  out(`Align ${VERSION}  home ${ctx.home}`);
  if (c && !c.signed_out) out(`  Identity:   ${c.user?.name || "?"} <${c.user?.email || "?"}> device ${c.device_id} on ${c.server_url}`);
  else out(`  Identity:   signed out${c?.signed_out_reason ? ` (${c.signed_out_reason})` : ""}; local metering only`);
  out(`  Last sync:  ${last ? `${shortTime(last.at)} (${last.ms} ms)` : "never"}`);
  out(`  Hooks:      Claude Code ${st.claude}; Codex ${st.codex}; hook file ${st.hash}`);
  out(`  Outbox:     ${outboxDepth(ctx)} pending`);
  const shares = ctx.db.prepare("SELECT state, COUNT(*) AS n FROM shares GROUP BY state").all() as { state: string; n: number }[];
  out(`  Shares:     ${shares.length ? shares.map((s) => `${s.n} ${s.state}`).join(", ") : "none (all sessions private)"}`);
  const unpriced = ctx.db.prepare("SELECT unpriced, COUNT(*) AS n FROM requests WHERE unpriced IS NOT NULL GROUP BY unpriced").all() as { unpriced: string; n: number }[];
  out(`  Unpriced:   ${unpriced.length ? unpriced.map((u) => `${u.n} ${u.unpriced}`).join(", ") : "0"}`);
  const latched = (ctx.db.prepare("SELECT COUNT(*) AS n FROM latches WHERE stopped=1").get() as { n: number }).n;
  if (latched) out(`  Stop latch: ${latched} session(s) stopped; see \`align latch status\``);
}

async function cmdSessions(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { all: { type: "boolean" }, json: { type: "boolean" } } });
  prepare(ctx);
  const since = values.all ? "0" : new Date(Date.now() - 7 * 86_400_000).toISOString();
  const sessions = ctx.db.prepare("SELECT * FROM sessions WHERE COALESCE(last_active, created_at) >= ? ORDER BY last_active DESC LIMIT ?").all(since, values.all ? 100000 : 25) as unknown as SessionListRow[];
  const rows = sessions.map((s) => {
    const agg = ctx.db
      .prepare(
        `SELECT basis, COUNT(*) AS requests, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read,
           SUM(cache_write_5m + cache_write_1h + cache_write_unsplit) AS cache_write, SUM(COALESCE(est_list_usd_micros,0)) AS est,
           SUM(CASE WHEN est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced, SUM(CASE WHEN finalized=0 THEN 1 ELSE 0 END) AS unfinished
         FROM requests WHERE local_id=? GROUP BY basis`,
      )
      .all(s.local_id) as { basis: string; requests: number; input: number; output: number; cache_read: number; cache_write: number; est: number; unpriced: number; unfinished: number }[];
    const share = getShare(ctx, s.local_id);
    return { ...s, repo: repoLabel(ctx, s, share?.workspace_id ?? null), usage: agg, shared: share ? `${share.state} (${share.workspace_name})` : "private" };
  });
  if (values.json) return out(JSON.stringify(rows, null, 2));
  if (!rows.length) return out("No sessions seen in the last 7 days. Use --all for older ones.");
  out(`${pad("ID", 10)} ${pad("HARNESS", 11)} ${pad("REPO", 18)} ${pad("STARTED", 16)} ${pad("LAST ACTIVE", 16)} ${pad("TOKENS in/out/cache r/w", 28)} ${pad("BASIS", 22)} ${pad("EST LIST (estimate)", 20)} SHARED`);
  for (const r of rows) {
    const t = r.usage.reduce((a, u) => ({ i: a.i + u.input, o: a.o + u.output, r: a.r + u.cache_read, w: a.w + u.cache_write, e: a.e + u.est, n: a.n + u.unpriced }), { i: 0, o: 0, r: 0, w: 0, e: 0, n: 0 });
    const basis = r.usage.map((u) => u.basis).join(",") || "-";
    const est = r.usage.length ? `${fmtUsd(t.e)}${t.n ? ` +${t.n} unpriced` : ""}` : "-";
    out(
      `${pad(r.local_id.slice(0, 8), 10)} ${pad(r.harness, 11)} ${pad(r.repo, 18)} ${pad(shortTime(r.started_at), 16)} ${pad(shortTime(r.last_active), 16)} ${pad(`${fmtTokens(t.i)}/${fmtTokens(t.o)}/${fmtTokens(t.r)}/${fmtTokens(t.w)}`, 28)} ${pad(basis, 22)} ${pad(est, 20)} ${r.shared}`,
    );
  }
  out("Estimates use list prices; for subscription_included sessions they are not money spent.");
}

async function cmdGoals(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { workspace: { type: "string" }, refresh: { type: "boolean" }, json: { type: "boolean" } } });
  if (values.refresh) {
    await needLogin(ctx);
    await refreshMe(ctx);
  }
  const me = loadMe(ctx.home);
  if (!me) throw new UsageError("no cached workspaces; run `align login`");
  const targets = values.workspace ? [resolveWorkspace(ctx.home, values.workspace)].filter(Boolean) : me.workspaces.map((w) => ({ id: w.id, name: w.name }));
  if (!targets.length) throw new UsageError(`unknown workspace "${values.workspace}"`);
  const all: { ws: string; goals: Goal[]; fetched: string | null }[] = [];
  for (const w of targets as { id: string; name: string }[]) {
    if (values.refresh) await refreshFeed(ctx, w.id);
    const f = loadFeed(ctx.home, w.id);
    all.push({ ws: w.name, goals: f?.goals || [], fetched: f?.fetched_at || null });
  }
  if (values.json) return out(JSON.stringify(all, null, 2));
  for (const a of all) {
    out(`${a.ws}${a.fetched ? ` (cached ${shortTime(a.fetched)})` : " (not fetched yet; use --refresh)"}`);
    for (const g of a.goals) out(`  ${g.bindable ? "*" : " "} ${pad(g.id, 14)} v${pad(String(g.version), 3)} ${pad(g.status, 9)} ${pad(g.visibility, 10)} ${g.title}`);
  }
  out("* = you can bind a session to it now.");
}

async function goalFor(ctx: Ctx, wsId: string, ref: string): Promise<Goal | null> {
  if (ref === "none") return null;
  try {
    await refreshFeed(ctx, wsId);
  } catch {
    /* use the cache */
  }
  const goal = resolveGoal(loadFeed(ctx.home, wsId), ref);
  if (!goal.bindable) throw new UsageError(`goal "${goal.title}" is not bindable for you yet; it needs an approved alignment`);
  return goal;
}

async function cmdShare(ctx: Ctx, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { latest: { type: "boolean" }, cwd: { type: "string" }, dir: { type: "boolean" }, workspace: { type: "string" }, goal: { type: "string" }, alias: { type: "string" }, from: { type: "string" }, yes: { type: "boolean", short: "y" } },
  });
  await needLogin(ctx);
  if (!values.goal) throw new UsageError("--goal <ref|none> is required");
  if (values.dir) return await shareDir(ctx, positionals[0] || process.cwd(), values.workspace, values.goal, !!values.yes);
  prepare(ctx);
  const from = (values.from || "start") as "start" | "now";
  if (from !== "start" && from !== "now") throw new UsageError("--from must be start or now");
  let ws = resolveWorkspace(ctx.home, values.workspace);
  if (!ws) {
    await refreshMe(ctx).catch(() => undefined);
    ws = resolveWorkspace(ctx.home, values.workspace);
  }
  if (!ws) throw new UsageError(values.workspace ? `unknown workspace "${values.workspace}"` : "--workspace is required (no default workspace)");
  const session = resolveSession(ctx, positionals[0], { latest: values.latest, cwd: values.cwd === undefined ? null : values.cwd || process.cwd() });
  const share = getShare(ctx, session.local_id);
  if (share && (share.state === "shared" || share.state === "pending" || share.state === "suspended")) throw new UsageError(`session is already ${share.state} with ${share.workspace_name}`);
  const goal = await goalFor(ctx, ws.id, values.goal);
  const priorEpochs = ctx.db.prepare("SELECT 1 FROM epochs WHERE local_id=?").get(session.local_id);
  const effectiveFrom = priorEpochs && from === "start" ? "now" : from;
  const plan = planShare(ctx, session.local_id, ws, goal, values.alias ?? null, effectiveFrom);
  out(renderPreview(plan));
  if (effectiveFrom !== from) out("This session was shared before, so this share counts from now.");
  if (!(await confirm("Share this session?", !!values.yes))) {
    out("Not shared. Run again with --yes to confirm.");
    return;
  }
  applyShare(ctx, plan);
  await tryFlush(ctx);
  const after = getShare(ctx, session.local_id);
  out(`Session ${session.local_id.slice(0, 8)} is ${after?.state === "pending" ? "queued to share (offline; the next sync retries)" : after?.state}.`);
}

async function shareDir(ctx: Ctx, folder: string, wsRef: string | undefined, goalRef: string, yes: boolean): Promise<void> {
  let ws = resolveWorkspace(ctx.home, wsRef);
  if (!ws) {
    await refreshMe(ctx).catch(() => undefined);
    ws = resolveWorkspace(ctx.home, wsRef);
  }
  if (!ws) throw new UsageError(wsRef ? `unknown workspace "${wsRef}"` : "--workspace is required (no default workspace)");
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new UsageError(`${folder} is not a folder`);
  const dir = gitInfo(realDir(folder))?.toplevel || realDir(folder);
  const goal = await goalFor(ctx, ws.id, goalRef);
  out(`Folder:    ${dir} (stays on this machine)`);
  out(`Workspace: ${ws.name}`);
  out(`Goal:      ${goal ? `${goal.title} (v${goal.version})` : "none (unallocated)"}`);
  out("Every new Claude Code or Codex session started in this folder is shared from its start. Forks stay private;");
  out("`::align unshare` keeps a single session private. Sessions that are already running are not changed.");
  out("Sent per session: harness, a keyed repo hash, start time, binding epochs, per-request token counts with model, basis and");
  out("estimated list cost. Never sent: prompts, responses, tool input or output, paths, branch names.");
  const prev = matchRule(readRules(ctx.home), dir);
  if (prev && prev.dir === dir) out(`This replaces the current rule (${prev.workspace_name}${prev.goal_title ? `, "${prev.goal_title}"` : ""}).`);
  if (!(await confirm("Share this folder?", yes))) return out("Not changed. Run again with --yes to confirm.");
  setRule(ctx.home, { dir, workspace_id: ws.id, workspace_name: ws.name, goal_id: goal ? goal.id : null, goal_title: goal ? goal.title : null });
  out(`New sessions in ${dir} will be shared with ${ws.name}${goal ? ` for "${goal.title}"` : ""}.`);
}

async function cmdRules(ctx: Ctx): Promise<void> {
  const rules = readRules(ctx.home);
  if (!rules.length) return out("No folder rules. Every session is private until you share it.");
  for (const r of rules) {
    const title = (r.goal_id && loadFeed(ctx.home, r.workspace_id)?.goals.find((g) => g.id === r.goal_id)?.title) || r.goal_title;
    out(`${r.dir}  ->  ${r.workspace_name}${title ? ` / ${title}` : " / no goal"}  (since ${r.created_at.slice(0, 10)})`);
  }
}

async function cmdStopSharing(ctx: Ctx, argv: string[]): Promise<void> {
  const { values: dv, positionals: dp } = parseArgs({ args: argv, allowPositionals: true, options: { dir: { type: "boolean" } } });
  if (dv.dir) {
    const removed = removeRule(ctx.home, dp[0] || process.cwd());
    return out(removed ? `New sessions in ${removed.dir} are private again. Already shared sessions keep sharing until you stop them.` : "No folder rule covers that folder.");
  }
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} });
  prepare(ctx);
  const s = resolveSession(ctx, positionals[0]);
  stopSharing(ctx, s.local_id);
  await tryFlush(ctx);
  out("Stopped sharing. Future usage stays on this machine. Already shared history stays until you run `align delete-history`.");
}

async function cmdDeleteHistory(ctx: Ctx, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { yes: { type: "boolean", short: "y" } } });
  prepare(ctx);
  const s = resolveSession(ctx, positionals[0]);
  out("This hard-deletes this session's shared usage and epochs on the server. Goal and workspace totals will change. Local metering is kept.");
  if (!(await confirm("Delete the shared history?", !!values.yes))) return out("Nothing deleted. Run again with --yes to confirm.");
  deleteHistory(ctx, s.local_id);
  await tryFlush(ctx);
  out(getShare(ctx, s.local_id) ? "Deletion queued; the next sync retries when online." : "Shared history deleted.");
}

async function cmdBind(ctx: Ctx, argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { goal: { type: "string" } } });
  prepare(ctx);
  if (!values.goal) throw new UsageError("--goal <ref|none> is required");
  const s = resolveSession(ctx, positionals[0]);
  const share = getShare(ctx, s.local_id);
  if (!share) throw new UsageError("session is not shared; run `align share` first");
  const goal = await goalFor(ctx, share.workspace_id, values.goal);
  bind(ctx, s.local_id, goal);
  out(`Binding to ${goal ? `"${goal.title}"` : "no goal"} takes effect at the session's next prompt.`);
}

async function cmdLatch(ctx: Ctx, argv: string[]): Promise<void> {
  if (argv[0] && argv[0] !== "status") throw new UsageError("usage: align latch status (stop and resume come from the web)");
  ingestSpool(ctx);
  const rows = ctx.db.prepare("SELECT l.*, s.harness, s.native_id FROM latches l JOIN sessions s ON s.local_id=l.local_id ORDER BY l.at DESC").all() as {
    local_id: string;
    stopped: number;
    directive_id: string;
    at: string;
    harness: string;
    native_id: string;
  }[];
  if (!rows.length) return out("No stop latches.");
  for (const r of rows) {
    const file = fs.existsSync(layout.latch(ctx.home, r.local_id));
    out(`${r.local_id.slice(0, 8)} ${r.harness} ${r.stopped ? "STOPPED (tools blocked)" : "resumed"} since ${shortTime(r.at)} by ${r.directive_id}${r.stopped && !file ? " (latch file missing!)" : ""}`);
  }
}

async function cmdInstall(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { claude: { type: "boolean" }, codex: { type: "boolean" }, "dry-run": { type: "boolean" } } });
  const any = values.claude || values.codex;
  const res = install(ctx.paths, {
    claude: !!values.claude || !any,
    codex: !!values.codex || !any,
    dryRun: !!values["dry-run"],
    distDir: distDir(),
    version: VERSION,
    nodePath: stableNodePath(ctx.env),
  });
  res.lines.forEach((l) => out(l));
  out("No background process: hooks start a short `align sync` (at most every 10 to 30 seconds) that exits when done.");
  out("Restart running Claude Code and Codex sessions to pick up the hooks.");
}

async function cmdUninstall(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { purge: { type: "boolean" } } });
  ctx.db.close();
  uninstall(ctx.paths, { purge: !!values.purge }).forEach((l) => out(l));
}

async function cmdSync(ctx: Ctx, argv: string[] = []): Promise<void> {
  const hook = argv.includes("--hook");
  const settle = argv.indexOf("--settle");
  // After a Stop hook the harness may still be flushing the transcript; the detached pass can afford to wait.
  if (settle >= 0) await new Promise((r) => setTimeout(r, Math.min(10_000, Number(argv[settle + 1]) || 0)));
  const r = await syncOnce(ctx, {
    tailBudgetMs: Number(ctx.env[hook ? "ALIGN_HOOK_TAIL_BUDGET_MS" : "ALIGN_CLI_TAIL_BUDGET_MS"] || (hook ? 5_000 : 20_000)),
    refreshFeeds: !hook,
    waitForLockMs: settle >= 0 ? 15_000 : 0,
  });
  if (hook) return;
  if (r.skipped) return out("Another sync is running.");
  out(`Local: ${r.spooled} hook records, ${r.tail.files} files scanned (${r.tail.bytes} new bytes).`);
  if (!signedIn(ctx.home)) return out("Signed out: nothing uploaded.");
  out(`Server: ${r.sent} queued calls sent, ${r.uploaded} usage rows uploaded, ${r.directives} directives, ${outboxDepth(ctx)} still queued.`);
}

async function cmdDoctor(ctx: Ctx): Promise<void> {
  const checks: [string, "OK" | "WARN" | "FAIL", string][] = [];
  const add = (name: string, level: "OK" | "WARN" | "FAIL", detail: string) => checks.push([name, level, detail]);
  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 24 ? "OK" : "FAIL", `${process.version} at ${process.execPath}`);
  const st = fs.statSync(ctx.home);
  add("align home", (st.mode & 0o077) === 0 ? "OK" : "FAIL", `${ctx.home} mode ${(st.mode & 0o777).toString(8)}`);
  for (const f of [layout.deviceSecret(ctx.home), layout.credentials(ctx.home), layout.deviceKey(ctx.home)]) {
    if (!fs.existsSync(f)) continue;
    const m = fs.statSync(f).mode & 0o777;
    add(path.basename(f), m === 0o600 ? "OK" : "FAIL", `mode ${m.toString(8)}`);
  }
  const s = installState(ctx);
  add("claude hooks", s.claude === "installed" ? "OK" : "WARN", s.claude);
  add("codex hooks", s.codex.startsWith("installed") ? "OK" : "WARN", s.codex);
  add("hook file", s.hash === "ok" ? "OK" : "WARN", s.hash);
  const rec = readJson<InstallRecord>(layout.install(ctx.home));
  if (rec && !fs.existsSync(rec.node)) add("hook node path", "FAIL", `${rec.node} no longer exists; rerun align install`);
  const hookJs = fs.existsSync(path.join(ctx.home, "bin", "current", "hook.js")) ? path.join(ctx.home, "bin", "current", "hook.js") : path.join(distDir(), "hook.js");
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const t0 = process.hrtime.bigint();
    spawnSync(process.execPath, [hookJs, "claude", "PreToolUse"], {
      input: JSON.stringify({ session_id: "align-doctor-probe", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} }),
      env: { ...process.env, ALIGN_HOME: ctx.home, ALIGN_NO_AUTOSTART: "1" },
      timeout: 5000,
    });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1];
  add("hook latency", p95 < 150 ? "OK" : "WARN", `p50 ${times[Math.floor(times.length / 2)].toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (internal deadline 300 ms)`);
  add("outbox", outboxDepth(ctx) < 100 ? "OK" : "WARN", `${outboxDepth(ctx)} queued`);
  const c = loadCredentials(ctx.home);
  add("sign-in", c && !c.signed_out ? "OK" : "WARN", c && !c.signed_out ? `access token expires ${c.access_expires_at}` : "signed out (local metering only)");
  for (const [n, l, dtl] of checks) out(`${pad(l, 5)} ${pad(n, 16)} ${dtl}`);
  if (checks.some((c) => c[1] === "FAIL")) process.exitCode = 1;
}

// ---------- main ----------
export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return out(HELP);
  if (cmd === "--version" || cmd === "version") return out(VERSION);
  const ctx = openCtx(process.env);
  try {
    switch (cmd) {
      case "login":
        return await cmdLogin(ctx, rest);
      case "logout":
        return await cmdLogout(ctx);
      case "status":
        return await cmdStatus(ctx);
      case "sessions":
        return await cmdSessions(ctx, rest);
      case "goals":
        return await cmdGoals(ctx, rest);
      case "share":
        return await cmdShare(ctx, rest);
      case "stop-sharing":
      case "unshare":
        return await cmdStopSharing(ctx, rest);
      case "delete-history":
        return await cmdDeleteHistory(ctx, rest);
      case "bind":
        return await cmdBind(ctx, rest);
      case "rules":
        return await cmdRules(ctx);
      case "latch":
        return await cmdLatch(ctx, rest);
      case "install":
        return await cmdInstall(ctx, rest);
      case "uninstall":
        return await cmdUninstall(ctx, rest);
      case "sync":
        return await cmdSync(ctx, rest);
      case "doctor":
        return await cmdDoctor(ctx);
      default:
        throw new UsageError(`unknown command "${cmd}"\n\n${HELP}`);
    }
  } finally {
    try {
      if (cmd !== "uninstall") ctx.db.close();
    } catch {
      /* closed */
    }
  }
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1] || "") === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e) => {
    err(`align: ${(e as Error).message}`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  });
}
