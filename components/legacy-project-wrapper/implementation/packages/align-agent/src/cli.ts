#!/usr/bin/env node
// `align` CLI. Works offline for local metering; server features need `align login`.
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import {
  api,
  clockWords,
  commitPairing,
  loadCredentials,
  bindDevice,
  loadPendingRevokes,
  logoutLocked,
  NetworkError,
  rawRequest,
  revokePending,
  SignedOut,
  signedIn,
  revokeState,
  whileSignedInAs,
  type PendingRevoke,
  type RevokeOutcome,
  signedOutWords,
  type Credentials,
} from "./api.ts";
import { openCtx, saveConfig, type Ctx } from "./context.ts";
import { willUpload, type PendingRow } from "./ledger.ts";
import { loadFeed, loadMe, refreshFeed, refreshMe, resolveGoal, resolveWorkspace, takeWorkspacesAdded } from "./goals.ts";
import { ACCESS_LOST, DEVICE_SIGNED_OUT, endedState, getShare } from "./hot.ts";
import { fetchAsks } from "./asks.ts";
import { hookEvents, install, pluginHooksFile, sha256File, uninstall, type InstallRecord } from "./install.ts";
import { newDeviceKey } from "./keys.ts";
import { applyShare, bind, deleteHistory, deleteRefused, endSharesIfSignedOut, endSharesSignedOut, PAST_MAX_DAYS, pastSessions, planShare, renderPreview, sharedBefore, stopSharing } from "./share.ts";
import { askLineForPeople, askOrder, readAsks } from "./shared/asks.ts";
import { gitInfo } from "./shared/anchors.ts";
import { readJson } from "./shared/fsx.ts";
import { matchRule, readRules, realDir, removeRule, setRule } from "./shared/rules.ts";
import { layout } from "./shared/layout.ts";
import type { Goal } from "./shared/types.ts";
import { flushOutbox, ingestSpool, outboxDepth, syncOnce, uploadUsage, type LastSync } from "./sync.ts";
import { tailAll } from "./tailer.ts";
import { VERSION } from "./version.ts";
import { MIN_NODE, unsupportedNode } from "./node-version.ts";
import { kvGet, kvSet } from "./db.ts";
import { podReport } from "./hooks/siblings.ts";
import { answerable, answerRequest, listRequests, stateWords } from "./requests.ts";
import { clean, requestShortId } from "./shared/envelope.ts";
import type { WireRequest } from "./shared/types.ts";
import { computeUnsharedDigest } from "./allocation.ts";
import { listSteering, weekKey } from "./shared/steering.ts";

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
  align share --dir [<folder>] --workspace <name|id> --goal <ref|none> [--signals] [--yes]   share every new session started in a folder
  align share --dir <folder> --past <days> --workspace <name|id> --goal <ref|none> [--signals] [--yes]
                               also share that folder's sessions of the last 1 to 14 days, each from its start
  align share <session|--latest> [--cwd [dir]] --workspace <name|id> --goal <ref|none> [--alias <name>] [--from start|now] [--yes]
  align unshare --dir [<folder>]
  align rules
  align team [--cwd <dir>]      work in flight toward this folder's goal and related ones (agents may run it too; alias: align pod)
  align asks [--workspace <name|id>] [--all] [--json]   what other teams asked of your teams, and your own asks (offline)
  align config [drift on|off]  local settings; drift: a user-only note when a reply may conflict with a goal's limit
  align stop-sharing <session>
  align delete-history <session> [--yes]
  align bind <session> --goal <ref|none>
  align requests [--all] [--json] [--session <session>]   requests from people who can approve your sessions' goals
  align requests accept|decline <id> [--session <session>]
  align latch status           stop latches and goal holds
  align allocation [--workspace <name|id>] [--week YYYY-MM-DD] [--refresh] [--json]   agent time per goal against its target
  align steering status [--workspace <name|id>]
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
    .prepare(`SELECT * FROM sessions WHERE ${PREFIX_MATCH} ORDER BY last_active DESC`)
    .all({ ref }) as unknown as SessionListRow[];
  const exact = rows.filter((r) => r.local_id === ref || r.native_id === ref);
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new UsageError(`no session matches "${ref}"`);
  throw new UsageError(`"${ref}" matches ${rows.length} sessions; use more characters`);
}

/** A session whose local or native id starts with `:ref`, compared exactly: LIKE would ignore case, which base64url
 *  ids need, and read their `_` as any character. */
const PREFIX_MATCH = "substr(local_id, 1, length(:ref)) = :ref OR substr(native_id, 1, length(:ref)) = :ref";

/** Is `arg` an id or id prefix of a session this machine metered (one the hooks only spooled so far included)? */
function isSessionRef(ctx: Ctx, arg: string): boolean {
  const known = () => !!ctx.db.prepare(`SELECT 1 FROM sessions WHERE ${PREFIX_MATCH} LIMIT 1`).get({ ref: arg });
  if (known()) return true;
  ingestSpool(ctx);
  return known();
}

/**
 * parseArgs for a command that takes a session. Local ids are base64url, so one session in 64 has an id, and so the
 * 8-character prefix every hint prints (`align stop-sharing <id>`), that starts with "-": an argument that is not one
 * of the command's options but names a session here is that session, not an unknown option, and so is the value of a
 * string option (`--session -AbC1234`). Anything else that starts with "-" is still refused as an unknown option.
 */
