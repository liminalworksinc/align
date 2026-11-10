// Caller-owned steering types and explicit resource bindings.
import { all, audit, get, run, tx } from "./db";
import { badRequest } from "./errors";
import { nowIso } from "./ids";
import type { DevicePrincipal } from "./devices";
import type { PolicyPrincipal } from "./policy";
import { need } from "./workspaces";
import { ID_RE, SESSION_KEY_RE, type Body } from "./validate";
import { create_steering } from "../native/.bindings/server_steering.js";

// Steering (PORT29, main #29): with it on, a shared session that starts on a goal at least 10 points over its target,
// while another goal it can read is at least 10 points under, gets one line naming both shares. The agent decides from
// its cached goals feed, which carries each goal's launched target, its 7-day share, whether it is held, and this
// switch (packages/align-agent/src/shared/steering.ts); the server writes no directive for it. A workspace owner turns
// it on or off, which is also the allocation experiment's A/B/A (docs/ALLOCATION_EXPERIMENT.md). Agents report each
// line they showed so it can be counted: a session key, goal ids and whole percents, never text or a person.
export type Steering = "off" | "on";

interface SteeringRuntime {
  workspaceSteering: (wsId: string) => Steering;
  writeSteering: (pp: PolicyPrincipal, v: unknown, at: string) => Steering;
  ingestSteering: (pp: PolicyPrincipal, dev: DevicePrincipal, b: Body) => Promise<{ accepted: number; refused: { index: number; reason: "clock_skew" | "too_old" | "not_shared"; }[]; server_time: string; }>;
  steeringCounts: (pp: PolicyPrincipal, from: string | null, to: string | null) => { steering: Steering; total: number; days: { day: string; n: number; }[]; };
}
const steeringService = create_steering({
  all: (...args: Parameters<typeof all>) => all(...args),
  audit: (...args: Parameters<typeof audit>) => audit(...args),
  get: (...args: Parameters<typeof get>) => get(...args),
  run: (...args: Parameters<typeof run>) => run(...args),
  tx: (...args: Parameters<typeof tx>) => tx(...args),
  badRequest: (...args: Parameters<typeof badRequest>) => badRequest(...args),
  nowIso: (...args: Parameters<typeof nowIso>) => nowIso(...args),
  need: (...args: Parameters<typeof need>) => need(...args),
  ID_RE,
  SESSION_KEY_RE,
  readDate: () => Date,
}) as unknown as SteeringRuntime;

export function workspaceSteering(wsId: string): Steering {
    return (0, steeringService.workspaceSteering)(wsId);
}
/** Turn steering on or off (inside the caller's tx; the caller checked workspace.manage). Audited only on a change. */
export function writeSteering(pp: PolicyPrincipal, v: unknown, at: string): Steering {
    return (0, steeringService.writeSteering)(pp, v, at);
}
/** POST …/steering { events }: steering lines this device's own shared sessions showed. Events for another device's,
 *  an unknown or a stopped session (`not_shared`), or dated more than 5 minutes ahead (`clock_skew`, with `server_time`)
 *  or 14 days back (`too_old`), are skipped and listed in `refused` by index, so a device never loses them silently
 *  (C3-4). A repeat (same session and time, in this batch or an earlier one) is stored once and counted in `accepted`,
 *  as activity counts every item it takes: `accepted + refused.length` is always the batch's length (X6). */
export async function ingestSteering(pp: PolicyPrincipal, dev: DevicePrincipal, b: Body): Promise<{ accepted: number; refused: { index: number; reason: "clock_skew" | "too_old" | "not_shared"; }[]; server_time: string; }> {
    return (0, steeringService.ingestSteering)(pp, dev, b);
}
/** How many steering lines were shown, per UTC day, in [from, to), and the switch. No goal, session or person. */
export function steeringCounts(pp: PolicyPrincipal, from: string | null, to: string | null): { steering: Steering; total: number; days: { day: string; n: number; }[]; } {
    return (0, steeringService.steeringCounts)(pp, from, to);
}
