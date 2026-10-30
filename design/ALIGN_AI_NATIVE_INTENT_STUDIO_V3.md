# Align Intent Studio · AI-native product design exploration (v3)

**Status:** design prototype / proposed direction; founder ruling outstanding. **No production code, model calls or backend integrations.**
**GitHub:** draft [PR #34](https://github.com/liminalworksinc/align/pull/34), [interactive HTML concept](./prototypes/lim-2449-intent-studio-v3.html).
**Existing sources:** current v13 product mechanics at Fly source SHA `5b74d8683592eeea4ae0850156ea7b9759b23258`; D0 evidence accepted [LIM-2446](https://linear.app/liminal-space-io/issue/LIM-2446) and privately held; Claude's real feasibility analysis [LIM-2447](https://linear.app/liminal-space-io/issue/LIM-2447). **Main advanced separately after v13; this is not a sync/rebase and this design branch is intentionally unmerged.**

## The correction

The earlier v1/v2 PR #34 concepts positioned **human approvals** as the product and AI as a sidebar. That is the wrong center of gravity. **v3 is a co-reasoning workspace**:

1. **State intent in language.** An operator asks a question about the current organizational priority. Align should connect that intent to relevant current goals and available evidence, not merely open a blank form.
2. **Generate an inspectable structured candidate.** Chat and a living change artifact coexist. The artifact shows the currently approved target, proposed target, owner, reasoning inputs and provenance. Suggestions are **not** authorizations.
3. **Propose and authorize with the right actor.** Separate requester proposal, owner ratification and leadership launch decision. When the owner counters, the requester acknowledges; the owner still ratifies. Never infer authority from a conversational response.
4. **Observe only what evidence establishes.** Read receipts from OAuth/MCP apps can indicate which authorized goal version an app last read. They are not live execution telemetry, verified task completion or proof an agent complied.
5. **Record the actual outcome.** Agreement, leadership's `not_yet`, no sandbox test, unverified conditions and unchanged objective are separate axes. An approval can be a valid decision with no evidence of execution.

## What the actual v3 prototype demonstrates

- **Conversational left canvas**: a seeded request from fictional Maya Ortiz, a scripted answer, follow-up prompts and a text composer. Responses follow deterministic branches for authority, goal objective, agents/read metadata and provenance.
- **Living right artifact**: the company priority, approved goal measure v1, proposed enterprise-pilot measure, source inspection, actual human approval authority and example read-freshness states.
- **Role-authored stages**: `draft → PENDING_SECURITY → COUNTERED → ACKNOWLEDGED_BY_PRODUCT → RATIFIED → not_yet/approved` (local-only), plus direct approval and decline.
- **Dedicated compact decision record**: verified human authorization vs launch decision vs evidence; original objective unchanged since v1. Conditions are never automatically marked confirmed.
- **Connected AI read view**: sample Claude Code latest-read goal v1 (current before v2.1 is ratified, older after), Codex no read. No fabricated session capture.
- **Responsive views**: wide two-pane, stacked tablet/phone. A mobile owner's decision shortcut jumps to the real controls, with no duplicate approval buttons.
- **Fictional test data only**; no sensitive customer screenshots or real passcodes pushed.

## Gap between design v3 and hosted v13: NO implied capabilities

| Proposed AI-native behavior | v13 status | Necessary production work |
| --- | --- | --- |
| Ask arbitrary questions about plans, priorities and their effects | **Not available** as an authenticated general-purpose AI workspace. Only the `/new` setup interviewer exists. | New retrieval-grounded conversation endpoint, clear scope/auth, rate/cost limits, prompt-injection handling, model invocation, evaluation, source/provenance, privacy/consent and error behavior. |
| Convert language into structured *candidate* goal changes | **Not available** in this form. Existing proposals submit structured `proposed_measure_text`. | Read-only proposal analysis/draft contract; return confidence/unknowns and verbatim source IDs; prevent silent writes; separate schema validation. |
| Understand current work and agent work | **Only partially available.** Current goal graph, read metadata, human activity and some test fixtures exist; no hosted agent-session capture. | First ship a source-grounded view of current authorized goals and app read metadata; agent actions/actual work require new instrumentation and consent. |
| One-person / me-with-my-agents approval mode | **Not available.** Requester, owner and leadership are separate actor slots. | Separate product model/identity/auth design and founder ruling; never fake it by auto-switching roles. |
| Human approval and independent leadership launch | **Available** through v13's human-authorized flow. | Keep backend routes, passcodes, security boundaries and explicit untested acknowledgments; redesign presentation only after approval. |
| Goal objective editing and source before/after company goal | **Not available** in custom scenario model. | Explicit schema/versioning work if the founder decides this belongs in product scope. |
| Connected app read freshness | **Limited metadata available.** Connection and read events exist, not execution proof. | Verify exact fields, versions, permission scoping and cases with no read; show only grounded state. |

## Minimum AI contract if the design direction is chosen

The AI never silently changes an authorized goal. Given **role-scoped, versioned** source facts (current approved goal, priority, proposal state, constraints, available read receipts), it may return:

- `answer`: concise interpretation and *what remains uncertain*;
- `source_refs[]`: real goal/requirement/version IDs used to build the candidate;
- `candidate_changes[]`: proposed measure text, target goal/version, reason and reciprocity, marked **draft/unapproved**;
- `requires_actor`: role required for each human step, derived from existing server rules;
- `evidence_limits[]`: no sandbox, unverified conditions, no agent telemetry, etc.

The client renders this as an inspectable **artifact**, not as an authoritative AI verdict. Actual mutation happens only via the existing independently authorized proposal/ratification/launch APIs, after human review. Do not give conversational AI a passcode bypass or direct arbitrary action endpoint.

## Browser evidence for this design study

**Tested locally in Chromium:** 1440×900, 1024×800, 390×844 and 320×740. Zero script errors and no document horizontal overflow in these four cases. Tested simulated workflow:
Maya proposes → Dev counters → Maya accepts changes → Dev ratifies with explicit no-test acknowledgment → Leadership records Not yet → Leadership approves launch with explicit no-test acknowledgment → decision record. A text composer question about AI app reads added a scripted answer.

**Not tested:** independent operator comprehension, keyboard-only full pass, screen readers, all empty/error/timeout states, non-Chromium browsers, real backend authorization/API behavior or live generative AI. This prototype is not user evidence and does not unblock implementation.

## Design review decisions required

1. **North star:** does Align fundamentally become an *intent and evidence workspace* rather than a goal approvals dashboard?
2. **AI boundary:** should conversations only explain/read first, or also propose structured candidate goal changes (still never auto-approve)?
3. **Primary work surface:** approve split conversation + living change artifact as one workspace; note phone layout preference.
4. **Agent truth:** show last scoped read/goal version now, and design actual execution instrumentation as a different capability later.
5. **Audience/model:** keep two distinct human decision roles for P0 or separately prioritize a real me+agents architecture.
6. **Visual register:** restrained graphite/magenta editorial UI, no generic analytics charts or invented confidence/risk scores.
7. **Approval gating:** existing [LIM-2454](https://linear.app/liminal-space-io/issue/LIM-2454) still controls any eventual implementation. Do not merge PR #34.

**Older v1/v2 prototypes remain in PR for A/B historical comparison, but v3 supersedes their product concept.**
