import { createHash } from "node:crypto";
import type { AppState } from "./types";

// The plan an agent should be working from, as one short fingerprint: the approved goal versions, every proposal
// and where it stands, and every acceptance with its launch decision. Open and declined requests count because the
// agent-facing tools report them (align_get_accepted_plan says a proposed plan is "not agreed"; align_get_decision_record
// returns the latest request), so the UI calls a change here "the latest change", not "the plan". When it changes, an
// agent that read the workspace before the change may still be working from what it read. A connected AI app records
// the fingerprint it last read (lib/oauth/grants.ts noteGrantUse), so the workspace can show which agents were seen
// since the latest change without capturing what they do (capture stays off when hosted).

export function planRev(s: AppState): string {
  const parts = [
    s.goals.map((g) => [g.id, g.version, g.approved_at]).sort(),
    s.proposals.map((p) => [p.id, p.state, p.counter_versions.length, p.product_ack_at ?? ""]).sort(),
    s.acceptances.map((a) => [a.proposal_id, a.accepted_version, a.launch_decision?.decision ?? "", a.launch_decision?.at ?? ""]).sort(),
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

/** When the plan last changed: the newest approval, proposal, counter, acceptance or launch decision. */
export function planChangedAt(s: AppState): string | null {
  const times: string[] = [];
  for (const g of s.goals) if (g.approved_at) times.push(g.approved_at);
  for (const p of s.proposals) {
    times.push(p.created_at);
    if (p.product_ack_at) times.push(p.product_ack_at);
    for (const c of p.counter_versions) times.push(c.at);
  }
  for (const a of s.acceptances) {
    times.push(a.ratified_at);
    if (a.launch_decision?.at) times.push(a.launch_decision.at);
  }
  const valid = times.filter((t) => !Number.isNaN(Date.parse(t)));
  return valid.length ? valid.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
}