function parseSessionArgs<T extends ParseArgsOptionsConfig>(ctx: Ctx, cmd: string, argv: string[], options: T) {
  const optionName = (a: string): string | null => {
    if (a.startsWith("--")) {
      const name = a.slice(2).split("=")[0];
      return Object.hasOwn(options, name) ? name : null;
    }
    return Object.keys(options).find((k) => options[k].short && a === `-${options[k].short}`) ?? null;
  };
  const opts: string[] = [];
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    const name = a.length > 1 && a.startsWith("-") ? optionName(a) : null;
    if (name && options[name].type === "string" && !a.includes("=") && i + 1 < argv.length && !optionName(argv[i + 1])) opts.push(`--${name}=${argv[++i]}`);
    else if (name) opts.push(a);
    else if (a.length > 1 && a.startsWith("-") && !isSessionRef(ctx, a)) {
      // Most likely a mistyped session prefix (ids are base64url, so one in 64 starts with "-"): say that no session
      // matches, and how to pass one that starts with "-", rather than Node's bare "Unknown option".
      throw new UsageError(`no session matches "${a}", and it is not an option of \`align ${cmd}\`. A session id that starts with "-" can also follow \`--\`, as in \`align ${cmd} -- ${a}\`.`);
    } else positionals.push(a);
  }
  return parseArgs({ args: [...opts, "--", ...positionals], options, allowPositionals: true });
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
  // One device's flush, like a sync pass: a login committing meanwhile stops it rather than sending as the new device.
  const unbind = bindDevice(ctx);
  try {
    await flushOutbox(ctx);
    await uploadUsage(ctx);
    await flushOutbox(ctx);
  } catch (e) {
    ctx.log(`flush failed: ${(e as Error).message}`);
  } finally {
    unbind();
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
  // A device this machine signed out of while the server was unreachable is revoked first, so its sessions end there
  // and can be shared again from the new pairing.
  if (loadPendingRevokes(ctx.home).length) revokeLines(await revokePending(ctx), "login").forEach((l) => out(l));
  // The new key stays in memory until the device is paired: the pairing in use (key, tokens) is untouched until then,
  // so an aborted, denied or expired login changes nothing (C3-2).
  const key = newDeviceKey();
  // The device this pairing replaces (this machine's own, on this server): the server leaves it out when it makes the
  // new device's name unique, so a re-login keeps the plain name instead of "<name> (2)" (cycle 5).
  const before = loadCredentials(ctx.home);
  const replaces = before && before.server_url.replace(/\/$/, "") === server ? before.device_id : null;
  const a = await rawRequest(server, "POST", "/api/v2/device/authorize", { body: { device_name: deviceName, public_key: key.publicKeyB64 } });
  if (a.status === 429) {
    // The server says how long to wait; an older one only sends Retry-After (or nothing).
    const secs = Number(a.headers.get("retry-after") ?? a.json?.retry_after);
    const said = typeof a.json?.message === "string" && /try again in/i.test(a.json.message) ? clean(a.json.message, 300) : "";
    const wait = Number.isFinite(secs) && secs > 0 ? ` Try again in ${Math.max(1, Math.ceil(secs / 60))} minute${Math.ceil(secs / 60) > 1 ? "s" : ""}.` : " Try again later.";
    throw new Error(`could not start pairing this device: ${said || `too many device pairings were started recently.${wait}`}`);
  }
  if (a.status !== 200 || !a.json?.device_code) throw new Error(`device authorize failed: ${a.status} ${a.json?.error || ""}`);
  const { device_code, user_code, verification_uri } = a.json;
  let interval = Number(a.json.interval || 5);
  const expiresAt = Date.now() + Number(a.json.expires_in || 600) * 1000;
  let pairedAs: string | null = null;
  out(`To connect this device, open ${verification_uri} and enter the code ${user_code}`);
  if (!ctx.env.ALIGN_NO_BROWSER && process.platform === "darwin") execFile("open", [verification_uri], () => undefined);
  const scale = Number(ctx.env.ALIGN_DEVICE_POLL_SCALE_MS || 1000);
  for (;;) {
    if (Date.now() > expiresAt) throw new Error("the code expired; run `align login` again");
    await new Promise((r) => setTimeout(r, interval * scale));
    let t;
    try {
      t = await rawRequest(server, "POST", "/api/v2/device/token", { body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code, ...(replaces ? { replaces } : {}) } });
    } catch (e) {
      // A dropped connection (the server restarting, say) is retried until the code expires, like a pending answer (N7).
      if (e instanceof NetworkError) continue;
      throw e;
    }
    if (t.status >= 500) continue;
    if (t.status === 200 && t.json?.access_token) {
      const creds: Credentials = {
        server_url: server,
        device_id: t.json.device_id,
        access_token: t.json.access_token,
        access_expires_at: new Date(Date.now() + Number(t.json.expires_in || 3600) * 1000).toISOString(),
        refresh_token: t.json.refresh_token,
        user: t.json.user || null,
      };
      // Key and credentials together, under the refresh lock (a sync's refresh in flight finishes first and can't
      // write the old device's tokens back, C3-1), keeping what revokes the device this pairing replaces. The shares of
      // the pairing it replaces end in the same step, before anything can share as the new device: a session the new
      // pairing shares while the old device's revoke is in flight keeps its share (C4-2). Each is told how to share
      // it again.
      const { replaced, committed: ended } = await commitPairing(ctx, creds, key.pem, () => endSharesSignedOut(ctx));
      // From here on this command is the new device's: if another login replaces it meanwhile, nothing goes on as that
      // one, and this login does not say it signed in (two logins at once).
      bindDevice(ctx, creds.device_id);
      saveConfig(ctx.home, { server_url: server });
      ctx.config.server_url = server;
      // The replaced device is revoked now (with its access token, or a refresh signed with its key when that has
      // expired, C3-3), so the server ends its shares; when the server can't be told, the next contact does it.
      if (replaced) {
        const o = await revokePending(ctx);
        if (o.pending.some((p) => p.device_id === replaced)) {
          err(`align: could not revoke this machine's earlier device ${replaced}. Align revokes it the next time it reaches the server (the next \`align sync\`); until then its sessions still show as shared there.`);
        }
      }
      if (ended) out(`${ended} session(s) shared from this machine's earlier sign-in stopped sharing; \`::align share\` in a session shares it again.`);
      pairedAs = creds.device_id;
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
  let me;
  try {
    me = await refreshMe(ctx);
  } catch (e) {
    // Another login replaced this pairing (DeviceChanged), or a logout signed it out (SignedOut), while it finished.
    if (e instanceof SignedOut) return replacedMeanwhile(ctx, pairedAs!);
    throw e;
  }
  // Said under the refresh lock and only while this pairing is still the one signed in: a second `align login` that
  // committed meanwhile revoked it, and this one must not report a revoked device as signed in.
  const name = me.device?.name || deviceName;
  if (!(await whileSignedInAs(ctx, pairedAs!, () => out(`Signed in as ${me.user.name} <${me.user.email}> on device ${name}.`)))) return replacedMeanwhile(ctx, pairedAs!);
  await mentionOtherDevices(ctx, server, pairedAs!);
  for (const w of me.workspaces) {
    out(`  workspace ${w.name} (${w.id}), role ${w.role}`);
    try {
      await refreshFeed(ctx, w.id);
      // The asks feed too, so the first session after pairing gets its team's accepted asks in its envelope.
      await fetchAsks(ctx, w.id);
    } catch {
      /* feed later */
    }
  }
}

/** Another `align login` committed after this one and replaced (and revoked) its device: say so, and which device this
 *  machine is signed in as now, instead of "Signed in". */
function replacedMeanwhile(ctx: Ctx, mine: string): void {
  const now = loadCredentials(ctx.home);
  const as = now && !now.signed_out ? `it is signed in as device ${now.device_id}` : "it is signed out now";
  err(`align: another \`align login\` (or \`align logout\`) on this machine finished while this one did, so device ${mine} it paired is replaced and revoked; ${as}. Run \`align status\` to see which.`);
  process.exitCode = 1;
}

/** Lines for the devices `revokePending` revoked or found revoked already (C4-3, C4-9). */
function revokeLines(o: RevokeOutcome, style: "login" | "sync"): string[] {
  const how = (p: PendingRevoke) => (p.reason === "replaced" ? "which `align login` replaced on this machine" : "which this machine signed out of while the server could not be reached");
  return [
    ...o.revoked.map((p) =>
      style === "sync" && p.reason !== "replaced"
        ? `Revoked the device this machine signed out of while the server could not be reached (${p.device_id}); its sessions stopped sharing there.`
        : `Revoked device ${p.device_id}, ${how(p)}; its sessions stopped sharing there.`,
    ),
    ...o.already.map((p) =>
      style === "sync" && p.reason !== "replaced"
        ? `The device this machine signed out of while the server could not be reached was already revoked (on the web, say); nothing was left to do (${p.device_id}).`
        : `Device ${p.device_id}, ${how(p)}, was already revoked (on the web, say); nothing was left to do.`,
    ),
  ];
}

/** The devices still to revoke, each as what it is: "the device this machine signed out of is revoked", "device
 *  <id>, which `align login` replaced, is revoked", or "2 devices this machine no longer uses (…) are revoked". */
function waitingRevokes(list: PendingRevoke[]): string {
  const what = (p: PendingRevoke) => (p.reason === "replaced" ? `${p.device_id}, which \`align login\` replaced` : `${p.device_id}, which this machine signed out of`);
  if (list.length === 1) return list[0].reason === "replaced" ? `device ${what(list[0])}, is revoked` : "the device this machine signed out of is revoked";
  return `the ${list.length} devices this machine no longer uses (${list.map(what).join("; ")}) are revoked`;
}

/**
 * After pairing: name the person's other devices that are still paired (not this one), so one left behind (a machine
 * whose Align home was deleted without `align logout`, say) is seen and can be revoked on the web. Best effort. Each is
 * named with the end of its id and when it was paired, as the Devices page shows them, so two devices of one name are
 * told apart (cycle 5). Never named as one to revoke: this machine's own earlier devices (revoked here, or waiting in
 * revoke.json to be), and a device paired after this one (a second `align login` on this machine, which replaces this
 * pairing, may be the device signed in a moment later). Said only while this pairing is still the one signed in.
 */
async function mentionOtherDevices(ctx: Ctx, server: string, pairedAs: string): Promise<void> {
  try {
    const r = await api(ctx, "GET", "/api/v2/devices");
    if (r.status !== 200 || !Array.isArray(r.json?.devices)) return;
    const list = r.json.devices as { id: string; name: string; created_at: string; last_seen_at: string | null; revoked_at: string | null; current?: boolean }[];
    const mine = list.find((d) => d.current);
    const earlier = new Set(loadPendingRevokes(ctx.home).map((p) => p.device_id));
    const others = list.filter((d) => !d.revoked_at && !d.current && !earlier.has(d.id) && (!mine || d.created_at < mine.created_at));
    if (!others.length) return;
    const named = others.slice(0, 5).map((d) => `${clean(d.name, 60)} (${deviceTag(d.id)}, paired ${shortTime(d.created_at)}, last seen ${shortTime(d.last_seen_at || d.created_at)})`);
    const more = others.length > 5 ? ` and ${others.length - 5} more` : "";
    const line = `Your account has ${others.length} other paired device${others.length === 1 ? "" : "s"}: ${named.join(", ")}${more}. This machine is ${mine ? `${clean(mine.name, 60)} (${deviceTag(mine.id)})` : `device ${pairedAs}`}. Revoke any other you no longer use at ${server}/app/devices.`;
    await whileSignedInAs(ctx, pairedAs, () => out(line));
  } catch {
    /* only a hint */
  }
}

/** A device as the Devices page and `align status` show it: `dv_…` and the last 6 characters of its id. */
export function deviceTag(id: string): string {
  return `dv_…${id.slice(-6)}`;
}

async function cmdLogout(ctx: Ctx): Promise<void> {
  // Entirely under the refresh lock that `align login` commits under (C4-4): the device this reads is the one it revokes
  // and signs out, whichever of the two finishes first. When the server could not be told, what revokes the device
  // later (its latest tokens and key) is kept in `revoke.json` for the next contact.
  let res;
  try {
    res = await logoutLocked(ctx, () => endSharesSignedOut(ctx));
  } catch (e) {
    if (e instanceof NetworkError && /lock busy/.test(e.message)) {
      throw new Error("could not sign out: another Align command is changing this machine's sign-in (an `align login` finishing, say); nothing was changed. Run `align logout` again.");
    }
    throw e;
  }
  const c = res.device;
  if (!c) return out("Not signed in.");
  // "Signed out" only when the credentials say so and the key is gone.
  const now = loadCredentials(ctx.home);
  if (!now?.signed_out || now.device_id !== c.device_id || fs.existsSync(layout.deviceKey(ctx.home))) {
    throw new Error(`could not sign out: this machine still holds the sign-in of device ${now?.device_id ?? "?"}. Run \`align logout\` again.`);
  }
  out("Signed out. Tokens and the device key were removed; local metering continues.");
  const ended = res.after ?? 0;
  if (ended) out(`${ended} shared session(s) stopped sharing. Sessions stopped from the web stay blocked until you run \`align stop-sharing <session>\`.`);
  if (!res.revoked) {
    err(
      `align: could not reach ${c.server_url} to revoke this device. Align revokes it the next time it reaches the server (the next \`align sync\` or \`align login\`); until then its sessions still show as shared there. You can also revoke it at ${c.server_url}/app/devices.`,
    );
  }
}

function installState(ctx: Ctx): { claude: string; codex: string; hash: string } {
  const rec = readJson<InstallRecord>(layout.install(ctx.home));
  const marker = path.join(ctx.home, "bin", "current", "hook.js");
  const count = (file: string, harness: "claude" | "codex", key: (j: any) => any) => {
    try {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      const hooks = key(j) || {};
      return hookEvents(harness).filter((e) => JSON.stringify(hooks[e] || []).includes(marker)).length;
    } catch {
      return 0;
    }
  };
  const c = count(pluginHooksFile(ctx.paths), "claude", (j) => j.hooks);
  const x = count(path.join(ctx.paths.codexHome, "hooks.json"), "codex", (j) => j.hooks);
  const installed = sha256File(marker);
  const hash = !rec ? "not installed" : !installed ? "missing" : installed === rec.hook_sha256 ? "ok" : "modified since install";
  const n = hookEvents("claude").length;
  const m = hookEvents("codex").length;
  return { claude: c === n ? "installed" : c ? `partial (${c}/${n})` : "not installed", codex: x === m ? "installed (trust them in Codex /hooks)" : x ? `partial (${x}/${m})` : "not installed", hash };
}

async function cmdStatus(ctx: Ctx): Promise<void> {
  ingestSpool(ctx);
  endSharesIfSignedOut(ctx);
  const c = loadCredentials(ctx.home);
  const st = installState(ctx);
  const last = readJson<LastSync>(layout.lastSync(ctx.home));
  out(`Align ${VERSION}  home ${ctx.home}`);
  // The name and email as the server last said (`/me`, refreshed by each sync), not as they were at pairing (N9).
  const who = loadMe(ctx.home)?.user || c?.user;
  if (c && !c.signed_out) out(`  Identity:   ${who?.name || "?"} <${who?.email || "?"}> device ${c.device_id} on ${c.server_url}`);
  else out(`  Identity:   signed out${c?.signed_out_reason ? ` (${signedOutWords(c.signed_out_reason)})` : ""}; local metering only`);
  if (c && !c.signed_out && c.clock_offset_ms) {
    out(`  Clock:      this computer's clock is ${clockWords(c.clock_offset_ms)} the server's; Align sends times on the server's clock. Set the system clock to update automatically.`);
  }
  for (const p of loadPendingRevokes(ctx.home)) {
    const why = p.reason === "replaced" ? `replaced by \`align login\` ${shortTime(p.since)} and not revoked yet (${p.server_url} could not be told)` : `signed out ${shortTime(p.since)} while ${p.server_url} could not be reached`;
    out(`  Revoke:     pending for device ${p.device_id}, ${why}; the next \`align sync\` or \`align login\` revokes it`);
  }
  out(`  Last sync:  ${last ? `${shortTime(last.at)} (${last.ms} ms)` : "never"}`);
  if (last?.error) out(`  Server:     unreachable since ${shortTime(last.error_since || last.at)}: ${last.error}; ${unuploadedRows(ctx)} usage rows wait to upload`);
  out(`  Hooks:      Claude Code ${st.claude}; Codex ${st.codex}; hook file ${st.hash}`);
  out(`  Outbox:     ${outboxDepth(ctx)} pending`);
  const shares = ctx.db.prepare("SELECT state, COUNT(*) AS n FROM shares GROUP BY state").all() as { state: string; n: number }[];
  out(`  Shares:     ${shares.length ? shares.map((s) => `${s.n} ${s.state}`).join(", ") : "none (all sessions private)"}`);
  const unpriced = ctx.db.prepare("SELECT unpriced, COUNT(*) AS n FROM requests WHERE unpriced IS NOT NULL GROUP BY unpriced").all() as { unpriced: string; n: number }[];
  out(`  Unpriced:   ${unpriced.length ? unpriced.map((u) => `${u.n} ${u.unpriced}`).join(", ") : "0"}`);
  const latched = (ctx.db.prepare("SELECT COUNT(*) AS n FROM latches WHERE stopped=1").get() as { n: number }).n;
  // Of those whose share ended: the ones that can be shared there again now (`::align share`, then the web lifts it), and
  // the ones only `align stop-sharing` unblocks (C6-2).
  const stuck = (e: { stuck: number; again: number }) =>
    (e.again ? `; ${e.again} can be shared again (\`::align share\` in the session), after which the web can lift it` : "") +
    (e.stuck ? `; ${e.stuck} can't be lifted from the web any more (sharing ended): \`align stop-sharing <session>\` unblocks each` : "");
  const endedOf = (table: "latches" | "holds", flag: "stopped" | "held") => {
    const lids = (ctx.db.prepare(`SELECT DISTINCT x.local_id AS lid FROM ${table} x JOIN shares s ON s.local_id=x.local_id WHERE x.${flag}=1 AND s.state IN ('stopped','error')`).all() as { lid: string }[]).map((r) => r.lid);
    const again = lids.filter((lid) => endedState(ctx, getShare(ctx, lid))?.reshare).length;
    return { stuck: lids.length - again, again };
  };
  if (latched) out(`  Stop latch: ${latched} session(s) stopped${stuck(endedOf("latches", "stopped"))}; see \`align latch status\``);
  const holds = ctx.db.prepare("SELECT json FROM holds WHERE held=1").all() as { json: string }[];
  if (holds.length) {
    const goals = [...new Set(holds.map((h) => `"${clean((JSON.parse(h.json) as { goal_title: string }).goal_title, 80)}"`))];
    out(`  Goal hold:  ${holds.length} session(s) paused on ${goals.join(", ")}${stuck(endedOf("holds", "held"))}; see \`align latch status\``);
  }
  const pending = (ctx.db.prepare("SELECT COUNT(*) AS n FROM goal_requests WHERE state='pending'").get() as { n: number }).n;
  if (pending) out(`  Requests:   ${pending} waiting for your answer; see \`align requests\``);
}

async function cmdSessions(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { all: { type: "boolean" }, json: { type: "boolean" } } });
  prepare(ctx);
  endSharesIfSignedOut(ctx);
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
    const deleting = share && ctx.db.prepare("SELECT 1 FROM outbox WHERE local_id=? AND kind='delete_session'").get(s.local_id);
    const refused = deleting ? deleteRefused(ctx, s.local_id) : null;
    // An ending this machine can undo now (signed in again, back in the workspace) says how, as the session's notice does.
    const again = endedState(ctx, share)?.reshare;
    const why =
      (share?.error === DEVICE_SIGNED_OUT
        ? again
          ? "; ended at a sign-out; `::align share` shares it again"
          : "; this machine signed out"
        : share?.error === ACCESS_LOST
          ? again
            ? "; ended while out of the workspace; `::align share` shares it again"
            : "; no access to the workspace"
          : "") +
      (refused ? `; history deletion refused (${refused})` : deleting ? "; history deletion queued" : "");
    return { ...s, repo: repoLabel(ctx, s, share?.workspace_id ?? null), usage: agg, shared: share ? `${share.state} (${share.workspace_name}${why})` : "private" };
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
  if (!values.workspace && !me.workspaces.length) return out(NO_WORKSPACES);
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
    for (const g of a.goals) out(`  ${g.bindable ? "*" : " "} ${pad(g.id, 14)} v${pad(String(g.version), 3)} ${pad(g.status, 9)} ${pad(g.visibility === "pod" ? "team" : g.visibility, 10)} ${g.title}`);
  }
  out("* = you can bind a session to it now.");
}

