import { randomUUID } from "node:crypto";
import { exec, get, run, tx } from "./db";
import { serializeGoal, transferGoals, visibleGoals } from "./goals";
import { nowIso } from "./ids";
import { V2Error, notFound } from "./errors";
import { v2Enabled } from "./config";
import type { PolicyPrincipal } from "./policy";
import { REGISTRY_CONTRACT, viewDigest, type ExternalGoalRef } from "./goal-registry-codec";

export const registryEnabled = () => v2Enabled() && process.env.ALIGN_GOAL_REGISTRY === "1";
export const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;

/** Additive singleton, persisted alongside this registry's goals. Never infer identity from its host or owner. */
export async function initializeGoalRegistry(): Promise<void> {
  if (!registryEnabled()) return;
  await tx(() => {
    exec("CREATE TABLE IF NOT EXISTS v2_goal_registry_instance (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), instance_id TEXT NOT NULL UNIQUE)");
    run("INSERT OR IGNORE INTO v2_goal_registry_instance (singleton, instance_id) VALUES (1, ?)", randomUUID());
  });
}
export function registryInstanceId(): string {
  const id = get<{ instance_id: string }>("SELECT instance_id FROM v2_goal_registry_instance WHERE singleton = 1")?.instance_id;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error("Invalid registry instance");
  return id;
}
export function goalRegistry(pp: PolicyPrincipal, observedAt = nowIso()) {
  if (!registryEnabled()) throw notFound();
  const instance = registryInstanceId();
  const rows = visibleGoals(pp);
  if (rows.length > 1000) throw new V2Error(413, "registry_too_large", "Registry exceeds snapshot limit");
  const transfers = transferGoals(pp.wsId, pp.userId);
  const goals = rows.map(row => {
    const goal = serializeGoal(pp, row, transfers);
    goal.depends_on.sort();
    goal.contributes_to.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const external_ref: ExternalGoalRef = {
      registry_instance_id: instance, workspace_id: pp.wsId, goal_id: goal.id,
      goal_version: goal.version, owner_id: goal.owner.id,
      view_digest: viewDigest(instance, pp.wsId, goal), observed_at: observedAt,
    };
    return { ...goal, external_ref };
  });
  const snapshot = { contract: REGISTRY_CONTRACT, registry_instance_id: instance, workspace_id: pp.wsId, observed_at: observedAt, goals };
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MAX_REGISTRY_BYTES) throw new V2Error(413, "registry_too_large", "Registry exceeds snapshot limit");
  return snapshot;
}
