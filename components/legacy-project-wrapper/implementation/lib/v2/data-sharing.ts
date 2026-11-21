import { randomUUID } from "node:crypto";
import { config } from "../config";
import { all, audit, DISPATCH_WINDOW_MS, get, run, trackDispatchWindow, tx } from "./db";
import type { DevicePrincipal } from "./devices";
import { V2Error, badRequest, conflict, forbidden, notFound } from "./errors";
import { nowIso } from "./ids";
import { expireOptionalSessionData, scheduleOptionalSessionExpiry } from "./retention";
import { bindableFor, goalObj, goalRow, visibleGoals } from "./goals";
import { authorize, canReadGoal, type PolicyPrincipal } from "./policy";
import { ownSession, sessionRow, wasSessionDeleted } from "./sessions";
import type { Body } from "./validate";
import { memberPrincipal, need } from "./workspaces";

type ModelCapability = "suggestion" | "limit_check";
type DispatchCapability = ModelCapability | "excerpt" | "work_signals" | "derived_results";
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

function storedDecisionService(ws: string) {
  return get<{ url: string; revision: string }>("SELECT url, revision FROM v2_workspace_decision_services WHERE ws_id = ?", ws) ?? null;
}

function decisionService(ws: string) {
  const stored = storedDecisionService(ws);
  return stored && allowedDecisionUrl(stored.url) === stored.url ? stored : null;
}

export function dataRestrictions(pp: PolicyPrincipal) {
  const blocked = all<{ tier: Tier }>("SELECT tier FROM v2_data_restrictions WHERE ws_id = ? ORDER BY tier", pp.wsId).map((r) => r.tier);
  return { blocked, model_check_blocked: modelBlocked(pp.wsId, "limit_check"), decision_service: decisionService(pp.wsId) };
}

function allowedDecisionUrl(value: unknown): string | null {
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
  return null;
}

function modelBlocked(ws: string, capability: ModelCapability) {
  return capability === "suggestion" ? tierBlocked(ws, 3) : !!get("SELECT 1 FROM v2_model_check_blocks WHERE ws_id = ?", ws);
}