/** No workspace in this device's reach (its person was removed from the only one, say): not an error (N6). */
const NO_WORKSPACES = "No workspaces on this device: this device can't reach any Align workspace (you may have been removed from it). Local metering continues. When you accept an invite to a workspace, tick this device there to give it that workspace; `align login` pairs this machine again with the workspaces you choose.";

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
  const { values, positionals } = parseSessionArgs(ctx, "share", argv, {
    latest: { type: "boolean" },
    cwd: { type: "string" },
    dir: { type: "boolean" },
    workspace: { type: "string" },
    goal: { type: "string" },
    alias: { type: "string" },
    from: { type: "string" },
    signals: { type: "boolean" },
    past: { type: "string" },
    yes: { type: "boolean", short: "y" },
  });
  await needLogin(ctx);
  if (!values.goal) throw new UsageError("--goal <ref|none> is required");
  let past: number | null = null;
  if (values.past !== undefined) {
    if (!values.dir) throw new UsageError("--past needs --dir <folder>");
    past = Number(values.past);
    if (!/^\d+$/.test(values.past) || past < 1 || past > PAST_MAX_DAYS) throw new UsageError(`--past takes a number of days from 1 to ${PAST_MAX_DAYS}`);
  }
  if (values.dir) return await shareDir(ctx, positionals[0] || process.cwd(), values.workspace, values.goal, !!values.yes, !!values.signals, past);
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
  // Shared before, also when its shared history was deleted since: this share counts from now (C6-1).
  const effectiveFrom = from === "start" && sharedBefore(ctx, session.local_id) ? "now" : from;
  const plan = planShare(ctx, session.local_id, ws, goal, values.alias ?? null, effectiveFrom);
  out(renderPreview(plan));
  out(signalsPreview(!!values.signals));
  if (effectiveFrom !== from) out("This session was shared before, so this share counts from now.");
  if (!(await confirm("Share this session?", !!values.yes))) {
    out("Not shared. Run again with --yes to confirm.");
    return;
  }
  applyShare(ctx, plan);
  kvSet(ctx.db, `signals:${session.local_id}`, values.signals ? "1" : "0");
  await tryFlush(ctx);
  const after = getShare(ctx, session.local_id);
  if (after?.state === "error" || after?.state === "stopped") {
    // The server refused it: say why and what to do (the session's own notice has the same words), never "is error." (C3-8).
    const notice = ctx.db.prepare("SELECT text FROM notices WHERE local_id=? AND id LIKE ? ORDER BY created_at DESC LIMIT 1").get(session.local_id, `${session.local_id}/share_err_%`) as { text: string } | undefined;
    const why = notice ? notice.text.replace(/^Align: /, "") : `the server refused it (${after.error || after.state}). This session stays private.`;
    err(`align: session ${session.local_id.slice(0, 8)} was not shared: ${why}`);
    process.exitCode = 1;
    return;
  }
  out(`Session ${session.local_id.slice(0, 8)} is ${after?.state === "pending" ? "queued to share (offline; the next sync retries)" : after?.state}.`);
}

