import { randomUUID } from "node:crypto";
import { config } from "../config";
import { all, audit, get, run, tx } from "./db";
import type { DevicePrincipal } from "./devices";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { nowIso } from "./ids";
import { goalObj, goalRow } from "./goals";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { ownSession, sessionRow, wasSessionDeleted } from "./sessions";
import type { Body } from "./validate";
import { memberPrincipal, need } from "./workspaces";

const MODEL_SEND_MS = { suggestion: 2950, limit_check: 1500 } as const;
type ModelCapability = keyof typeof MODEL_SEND_MS;
const TIERS = [1, 2, 3, 4] as const;
const EVIDENCE = ["wording", "example", "tool", "file", "git", "model"] as const;
const FINDING_FIELDS = ["id", "epoch_id", "goal_version", "limit_id", "evidence", "digest", "turn_started_at"] as const;
type Tier = typeof TIERS[number];
type Finding = {
  id: string;
  epoch_id: string;
  goal_version: number;
  limit_id: string;
  evidence: typeof EVIDENCE[number];
  digest: string;
  turn_started_at: string;
};

const since = () => new Date(Date.now() - 30 * 86_400_000).toISOString();
const columns = "id, epoch_id, goal_version, limit_id, evidence, digest, turn_started_at";
const deviceConsent = (dev: DevicePrincipal) =>
  get<{ enabled_at: string }>("SELECT enabled_at FROM v2_device_result_consent WHERE device_id = ?", dev.deviceId)?.enabled_at ?? null;
const hostedRefusal = () => forbidden("results_unavailable", "Hosted Align cannot receive derived findings. They stay on this machine.");
const findingGone = () => new V2Error(410, "finding_gone", "This finding was deleted or expired.");
const workspaceObject = { kind: "workspace" } as const;

export function tierBlocked(ws: string, tier: Tier) {
  return !!get("SELECT 1 FROM v2_data_restrictions WHERE ws_id = ? AND tier = ?", ws, tier);
}

function decisionService(ws: string) {
  return get<{ url: string; revision: string }>("SELECT url, revision FROM v2_workspace_decision_services WHERE ws_id = ?", ws) ?? null;
}

export function dataRestrictions(pp: PolicyPrincipal) {
  const blocked = all<{ tier: Tier }>("SELECT tier FROM v2_data_restrictions WHERE ws_id = ? ORDER BY tier", pp.wsId).map((r) => r.tier);
  return { blocked, model_check_blocked: modelBlocked(pp.wsId, "limit_check"), decision_service: decisionService(pp.wsId) };
}

function decisionServiceUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string" && value.length <= 2048) {
    try {
      const url = new URL(value);
      const loopback = !config().hosted && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
      if ((url.protocol === "https:" || loopback) && !url.username && !url.password && !url.href.includes("?") && !url.href.includes("#")) {
        return url.href;
      }
    } catch {
      // Use the field label for all invalid addresses.
    }
  }
  throw badRequest("Decision service address must be an HTTPS URL without credentials, a query or a fragment.");
}

function modelBlocked(ws: string, capability: ModelCapability) {
  return capability === "suggestion" ? tierBlocked(ws, 3) : !!get("SELECT 1 FROM v2_model_check_blocks WHERE ws_id = ?", ws);
}

function sendUntil(ws: string, capability: ModelCapability) {
  return get<{ until_ms: number }>("SELECT until_ms FROM v2_model_send_windows WHERE ws_id = ? AND capability = ?", ws, capability)?.until_ms ?? 0;
}

