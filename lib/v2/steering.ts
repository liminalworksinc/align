import { all, audit, get, run, tx } from "./db";
import { badRequest } from "./errors";
import { nowIso } from "./ids";
import type { DevicePrincipal } from "./devices";
import type { PolicyPrincipal } from "./policy";
import { sessionRow } from "./sessions";
import { need } from "./workspaces";
import { ID_RE, SESSION_KEY_RE, type Body } from "./validate";

// Steering: when it is on, a shared session that starts on a goal over its target, while another goal is under
// its target, gets one line naming both shares (packages/align-agent/src/steering.ts decides, from the cached feed).
// The workspace owner turns it on or off; that switch is also the experiment's A/B/A. Agents report each line they
// showed so the experiment can count them: goal ids and shares only, never prompt text or names.

export type Steering = "off" | "on";

export function workspaceSteering(wsId: string): Steering {
  return get<{ steering: Steering }>("SELECT steering FROM v2_workspaces WHERE id = ?", wsId)?.steering === "on" ? "on" : "off";
}

export async function setSteering(pp: PolicyPrincipal, b: Body): Promise<{ steering: Steering }> {
  need(pp, "workspace.manage");
  const v = b.steering;
  if (v !== "on" && v !== "off") throw badRequest("steering must be on or off");
  const at = nowIso();
  await tx(() => {
    run("UPDATE v2_workspaces SET steering = ? WHERE id = ?", v, pp.wsId);
    audit(pp.wsId, pp.userId, `steering.${v}`, pp.wsId, at);
  });
  return { steering: v };
}

const MAX_EVENTS = 100;
const pctOk = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 100;

/** Steering lines this device's own shared sessions showed. Foreign, unknown or stopped sessions are skipped. */
export async function ingestSteering(pp: PolicyPrincipal, dev: DevicePrincipal, b: Body) {
  need(pp, "session.share");
  const events = b.events;
  if (!Array.isArray(events)) throw badRequest("events must be a list");
  if (events.length > MAX_EVENTS) throw badRequest(`events: at most ${MAX_EVENTS}`);
  const now = Date.now();
  const recorded = nowIso();
  let accepted = 0;
  await tx(() => {
    for (const raw of events) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("each event must be an object");
      const e = raw as Body;
      if (typeof e.session_key !== "string" || !SESSION_KEY_RE.test(e.session_key)) throw badRequest("session_key is invalid");
      if (typeof e.goal_id !== "string" || !ID_RE.test(e.goal_id) || typeof e.suggested_goal_id !== "string" || !ID_RE.test(e.suggested_goal_id)) throw badRequest("goal ids are invalid");
      if (!pctOk(e.share) || !pctOk(e.target)) throw badRequest("share and target must be whole percents");
      const at = typeof e.at === "string" ? Date.parse(e.at) : NaN;
      if (!Number.isFinite(at)) throw badRequest("at must be an ISO time");
      if (at > now + 5 * 60_000 || at < now - 14 * 86_400_000) continue;
      const s = sessionRow(pp.wsId, e.session_key);
      if (!s || s.device_id !== dev.deviceId || s.state !== "shared") continue;
      accepted += run(
        "INSERT OR IGNORE INTO v2_steering_events (ws_id, session_key, goal_id, suggested_goal_id, share, target, at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        pp.wsId,
        e.session_key,
        e.goal_id,
        e.suggested_goal_id,
        e.share,
        e.target,
        new Date(at).toISOString(),
        recorded,
      );
    }
  });
  return { accepted };
}

/** How many steering lines were shown, per UTC day, in [from, to). No goal or person names. */
export function steeringCounts(pp: PolicyPrincipal, from: string | null, to: string | null) {
  need(pp, "spend.read");
  const days = all<{ day: string; n: number }>(
    `SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM v2_steering_events WHERE ws_id = ? AND (? IS NULL OR at >= ?) AND (? IS NULL OR at < ?) GROUP BY day ORDER BY day`,
    pp.wsId,
    from,
    from,
    to,
    to,
  );
  return { steering: workspaceSteering(pp.wsId), total: days.reduce((a, d) => a + d.n, 0), days };
}
