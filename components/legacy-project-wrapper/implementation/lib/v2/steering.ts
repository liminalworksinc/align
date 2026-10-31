import { all, audit, get, run, tx } from "./db";
import { badRequest } from "./errors";
import { nowIso } from "./ids";
import type { DevicePrincipal } from "./devices";
import type { PolicyPrincipal } from "./policy";
import { need } from "./workspaces";
import { ID_RE, SESSION_KEY_RE, type Body } from "./validate";

// Steering (PORT29, main #29): with it on, a shared session that starts on a goal at least 10 points over its target,
// while another goal it can read is at least 10 points under, gets one line naming both shares. The agent decides from
// its cached goals feed, which carries each goal's launched target, its 7-day share, whether it is held, and this
// switch (packages/align-agent/src/shared/steering.ts); the server writes no directive for it. A workspace owner turns
// it on or off, which is also the allocation experiment's A/B/A (docs/ALLOCATION_EXPERIMENT.md). Agents report each
// line they showed so it can be counted: a session key, goal ids and whole percents, never text or a person.

export type Steering = "off" | "on";

export function workspaceSteering(wsId: string): Steering {
  return get<{ steering: Steering }>("SELECT steering FROM v2_workspaces WHERE id = ?", wsId)?.steering === "on" ? "on" : "off";
}

/** Turn steering on or off (inside the caller's tx; the caller checked workspace.manage). Audited only on a change. */
export function writeSteering(pp: PolicyPrincipal, v: unknown, at: string): Steering {
  if (v !== "on" && v !== "off") throw badRequest("steering must be on or off");
  if (workspaceSteering(pp.wsId) !== v) {
    run("UPDATE v2_workspaces SET steering = ? WHERE id = ?", v, pp.wsId);
    audit(pp.wsId, pp.userId, v === "on" ? "workspace.steering_on" : "workspace.steering_off", pp.wsId, at);
  }
  return v;
}

const MAX_EVENTS = 100;
const pctOk = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 100;

/** POST …/steering { events }: steering lines this device's own shared sessions showed. Events for another device's,
 *  an unknown or a stopped session, or dated more than 5 minutes ahead or 14 days back, are skipped; a repeat (same
 *  session and time) is accepted once. */
export async function ingestSteering(pp: PolicyPrincipal, dev: DevicePrincipal, b: Body) {
  need(pp, "session.share");
  const events = b.events;
  if (!Array.isArray(events)) throw badRequest("events must be a list");
  if (events.length > MAX_EVENTS) throw badRequest(`events: at most ${MAX_EVENTS}`);
  const parsed = events.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("each event must be an object");
    const e = raw as Body;
    if (typeof e.session_key !== "string" || !SESSION_KEY_RE.test(e.session_key)) throw badRequest("session_key is invalid");
    if (typeof e.goal_id !== "string" || !ID_RE.test(e.goal_id) || typeof e.suggested_goal_id !== "string" || !ID_RE.test(e.suggested_goal_id)) throw badRequest("goal ids are invalid");
    if (!pctOk(e.share) || !pctOk(e.target)) throw badRequest("share and target must be whole percents");
    const at = typeof e.at === "string" ? Date.parse(e.at) : NaN;
    if (!Number.isFinite(at)) throw badRequest("at must be an ISO time");
    return { session_key: e.session_key, goal_id: e.goal_id, suggested_goal_id: e.suggested_goal_id, share: e.share, target: e.target, at };
  });
  const now = Date.now();
  const recorded = nowIso();
  let accepted = 0;
  await tx(() => {
    for (const e of parsed) {
      if (e.at > now + 5 * 60_000 || e.at < now - 14 * 86_400_000) continue;
      const s = get<{ device_id: string; user_id: string; state: string }>("SELECT device_id, user_id, state FROM v2_sessions WHERE ws_id = ? AND session_key = ?", pp.wsId, e.session_key);
      if (!s || s.device_id !== dev.deviceId || s.user_id !== dev.user.id || s.state !== "shared") continue;
      accepted += run(
        "INSERT OR IGNORE INTO v2_steering_events (ws_id, session_key, goal_id, suggested_goal_id, share, target, at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        pp.wsId,
        e.session_key,
        e.goal_id,
        e.suggested_goal_id,
        e.share,
        e.target,
        new Date(e.at).toISOString(),
        recorded,
      );
    }
  });
  return { accepted };
}

/** How many steering lines were shown, per UTC day, in [from, to), and the switch. No goal, session or person. */
export function steeringCounts(pp: PolicyPrincipal, from: string | null, to: string | null) {
  need(pp, "spend.read");
  const days = all<{ day: string; n: number }>(
    "SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM v2_steering_events WHERE ws_id = ? AND (? IS NULL OR at >= ?) AND (? IS NULL OR at < ?) GROUP BY day ORDER BY day",
    pp.wsId,
    from,
    from,
    to,
    to,
  );
  return { steering: workspaceSteering(pp.wsId), total: days.reduce((a, d) => a + d.n, 0), days };
}
