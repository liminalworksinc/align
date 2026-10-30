import type { Session } from "./auth";
import { audit, touch } from "./flow";
import { refreshRegistry, currentGoals } from "./registry";
import { HttpError, id, now } from "./store";
import type { AppState, OrgDraft } from "./types";

/** Leadership ratifies the drafted company goal and pushes it to every team. Prior versions are kept. */
export function pushCompanyGoal(s: AppState, who: Session, edits?: Partial<OrgDraft>) {
  if (who.actor !== "leadership") throw new HttpError(403, "Only leadership can approve and send the company goal");
  if (!s.org_draft) throw new HttpError(409, "There’s no new company goal drafted to send");
  const draft = { ...s.org_draft, ...Object.fromEntries(Object.entries(edits ?? {}).filter(([, v]) => v !== undefined && v !== "")) } as OrgDraft;
  if (!draft.objective?.trim() || !draft.measures?.length) throw new HttpError(400, "The company goal needs a goal statement and at least one requirement");
  const prev = currentGoals(s).find((g) => g.owner_id === "ceo");
  if (!prev) throw new HttpError(409, "There’s no current company goal yet");
  const nextNum = Number(prev.version.replace(/^v/, "")) + 1;
  const version = `v${nextNum}`;
  const gid = `g-ceo-v${nextNum}`;
  if (s.goals.some((g) => g.id === gid)) throw new HttpError(409, `Company goal ${version} was already sent to teams`);
  const at = now();
  s.goals.push({
    ...prev,
    id: gid,
    version,
    objective: draft.objective.trim(),
    success_criteria: draft.success_criteria ?? prev.success_criteria,
    measures: draft.measures,
    approved_at: at,
    approved_by: "ceo",
    supersedes: prev.id,
    changed: true,
  });
  // Team goals now inherit from the new company version; relations follow.
  for (const g of currentGoals(s)) if (g.parent_ids.includes(prev.id)) g.parent_ids = [gid];
  for (const r of s.relations) if (r.source_goal === prev.id) r.source_goal = gid;
  const product = currentGoals(s).find((g) => g.owner_id === "product");
  const security = currentGoals(s).find((g) => g.owner_id === "security");
  if (product && security && !s.relations.some((r) => r.id === "r-product-security")) {
    s.relations.push({
      id: "r-product-security",
      source_goal: product.id,
      target_goal: security.id,
      type: "depends_on",
      status: "UNKNOWN",
      label: "The beta launch needs Security to handle beta issues first",
      provenance: `Found when leadership sent company goal ${version}: Security's current target rewards closing lots of tickets and doesn't mention the beta`,
    });
  }
  refreshRegistry(s);
  s.pushes.push({ id: id("push"), goal_id: gid, version, pushed_by: "leadership", pushed_at: at, pushed_to: ["product", "security"], registry_version: s.registry_version });
  s.org_draft = null;
  audit(s, who, "ratify_and_push_company_goal", gid);
  touch(s, who, "push_company_goal");
  return { goal_id: gid, version, pushed_at: at, registry_version: s.registry_version };
}
