> **SUPERSEDED by founder-ruled R2 (2026-10-30):** [Current v2 R2 design contract](./ALIGN_V2_E2E_DESIGN_CONTRACT_R2.md), [updated interactive prototype](./prototypes/lim-2449-v2-sample-e2e-r2.html). The R1 external-verifier, condition confirmation, verification launch block and speculative Leadership identity are **withdrawn**. Founder ruled: approval records agreement, launch releases plan to agents; conditions are requester-only acknowledgment (not verified/confirmed); one adaptive Home; v2 launcher authority remains OPEN. This file is preserved solely as historical R1.

---

# Align v2 — R1 end-to-end product/design contract (proposed)

**Owner:** LIM-2449 → founder R-n ruling in LIM-2454 → implementation in LIM-2455 / draft PR #39. **Date:** 2026-10-30. **Status: SPECIFIED FOR REVIEW, NOT FOUNDER-RATIFIED, NOT SHIPPED.** This document resolves the interaction design sufficiently to prototype/test, but the **choice of launch enforcement semantics still requires explicit founder + security approval** before any v2 backend implementation.

## Evidence and scope

- Current production behavior: v1 main \`e044f11\` (the D0 comparative text refers to Fly v17); do not use its fixed three-passcode role model as v2 implementation.
- Future v2 reference: PR #37 \`237268f\`, \`specs/align/{interface,goals-and-proposals,directives,metrics}.md\`; v2 uses **named identities, teams, effective approval sets, change requests, sessions and receipts**.
- [Source-pinned v1→v2 comparison](./ALIGN_V1_V2_SCREEN_COMPARISON.md). [First-use Home exploration](./ALIGN_V2_UNIFIED_HOME_FIRST_USE_CONTRACT.md). [D3 acceptance draft PR #39](https://github.com/liminalworksinc/align/pull/39). No second decision record or source of truth.
- D0 screenshot audit: LIM-2446 records 427 synthetic/local WebP captures plus 2 hosted signed-out states; **the original private images were not retrievable in this session**. The GitHub \`design/d0-summary\` branch supplies only a sanitized README. Thus the prototype below is an **interaction/wireflow**, not a visually faithful v1-port verdict. Do not ship new screenshots, private demo credentials, or overwrite D0's visual authority.
- **First prototype scope only**: sample workspace → unified home → owner/counter → requester accepts counter → final approval → leadership holds/launches → immutable record → session/work evidence. Do not add Spend, Asks, AI autopilot, arbitrary agent execution monitoring or a fake live system.

## Decision A · Agreement is not launch

### Recommendation for founder ruling: HOLD **agent-effective distribution**, not merely a visual label

**Three independent truths**:
1. **Approved target version** (\`approved_version\`): a member of the **effective v2 approval set** authorizes a change request (after any counter/ack). This writes the version and immutable change-request decision. The decision record reads **“Agreed, launch not yet”** when no launch authorization exists.
2. **Leadership launch decision** (\`launch_decision\`): \`undecided | not_yet | approved\`, each ruling logged with authenticated eligible authority, reason/note, timestamp, and target **approved version**. \`not_yet\` is an explicit hold; \`undecided\` means no decision ever recorded. Later replacement decisions form an append-only history. The effective approval and the launch ruling can be made by different people.
3. **Agent-effective version** (\`effective_version\`): updated goal-version directives are **NOT issued to sessions on approval**. They are issued **only after leadership approves launch and any blocking conditions are verified**. \`effective_version\` remains the last launched version until then. An approval/launch UI never promises stopped old work or actual compliance; independent stop controls may be needed.

**Why this default:** v2 currently emits \`goal_version\` directives immediately on approval (\`specs/align/directives.md\`). Adding a UI-only “Not yet” is actively misleading. This proposal requires a backend transaction/outbox change and negative tests so an approved-but-held target is not silently applied by bound/governed sessions. This choice is **not yet a founder-approved technical ruling**; alternative designs that distribute only a non-executable preview need their own explicit protocol/security review. For a product with agent-execution risk, prefer not distributing the new executable goal until launch rather than trusting model compliance with a warning.

**During a hold**:
- UI may display the **authorized target** as approved but label it **not effective for agents**. Show the active/previous launched target separately.
- A connected app or human may read the approved target and see the hold; **read is not authorization to execute**. The agent's actionable directives/installed hooks continue to use last launched snapshot. A product-level MCP plan read must expose two versions + the launch gate or must avoid calling the pending approved version “current execution plan.”
- Sessions receiving **old previously launched directives** may continue old work; a hold is **not** an automatic Stop and not proof work stopped.
- If no sessions are connected, launch can still be recorded but delivery count is 0/unknown; no fake receipts.
- If another approved revision supersedes the launch candidate during a hold, the previous launch decision is **not reusable**: leadership must authorize the exact newly approved version; no replay to a stale version.
- A launch \`approved\` later replaced by \`not_yet\` cannot unsend/undo delivered directives; new enforcement/stop policy is required and UI must say “Previously distributed—stop or re-scope separately.” Default post-launch “not yet” does not falsely roll back executed work.

**API/spec additions needed** (names provisional):
- \`launch_decisions\` append-only rows: workspace, change-request ID, goal ID, approved version/hash, allowed authority, \`approved | not_yet\`, note, timestamp, latest effective ruling; server derives \`undecided\`.
- Workspace/goals/read model exposes \`approved_version\`, \`effective_version\`, \`launch_decision\`, \`conditions_status\`; session directive outbox gates \`goal_version\` writes at the **launch boundary**.
- Explicit 403 wrong launch authority, 409 no agreement, stale version/hash, pending blocking conditions, repeated/outdated decision; audit and MCP output schema updated simultaneously.
- Direct owner \`save a new version\`, alignments and upstream changes must be classified: do they also need a launch gate? **Open founder scope ruling**. First prototype applies gate to **approved cross-team change requests** only; don't silently claim coverage for all owner edits.

## Decision B · “Accept if…” is a first-class negotiation, not a note

**Recommended progression**:

\`\`\`text
Requester proposes fields → effective approver opens request → “Accept if…”
    → approver stores COUNTER revision + structured conditions (not a goal limit)
    → requester reads changed fields and conditions → explicitly Accepts counter
    → request is PENDING FINAL APPROVAL (acceptance does not approve)
    → eligible approver signs exact accepted revision → APPROVED goal version
    → condition state UNCONFIRMED (default; no fulfilment asserted)
    → leadership may HOLD; LAUNCH requires verified blocking conditions
    → verifier checks evidence with actual authority → condition CONFIRMED
    → leadership may authorize launch of exact version → session directive issued
\`\`\`

A normal **Counter** may update fields with no conditions. “Accept if…” is a **specific Counter + structured condition set**. Never store the conditions only in a note, rationale, generic goal limits, or a status-pigment. Each condition is \`{id, text, required_for_launch=true, evidence_refs?, status: unconfirmed|confirmed|failed, confirmed_by?, confirmed_at?}\`. The exact revision, condition texts and requester acknowledgement are immutable in the decision record. A confirming person must be in an authorized verification set; “I accept these conditions” does **not** confirm fulfilment. A \`failed\` condition blocks launch pending a new revision or explicit founder-defined waiver (waiver path not in P0). No broad “auto-pass” based on session receipts.

**Authority and errors:** the same v2 effective approval set controls counter and final approval, requester alone can accept the counter, and only designated verifier(s) can confirm a condition. Every mutation requires current request revision/version and cookie-session permissions; conflict (stale revision) returns 409. If no eligible approver exists, show “Nobody can approve this yet,” not a spinner. Different requests on one goal can coexist when server permits them.

**Unconfirmed versus launch:** It is valid to **agree** to a conditional target while fulfilment remains **Not confirmed yet**. A pending/unconfirmed blocking condition means launch stays **undecided** or **not yet**, even though the goal decision was approved. If no blocking conditions exist, leadership can launch independently. A condition can be \`confirmed\` only with attached **source and human verification action**; it is not implied by an agent's applied directive.

## One complete first-time tester journey

| Stage | Screen / truthful question | Visible data / first action | Guardrail |
| --- | --- | --- | --- |
| 0. Enter | Sign in → **Northstar sample**, when the creation gate actually permits it | Person identity, sample label, “Open sample” | Demo uses fictional seeded sample; real sample button hidden when hosted creation code required or user has workspace. Never silently grant new identity. |
| 1. Home | **What changed / whose turn?** | Company priority, changed goal, named **eligible approver(s)**, “Review request”; separate “Work & agents” route | Both founder-approved entry jobs visible; no role-impersonation toggle in production. |
| 2. Review | **Exactly what changes?** | Field-by-field v2 diff, reason, evidence provenance, actual permissions | Owner/approver can Counter, Accept if…, Approve, Reject only when eligible. |
| 3. Negotiate | **Which terms must change?** | Structured new target + one explicit condition | Requester acceptance returns to pending. App never auto-ratifies. |
| 4. Approve | **Who approved what?** | Final named approver, revision/version, condition **Not confirmed yet** | State “Agreed, launch not yet” for no authorization. |
| 5. Launch | **What may agents do?** | Leadership **Not yet** or **Approve launch** (blocked until required conditions verified) | Hold leaves previously launched effective version; no new goal directive; hold ≠ Stop. |
| 6. Record | **What is actually authoritative?** | Single decided request read model: version diff, approvals, ack, conditions, launch history, evidence and receipts | Does not invent verification, signatures, session tests or agent completion. |
| 7. Work | **What happened downstream?** | Session list, goal binding, last directive per session with \`received/applied/enforced\` or \`no receipt\` | Directive receipt proves protocol state, **not** completed objective or task correctness. Spend and Asks not in this P0 journey. |

### Design-state test matrix (scriptable)

- No approval can occur directly from \`countered\`; requester must accept, then eligible approver acts.
- An approver cannot confirm conditions merely by approving the goal. Condition starts \`unconfirmed\`.
- \`approved\` request + \`undecided\` launch displays “Agreed, launch not yet” and emits **zero new goal directives**.
- Leadership \`not_yet\` likewise emits none and does not automatically stop existing sessions.
- Leadership \`approved\` with blocking condition still \`unconfirmed\` is refused; require confirmation (no blind simulation of evidence).
- On verified condition + eligible launch, emit target-version directive; an \`applied\` receipt does not assert work completion.
- Non-leadership launch attempt, self-approval by ineligible requester, stale revision and no approver must fail with explicit reason.
- Unbound/no-session: permitted launch, **0 delivered** (not 0 completed).
- Read-only participants cannot mutate, and private-goal names never leak into Home.
- Mobile and keyboard: 320/390/900/1024/1440, visible focus, no overflow, accurate live announcements after actions.
- Both Work-first and Decision-first Home paths converge on **same** request state/record and do not create two stores.

## Visual gate / D0 fidelity

D0 is **not reproduced** here. Sanctioned summary \`design/d0/README.md\` on branch \`design/d0-summary\` says: decisive reviewer action in first viewport, responsive signed-in shell, and consistent plan/launch truth across views. These **general** recommendations can inform an unstyled wireframe. No original screenshots are re-uploaded, modified, generated or displayed as if recovered. Before final high-fidelity color/layout approval, obtain the private original image archive (the 427 WebP captures recorded on LIM-2446), inspect at least owner proposal 1440/390 and launch-not-yet record 1440; compare retained, adapted and deleted visual atoms with side-by-side crops in restricted storage. The removed \`design/d0-audit-5b74d86\` branch cannot serve as a current accessible source.

## Independent usability evaluation (must occur with humans)

**No independent usability session is represented by scripted prototype tests.** Recruit two types: (a) multi-agent operator (Dhivya, **only if she agrees / is available**), (b) a first-time person responsible for goal approval. Cold protocol (20 minutes): show sample-entry screen; no teaching; ask them to complete the eight stages above and narrate what they think a receipt proves. Record task success, first action, incorrect action attempts, seconds to next actor, confusion between agreement/launch, condition interpretation, agent evidence interpretation, and unsolicited discussion of Spend/Asks. At least one disconfirming example. Do not present Spend/Asks as validated because they appear in a spec.

**Pass thresholds (hypotheses):** 2/2 identify actual next actor; 2/2 explicitly say agreed ≠ launched; 2/2 distinguish acknowledged condition from fulfilled condition; 2/2 correctly say an \`applied\` receipt is **not** completed work. Small samples establish usability issues, not PMF.

## Implementation slicing (no code before founder semantic sign-off)

1. **P0 Authority contract:** separate version/launch state, approved-vs-effective goal and server-level directive outbox gating, explicit launch history/role, session negative tests, v2 MCP schema. Must be decided BEFORE any UI.
2. **P0 Conditional negotiation:** condition rows, author/revision/ack, confirmation authority, evidence status and launch blocker; API tests.
3. **P0 Unified Home and sample flow:** composite read model over v2 requests/alignments/asks, dynamic \`can\` and visibility; two entry routes, zero fake telemetry.
4. **P0 Request review / record / work drilldown:** accessible linked P0 journey over canonical v2 change-request object, explicit receipt limits.
5. **P1 Intake assistant:** optional draft-and-review v2 field mapping; no unapproved writes; do not reinstate mandatory two-team form.
6. **P1 Value/funnel parity:** preserve explicit evaluation vs waitlist and operator-verified LOI source, not v1 timers projected into v2.
7. **P2 Secondary tabs** (Spend, Asks) only after direct operator evidence.

**No production files changed, #37 stays independently gated, PR #34 stays draft.** Follow exact API/QA mappings in draft PR #39 and avoid conflicting with its separate owner.
