import type { Session } from "./auth";
import { audit } from "./flow";
import { HttpError, now } from "./store";
import type { Actor, AppState, Owner } from "./types";

const OWNER_ACTOR: Record<Owner, Actor> = { ceo: "leadership", product: "product", security: "security" };

/** Only the owner of the goal Jev chose may confirm or reject a session mapping. */
export function decideMapping(s: AppState, who: Session, rawId: string, decision: "CONFIRMED" | "REJECTED") {
  let sessionId = rawId;
  try {
    sessionId = decodeURIComponent(rawId);
  } catch {
    sessionId = rawId;
  }
  const m = s.mappings.find((x) => x.session_id === sessionId);
  if (!m) throw new HttpError(404, "No mapping for this session");
  if (!m.choice || m.choice === "none") throw new HttpError(409, "This mapping has no goal to confirm or reject");
  const goal = s.goals.find((g) => g.id === m.choice);
  if (!goal) throw new HttpError(409, "The mapped goal is no longer in the registry");
  if (OWNER_ACTOR[goal.owner_id] !== who.actor) throw new HttpError(403, "Only the owner of this goal can decide this mapping");
  if (m.registry_version !== s.registry_version) throw new HttpError(409, "The goal registry changed; this session is being re-mapped");
  m.state = decision;
  m.confirmed_by = who.actor;
  m.confirmed_at = now();
  audit(s, who, decision === "CONFIRMED" ? "confirm_mapping" : "reject_mapping", sessionId);
  return m;
}