/** What team awareness sends, with and without the user's consent to share names. */
function signalsPreview(on: boolean): string {
  return on
    ? "Work signals ON: repo-relative paths of edited files, commit subjects, task labels and the branch name go to people who\ncan read the goal, kept 24 hours, so their agents can avoid overlapping work. File contents are never sent."
    : "Work signals OFF: only keyed hashes of edited files are sent, so overlapping edits can be flagged without names.\nAdd --signals to share file paths, commit subjects and task labels with people who can read the goal.";
}

const HARNESS_NAME: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

async function shareDir(ctx: Ctx, folder: string, wsRef: string | undefined, goalRef: string, yes: boolean, signals = false, pastDays: number | null = null): Promise<void> {
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
  out(`\`::align unshare\` keeps a single session private. Sessions that are already running are not changed${pastDays === null ? "" : ", apart from the past sessions listed below"}.`);
  out("Sent per session: harness, a keyed repo hash, start time, binding epochs, per-request token counts with model, basis and");
  out(`estimated list cost. Never sent: prompts, responses, tool input or output${signals ? "" : ", paths, branch names"}.`);
  out(signalsPreview(signals));
  const prev = matchRule(readRules(ctx.home), dir);
  if (prev && prev.dir === dir) out(`This replaces the current rule (${prev.workspace_name}${prev.goal_title ? `, "${prev.goal_title}"` : ""}).`);
  // --past: sessions already metered on this machine whose own folders are all inside this one, each from its start.
  const past = pastDays === null ? null : (prepare(ctx), pastSessions(ctx, realDir(folder), pastDays));
  if (past) {
    const n = (h: string) => past.take.filter((s) => s.harness === h).length;
    out(`${past.take.length} session(s) in ${realDir(folder)} from the last ${pastDays} days: ${n("claude-code")} Claude Code, ${n("codex")} Codex`);
    for (const s of past.take) out(`  ${shortTime(s.started_at)}  ${pad(HARNESS_NAME[s.harness] || s.harness, 11)} ${s.local_id.slice(0, 8)}`);
    if (past.already) out(`Skipped ${past.already} that were shared before (an earlier share is never backdated).`);
    if (past.deleted) out(`Skipped ${past.deleted} whose shared history was deleted (on the web or with \`align delete-history\`); \`align share <session>\` shares one again, counting from now, if you want.`);
    if (past.take.length) out("Each is shared from its own start with the fields above; nothing it said is sent.");
  }
  if (!(await confirm(past?.take.length ? "Share this folder and these sessions?" : "Share this folder?", yes))) return out("Not changed. Run again with --yes to confirm.");
  setRule(ctx.home, { dir, workspace_id: ws.id, workspace_name: ws.name, goal_id: goal ? goal.id : null, goal_title: goal ? goal.title : null, signals });
  out(`New sessions in ${dir} will be shared with ${ws.name}${goal ? ` for "${goal.title}"` : ""}${signals ? ", with work signals" : ""}.`);
  if (!past?.take.length) return;
  const epochs: string[] = [];
  for (const s of past.take) {
    const plan = planShare(ctx, s.local_id, ws, goal, null, "start");
    applyShare(ctx, plan);
    kvSet(ctx.db, `signals:${s.local_id}`, signals ? "1" : "0");
    epochs.push(plan.epoch_body.epoch_id);
  }
  await tryFlush(ctx);
  const state = (id: string) => (ctx.db.prepare("SELECT synced FROM epochs WHERE epoch_id=?").get(id) as { synced: number } | undefined)?.synced ?? 0;
  const ok = epochs.filter((e) => state(e) === 1).length;
  const refused = epochs.filter((e) => state(e) < 0).length;
  const queued = epochs.length - ok - refused;
  out(`Shared ${ok} past session(s) from their start.`);
  if (refused) out(`${refused} refused by the server: it already holds that session's history from a later start, so it is not backdated. Skipped.`);
  if (queued) out(`${queued} queued (offline); the next sync retries.`);
}

