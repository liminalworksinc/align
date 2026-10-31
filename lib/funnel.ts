import type { Session } from "./auth";
import { HttpError, now } from "./store";
import type { AppState, FunnelEvent, ValueReport } from "./types";
import { cleanValueText, isEstimate, MAX_VALUE_TEXT, type FunnelAction } from "./value";

// Funnel events for the decision value card (issue #30 item 5, LIM-2445), written through POST /api/timer so no new
// hosted route exists. Custom workspaces only, and only for a proposal that is RATIFIED: the card shows nothing before
// that. Each event is kept once per action, role and proposal (the first time), so a loop can't grow the state, and it
// carries the role and a time only: no session id, name, code or token.

export function recordFunnel(s: AppState, who: Session, action: FunnelAction, body: { proposal_id?: unknown; feedback?: unknown }) {
  if (s.scenario !== "custom") throw new HttpError(400, "Unknown timer action"); // Northstar's timer is unchanged
  const pid = typeof body.proposal_id === "string" ? body.proposal_id : "";
  const p = s.proposals.find((x) => x.id === pid);
  if (!p || p.state !== "RATIFIED" || !s.acceptances.some((a) => a.proposal_id === pid))
    throw new HttpError(409, "This decision isn’t agreed yet");
  const funnel = (s.funnel ??= { events: [], reports: [] });
  let report: ValueReport | undefined;
  if (action === "value_reported") {
    const f = body.feedback && typeof body.feedback === "object" ? (body.feedback as Record<string, unknown>) : {};
    if (!isEstimate(f.estimate)) throw new HttpError(400, "Choose one of the answers");
    if (f.text !== undefined && f.text !== null && typeof f.text !== "string") throw new HttpError(400, "The note must be text");
    const text = typeof f.text === "string" ? cleanValueText(f.text) : "";
    if (text.length > MAX_VALUE_TEXT) throw new HttpError(400, `Keep the note to ${MAX_VALUE_TEXT} characters or fewer`);
    if (funnel.reports.some((r) => r.proposal_id === pid && r.role === who.actor)) throw new HttpError(409, "Your answer is already saved");
    report = { proposal_id: pid, role: who.actor, estimate: f.estimate, ...(text ? { text } : {}), at: now() };
    funnel.reports.push(report);
  }
  if (!funnel.events.some((e) => e.action === action && e.role === who.actor && e.proposal_id === pid)) {
    const ev: FunnelEvent = { action, role: who.actor, proposal_id: pid, at: now() };
    funnel.events.push(ev);
  }
  return report ? { ok: true, report } : { ok: true };
}
