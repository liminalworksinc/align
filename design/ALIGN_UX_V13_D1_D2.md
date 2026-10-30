# Align · v13 priority-change redesign (D1/D2 candidate B)

**Review status:** proposed, not founder-approved. **Not production code.**  
**Deployed A baseline:** Fly v13 / main \`5b74d8683592eeea4ae0850156ea7b9759b23258\` (PR #32).  
**Source evidence:** D0 completed in [LIM-2446](https://linear.app/liminal-space-io/issue/LIM-2446), with full audit in restricted Drive and [public sanitized summary](https://github.com/liminalworksinc/align/blob/design/d0-summary/design/d0/README.md). **No D0 screenshot copies should be added to this public design branch.**  
**Claude feasibility:** [LIM-2447 comment b4e0d04b](https://linear.app/liminal-space-io/issue/LIM-2447).  
**Prototype v2:** [\`prototypes/lim-2449-priority-change-v2.html\`](./prototypes/lim-2449-priority-change-v2.html). One-file client-only design study, fictional Kestrel Analytics, no API calls or credentials. Run locally from Raw/Download; no build step.  
**Older concept:** [\`prototypes/lim-2449-decision-desk.html\`](./prototypes/lim-2449-decision-desk.html) is **superseded** for product direction; it was a pre-#32 study with hard-coded Product/Security and generic conflict framing.

## Thesis

Align's primary interaction isn't *manage a conflict*. It is **a priority changed while work and connected AI apps were following an earlier goal. Make one owned change, record the authorization and show who has read the updated plan**.

The design is a *first-time operator flow*, not a miniature enterprise risk dashboard. One open proposal is possible per custom workspace. No risk scores, invented agent sessions, voice capability claims or editable objectives.

## A (deployed v13) → B (visual / interaction target)

| Operator job | Actual A (D0 observed on synthetic v13) | B (this clickable prototype) | Production file changes after approval | Category |
| --- | --- | --- | --- | --- |
| Understand why this matters | A fixed company goal strip, header, Inspector and \"New conflict\" create four parallel explanations. | **\"Your turn · What needs to move\"**: a single changed-priority context, a role-specific next action, and an agent-read summary. | \`Home.tsx\` / \`YourTurnView.tsx\` / \`Inspector.tsx\` | MERGE duplicated content; delete non-author disabled CTA |
| Find current step | Owning team's review action sits ~1110px down at 1440×900. Repeated inbox card, badges, stepper, thread are above it. | Review panel and previous→proposed **measure** comparison are above the fold. Secondary rationale/history are disclosures. | \`ProposalsView.tsx\` / \`Handoff.tsx\` | ADAPT action layout, remove duplicate inbox/labels |
| Know who can accept or approve | Owner's selected \"Accept\" button actually **ratifies**, while requester \"Accept changes\" is a different server step. | Explicit **\"Approve goal change\"** = owner-only \`/accept\`; **\"Accept changes\"** = requester-only \`/acknowledge\`. No default answer. \"Accept if\" = counter → requester acknowledges → owner approves. | \`ProposalsView.tsx\`, \`nextStep.ts\` | UI-only copy, selector, conditional stage |
| Work on a phone | Fixed 236px rail causes a 593–824px document at 390px. | Single-column signed-in app, brand/menu header and stacked context; accessible buttons and cards, no horizontal rail. | \`Home.tsx\` / \`ui.tsx\` | Responsive UI-only, QA required |
| Interpret outcome | Goal objective still uses v1 wording; a new **measure** was ratified. \"Agreed, launch pending\" persists after \"not yet\". | Lead record with the **approved target**, show objective as **\"unchanged since v1\"** without inventing a rewrite; show **\"Launch: Not yet\"** only in its own status dimension. | \`DecisionView.tsx\`, \`GoalsView.tsx\`, \`OrgView.tsx\`, \`launch.ts\`, \`labels.ts\`, \`nextStep.ts\`, directive/MCP status copy | UI/text mapping, with founder copy ruling |
| Know whether agents picked up the latest goal | Connected OAuth apps and captured sessions are separate; hosted sessions are not captured; #32 changed visible asks, limits, Work and ConnectAI. | First-view card for **connected AI app read receipts**. If a real app last read an earlier version, say **\"Last read older version\"**; if no read, say that; if current, say **\"Latest version read\"**. **Never imply it executed or followed instructions**. | \`ConnectAI.tsx\`, \`YourTurnView.tsx\`, \`WorkMap.tsx\`; read-only scoped connection data | ADAPT once source field is verified |
| Show evidence | Four repetitions of \"Not sandbox-tested\" plus alarm-red \"NEVER TESTED\" in record. | One neutral **\"Sandbox · not run\"** provenance fact, with **explicit required checkbox at owner approval and launch**. Conditions remain recorded as **not confirmed yet**. | \`ProposalsView.tsx\`, \`v6/record.tsx\`, \`DecisionView.tsx\` | Merge copy, preserve truth and authorization |

### What must **not** be smuggled into a visual redesign

- **No one-person / one-team workflow in v13.** There are distinct requester, goal owner and leadership actor slots. A one-team/me-and-agents mode is a new server model, not a new form label. Agents are scoped readers, not approvers.
- **No editor for goal objectives.** The proposal body changes \`proposed_measure_text\`; \`flow.ts\` carries forward \`objective\`. Version history is **target/version history**, not a claim that objectives changed.
- **No company-priority before→after data.** Custom scenarios seed one company goal; prior goal state isn't stored as a version. The B opening shows today's priority and the team goal it affects, not fabricated earlier company-state history.
- **No requester withdraw action.** Requires a new server transition. The owner can reject a counter according to the server, but the current UI hides it; whether to reveal it is a founder call.
- **No instant role switch.** Production \"Switch team\" signs out and requires the next team's passcode. The v2 prototype's **Preview role** selector is for a fictional non-networked walkthrough only.
- **No captured agent sessions on Fly.** OAuth app connection and last read do not prove execution. Sample read-receipt states in the prototype are **explicitly synthetic** and not claims about a real customer's connected apps.
- **No launch approval folded into goal agreement.** Leadership's decision remains independent; \`not_yet\` persists in the model. The old \`agreementStatus\` helper collapses it to pending, which causes the current contradiction.
- **No removal of evidence acknowledgement.** Owner acceptance of an untested plan and leadership launch of an untested plan each require explicit checkbox acknowledgment at the right step. Conditions, where entered, remain \"Not confirmed yet\" until an authorized external confirmation exists.
- **No override of \`ALIGN_GOAL_SESSIONS\` / hosted route allowlist / OAuth scoping.** They stay as approved under LIM-2441 and hosting constraints.

## Interaction state contract (fictional walkthrough, maps to actual server transitions)

| Context | Server state | Next authorized action | B action label | Transition |
| --- | --- | --- | --- | --- |
| Goal owner receives change | \`PENDING_SECURITY\` | Owner may ratify directly, counter, accept-if (counter), or reject | **Approve goal change**, **Counter**, **Accept if…**, **Decline** | \`/accept\`, \`/counter\`, \`/reject\` |
| Owner has requested changes | \`COUNTERED\` | Requester acknowledges revised terms; owner rejection after counter is permitted by server but not current UI | **Accept changes** (requester), pending founder ruling on owner Decline visibility | \`/acknowledge\` |
| Requester accepted counter | \`ACKNOWLEDGED_BY_PRODUCT\` | Goal owner ratifies with untested acknowledgment | **Approve goal change** | \`/accept\` |
| Goal ratified | \`RATIFIED\` | Only leadership can decide launch | **Approve launch** / **Not yet** | \`/launch\` |
| Leadership chooses not yet | \`RATIFIED\` + \`launch_decision.not_yet\` | Leadership can reconsider; other roles can view | **Launch: Not yet** (candidate display) | New \`/launch\` decision, if leadership acts |
| Leadership approves | \`RATIFIED\` + \`launch_decision.approved\` | Read the record | **Launch approved** | No additional client-side authorization |
| Owner declines | \`REJECTED\` | Read outcome, create a later new proposal if allowed | **Declined** | Closed request |

**Avoid inventing two serial owner approvals on the direct approval path.** There is one owner approval unless a counter introduces an additional requester acknowledgment and a later owner approval.

## Visual system & responsive criteria

- Dark neutral/graphite surface, magenta solely for selected actions/owner focus, amber for unresolved attention, red only for real failed checks, neutral for unrun test.
- Bold but calm information hierarchy: title (operator job), status/action card, previous-approved vs proposed measure; context and audit below. No generic stats or chart filler.
- In the **owner review at 1440×900**, the decision controls must be in the first viewport **without requiring scroll**; focus order follows heading → comparison → decision → details.
- **At 1024/900** the Inspector stacks below main; **at 390/320** hide the fixed navigation rail behind an accessible menu. No horizontal overflow, word-per-line paragraphs, overlapping controls, or invisible actions.
- Responsive layout must preserve actual current app session/selection/attached plan state, ConnectAI dialog, and Switch team with passcode.
- Use a coherent body scale, consistent CTA minimum size and visible input borders. D0 contrast findings require retest: some links and borders were below WCAG AA/non-text criteria.
- Dialog/menus need visible close, Escape, focus return and meaningful keyboard order in implementation.
- Avoid repeating refusal/caveat text in every card; preserve one truthful status in the record and the two specific acknowledgments at authorization steps.

## Concept walkthrough

Open [v2 HTML](./prototypes/lim-2449-priority-change-v2.html) locally (readable without an app server). It starts as fictional **Dev Patel · Growth Engineering**, \`PENDING_SECURITY\`.

1. Your turn: see one owned change and an example app read older than the latest goal.
2. Review: compare **old target** to **proposed target** and see four choices above the history section; none is preselected.
3. Choose **Counter**, enter revised conditions, then switch **Preview role** to Maya (requester) and **Accept changes**. Switch back to Dev, tick explicit untested acknowledgment and **Approve goal change**.
4. Switch to Leadership, open Decisions, choose **Not yet**. Confirm the record says **Launch: Not yet**, not pending. Then tick the untested launch acknowledgment and **Approve launch**.
5. Restart and test **direct goal approval**, which bypasses counter/acknowledgment, plus **Decline**.
6. On AI apps, preview older-read/current-read/no-read synthetic states. Observe all are read receipts, not session execution.
7. View the same screens at 1440×900, 1024, 900 and 390px. This code includes responsive rules but still requires actual browser screenshot/E2E QA before implementation.

## Founder rulings required in LIM-2454

| Ruling | Choice / consequence | Recommended first-slice treatment |
| --- | --- | --- |
| **R-1: Launch \"not yet\" wording** | Existing ruling was \"Agreed, launch pending\" as a generic agreement label. But \`not_yet\` is a stored decision; showing \"pending\" creates a contradiction. Affects ~10 status surfaces plus agent-directive/MCP copy. | **Distinct \"Launch: Not yet\"** under separate \"Goal: agreed\". Preserve previous phrase only when no launch decision exists; explicitly decide whether approved copy is \"held\", \"not yet\", or alternative. |
| **R-2: Editable objectives** | Changes core proposal/ratification schema, not CSS. | **Defer model change**. In UX show objective **\"unchanged since v1\"** and approved new measure as primary. |
| **R-3: Me + my agents path** | Separate product/model design, authentication, approval authority and roles. | **Not in P0**, separate model/validation project. Do not fake one-team by naming both actors the same. |
| **R-4: Withdraw / reject counter** | Requester withdraw = new server transition. Owner reject in counter state already server-legal but not surfaced. | **Defer withdraw**, decide whether to expose owner decline during counter with proper explanation. |
| **R-5: \"Try to approve\" refusal demo** | Real denied request is an instructional adversarial proof, but looks like an actionable button in normal user workflow. | **Remove from normal production decision screen**; retain in a separate test or demo harness. No permission changes. |
| **R-6: P0 responsive and IA** | Current signed-in screens are unusable on phones. | **Approve responsive shell and owner action above fold** as highest-priority visual work. |
| **R-7: Connected AI status framing** | Only show verified authorization/read metadata; no action/execution inference. | **Surface read freshness on first screen where data exists**; no sample values outside the fictional prototype. |

### Release boundary

This design artifact and PR #34 are **draft only**; do not merge into main or deploy to Fly. Production implementation stays blocked by founder rulings in LIM-2454. The separate \`9a304b6\` hosted-dead-end-link fix is independent of this redesign.