export async function setDataRestriction(pp: PolicyPrincipal, b: Body) {
  const { wsId: ws } = pp;
  return tx(() => {
    need(memberPrincipal(ws, pp.userId), "workspace.manage");
    if (Object.hasOwn(b, "decision_service_url") && Object.keys(b).length === 1) {
      const url = allowedDecisionUrl(b.decision_service_url);
      if (url === null && b.decision_service_url !== null) {
        throw badRequest("Decision service address must be an HTTPS URL without credentials, a query or a fragment.");
      }
      if ((storedDecisionService(ws)?.url ?? null) !== url) {
        if (url === null) run("DELETE FROM v2_workspace_decision_services WHERE ws_id = ?", ws);
        else run(`INSERT INTO v2_workspace_decision_services (ws_id, url, revision) VALUES (?, ?, ?)
          ON CONFLICT(ws_id) DO UPDATE SET url = excluded.url, revision = excluded.revision`, ws, url, randomUUID());
        audit(ws, pp.userId, "data_sharing.decision_service_changed", null, nowIso());
      }
    } else if (typeof b.model_check_blocked === "boolean" && Object.keys(b).length === 1) {
      if (modelBlocked(ws, "limit_check") !== b.model_check_blocked) {
        if (b.model_check_blocked) run("INSERT INTO v2_model_check_blocks (ws_id) VALUES (?)", ws);
        else run("DELETE FROM v2_model_check_blocks WHERE ws_id = ?", ws);
        audit(ws, pp.userId, b.model_check_blocked ? "data_sharing.model_check_blocked" : "data_sharing.model_check_unblocked", null, nowIso());
      }
    } else {
      const tier = b.tier as Tier;
      if (!TIERS.includes(tier) || typeof b.blocked !== "boolean" || Object.keys(b).length !== 2) {
        throw badRequest("Choose a sharing restriction and whether to block it.");
      }
      if (tierBlocked(ws, tier) !== b.blocked) {
        if (b.blocked) run("INSERT INTO v2_data_restrictions (ws_id, tier) VALUES (?, ?)", ws, tier);
        else run("DELETE FROM v2_data_restrictions WHERE ws_id = ? AND tier = ?", ws, tier);
        audit(ws, pp.userId, b.blocked ? `data_sharing.tier_${tier}_blocked` : `data_sharing.tier_${tier}_unblocked`, null, nowIso());
      }
    }
    return dataRestrictions(pp);
  });
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

function modelPermission(ws: string, capability: ModelCapability, phase: string | null, revision: string | null) {
  if (modelBlocked(ws, capability)) return { enabled: false };
  if (phase === "answer") {
    return { enabled: dispatchRevisionMatches(ws, capability, revision) };
  }
  if (phase !== "dispatch") return { enabled: false };
  return grantDispatchWindow(ws, capability);
}

export function dispatchRevisionMatches(ws: string, capability: DispatchCapability, revision: string | null) {
  return !!revision && !!get("SELECT 1 FROM v2_model_send_windows WHERE ws_id = ? AND capability = ? AND revision = ?", ws, capability, revision);
}

export function grantDispatchWindow(ws: string, capability: DispatchCapability) {
  const row = get<{ revision: string; until_ms: number }>(`INSERT INTO v2_model_send_windows (ws_id, capability, until_ms, revision)
    VALUES (?, ?, ?, lower(hex(randomblob(16))))
    ON CONFLICT(ws_id, capability) DO UPDATE SET until_ms = max(until_ms + 1, excluded.until_ms)
    RETURNING revision, until_ms`, ws, capability, Date.now() + DISPATCH_WINDOW_MS)!;
  trackDispatchWindow(ws, capability, row.until_ms);
  return { enabled: true, send_for_ms: DISPATCH_WINDOW_MS, revision: row.revision };
}

export async function suggestionSendWindow(pp: PolicyPrincipal, dev: DevicePrincipal, phase: string | null,
  revision: string | null, workspaceRecipient: boolean) {
  return tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    need(current, "session.share");
    const decision_service = decisionService(pp.wsId);
    if (workspaceRecipient && !decision_service) return { enabled: false };
    if (phase === "answer") return { ...modelPermission(pp.wsId, "suggestion", phase, revision), decision_service };
    if (phase !== "dispatch" || modelBlocked(pp.wsId, "suggestion")) return { enabled: false };
    const goals = visibleGoals(current).filter((goal) => bindableFor(current, goal))
      .map(({ id, title }) => ({ id, title }));
    if (!goals.length || goals.length > 254) return { enabled: false };
    return { ...modelPermission(pp.wsId, "suggestion", phase, revision), decision_service, goals };
  });
}

export async function modelSendWindow(pp: PolicyPrincipal, dev: DevicePrincipal, key: string,
  phase: string | null, revision: string | null, epoch: string | null) {
  return tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    const session = ownSession(current, dev, key);
    need(current, "session.share");
    const decision_service = decisionService(pp.wsId);
    if (session.state !== "shared" || !decision_service || !epoch) return { enabled: false };
    const binding = get<{ goal_id: string | null }>(
      "SELECT goal_id FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?", pp.wsId, key, epoch,
    );
    const goal = binding?.goal_id ? goalRow(pp.wsId, binding.goal_id) : null;
    if (!goal || !canReadGoal(current, goalObj(goal))) throw notFound();
    return { ...modelPermission(pp.wsId, "limit_check", phase, revision), decision_service };
  });
}

export async function setWorkSignals(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, b: Body, epochs: string[] | null = null) {
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
    if (!epochs || !b.enabled) return { enabled: b.enabled };
    const readable = [...new Set(epochs)].filter((epoch) => findingGoal(current, key, epoch));
    return readable.length ? { ...grantDispatchWindow(pp.wsId, "work_signals"), epochs: readable } : { enabled: false };
  });
}

function resultsStart(pp: PolicyPrincipal, dev: DevicePrincipal, session: ReturnType<typeof ownSession>) {
  if (config().hosted || !authorize(pp, "session.share", workspaceObject).ok
    || session.state !== "shared" || tierBlocked(pp.wsId, 2)) return null;
  return deviceConsent(dev);
}

function findingGoal(pp: PolicyPrincipal, key: string, epoch: string) {
  const binding = get<{ goal_id: string | null }>("SELECT goal_id FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND epoch_id = ?", pp.wsId, key, epoch);
  const goal = binding?.goal_id ? goalRow(pp.wsId, binding.goal_id) : null;
  return !!goal && canReadGoal(pp, goalObj(goal));
}