async function cmdRules(ctx: Ctx): Promise<void> {
  const rules = readRules(ctx.home);
  if (!rules.length) return out("No folder rules. Every session is private until you share it.");
  for (const r of rules) {
    const title = (r.goal_id && loadFeed(ctx.home, r.workspace_id)?.goals.find((g) => g.id === r.goal_id)?.title) || r.goal_title;
    out(`${r.dir}  ->  ${r.workspace_name}${title ? ` / ${title}` : " / no goal"}  (since ${r.created_at.slice(0, 10)}${r.signals ? ", work signals on" : ""})`);
  }
}

/** Work in flight toward the goal of the newest shared session in this folder, and related goals. Offline. */
async function cmdTeam(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { cwd: { type: "string" } } });
  const dir = realDir(values.cwd || process.cwd());
  const rows = ctx.db
    .prepare("SELECT s.local_id AS lid, s.cwd AS cwd FROM sessions s JOIN shares h ON h.local_id = s.local_id WHERE h.state = 'shared' ORDER BY COALESCE(s.last_active, s.created_at) DESC")
    .all() as { lid: string; cwd: string | null }[];
  const inside = (c: string | null) => !!c && (realDir(c) === dir || realDir(c).startsWith(dir + path.sep) || dir.startsWith(realDir(c) + path.sep));
  for (const r of rows.filter((x) => inside(x.cwd))) {
    const hot = readJson<{ share: { workspace_id: string } | null; goal: { id: string } | null }>(layout.hot(ctx.home, r.lid));
    if (hot?.share && hot.goal) return out(podReport(ctx.home, r.lid, hot.share.workspace_id, hot.goal.id, r.cwd, 1500));
  }
  const rule = matchRule(readRules(ctx.home), dir);
  if (rule?.goal_id) return out(podReport(ctx.home, null, rule.workspace_id, rule.goal_id, dir, 1500));
  out("No shared session or folder rule covers this folder, so there is no goal to show work for.");
}

/** Asks of this person's teams, and their own, from the cached feed (offline). People's words, shown to people only. */
async function cmdAsks(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { workspace: { type: "string" }, all: { type: "boolean" }, json: { type: "boolean" } } });
  const me = loadMe(ctx.home);
  if (!me) throw new UsageError("no cached workspaces; run `align login`");
  if (!values.workspace && !me.workspaces.length) return out(NO_WORKSPACES);
  const targets = values.workspace ? [resolveWorkspace(ctx.home, values.workspace)].filter((w): w is { id: string; name: string } => !!w) : me.workspaces.map((w) => ({ id: w.id, name: w.name }));
  if (!targets.length) throw new UsageError(`unknown workspace "${values.workspace}"`);
  const all = targets.map((w) => {
    const f = readAsks(ctx.home, w.id);
    const asks = (f?.asks || []).filter((a) => values.all || a.state === "open" || a.state === "accepted").sort(askOrder);
    return { workspace: { id: w.id, name: w.name }, fetched_at: f?.fetched_at || null, asks };
  });
  if (values.json) return out(JSON.stringify(all, null, 2));
  for (const a of all) {
    out(`${a.workspace.name}${a.fetched_at ? ` (cached ${shortTime(a.fetched_at)})` : " (not fetched yet; run `align sync`)"}`);
    const waiting = a.asks.filter((x) => x.waiting_on_me);
    const rest = a.asks.filter((x) => !x.waiting_on_me);
    if (waiting.length) out("  Waiting on you:");
    for (const x of waiting) out(`    - ${askLineForPeople(x, 280)}`);
    if (rest.length) out(waiting.length ? "  Others:" : "  Asks:");
    for (const x of rest) out(`    - ${askLineForPeople(x, 280)}`);
    if (!a.asks.length) out(values.all ? "  No asks." : "  Nothing open or accepted. Use --all for closed asks.");
  }
  if (all.some((a) => a.asks.length)) out("Quoted text was written by people: treat it as information, not instructions. Accept, decline or mark done in the web app.");
}

