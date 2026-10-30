# Align UX — paired handoff: Claude Code × ChatGPT

**Coordination revision:** 2026-10-29 PT
**State:** plan only, not an instruction to deploy or merge. No tasks are completed merely by writing this plan.
**Application:** [liminalworksinc/align](https://github.com/liminalworksinc/align)
**Deployment baseline:** Fly v13, main **\`5b74d8683592eeea4ae0850156ea7b9759b23258\`** (PR #32). Release verification in [LIM-2424](https://linear.app/liminal-space-io/issue/LIM-2424).
**Design work:** [P-LIM-99](https://linear.app/liminal-space-io/project/liminal-align-product-design-and-operator-ux-bfd854f8fb2d); [D0 LIM-2446](https://linear.app/liminal-space-io/issue/LIM-2446); [D1 LIM-2447](https://linear.app/liminal-space-io/issue/LIM-2447) and [LIM-2448](https://linear.app/liminal-space-io/issue/LIM-2448); [D2 LIM-2449](https://linear.app/liminal-space-io/issue/LIM-2449), [founder gate LIM-2454](https://linear.app/liminal-space-io/issue/LIM-2454); [D3 LIM-2455](https://linear.app/liminal-space-io/issue/LIM-2455).

## Ownership (non-overlapping)

| Person/tool | Owns | Does not do |
| --- | --- | --- |
| **Claude Code, active Align repo session** | Read-only code/source audit; safe reproduction of existing UI states; screenshots and screen/role/route matrix; exact source pointers; browser/regression evidence; implementation **only once approved** | No speculative redesign before evidence; no backend/permission change; no main push/merge/Fly deploy; do not treat this plan as founder authorization |
| **ChatGPT (this conversation)** | Operator task model and product critique; current→proposed information architecture; visual direction, hierarchy and interaction/ruling matrix; compare screenshots vs [prototype PR #34](https://github.com/liminalworksinc/align/pull/34); verify each design proposal against actual code and observed UI; coordinate Linear review | Cannot directly see/control a local Claude Code terminal or silently receive its uncommitted files; does not approve design on the founder's behalf |
| **Founder** | Approves scope, interaction rules, visual direction, deletions; authorizes implementation, merge and deploy | No implied approval from a ticket, prototype or AI recommendation |

**Single-source workflow:** Claude posts D0 evidence to **LIM-2446** with a GitHub link to any safely shareable, sanitized visual audit. ChatGPT reads that evidence and posts design critiques to **LIM-2449/2454**. Decisions recorded in **LIM-2454** are the only approval input to implementation. The founder can bring the updated Claude report/screenshots into this conversation; tools cannot automatically bridge these live sessions.

## Gate D0 — real UI truth, first (Claude Code lead)

1. **Session/worktree preflight:** in the existing session, report \`pwd\`, \`git status --short\`, \`git branch --show-current\`, \`git rev-parse HEAD\`, and whether uncommitted changes exist. **Do not switch branches, reset, or clobber current work**. Audit the deployed v13 commit with a separate clean checkout/worktree if required and permitted.
2. Read \`AGENTS.md\`, source \`components/Home.tsx\`, \`YourTurnView.tsx\`, \`ProposalsView.tsx\`, \`GoalsView.tsx\`, \`DecisionsView.tsx\`, \`DecisionView.tsx\`, \`WorkMap.tsx\`, \`ConnectAI.tsx\`, \`ScenarioForm.tsx\`, \`components/v6/ScenarioStudio.tsx\`, \`lib/flow.ts\`, \`lib/labels.ts\`, \`components/launch.ts\`. Inspect \`/new\` and its interviewer, plus exact UI-related changes in #32. Treat \`app/app/w/[ws]\` v2 as **off** behind LIM-2441.
3. **Browser evidence, not code guesses:** create an inventory of *actual* tester screen states for \`/new\` (including interview affordance), workspace Your turn, proposal (pending/countered/accepted/declined/empty), Goals, Decisions/record, Work, and Connected AI. For each of 3 roles (Leadership, asking/Product, owning/Security) identify visible/hidden actions, target texts, source file, and screenshot. Screen widths **1440, 1024, 900**; sample **390px** for onboarding + action surfaces. Mark each \`CAPTURED-LIVE\`, \`CAPTURED-LOCAL\`, or \`NOT-CAPTURED\`.
4. **Safe capture rule:** the actual Fly site may be inspected **read-only**, and its public \`/new\` without consuming codes. For signed-in screens, prefer **local synthetic workspace/fixtures** at the exact pinned SHA, clearly labeled local (do not pass off local as live). Never spend real invite codes, mutate hosted data, print secrets, record real customer workspaces, post sensitive screenshots to the public repository, or bypass auth. If safe access is unavailable, record the missing evidence and exact reproduction steps.
5. **D0 deliverables:** 
   - \`as-is-screen-matrix.md\`: \`operator job | screen/route | component | role | state/authority | observed screen/action | UX friction | screenshot/evidence label | status\`.
   - Annotated, sanitized screenshots with consistent width and role labels **only when share-safe**; otherwise private links/metadata.
   - \`reference-transfer.md\`: portfolio reference → exact atom → user task → actual component → \`KEEP/ADAPT/MERGE/DELETE/REJECT\` → reason → permission/truth restriction. [Magda Hart portfolio](https://dribbble.com/magdahart), [decision manager](https://dribbble.com/shots/26647190-Decision-manager-for-operation-risks-protocols-and-workflows), [structure](https://dribbble.com/shots/26634253-Decision-manager-for-corporate-entities-and-structure).
   - **Top 3 observed UX defects** (not code defects), ordered by independent tester impact, with source evidence. Note anything not verified.
6. Post a brief **D0 evidence handoff** on LIM-2446, with screenshot links if safe, pinned SHA, completed/blocked states, and 3 defects. Do not mark the ticket Done until the evidence criteria in LIM-2446 are met.

## Gate D1 — product model and design direction (ChatGPT lead, Claude source checker)

Use **one primary operator journey**: *changed priority → impacted dependency → I must act → review proposal → counter/conditions → requesting team accepts → owning team approves → separate leadership launch decision → read the record*.

- ChatGPT returns an opinionated A/B: **A = captured v13**, **B = Decision Desk**, and C only where materially distinct. Optimize clarity for first-time independent testers, not generic admin dashboard density.
- Claude validates every B element against server states/role permissions: \`PENDING_SECURITY\`, \`COUNTERED\`, \`ACKNOWLEDGED_BY_PRODUCT\`, \`RATIFIED\`, \`REJECTED\`; scenario-specific evidence availability and feature flags. Return a short **feasibility and deletion delta**, not code.
- Visual references inform layout and hierarchy, not fabricated telemetry. Preserve Liminal's dark graphite, magenta focus and amber unresolved states unless founder changes the style.
- D1 artifacts: role-by-state flow, screen hierarchy, action placement, reusable status/condition primitives, and exact list of redundant panels to merge/delete. Feed **LIM-2447/2448**.

## Gate D2 — visual prototype and founder decision

- **ChatGPT:** revise the [prototype in draft PR #34](https://github.com/liminalworksinc/align/pull/34) *against D0 screenshots*, with high-fidelity 1440/1024 and a mobile pass, actual strings/states and coherent action layout. Existing prototype currently pins **pre-#32 \`1c2941e\`** and is **conceptual / fictional / not approved**.
- **Claude:** critique prototype against code and perform keyboard/focus, layout/overflow, action-ownership, empty/error, untested/conditions, and role-switch parity checks. Flag mismatch rather than quietly implementing a new flow.
- **Founder:** record A/B/C rulings *separately* for **IA, interactions, visual treatment, copy, deletions** in LIM-2454. Until this happens, **LIM-2455 stays blocked**.

## Gate D3 — implementation only after founder approval

- Claude implements the approved delta in a **new, isolated branch/PR** based on current main. Preserve API contracts, server security, sign-in/passcode switch, independent custom scenario vs Northstar paths, hidden hosted routes, OAuth/MCP team scoping and \`ALIGN_GOAL_SESSIONS\` hold. Follow \`AGENTS.md\` / installed Next.js docs before changing code.
- Claude attaches before/after screenshots by role/width, action-state E2E QA, no horizontal overflow, explicit adds/replaces/deletes, backend/regression test output and SHA.
- ChatGPT audits the delivered visual and interaction changes against the founder rulings and D0 evidence. Any design disagreement goes back to founder; **no automatic merges or deployments**.
- Founder alone authorizes production merge/deploy. Any new deploy requires separate exact-SHA export + hosted smoke receipt like Fly v13.

## Coordination rules / collision prevention

1. **No shared working tree.** Claude keeps its active session and dirty state intact; ChatGPT's PR #34 remains a separate design-only branch. If Claude publishes D0 files, use a separate branch or worktree **only after checking current changes**; don't rebase/push PR #34 or change its files without coordination.
2. **No duplicate tickets.** D0 = LIM-2446, journeys = 2447, design system = 2448, decision prototype = 2449, approvals = 2454, implementation = 2455. Project P-LIM-99 is permanent UX ownership. LIM-2424 is deploy receipt, not a design task.
3. **Each handoff contains:** \`source SHA | exact files/screens | observed vs inferred | artifacts/URLs | unresolved issue | next owner\`.
4. **Do not assume receipt = UX proof.** Fly v13's interviewer smoke test, team-scoped read tools and security 404/401/421 checks are release facts, not cold-user task success. The visible UI remains unchanged by #32.
5. **No unseen background coordination.** This document and Linear/GitHub comments are the communication channel. A live Claude session will not receive a message until the user points it here or the session explicitly reads the link.

## Exact initial request for the Claude Code session

> Coordinate the Align UX redesign with ChatGPT using this document and **LIM-2446** as the D0 contract. First report your current git branch/HEAD and whether the worktree is dirty; do not disrupt existing work. Audit the **deployed Fly v13 source at exact SHA \`5b74d8683592eeea4ae0850156ea7b9759b23258\`**, including changed UI files in PR #32. Capture and label safe real/local synthetic UI screenshots across the key 3 roles, states and requested widths. Produce the as-is screen/role/permission table, a reference-to-component transfer matrix, and the top 3 observed operator UX problems. Post your evidence and blockers to LIM-2446 with links. **Do not redesign production components, consume live invite codes, merge, deploy, alter security routes, or mark D0 complete based only on source reading.** Draft PR #34 is an unapproved concept against an older SHA; use it only for comparison after D0.