export async function resultSendWindow(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, epoch: string | null,
  phase: string, revision: string | null) {
  return tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    const session = ownSession(current, dev, key);
    if (!epoch || !findingGoal(current, key, epoch)) throw notFound();
    const available = !config().hosted;
    const enabledSince = resultsStart(current, dev, session);
    if (!enabledSince) return { available, enabled: false };
    const permission = phase === "dispatch" ? grantDispatchWindow(pp.wsId, "derived_results")
      : { enabled: dispatchRevisionMatches(pp.wsId, "derived_results", revision) };
    return { ...permission, available, enabled_since: enabledSince };
  });
}

export async function readFindings(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, statusOnly: boolean, epoch: string | null) {
  if (!statusOnly) await expireOptionalSessionData();
  const current = currentDeviceWorkspace(pp, dev);
  const session = ownSession(current, dev, key);
  if (epoch && !findingGoal(current, key, epoch)) throw notFound();
  const available = !config().hosted;
  const enabledSince = resultsStart(current, dev, session);
  const status = { available, enabled: !!enabledSince, enabled_since: enabledSince };
  if (statusOnly) return status;
  const cutoff = since();
  return {
    ...status,
    findings: available ? all<Finding>(`SELECT ${columns} FROM v2_analysis_findings
      WHERE ws_id = ? AND session_key = ? AND device_id = ? AND turn_started_at > ? AND received_at > ?
      ORDER BY received_at, id`, pp.wsId, key, dev.deviceId, cutoff, cutoff)
      .filter((finding) => findingGoal(current, key, finding.epoch_id)) : [],
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
  const accepted = await tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    const session = ownSession(current, dev, key);
    need(current, "session.share");
    if (config().hosted) throw hostedRefusal();
    const enabledSince = deviceConsent(dev);
    if (!enabledSince || session.state !== "shared") throw forbidden("results_off", "Sharing derived results is off.");
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
         AND v.version >= e.goal_version_at_start AND v.created_at <= ?
         AND ? >= e.starts_at AND (e.ends_at IS NULL OR ? <= e.ends_at)
         AND json_extract(l.value, '$.id') = ?`,
      finding.goal_version, pp.wsId, key, finding.epoch_id, finding.turn_started_at, finding.turn_started_at, finding.turn_started_at, finding.limit_id,
    );
    const goal = version ? goalRow(pp.wsId, version.goal_id) : null;
    if (!goal || !canReadGoal(current, goalObj(goal))) throw notFound();
    if (old) return finding;
    if (tierBlocked(pp.wsId, 2)) throw forbidden("results_off", "Sharing derived results is off.");
    if (get("SELECT 1 FROM v2_analysis_findings WHERE ws_id = ? AND session_key = ? AND device_id = ? AND turn_started_at > ? AND received_at > ? LIMIT 1 OFFSET 499", pp.wsId, key, dev.deviceId, cutoff, cutoff)) {
      throw conflict("findings_full", "This session has reached its derived results limit.");
    }
    run(`INSERT INTO v2_analysis_findings (ws_id, session_key, device_id, id, epoch_id, goal_version, limit_id, evidence, digest, turn_started_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...args, finding.epoch_id, finding.goal_version, finding.limit_id, finding.evidence, finding.digest, finding.turn_started_at, nowIso());
    return finding;
  }).finally(expireOptionalSessionData);
  scheduleOptionalSessionExpiry();
  return accepted;
}

export async function deleteFindings(pp: PolicyPrincipal, dev: DevicePrincipal, key: string, before: string | null) {
  await tx(() => {
    const current = currentDeviceWorkspace(pp, dev);
    if (!sessionRow(pp.wsId, key) && wasSessionDeleted(current, key)) return;
    const session = ownSession(current, dev, key);
    const at = nowIso();
    const parsed = before === null ? null : Date.parse(before);
    if (parsed !== null && (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== before || parsed > Date.parse(at) + 5000)) {
      throw badRequest("Choose a valid deletion cutoff.");
    }
    const cutoff = before ?? session.analysis_deleted_at ?? at;
    if (session.analysis_deleted_at && session.analysis_deleted_at >= cutoff) return;
    run("UPDATE v2_sessions SET analysis_deleted_at = ? WHERE ws_id = ? AND session_key = ?", cutoff, pp.wsId, key);
    run("DELETE FROM v2_analysis_findings WHERE ws_id = ? AND session_key = ? AND device_id = ? AND turn_started_at <= ?",
      pp.wsId, key, dev.deviceId, cutoff);
    audit(pp.wsId, pp.userId, "data_sharing.results_deleted", null, at);
  });
}