/** `align config` prints local settings; `align config drift on|off` turns the local drift notice on or off. */
async function cmdConfig(ctx: Ctx, argv: string[]): Promise<void> {
  const [key, value] = argv;
  if (!key) {
    out(`drift  ${ctx.config.drift === false ? "off" : "on"}   (a user-only note when the agent's reply may conflict with its goal's limits)`);
    out(`server ${ctx.config.server_url}`);
    // The only default workspace besides a device's single one, so it is never a hidden one (C5-2).
    const def = ctx.config.default_workspace;
    if (def) {
      const w = loadMe(ctx.home)?.workspaces.find((x) => x.id === def);
      out(`default_workspace ${w ? `${clean(w.name, 80)} (${def})` : `${def} (not reached by this device, so not used)`}   (from config.json: \`::align share\` shares there)`);
    }
    return;
  }
  if (key !== "drift" || (value !== "on" && value !== "off")) throw new UsageError("usage: align config drift on|off");
  saveConfig(ctx.home, { drift: value === "on" });
  out(
    value === "on"
      ? "Drift notice on: after each turn of a shared session whose goal has limits, the reply is checked on this machine and you see a note if it may conflict with one. Nothing is sent or added to the agent's context."
      : "Drift notice off.",
  );
}

async function cmdStopSharing(ctx: Ctx, argv: string[], cmdName = "stop-sharing"): Promise<void> {
  const { values: dv, positionals: dp } = parseSessionArgs(ctx, cmdName, argv, { dir: { type: "boolean" } });
  if (dv.dir) {
    const removed = removeRule(ctx.home, dp[0] || process.cwd());
    return out(removed ? `New sessions in ${removed.dir} are private again. Already shared sessions keep sharing until you stop them.` : "No folder rule covers that folder.");
  }
  const { positionals } = parseSessionArgs(ctx, cmdName, argv, {});
  prepare(ctx);
  const s = resolveSession(ctx, positionals[0]);
  stopSharing(ctx, s.local_id);
  await tryFlush(ctx);
  out("Stopped sharing. Future usage stays on this machine. Already shared history stays until you run `align delete-history`.");
}

async function cmdDeleteHistory(ctx: Ctx, argv: string[]): Promise<void> {
  const { values, positionals } = parseSessionArgs(ctx, "delete-history", argv, { yes: { type: "boolean", short: "y" } });
  prepare(ctx);
  const s = resolveSession(ctx, positionals[0]);
  out("This hard-deletes this session's shared usage and epochs on the server. Goal and workspace totals will change. Local metering is kept.");
  if (!(await confirm("Delete the shared history?", !!values.yes))) return out("Nothing deleted. Run again with --yes to confirm.");
  deleteHistory(ctx, s.local_id);
  await tryFlush(ctx);
  if (!getShare(ctx, s.local_id)) {
    const gone = kvGet(ctx.db, `history_gone:${s.local_id}`);
    if (gone) ctx.db.prepare("DELETE FROM kv WHERE key=?").run(`history_gone:${s.local_id}`);
    return out(gone ? "This session's shared history was already deleted on the server (on the web, say); nothing is left there. Nothing more is queued." : "Shared history deleted.");
  }
  // Never "deleted" unless the server said so (C4-1): a refusal keeps the share and the queued deletion.
  const refused = deleteRefused(ctx, s.local_id);
  if (!refused) return out(signedIn(ctx.home) ? "Deletion queued; the next sync retries when online." : "Deletion queued; it is sent once you run `align login` (the next sync after that retries it).");
  const share = getShare(ctx, s.local_id)!;
  const server = loadCredentials(ctx.home)?.server_url || ctx.config.server_url;
  err(
    `align: the shared history of session ${s.local_id.slice(0, 8)} was not deleted: the server refused (${refused}). Only the account that shared it can delete it, from a device that still has access to ${clean(share.workspace_name, 80)}; if it was deleted on the web already, nothing is left there. The deletion stays queued here and is tried again; you can also delete it on the web at ${server}/app/w/${share.workspace_id}/sessions.`,
  );
  process.exitCode = 1;
}

async function cmdBind(ctx: Ctx, argv: string[]): Promise<void> {
  const { values, positionals } = parseSessionArgs(ctx, "bind", argv, { goal: { type: "string" } });
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
  endSharesIfSignedOut(ctx);
  const rows = ctx.db.prepare("SELECT l.*, s.harness, s.native_id FROM latches l JOIN sessions s ON s.local_id=l.local_id ORDER BY l.at DESC").all() as {
    local_id: string;
    stopped: number;
    directive_id: string;
    at: string;
    harness: string;
    native_id: string;
  }[];
  const holds = ctx.db.prepare("SELECT h.*, s.harness FROM holds h JOIN sessions s ON s.local_id=h.local_id WHERE h.held=1 ORDER BY h.at DESC").all() as {
    local_id: string;
    goal_id: string;
    json: string;
    directive_id: string;
    at: string;
    harness: string;
  }[];
  if (!rows.length && !holds.length) return out("No stop latches or goal holds.");
  /** A latch or hold whose share ended can't be lifted from the web: say how to get out. */
  const way = (lid: string) => {
    const ended = endedState(ctx, getShare(ctx, lid));
    if (!ended) return "";
    // Shareable there again now: the way the session's notice and its deny give (C6-2).
    if (ended.reshare) {
      const why = ended.why === "device_signed_out" ? "this machine signed out, and is signed in again now" : "this machine lost access to its Align workspace, and can reach it again now";
      return `; sharing ended (${why}): \`::align share\` in the session shares it there again, after which it can be resumed or released from the web`;
    }
    const why = ended.why === "device_signed_out" ? "this machine signed out" : ended.why === "access_lost" ? "this machine no longer has access to its Align workspace" : "the Align server no longer has this session's share";
    return `; sharing ended (${why}), so only \`align stop-sharing ${lid.slice(0, 8)}\` unblocks it`;
  };
  for (const r of rows) {
    const file = fs.existsSync(layout.latch(ctx.home, r.local_id));
    out(`${r.local_id.slice(0, 8)} ${r.harness} ${r.stopped ? "STOPPED (tools blocked)" : "resumed"} since ${shortTime(r.at)} by ${r.directive_id}${r.stopped && !file ? " (latch file missing!)" : ""}${r.stopped ? way(r.local_id) : ""}`);
  }
  for (const h of holds) {
    const j = JSON.parse(h.json) as { goal_title: string; by: string; reason: string | null };
    const file = fs.existsSync(layout.hold(ctx.home, h.local_id));
    out(
      `${h.local_id.slice(0, 8)} ${h.harness} HELD on goal "${clean(j.goal_title, 80)}" by ${clean(j.by, 50) || "someone"} since ${shortTime(h.at)}${j.reason ? ` (${clean(j.reason, 80)})` : ""} (all tools blocked)${file ? "" : " (hold file missing!)"}${way(h.local_id)}`,
    );
  }
}

