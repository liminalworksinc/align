# Align recognition-first entry — discovery-to-design v4

**Status:** D2 experiment, not founder-approved and not a production feature.  
**Clickable prototype:** [Recognition-first dual entry v4](./prototypes/lim-2449-recognition-first-v4.html).  
**Prior D2 baseline:** [AI-native Intent Studio v3](./prototypes/lim-2449-intent-studio-v3.html) retains the approved-to-test source flow and prior Claude review history.  
**Evidence basis:** founder-supplied interview synthesis and Friday, Oct 30, 2026 call plan. Direct interview transcripts and Friday outcomes have **not** been independently verified for this document. Do not treat reported pull as completed independent tests, connected telemetry, signed LOIs, or PMF.

## Product thesis to test

Intensive AI operators commonly recognize **work drifting across tools and sessions** before they know Align exists. A planning/approval UI asks them to learn a method before seeing their own problem. Therefore the first experience should reveal *a familiar failure mode* first, then the authorization system that resolves it.

Three distinguishable jobs, one product system:

1. **See work / possible drift.** What was the last approved target? What agent, app or human activity is actually observable? What information is absent?
2. **Decide a changed direction.** Who owns the proposed target and its reciprocal commitment? Which evidence, conditions and untested acknowledgments matter? Who may approve, counter, accept-if or decline?
3. **Establish and verify the plan.** What target is authorized? Did Leadership separately approve launch? Which connected apps read the latest whole-plan hash? Has any actual execution been observed?

**Do not imply #1 already supports live telemetry**: Fly hosted custom workspaces do not automatically capture agent sessions, infer task→goal mappings, or know if obsolete work stopped. Existing app-read metadata is a last-read timestamp and **whole-plan** revision comparison, not a per-goal version read event. All examples in v4 are fictional and labeled.

## Two P0 entry experiences — variants, not separate products

| | A: Agent-intensive operator | B: Decision owner |
|---|---|---|
| User's recognizable question | "Is any work still following the old plan?" | "What decision is waiting on me?" |
| First proof available from v13 data | Current authorized target; current priority; possible goal-work dependency; scoped app read / whole-plan freshness; explicit **Not observed** for live agents | Proposed vs approved target; source and requester commitment; current human owner and authorized response choices |
| Main uncertainty shown honestly | Cannot observe what agents are executing without additional integration and consent | No sandbox test or automatically confirmed conditions, unless an authorized test/evidence exists |
| First action | Inspect likely affected goal/work or ask what can be established from connected sources | Approve / Counter / Accept if / Decline, as server state permits |
| Convergence | Request/propose a structured target change for a real goal owner | Ratify/reject with evidence and reciprocal terms |
| Shared record | Goal target version, conditions, separate launch decision, whole-plan last-read state, actual observation limits | Same |

### How v4 encodes the test

- **Landing:** two specific real-problem prompts, not a methodology questionnaire or generic dashboard. Selecting either one opens a design-only scenario immediately; no extra setup flow.
- **Operator first view:** a three-column evidence strip: *stored approved target* (known), *whole-plan app-read* (known), and *agents actually executing old work* (**not observed**). A row labeled potentially affected work is **not** a live task feed.
- **Decision owner first view:** reuses the prior verified v3.2 authorization UI and explicitly seeds a **fictional pending proposal** for the design study. The owner decision appears before chat/context. This is a role-preview; real Align does not switch actors without a passcode.
- **Shared authoritative record:** same approval, counter target, reciprocal commitment, conditions and separate Leadership launch semantics as v3.2.
- **Material behavior:** preserve the canonical wash→stain→dry progression on the relevant proposal/decision; visual color is not proof of agent execution. Reserved Agency yellow and Surge coral remain **unbound** as production state roles without founder approval.

## Friday discovery experiment — use stories, not pitch feedback

First ask for the **most recent actual event** ("Walk me through the last time this happened") *before* introducing Align or the prototype. Avoid leading the interviewee. These five suggested lenses derive from the founder-supplied schedule and must be reconfirmed if plans change.

| Lens | Reconstruction prompt | Disconfirming evidence |
|---|---|---|
| Ecosystem / cross-team | A partner's priority changed after assignment. Who could authorize and who learned? | Current system handled ownership and notification fully, with no AI-specific gap |
| Engineer / code review | AI wrote code. Which review criteria determined shipping, and did requirements change in flight? | No recurring re-review, stale context or decision bottleneck |
| High-stakes research | What evidence was required before action and who signed off? | The work is not agent-mediated; existing governance is sufficient |
| Operator-network connector | Which real multi-agent operators will show a recent pain case? | Only abstract interest or non-operator opinions |
| Agent-workflow operator | Reconstruct a mid-flight change: how did agents learn it, which context persisted, how was obsolete work stopped and verified? | Reliable context propagation and verification already exist |

For **every** call, capture, without exaggeration:
- **Unprompted pain:** quote/summary of what they identified before the idea was presented, with source and timestamp.
- **Observed workflow:** actors, tools, goal dependencies, actual approvals; distinguish demonstration from recollection.
- **Current workaround / gap:** what they use and what concretely fails. Capture examples where it works.
- **Design consequence:** entry A vs B, evidence coverage, approval step, read/receipt semantics, or no change.
- **Commitment:** no commitment / offered intro / agreed interview / explicitly agreed independent test / completed test / signed LOI. Never collapse categories.

## Founder review decision (LIM-2454)

Compare variants **with the same scenario and real authority model**:

- **Recognition:** within the first 10–20 seconds, can the cold operator state what problem the view is solving?
- **Truth:** can they distinguish stored goal, app read, inferred impact and unobserved running agent activity?
- **Ownership:** can they point to the next authorized human and understand why app reads don't approve changes?
- **Convergence:** can both variants reach one decision record without inventing a different backend?
- **Disconfirmation:** which interviewees say existing Slack/IDE/coding-agent tools already solve the problem? Capture this, not just enthusiasm.

**Do not approve development just because the prototype looks polished.** Friday interviews produce input, not automatic design approval. Review also requires rendered 1440×900, 1024, 900, 390 and 320 screenshots; keyboard/focus/contrast, mobile-first tests; no horizontal overflow or ungrounded read/agent claims; and founder selection of preferred entry.

## Implementation boundary

An entry chosen in a **prototype** is UI state. Actual general-purpose chat/impact synthesis, enterprise source integration, automatic session capture, agent-read versions and a one-team/me+agents authority model are **not** implied by this v4 artifact. Additional backend/security/consent and telemetry work must be separately modeled and authorized, especially the still-gated session work in LIM-2441. Preserve server approval, counter/accept-if, passcoded team switch and independent Leadership launch.

**Status of verification:** v4 was created on the draft design branch and passed static JavaScript syntax/source checks. No new rendered browser or independent cold-user verification is claimed for v4. The earlier v3 test result does not automatically cover the new landing and work lens.