# Align v2 R1 — verification, D0 evidence, independent-user protocol

**Oct 30, 2026.** Design study only. [Interactive R1 sample prototype](./prototypes/lim-2449-v2-sample-e2e-r1.html) · [R1 behavior contract](./ALIGN_V2_E2E_DESIGN_CONTRACT_R1.md). Not a live backend or hosted deployment.

## Verification performed

| Check | Result | Evidence |
|---|---|---|
| Embedded JS syntax | **PASS** | Compiled script using JavaScript new Function without error |
| Source and evidence constraints | **PASS** | Six stages, responsive breakpoints, no fetch/WebSocket/external popup; separated approval/launch/receipt state |
| State transitions | **23/23 PASS** | Ran actual HTML reducer with stub DOM against GitHub-fetched prototype |
| Real Chromium, viewport screenshots, horizontal overflow | **NOT RUN** | No current GitHub HTML bytes were materialized into browser runtime |
| Screen reader and keyboard end-to-end | **NOT RUN** | Actual browser and assistive-tech testing remain open |
| Live v2 server, permissions, devices, OAuth, session hooks, DB, migration | **NOT RUN** | #37 unmerged; R1 uses fictional in-memory state |
| Visual comparison with original D0 pixels | **NOT VERIFIED** | Audit markdown and screenshot file paths recovered, but image blob API rejected non-UTF-8 bytes; no visual image inspection claimed |
| Independent first-time participant usability | **NOT RUN** | Nobody contacted, recruited, observed or counted in this pass |

**23 checked branches:** sample entry; review; blank conditional counter blocked; valid Accept if counter; premature approval forbidden; requester accepts counter; requester cannot self-approve; final eligible approval; approved-but-held emits no directive and retains effective version v1; wrong authority cannot hold; leadership Not yet retains no directive; unconfirmed condition blocks launch; verification needs fictional evidence reference; simulated verifier confirmation; authorized launch; directive queued; received then applied receipt; record→work; direct approval; unconditional launch; rejection records no directive; rejected request cannot launch.

## Original D0 evidence recovered by commit

The deleted D0 branch's SHA **26402c083d2f43861631f93e47d024a2ed0ee9dc** is accessible and contains **427 WebP captures**, the full source-pinned D0 audit, as-is matrix, reference-transfer matrix and top-three defects. Those original images are local fictional or signed-out hosted captures, NOT modern v2 screenshots. The sanitized branch design/d0-summary has only a README. The GitHub binary read was blocked by UTF-8 decoding; no direct visual inspection of these original image pixels was possible in this runtime.

Review these exact files privately at commit 26402c0 (do not copy into a public design branch):

| Design decision | Relative path beneath design/d0/shots | D0 observed finding |
|---|---|---|
| Reviewer action position | 37-security-proposals-review-1440.webp and -1440full.webp | Decision below fold at ~y=1110 desktop |
| Reviewer phone layout | 37-security-proposals-review-390.webp | Fixed left rail overflowed narrow screen |
| Whose turn | 20-product-yourturn-initial-1440.webp and -390.webp | Repeated status, delayed main action |
| Leadership launch | 48-leadership-companygoal-launch-form-1440.webp and -390.webp | Separate launch action exists |
| Explicit Not yet | 4b-leadership-companygoal-launch-notyet-1440full.webp | Headline pending conflicted with body not yet |
| Decision archive | 80-security-decisionrecord-summary-1440.webp and 81-security-decisionrecord-activity-1440.webp | Confusing caveats, stale goal naming |
| Agent work | 53-security-work-agents-recorded-1440.webp | Read/record does not establish task completion |
| V1 onboarding | 03-anon-new-interview-start-390.webp | Useful responsive intake affordance, not direct v2 identity pattern |

**Visual fidelity gate:** authorized reviewer must actually view the private capture files, then compare v2 R1 screenshots against them at 1440/1024/900/390/320, annotating Keep/Adapt/Delete for action hierarchy, sidebar, mobile, evidence treatment, record and condition controls. No generated recreation of private D0 images is acceptable as evidence.

## Independent 20-minute usability script (not yet executed)

Recruit at least two **naïve first-time operators** and optionally one informed multi-agent operator. Attio shows Dhivya Vijayakumar previously performed a guided evaluation and requested an actual agent-first CLI/MCP workflow; she is a strong *returning* qualitative reviewer only if available and consenting, NOT a naïve unassisted first-use test. No contact was made.

Tasks: (1) enter fictional Northstar sample with no product teaching; (2) identify next eligible actor from Home; (3) review changed goal, counter with one explicit condition; (4) simulate requester acceptance, ask if now approved; (5) simulate final approver decision, ask whether agents already have a new executable directive; (6) Leadership selects Not yet, ask what happens to old sessions; (7) simulate fictional condition verification then leadership launch; (8) read canonical record and Work, explain received/applied receipt vs completed task.

Capture consent, prior exposure, build/SHA, viewport, time to first useful result, wrong-role/condition/launch misinterpretations, unprompted Spend/Asks interest, coaching required, task success, verbatim feedback, next commitment classified separately. Passing hypothesis: both fresh participants identify the next actor, differentiate agreement from launch, know condition acknowledgement ≠ fulfilment, and understand receipt ≠ completed work. Small samples are formative, not PMF.

## Honest release gates

- **PASS** 23/23 simulated state tests only.
- **NOT RUN** real-browser and keyboard/assistive-tech verification.
- **NOT RUN** external participant observation, including Dhivya.
- **NOT VERIFIED** pixel-level D0 comparisons despite recovered commit and paths.
- **BLOCKED** #37 backend implementation until founder rules whether launch gates directive creation, agent execution, or operational release. R1 recommends gating executable goal-version directive emission; its behavior is NOT currently in #37.
- **BLOCKED** production design/merge until conditions are independently modeled, authorized, and checked in backend and PR #39 acceptance suite.

These gates do not authorize merge or deploy.