/** `align requests`: what people who can approve a session's goal asked of it, and the developer's answers. */
async function cmdRequests(ctx: Ctx, argv: string[]): Promise<void> {
  const { values, positionals } = parseSessionArgs(ctx, "requests", argv, { all: { type: "boolean" }, json: { type: "boolean" }, session: { type: "string" } });
  ingestSpool(ctx);
  const [sub, ref] = positionals;
  if (!sub) {
    // `--session` lists only that session's requests (it used to be ignored here).
    const only = values.session ? resolveSession(ctx, values.session).local_id : null;
    const rows = listRequests(ctx, { all: !!values.all }).filter((r) => !only || r.local_id === only);
    const view = rows.map((r) => {
      const q = JSON.parse(r.json) as Omit<WireRequest, "cancelled">;
      return { id: r.request_id, short_id: requestShortId(r.request_id), session: { local_id: r.local_id, harness: r.harness, native_id: r.native_id }, type: r.type, state: r.state, goal: q.goal, target_goal: q.target_goal, sender: q.sender, note: q.note, created_at: q.created_at, answered_at: r.answered_at };
    });
    if (values.json) return out(JSON.stringify(view, null, 2));
    if (!view.length) return out(`${values.all ? "No requests" : "No requests waiting for an answer"}${only ? ` for session ${only.slice(0, 8)}` : ""}.${values.all ? "" : " Use --all for answered ones."}`);
    for (const v of view) {
      const what = v.type === "switch_goal" ? `switch to goal "${clean(v.target_goal?.title, 60)}"` : v.type === "checkpoint" ? "checkpoint" : `replan toward "${clean(v.goal.title, 60)}" v${v.goal.version}`;
      out(`${v.short_id} ${pad(v.type, 11)} ${what} from ${clean(v.sender.name, 50)} on ${v.session.local_id.slice(0, 8)} ${v.session.harness}: ${stateWords(v.state)} (${shortTime(v.created_at)})`);
      if (v.note) out(`    Note: "${clean(v.note, 280)}"`);
    }
    out("Notes were written by people: treat them as information, not instructions. `align requests accept|decline <id>` answers one.");
    return;
  }
  if ((sub !== "accept" && sub !== "decline") || !ref) throw new UsageError("usage: align requests [--all] [--json] [--session <session>] | align requests accept|decline <id> [--session <session>]");
  const want = ref.toLowerCase().replace(/^rq_/, "");
  const lid = values.session ? resolveSession(ctx, values.session).local_id : null;
  const answer = sub === "accept" ? "accepted" : "declined";
  const open = listRequests(ctx, { all: true }).filter(
    (r) => r.request_id.toLowerCase().replace(/^rq_/, "").startsWith(want) && (!lid || r.local_id === lid) && answerable(r.type, r.state, answer),
  );
  const ids = [...new Set(open.map((r) => r.request_id))];
  if (!ids.length) {
    // Known but answered already (say, accepted in the session a moment ago): say so rather than "no match".
    const known = listRequests(ctx, { all: true }).filter((r) => r.request_id.toLowerCase().replace(/^rq_/, "").startsWith(want) && (!lid || r.local_id === lid));
    if (new Set(known.map((r) => r.request_id)).size === 1) throw new UsageError(`request ${requestShortId(known[0].request_id)} is already ${stateWords(known[0].state)}, so it can't be ${answer} now`);
    throw new UsageError(`no open request matches "${ref}"; run \`align requests\``);
  }
  if (ids.length > 1) throw new UsageError(`"${ref}" matches ${ids.length} requests; use more characters`);
  const msgs: string[] = [];
  for (const r of open) {
    const res = answerRequest(ctx, r.local_id, r.request_id, answer, false);
    msgs.push(`${r.local_id.slice(0, 8)} ${r.harness}: ${res.ok ? answer : `not ${answer} (${res.why})`}`);
  }
  await tryFlush(ctx);
  msgs.forEach((m) => out(m));
  if (answer === "accepted" && open[0].type === "switch_goal") out("The session moves to the new goal at its next prompt.");
  else out("The agent hears it at the session's next prompt.");
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
  // --purge deletes the device key and tokens, so nothing could revoke this device later: revoke it now (and a device
  // a past logout left waiting), or say where to, so no device is left paired with no machine behind it.
  if (values.purge) await revokeBeforePurge(ctx);
  ctx.db.close();
  uninstall(ctx.paths, { purge: !!values.purge }).forEach((l) => out(l));
}

async function revokeBeforePurge(ctx: Ctx): Promise<void> {
  const c = loadCredentials(ctx.home);
  // Every device revoked here is named, not only this one (cycle 5): a device an earlier login replaced goes too.
  const o = loadPendingRevokes(ctx.home).length ? await revokePending(ctx).catch(() => null) : null;
  if (o) revokeLines(o, "login").forEach((l) => out(l));
  const left = o ? o.pending : loadPendingRevokes(ctx.home);
  for (const p of left) err(`align: could not revoke device ${p.device_id}, which this machine no longer uses; revoke it at ${p.server_url}/app/devices.`);
  if (!c || c.signed_out || !c.refresh_token) return;
  let revoked = false;
  try {
    const r = await api(ctx, "DELETE", "/api/v2/devices/self");
    revoked = r.status === 204 || r.status === 200 || r.status === 401;
  } catch (e) {
    revoked = e instanceof SignedOut;
  }
  if (revoked) out(`Revoked this device (${c.device_id}) on ${c.server_url}; its shared sessions stopped sharing there.`);
  else err(`align: could not reach ${c.server_url} to revoke this device (${c.device_id}). Its key is deleted now, so revoke it at ${c.server_url}/app/devices.`);
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
  if (r.revoked) revokeLines(r.revoked, "sync").forEach((l) => out(l));
  if (r.aborted) out("This machine's Align pairing changed during this sync (`align login` or `align logout`), so it stopped there; nothing more was sent as the earlier device. The next sync goes on as the device signed in now.");
  if (!signedIn(ctx.home)) {
    // Cut short by `align logout`: the line above says so, not that it ran signed out (C5-4).
    if (!r.aborted) out("Signed out: nothing uploaded.");
    if (r.revoked && revokeState(r.revoked) === "pending") {
      // The server could not be reached for the revoke: an unreachable server exits 1, as every other pass does.
      err(`align: ${r.serverError || "the server could not be reached"}; ${waitingRevokes(r.revoked.pending)} at the next sync that reaches it.`);
      process.exitCode = 1;
    }
    return;
  }
  // Nothing got through, so no "0 sent" line above the error (it reads as if the pass had worked).
  if (!r.serverError) out(`Server: ${r.sent} queued calls sent, ${r.uploaded} usage rows uploaded, ${r.directives} directives, ${outboxDepth(ctx)} still queued.`);
  // After the `Server:` line, as the spec orders them (cycle 5).
  for (const w of takeWorkspacesAdded()) out(`This machine can now reach ${clean(w.name, 80)} in Align (given to this device when you accepted an invite or on your Devices page). \`align share\`, or \`::align share\` in a session, shares sessions there.`);
  if (r.serverError) {
    const waiting = unuploadedRows(ctx);
    err(`align: ${r.serverError}. ${waiting} usage rows and ${outboxDepth(ctx)} queued calls stay on this machine; the next sync retries.`);
    process.exitCode = 1;
  }
}

/** Finalized usage rows of shared sessions that will upload and have not yet: never one made while the session was not
 *  shared, which stays on this machine (C5-1). */
function unuploadedRows(ctx: Ctx): number {
  const rows = ctx.db
    .prepare(
      `SELECT r.local_id, r.root_turn, r.ts, r.created_at, r.epoch_id, r.uploaded FROM requests r JOIN shares s ON s.local_id=r.local_id
       WHERE s.state='shared' AND r.uploaded=0 AND r.finalized=1`,
    )
    .all() as unknown as PendingRow[];
  return rows.filter((r) => willUpload(ctx.db, r)).length;
}

async function cmdDoctor(ctx: Ctx): Promise<void> {
  const checks: [string, "OK" | "WARN" | "FAIL", string][] = [];
  const add = (name: string, level: "OK" | "WARN" | "FAIL", detail: string) => checks.push([name, level, detail]);
  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= MIN_NODE ? "OK" : "FAIL", `${process.version} at ${process.execPath}`);
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