async function waitForWindow(until: number) {
  for (let remaining = until - Date.now(); remaining > 0; remaining = until - Date.now()) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export async function setDataRestriction(pp: PolicyPrincipal, b: Body) {
  const { wsId: ws } = pp;
  const wait = await tx((): { until?: number; blocked?: ModelCapability } => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.manage");
    if (Object.hasOwn(b, "decision_service_url") && Object.keys(b).length === 1) {
      const url = decisionServiceUrl(b.decision_service_url);
      if ((decisionService(pp.wsId)?.url ?? null) !== url) {
        if (url === null) run("DELETE FROM v2_workspace_decision_services WHERE ws_id = ?", pp.wsId);
        else run(`INSERT INTO v2_workspace_decision_services (ws_id, url, revision) VALUES (?, ?, ?)
          ON CONFLICT(ws_id) DO UPDATE SET url = excluded.url, revision = excluded.revision`, pp.wsId, url, randomUUID());
        audit(ws, pp.userId, "data_sharing.decision_service_changed", null, nowIso());
        return { until: Math.max(sendUntil(ws, "suggestion"), sendUntil(ws, "limit_check")) };
      }
      return {};
    }
    if (typeof b.model_check_blocked === "boolean" && Object.keys(b).length === 1) {
      if (modelBlocked(ws, "limit_check") !== b.model_check_blocked) {
        if (b.model_check_blocked) run("INSERT INTO v2_model_check_blocks (ws_id) VALUES (?)", ws);
        else run("DELETE FROM v2_model_check_blocks WHERE ws_id = ?", ws);
        audit(ws, pp.userId, b.model_check_blocked ? "data_sharing.model_check_blocked" : "data_sharing.model_check_unblocked", null, nowIso());
      }
      return b.model_check_blocked ? { blocked: "limit_check" } : {};
    }
    const tier = b.tier as Tier;
    if (!TIERS.includes(tier) || typeof b.blocked !== "boolean" || Object.keys(b).length !== 2) {
      throw badRequest("Choose a sharing restriction and whether to block it.");
    }
    if (tierBlocked(pp.wsId, tier) !== b.blocked) {
      if (b.blocked) run("INSERT INTO v2_data_restrictions (ws_id, tier) VALUES (?, ?)", pp.wsId, tier);
      else run("DELETE FROM v2_data_restrictions WHERE ws_id = ? AND tier = ?", pp.wsId, tier);
      audit(pp.wsId, pp.userId, b.blocked ? `data_sharing.tier_${tier}_blocked` : `data_sharing.tier_${tier}_unblocked`, null, nowIso());
    }
    return tier === 3 && b.blocked ? { blocked: "suggestion" } : {};
  });
  if (wait.until) await waitForWindow(wait.until);
  if (wait.blocked) {
    // The workspace may have unblocked and issued another window while a save was waiting.
    while (modelBlocked(ws, wait.blocked)) {
      const until = sendUntil(ws, wait.blocked);
      if (until <= Date.now()) break;
      await waitForWindow(until);
    }
  }
  return dataRestrictions(pp);
}

export async function setDeviceSharingConsent(dev: DevicePrincipal, b: Body) {
  const { enabled, tier, revision } = b;
  const excerpts = tier === 4;
  if (typeof enabled !== "boolean" || (tier !== undefined && !excerpts)
    || Object.keys(b).some((key) => key !== "enabled" && key !== "tier" && !(excerpts && key === "revision"))) {
    throw badRequest("Choose whether to allow sharing.");
  }
  if (excerpts && (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1)) {
    throw badRequest("Update the align CLI before changing excerpt sharing.");
  }
  return tx(() => {
    if (!get("SELECT 1 FROM v2_devices WHERE id = ? AND revoked_at IS NULL", dev.deviceId)) throw notFound();
    const prior = excerpts
      ? get<{ enabled: number; revision: number }>("SELECT enabled, revision FROM v2_device_excerpt_consent WHERE device_id = ?", dev.deviceId)
      : undefined;
    const wasEnabled = excerpts ? !!prior?.enabled : !!deviceConsent(dev);
    const at = nowIso();
    if (excerpts) {
      if (prior && prior.revision >= (revision as number)) return { enabled: wasEnabled, revision: prior.revision };
      run(`INSERT INTO v2_device_excerpt_consent (device_id, enabled, revision) VALUES (?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET enabled = excluded.enabled, revision = excluded.revision`,
      dev.deviceId, Number(enabled), revision as number);
    } else {
      if (enabled && config().hosted) throw hostedRefusal();
      if (wasEnabled === enabled) return { enabled };
      if (enabled) run("INSERT INTO v2_device_result_consent (device_id, enabled_at) VALUES (?, ?)", dev.deviceId, at);
      else run("DELETE FROM v2_device_result_consent WHERE device_id = ?", dev.deviceId);
    }
    if (wasEnabled !== enabled) {
      const choice = excerpts ? "excerpts" : "results";
      for (const { ws_id } of all<{ ws_id: string }>("SELECT ws_id FROM v2_device_grants WHERE device_id = ?", dev.deviceId)) {
        audit(ws_id, dev.user.id, `data_sharing.${choice}_${enabled ? "on" : "off"}`, null, at);
      }
    }
    return excerpts ? { enabled, revision } : { enabled };
  });
}

