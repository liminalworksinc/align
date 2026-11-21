import { all, get, run, tx } from "./db";
import { notFound } from "./errors";
import type { PolicyPrincipal } from "./policy";
import { str, type Body } from "./validate";
import { memberPrincipal, need } from "./workspaces";

/** A personal preference, with the earliest joined current membership as the default. Never used to reassign history. */
export function homeTeamId(ws: string, user: string): string | null {
  return get<{ pod_id: string }>(
    `SELECT pm.pod_id FROM v2_pod_members pm
     LEFT JOIN v2_spend_home_teams h ON h.ws_id = pm.ws_id AND h.user_id = pm.user_id AND h.pod_id = pm.pod_id
     WHERE pm.ws_id = ? AND pm.user_id = ? ORDER BY h.pod_id IS NULL, pm.created_at, pm.rowid LIMIT 1`, ws, user,
  )?.pod_id ?? null;
}

export function spendHomeTeam(pp: PolicyPrincipal) {
  need(pp, "workspace.read");
  const teams = all<{ id: string; name: string }>(
    `SELECT p.id, p.name FROM v2_pod_members pm JOIN v2_pods p ON p.ws_id = pm.ws_id AND p.id = pm.pod_id
     WHERE pm.ws_id = ? AND pm.user_id = ? ORDER BY pm.created_at, pm.rowid`, pp.wsId, pp.userId,
  );
  const id = homeTeamId(pp.wsId, pp.userId);
  return { team: teams.find((t) => t.id === id) ?? null, teams, can_choose: teams.length > 1 };
}

export async function chooseSpendHomeTeam(pp: PolicyPrincipal, b: Body) {
  need(pp, "workspace.read");
  const team = str(b, "team_id", 100);
  await tx(() => {
    need(memberPrincipal(pp.wsId, pp.userId), "workspace.read");
    if (!get("SELECT 1 AS x FROM v2_pod_members WHERE ws_id = ? AND user_id = ? AND pod_id = ?", pp.wsId, pp.userId, team)) throw notFound();
    run(`INSERT INTO v2_spend_home_teams (ws_id, user_id, pod_id) VALUES (?, ?, ?)
      ON CONFLICT (ws_id, user_id) DO UPDATE SET pod_id = excluded.pod_id`, pp.wsId, pp.userId, team);
  });
  return spendHomeTeam(memberPrincipal(pp.wsId, pp.userId));
}