// ---------- allocation ----------
function allocationTargets(ctx: Ctx, ref: string | undefined): { id: string; name: string }[] {
  const me = loadMe(ctx.home);
  if (!me) throw new UsageError("no cached workspaces; run `align login`");
  if (!ref && !me.workspaces.length) return [];
  const list = ref ? [resolveWorkspace(ctx.home, ref)].filter((w): w is { id: string; name: string } => !!w) : me.workspaces.map((w) => ({ id: w.id, name: w.name }));
  if (!list.length) throw new UsageError(`unknown workspace "${ref}"`);
  return list;
}

/** A gap as the web's Spend tab words it (app/app/w/[ws]/spend/allocation.tsx): whole points, rounded toward zero, so a
 *  9.6-point gap reads "9 points over", agreeing with steering's "at least 10 points" (which compares the exact gap). */
export function gapWords(gap: number | null): string {
  if (gap === null) return "no target";
  if (Math.abs(gap) < 1) return "on target";
  const n = Math.floor(Math.abs(gap));
  return `${n} ${n === 1 ? "point" : "points"} ${gap > 0 ? "over" : "under"}`;
}

async function cmdAllocation(ctx: Ctx, argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { workspace: { type: "string" }, week: { type: "string" }, refresh: { type: "boolean" }, json: { type: "boolean" } } });
  const targets = allocationTargets(ctx, values.workspace);
  if (!targets.length) return out(NO_WORKSPACES);
  prepare(ctx);
  const digest = computeUnsharedDigest(ctx, Date.now(), true);
  if (values.week) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.week) || Number.isNaN(Date.parse(`${values.week}T00:00:00Z`))) throw new UsageError("--week must be a date, YYYY-MM-DD");
    await needLogin(ctx);
    const from = new Date(`${weekKey(Date.parse(`${values.week}T00:00:00Z`))}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 7 * 86_400_000);
    const all = [];
    for (const w of targets) {
      const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(w.id)}/allocation?from=${from.toISOString()}&to=${to.toISOString()}&weeks=1`);
      if (r.status !== 200) throw new Error(r.json?.message ?? `allocation failed (${r.status})`);
      all.push({ workspace: w.name, ...r.json });
    }
    if (values.json) return out(JSON.stringify(all, null, 2));
    for (const a of all as { workspace: string; window: { rows: { kind: string; goal: { title: string } | null; share: number; target_share: number | null; gap: number | null }[] }; steering: { steering: string; total: number } }[]) {
      out(`${a.workspace}, week of ${from.toISOString().slice(0, 10)} (steering ${a.steering.steering}, ${a.steering.total} lines shown)`);
      for (const r of a.window.rows) {
        const label = r.kind === "goal" ? r.goal!.title : r.kind === "private" ? "Goals you can't see" : "Not bound to a goal";
        out(`  ${pad(`${r.share}%`, 7)} ${pad(r.target_share === null ? "-" : `${r.target_share}%`, 6)} ${pad(gapWords(r.gap), 16)} ${label}`);
      }
    }
    return;
  }
  if (values.refresh) {
    await needLogin(ctx);
    for (const w of targets) await refreshFeed(ctx, w.id);
  }
  const feeds = targets.map((w) => ({ workspace: w.name, feed: loadFeed(ctx.home, w.id) }));
  if (values.json) return out(JSON.stringify({ workspaces: feeds.map((f) => ({ workspace: f.workspace, steering: f.feed?.steering ?? "off", fetched_at: f.feed?.fetched_at ?? null, goals: (f.feed?.goals ?? []).map((g) => ({ id: g.id, title: g.title, ...(g.allocation ?? {}) })) })), unshared: digest }, null, 2));
  for (const f of feeds) {
    out(`${f.workspace}, last 7 days${f.feed ? ` (cached ${shortTime(f.feed.fetched_at)}, steering ${f.feed.steering ?? "off"})` : " (not fetched yet; use --refresh)"}`);
    out(`  ${pad("SHARE", 7)} ${pad("TARGET", 6)} ${pad("GAP", 16)} GOAL`);
    const goals = [...(f.feed?.goals ?? [])].filter((g) => g.status === "active").sort((a, b) => (b.allocation?.share_7d ?? 0) - (a.allocation?.share_7d ?? 0));
    for (const g of goals) {
      const a = g.allocation;
      out(`  ${pad(a ? `${a.share_7d}%` : "-", 7)} ${pad(a?.target_share === null || a?.target_share === undefined ? "-" : `${a.target_share}%`, 6)} ${pad(gapWords(a ? a.gap_7d : null), 16)} ${g.title}`);
    }
  }
  if (digest && digest.total_tokens) {
    out(`This machine: ${digest.share}% of agent time in the last 7 days was in sessions not shared toward a goal.`);
    for (const t of digest.top.slice(0, 3)) out(`  ${pad(fmtTokens(t.tokens), 8)} ${t.dir}`);
    out("This part stays on this machine. Shares above are of shared agent time in each workspace.");
  }
}

async function cmdSteering(ctx: Ctx, argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "status") throw new UsageError("usage: align steering status [--workspace <name|id>]");
  const { values } = parseArgs({ args: rest, options: { workspace: { type: "string" } } });
  const queued = listSteering(ctx.home).length;
  const targets = allocationTargets(ctx, values.workspace);
  if (!targets.length) out(NO_WORKSPACES);
  for (const w of targets) {
    const feed = loadFeed(ctx.home, w.id);
    let shown = "";
    if (signedIn(ctx.home)) {
      const from = `${weekKey(Date.now())}T00:00:00.000Z`;
      const r = await api(ctx, "GET", `/api/v2/workspaces/${encodeURIComponent(w.id)}/allocation?from=${from}&weeks=1`).catch(() => null);
      if (r?.status === 200) shown = `, ${r.json.steering.total} ${r.json.steering.total === 1 ? "line" : "lines"} shown this week`;
    }
    out(`${w.name}: steering ${feed?.steering ?? "off"}${shown}`);
  }
  out(`${queued} ${queued === 1 ? "line" : "lines"} waiting to be reported by the next sync.`);
}

// ---------- main ----------
export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return out(HELP);
  if (cmd === "--version" || cmd === "version") return out(VERSION);
  // One clear message on an unsupported Node, before anything else runs (and before node:sqlite loads).
  const old = unsupportedNode(process.env);
  if (old) {
    process.exitCode = 1;
    return err(`align: ${old}. Install Node ${MIN_NODE} or later, then run \`align install\` with it so the hooks use it too.`);
  }
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
        return await cmdStopSharing(ctx, rest, cmd);
      case "delete-history":
        return await cmdDeleteHistory(ctx, rest);
      case "bind":
        return await cmdBind(ctx, rest);
      case "rules":
        return await cmdRules(ctx);
      case "team":
      case "pod":
        return await cmdTeam(ctx, rest);
      case "asks":
        return await cmdAsks(ctx, rest);
      case "config":
        return await cmdConfig(ctx, rest);
      case "latch":
        return await cmdLatch(ctx, rest);
      case "allocation":
        return await cmdAllocation(ctx, rest);
      case "steering":
        return await cmdSteering(ctx, rest);
      case "requests":
        return await cmdRequests(ctx, rest);
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
  // Output into a pipe that closed (`align status | head -3`): stop quietly, as other command-line tools do, instead of
  // an unhandled EPIPE stack trace (C3-7).
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EPIPE") process.exit(process.exitCode ?? 0);
      throw e;
    });
  }
  main(process.argv.slice(2)).catch((e) => {
    err(`align: ${(e as Error).message}`);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  });
}