export function currentDeviceWorkspace(pp: PolicyPrincipal, dev: DevicePrincipal) {
  if (!get(`SELECT 1 FROM v2_device_grants g JOIN v2_devices d ON d.id = g.device_id
    WHERE g.ws_id = ? AND g.device_id = ? AND d.revoked_at IS NULL`, pp.wsId, dev.deviceId)) throw notFound();
  const current = memberPrincipal(pp.wsId, pp.userId);
  need(current, "workspace.read");
  return current;
}

function grantModelWindow(ws: string, capability: ModelCapability) {
  if (modelBlocked(ws, capability)) return { enabled: false };
  const send_for_ms = MODEL_SEND_MS[capability];
  run(`INSERT INTO v2_model_send_windows (ws_id, capability, until_ms) VALUES (?, ?, ?)
    ON CONFLICT(ws_id, capability) DO UPDATE SET until_ms = max(until_ms, excluded.until_ms)`,
  ws, capability, Date.now() + send_for_ms);
  return { enabled: true, send_for_ms };
}

export async function suggestionSendWindow(pp: PolicyPrincipal, dev: DevicePrincipal) {
  return tx(() => {
    need(currentDeviceWorkspace(pp, dev), "session.share");
    return { ...dataRestrictions(pp), ...grantModelWindow(pp.wsId, "suggestion") };
  });
}

export async function modelSendWindow(pp: PolicyPrincipal, dev: DevicePrincipal, key: string) {
  return tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    const session = ownSession(current, dev, key);
    need(current, "session.share");
    const decision_service = decisionService(pp.wsId);
    if (session.state !== "shared" || !decision_service) return { enabled: false };
    return { ...grantModelWindow(pp.wsId, "limit_check"), decision_service };
  });
}

export async function setWorkSignals(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) {
  return tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    const session = ownSession(current, dev, key);
    if (typeof b.enabled !== "boolean" || Object.keys(b).length !== 1) throw badRequest("Choose whether to share work signals.");
    if (b.enabled) need(current, "session.share");
    const allowed = !tierBlocked(pp.wsId, 1);
    if (b.enabled && (!allowed || session.state !== "shared")) return { enabled: false };
    if (session.work_signals !== Number(b.enabled)) {
      run("UPDATE v2_sessions SET work_signals = ? WHERE ws_id = ? AND session_key = ?", Number(b.enabled), pp.wsId, key);
      audit(pp.wsId, pp.userId, b.enabled ? "data_sharing.work_signals_on" : "data_sharing.work_signals_off", null, nowIso());
    }
    return { enabled: b.enabled };
  });
}

function resultsStart(pp: PolicyPrincipal, dev: DevicePrincipal, session: ReturnType<typeof ownSession>) {
  if (config().hosted || !authorize(pp, "session.share", workspaceObject).ok
    || session.state !== "shared" || tierBlocked(pp.wsId, 2)) return null;
  return deviceConsent(dev);
}

export function readFindings(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, statusOnly: boolean) {
  const current = currentDeviceWorkspace(pp, dev);
  const session = ownSession(current, dev, key);
  const available = !config().hosted;
  const enabledSince = resultsStart(current, dev, session);
  const status = { available, enabled: !!enabledSince, enabled_since: enabledSince };
  if (statusOnly) return status;
  const cutoff = since();
  return {
    ...status,
    findings: all<Finding>(`SELECT ${columns} FROM v2_analysis_findings
      WHERE ws_id = ? AND session_key = ? AND device_id = ? AND turn_started_at > ? AND received_at > ?
      ORDER BY received_at, id`, pp.wsId, key, dev.deviceId, cutoff, cutoff),
  };
}

