# LIM-2449 · Align Decision Desk — design proposal

**Status:** interactive concept B, **not approved**, **not production UI**, **not connected to API**.
**Source:** \`liminalworksinc/align\` \`main\` at \`1c2941ea22fb395cc346c30b2744bd6f6631f376\` (Oct 29, 2026).
**Design owner/gate:** [LIM-2449](https://linear.app/liminal-space-io/issue/LIM-2449), [LIM-2454 founder ruling](https://linear.app/liminal-space-io/issue/LIM-2454).
**Prototype:** [decision-desk.html](./prototypes/lim-2449-decision-desk.html). Download the raw file and open locally in any current browser. No installation or API requests. The reset button starts the fictional scenario again.

## Why this redesign

The current v6 app has real, correct components for each part of the human approval flow but splits the operator's cognitive task:

- **\`YourTurnView.tsx\`**: action card, "waiting on others" list, changed priority card.
- **\`ProposalsView.tsx\`**: another inbox list, large thread of proposal/counter/acknowledgement/approval events, response controls.
- **\`GoalsView.tsx\`**: company goal, two team goals and their unresolved dependency.
- **\`DecisionsView.tsx\` / \`DecisionView.tsx\`**: list and recorded approval, proposal version, launch/evidence distinctions.
- **\`Home.tsx\`**: sidebar, top context strip and separate 360px inspector.

All of these are useful. The issue is **context fragmentation, repeated content and horizontal competition between sidebar, inbox, detail, global context and inspector**, especially at 900–1200px. The first operator question—*what do I need to do and why?*—should determine the hierarchy.

### Proposed design contract

1. **Your turn becomes a decision desk, not a second inbox.** The first viewport answers what changed, what is still approved, whose permission is required, and one clear CTA. If no action belongs to the signed-in role, the truthful next owner is shown.
2. **Proposal review is one work surface.** Prior/current goal, proposal, why, reciprocal commitment, stage/provenance and authority-aware action sit in a single hierarchy; long history becomes an explicit supporting detail, not the entire primary content.
3. **Context rail is role/authority, not another summary dashboard.** No repeated full goal cards or invented evidence.
4. **Decision record separates goal agreement, leadership launch, sandbox outcome and real-world outcome.**
5. **Same IA, same backend.** No new top-level navigation or workflow semantics in this prototype.

## Mapping: what the design changes

| Design atom | Inspiration | Existing file(s) | Design operation | Do not change |
| --- | --- | --- | --- | --- |
| One decisive next-step surface | Magda Hart decision manager, operator triage | \`YourTurnView.tsx\`, \`Home.tsx\` | ADAPT current action cards into a more focused decision desk; merge duplicate changed-priority summaries | \`waitingOnMe\`, \`nextActor\`, API touchpoint \`mark("ceo_change_viewed")\`, timer ownership |
| Primary context in two compared columns | Enterprise change panels / approval review | \`GoalsView.tsx\`, \`ProposalsView.tsx\` | ADAPT existing current vs proposed information into an explicit conflict comparison | Exact measure texts, owner, proposal version, current version of company requirement |
| Owner/role progress visualization | Magda Hart role-lane approval workflows | \`components/Handoff.tsx\`, \`ProposalsView.tsx\` | ADAPT 4-stage summary into a compact always-visible progression; avoid two duplicate progress indicators | \`stages()\` and actual server \`lib/flow.ts\` state machine |
| Persistently visible authority + epistemic limits | Audit/decision manager patterns | \`Inspector.tsx\`, \`Home.tsx\` | MERGE repeated status facts into one contextual rail/compact small-screen section | "not sandbox-tested"; *conditions unconfirmed*; "agreement ≠ launch"; per-role permissions |
| Structured record chronology | Change-history/audit panel | \`DecisionsView.tsx\`, \`DecisionView.tsx\` | ADAPT list, chronology, actor and receipt sections to an easier-to-read record | No false claims of signatures, test runs, enforcement or observed business outcomes |

**References:** https://dribbble.com/magdahart · https://dribbble.com/shots/26647190-Decision-manager-for-operation-risks-protocols-and-workflows · https://dribbble.com/shots/26634253-Decision-manager-for-corporate-entities-and-structure . Only structural ideas are adapted; the example content, CSS and composition are original.

## Fictional scenario and interactions

**Workspace:** Vela Cloud (fictional). **Role labels:** Priya Shah / Product, Alex Kim / Security, Morgan Lee / Leadership. These are **illustrative identities**, not customer data and not existing Align fixtures.

The prototype opens in Security's \`PENDING_SECURITY\` analogue. From the proposal review, Security can choose Counter, Accept if…, Approve as written, or Decline. The counter leads to Product's \`COUNTERED\` acknowledgement, then Security's \`ACKNOWLEDGED_BY_PRODUCT\` final approval. The goal agreement leads to leadership's **separate launch** decision. Buttons that would write data to production instead change local browser variables only; role switching is a demo selector, NOT the real sign-out/passcode-based \`Switch team\`.

Important: the prototype's controls are **illustrative**. It is **not** a reference implementation of backend handlers, session credentials, limits, submission validation, error handling or audit completeness. The production server remains the only authority on allowed transitions. The real custom scenario may contain a single open proposal and no session capture or sandbox results.

## Screen/state inventory used

| State | Prototype | Real source |
| --- | --- | --- |
| Security review pending | \`Your turn\` → proposal review | \`YourTurnView.tsx\`, \`ProposalsView.tsx\` \`PENDING_SECURITY\` |
| Owner asks for conditions | proposal review → simulated Product step | \`ProposalsView.tsx\` \`AcceptIfForm\` or \`CounterForm\` |
| Product acknowledges changes | role selector → action | \`ProposalsView.tsx\` \`COUNTERED\` |
| Security gives final approval | Security view after acknowledgement | \`ProposalsView.tsx\` \`ACKNOWLEDGED_BY_PRODUCT\` |
| Agreed, launch pending | decision record | \`DecisionView.tsx\`, \`components/launch.ts\`, \`lib/labels.ts\` |
| Leadership approves launch | role selector → action | \`OrgView.tsx\`, \`components/launch.ts\` |
| Declined | decision record / reset | \`DecisionsView.tsx\`, \`ProposalsView.tsx\` |
| Goal relationship | \`Goals\` | \`GoalsView.tsx\` |
| Fictional work | \`Work\` | \`WorkMap.tsx\`, \`OldPlanWork\` (no agent telemetry in custom workspaces) |
| No sandbox testing | all relevant views | existing custom-scenario truth: \`Not sandbox-tested\` |

**Missing by design (not claimed as done):** running-app baseline screenshots, actual app error/signed-out states, real keyboard and 900–1024px browser QA, moderated/unassisted user observation, approved variants, API + E2E implementation. The CSS includes responsive rules but a real browser screenshot review is still required before the production ticket opens.

## How to review this prototype

- Open \`design/prototypes/lim-2449-decision-desk.html\` locally.
- In **Security**, open proposal review; inspect conflict comparison, four-stage process and role/authority rail.
- Request changes, switch preview to **Product**, acknowledge, switch back to **Security**, check the untested acknowledgement and approve.
- Switch to **Leadership** and approve launch. Confirm the Decision record says no sandbox run and launch is separately approved.
- Reset. Try a direct Security approval and a decline.
- Review at **1440 / 1024 / 900 / 390px**; check clarity, truncation, focus, card density, action visibility. The inspector should move below at medium widths, and navigation becomes horizontal at mobile widths.
- Record founder decisions in LIM-2454 as: hierarchy, action placement, sidebar/context structure, density/type, copy, what survives/merges/deletes.

## What the implementation ticket must eventually preserve

- Current state transitions and server authorization. Product **cannot** approve Security's goal; Leadership controls custom-scenario launch; switching roles still requires the real passcode.
- Real request and response texts; no fabricated measurements.
- All existing actions (including conditional approval, counter, decline, untested acknowledgement, scenario navigation and evidence details), including errors and inaccessible/empty states.
- Source linkages, actual \`StateView\` and scenario configuration.
- Existing \`ALIGN_GOAL_SESSIONS\` safety hold in LIM-2441, which this design does not override.
- A clean before/after delta (**ADDS / REPLACES / DELETES / canonical owner**) and captured visual/E2E evidence.

### Founder decisions this artifact requests

1. Does "Your turn" become a decision desk, with the full proposed-change review as its first drill-in? **Recommended yes.**
2. Should a persistent inspector show authority and next owner across relevant screens, while primary proposal content stays in a single column? **Recommended yes on wide screens; below on laptop.**
3. Is the revised style (muted graphite, rich magenta only for focus/actions, amber exclusively for unresolved/untested, restrained typography) the correct register? **Founder visual judgment.**
4. Should the opening screen show the old vs new priority as one explicit comparison rather than repeat context in header, sidebar, and panels? **Recommended yes.**

No founder approval or code migration is implied by this draft.