function findingIn(b: Body): Finding {
  const { id, epoch_id, goal_version, limit_id, evidence, digest, turn_started_at } = b;
  const started = typeof turn_started_at === "string" ? Date.parse(turn_started_at) : NaN;
  if (Object.keys(b).some((field) => !FINDING_FIELDS.some((key) => key === field))
    || typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id)
    || typeof epoch_id !== "string" || !/^ep_[A-Za-z0-9_-]{22,64}$/.test(epoch_id)
    || typeof goal_version !== "number" || !Number.isSafeInteger(goal_version) || goal_version < 1
    || typeof limit_id !== "string" || !/^lim_[a-z2-7]{12}$/.test(limit_id)
    || !EVIDENCE.some((v) => v === evidence)
    || typeof digest !== "string" || !/^[0-9a-f]{32}$/.test(digest)
    || typeof turn_started_at !== "string" || !Number.isFinite(started) || new Date(started).toISOString() !== turn_started_at
    || started > Date.now()) throw badRequest("Send only the fields of one derived finding, with a valid turn start time.");
  return { id, epoch_id, goal_version, limit_id, evidence: evidence as Finding["evidence"], digest, turn_started_at };
}

export async function putFinding(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body) {
  return tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    const session = ownSession(current, dev, key);
    need(current, "session.share");
    if (config().hosted) throw hostedRefusal();
    const enabledSince = resultsStart(current, dev, session);
    if (!enabledSince) throw forbidden("results_off", "Sharing derived results is off.");
    const finding = findingIn(b);
    const cutoff = since();
    if (finding.turn_started_at <= cutoff) throw findingGone();
    if (finding.turn_started_at <= enabledSince) throw forbidden("results_before_consent", "This turn started before sharing was enabled.");
    if (session.analysis_deleted_at && finding.turn_started_at <= session.analysis_deleted_at) throw findingGone();
    const args = [pp.wsId, key, dev.deviceId, finding.id] as const;
    const old = get<Finding & { received_at: string }>(`SELECT ${columns}, received_at FROM v2_analysis_findings WHERE ws_id = ? AND session_key = ? AND device_id = ? AND id = ?`, ...args);
    if (old) {
      if (old.received_at <= cutoff || old.turn_started_at <= cutoff) throw findingGone();
      if (FINDING_FIELDS.some((name) => old[name] !== finding[name])) throw conflict("finding_conflict", "This finding was already recorded with different details.");
    }
    const version = get<{ goal_id: string }>(
      `SELECT e.goal_id FROM v2_epochs e
       JOIN v2_goal_versions v ON v.ws_id = e.ws_id AND v.goal_id = e.goal_id AND v.version = ?
       JOIN json_each(v.limits_json) l
       WHERE e.ws_id = ? AND e.session_key = ? AND e.epoch_id = ?
         AND v.version >= e.goal_version_at_start AND (e.ends_at IS NULL OR v.created_at <= e.ends_at)
         AND ? >= e.starts_at AND (e.ends_at IS NULL OR ? <= e.ends_at)
         AND json_extract(l.value, '$.id') = ?`,
      finding.goal_version, pp.wsId, key, finding.epoch_id, finding.turn_started_at, finding.turn_started_at, finding.limit_id,
    );
    const goal = version ? goalRow(pp.wsId, version.goal_id) : null;
    if (!goal || !canReadGoal(current, goalObj(goal))) throw notFound();
    if (old) return finding;
    if (get("SELECT 1 FROM v2_analysis_findings WHERE ws_id = ? AND session_key = ? AND device_id = ? AND turn_started_at > ? AND received_at > ? LIMIT 1 OFFSET 499", pp.wsId, key, dev.deviceId, cutoff, cutoff)) {
      throw conflict("findings_full", "This session has reached its derived results limit.");
    }
    run(`INSERT INTO v2_analysis_findings (ws_id, session_key, device_id, id, epoch_id, goal_version, limit_id, evidence, digest, turn_started_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...args, finding.epoch_id, finding.goal_version, finding.limit_id, finding.evidence, finding.digest, finding.turn_started_at, nowIso());
    return finding;
  });
}

export async function deleteFindings(pp: PolicyPrincipal, dev: DevicePrincipal, key: string) {
  await tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    if (!sessionRow(pp.wsId, key) && wasSessionDeleted(current, key)) return;
    ownSession(current, dev, key);
    const at = nowIso();
    run("UPDATE v2_sessions SET analysis_deleted_at = MAX(COALESCE(analysis_deleted_at, ''), ?) WHERE ws_id = ? AND session_key = ?", at, pp.wsId, key);
    const removed = run("DELETE FROM v2_analysis_findings WHERE ws_id = ? AND session_key = ? AND device_id = ?", pp.wsId, key, dev.deviceId);
    if (removed) audit(pp.wsId, pp.userId, "data_sharing.results_deleted", null, at);
  });
}
