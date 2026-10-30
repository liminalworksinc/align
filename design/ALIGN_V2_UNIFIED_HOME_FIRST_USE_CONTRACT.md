> **FOUNDER RULING UPDATE (2026-10-30):** the previously proposed **one adaptive Home exposing both work-first and decision-first paths, with no separate chooser**, is now explicitly approved as the entry presentation (LIM-2454 comment `35376283`). Current first complete interaction candidate: [R2 contract](./ALIGN_V2_E2E_DESIGN_CONTRACT_R2.md) and [R2 prototype](./prototypes/lim-2449-v2-sample-e2e-r2.html). This does **not** constitute D2 visual clearance or implement v2 launch authority.

---

# Align v2 — Unified Home, first use and decision journey

**Status:** D2 interaction design contract, **not** founder-approved visual UI or executable backend spec. Prepared Friday Oct 30, 2026 for [LIM-2449](https://linear.app/liminal-space-io/issue/LIM-2449), [LIM-2454](https://linear.app/liminal-space-io/issue/LIM-2454) and draft [PR #34](https://github.com/liminalworksinc/align/pull/34).

**Authority and sources.**
- Founder ruling [LIM-2454 comment e3a14f87](https://linear.app/liminal-space-io/issue/LIM-2454#comment-e3a14f87): target v2, not v1; **both** work-first and decision-first entry experiences retained. Preserve separate leadership launch and structured “Accept if…” conditions as required v2 additions.
- [Source-linked v1→v2 comparison](./ALIGN_V1_V2_SCREEN_COMPARISON.md) pins current legacy v1 to `e044f11` (Fly v17 source) and proposed v2 to PR #37 `237268f058ca`. Its preference scores are *design inferences*, not tester observations.
- V2 source contracts at that SHA: `specs/align/interface.md`, `goals-and-proposals.md`, `directives.md`, `metrics.md`; code under `components/legacy-project-wrapper/implementation`. [Draft v2 implementation acceptance checklist](https://github.com/liminalworksinc/align/pull/39) is the D3 owner of detailed API/QA tests; this document only defines the **person-facing experience**.
- No private D0 screenshot archive was available in the source comparison. This is a **wireflow and information hierarchy**, not a completed side-by-side visual or usability test. No production code change.

## One product: two recognized starting jobs

The first workspace view should not require a user to choose whether they are a “manager” or “agent operator.” Use a **single Home** with two visible, evidence-qualified sections. Rank the section with an **authorized outstanding task** first when there is one; otherwise lead with the **current goals / available work evidence**. Do not claim personalized machine-learning prioritization.

```text
┌──────────────────── ALIGN / Workspace / Person ───────────────────┐
│ Workspace  ▾   Personal identity / role   Apps · Devices · People  │
│                                                                     │
│ YOUR NEXT USEFUL STEP                                               │
│ [Approval needed]  [Goal needs review]  [Connect an agent]          │
│ Exact change / named eligible approver or true waiting owner       │
│ Primary CTA: Review request  or  Inspect goal / Connect agent       │
│                                                                     │
│ 01  DECISIONS NEEDING ATTENTION                                     │
│ Waiting on you | Waiting on others | Recent decisions              │
│ Change requests · alignment consent · team asks · launch decisions*│
│ [one request, one current revision, one scoped permission]          │
│                                                                     │
│ 02  WORK IN RELATION TO GOALS                                       │
│ Approved goal(s) → bound/shared sessions → directive receipts       │
│ [Shared sessions 3] [First applied receipt 1] [Not observed — …]    │
│ Work-first CTA: Inspect affected goal / view sessions              │
│                                                                     │
│ RECENT DECISIONS (read-only)                                        │
│ Latest approved/rejected request → its one archived record          │
└─────────────────────────────────────────────────────────────────────┘
* Launch is REQUIRED future v2 functionality, not present at #37 pin.
```

### Shared visual hierarchy

1. **Question to answer now:** “What changed?” Keep concise goal/version, affected people and relevant evidence **before** full navigation, not an abstract alert score.
2. **Human authority:** “Who can make this decision?” Show a permission from **v2’s effective approval set / `can` flags**, not a fabricated single owner. If several people may approve, list them or a factual count. If no one may approve, show an explicit blocked state and link to a permissible remediation (do **not** silently assign a fallback).
3. **Work evidence:** “What is affected and what can we actually observe?” Distinguish goal-linked session, recorded directive `received/applied/enforced`, and **work outcome unverified**. Never derive agent task completion from plan reads, token spending or receipt counts.
4. **One primary action:** review the specific version, connect a device/app, create a goal, or open an invite. Avoid simultaneously showing an action the person cannot perform.
5. **Result:** decision record and optional value/evaluation next step; no second shadow record or hidden conversion flow.

### Typed queue rows — one Home, separate authoritative objects

| Row | Source of truth | Permissions | Primary action | Never infer |
| --- | --- | --- | --- | --- |
| Goal change | v2 `change request`, state, current revision, server `can` | Approver in effective set; requester for accept-counter/rebase/withdraw | Review changed fields; approve/counter/reject if eligible | That counter acceptance itself ratifies |
| Goal alignment | v2 alignment and per-goal/per-session consent requirements | Eligible approver for each *specific* requirement | Review source→target and accept/reject/counter as permitted | All consent granted from one person's approval |
| Team ask | v2 ask, team response rights and provenance | Assigned response team or workspace authority | Acknowledge/respond/resolve only when allowed | Ask is a goal version or change request |
| Parent review | v2 `contributes_to.stale`, review permission | Child goal owner | Review newer parent, confirm fit or propose adjustment | Parent freshness is an agent execution receipt |
| Leadership launch **(required addition)** | **Not specified in pinned v2** | Founder-approved launch authority **TBD** | Approve launch / Not yet, **after** agreement | An approved goal, delivered directive, or applied receipt authorizes launch |
| Work evidence | v2 goal/session binding and directive receipt | Viewer may inspect only authorized visibility | Inspect linked goal/session/activity | Token usage or context delivery proves task execution |

Home is a **read-model/aggregation surface**, not a write-authority union. Every row opens its original route and relies on server permissions. Private-goal visibility remains enforced server-side; no hidden goal names in cross-team summaries.

## Four zero-coaching first-use states

**A · Invited into a workspace** — Sign in as yourself → accept the bound invite → land on workspace Home with the concrete pending item or relevant goal. First CTA is to review or inspect it. No persona switcher.

**B · Existing team already shares sessions** — Sign in → see approved goal and attached shared session(s), actual receipt/freshness states → ask “Is work still following the priority?” with explicit **unknown** for unobserved execution. Link to Sessions / Goal detail, not a manufactured live run stream.

**C · Blank workspace / no sessions** — Show *known emptiness*, not invented “all work aligned.” Choice 1: create a goal and invite an owner/team. Choice 2: connect an app or pair a device; make it clear **MCP consent ≠ CLI pairing ≠ sharing a session ≠ applying a directive**. An optional reviewable AI intake assistant can draft goal fields, but its field mappings and actual endpoint/model/permission requirements are a **separate implementation decision**. Do not require a fictional two-team conflict just to see the product.

**D · Sample available** — Surface “Try sample workspace” only when allowed by v2’s creation gate and only if the person has no workspaces. When hosted creation requires a code, or a user already has workspaces, **do not show the sample button**; point to the real invite/request-access path instead. Sample artifacts must be unambiguously labeled **sample** and excluded from production adoption metrics.

### Proposed intake assistant contract (not present in v2)

Start by asking *“What changed, or what are you trying to keep consistent?”* Let the person paste notes or describe a situation. The assistant may prepare an **editable draft** of goal title, measures, anchors, dependency suggestions and potential people; it must label **unresolved** ownership, consent, evidence provenance and work/session mapping. One review screen shows exact draft field values and the future permission required to save/propose each. **No AI-generated write, invitation, approval or session binding before explicit eligible human action.** No claim of automatic context import without connected/consented sources. The existing v2 note→limit suggestions are **not** this interviewer.

## Decision-review anatomy against v2

```text
[Request title + state]           [revision N; base goal vX; current vY]
[Which fields changed: EXACT before | after, reason, dependencies]
[Evidence: self-reported link / agent-reported link / Align snapshot]
[Impact: readable dependent goals & bound sessions; unknown when absent]
[Who can act: factual eligible approvers; your server `can` permissions]
[Required action row: Approve | Suggest a change | Reject …]
[Revision history collapsed, inspectable; no invented actor approval]
```

- **Countered:** requester can accept the counter (returns to `pending`), and an eligible approver must then decide. Do not show a direct ratification from requester counter acceptance.
- **Reject:** visible as a legitimate final human decision, with reason; it does not become Error red.
- **Rebase/withdraw:** show only when server allows, with stale or superseded reasons. A person may face several requests on one goal, including multiple requesters—do not impose v1's one-open-proposal story.
- **Approval without evidence:** require explicit acknowledgement and retain the audit wording; do not fabricate a sandbox pass.
- **Conditions (“Accept if…”) — REQUIRED, NOT YET MODELED:** separate conditions from counter notes/goal limits; record what the requester acknowledged, which approver subsequently approved, and display **Not confirmed yet** until actual verification. This **needs v2 storage, API, permission, audit and MCP-copy design before shipping**; no display-only pretend condition.
- **Leadership launch — REQUIRED, NOT YET MODELED:** differentiate **No decision yet**, **Not yet**, and **Approved**, with actor/note/time and a later changed ruling. **Critical semantics conflict:** pinned v2 issues `goal_version` directives to bound/governed sessions *as soon as change approval writes a goal version*. Founder must decide whether launch gates (a) directive publication, (b) application/execution, or (c) only downstream operational release. These lead to different safety behavior. **Never label current v2 approved/directive-delivered as “not launched” in a way suggesting agent work cannot already change.** A backend/MCP/directive change and negative tests are required for whichever semantics is approved.

## One discoverable decision record, plus value

On approval or rejection, the decided **v2 change request remains the canonical record**. Present a read-only archive over its final revision and immutable goal version, not a second mutable record. Show separately:

1. **Decision:** requested change, agreed/rejected revision, approver(s), time and reasons, with “approved without evidence” when applicable.
2. **Conditions** (after required addition): exact terms, requester acknowledgment, whether confirmed and by whom; unknown stays **Not confirmed yet**.
3. **Launch** (after required addition): status/authority/time and how that affects agent directive/execution semantics.
4. **Evidence / propagation:** uploaded self- or agent-reported evidence (not externally verified), server snapshot, shared sessions and received/applied/enforced directive receipts, and what **was not observed**.
5. **Value and next step:** keep v2's proposal→approval and approval→first applied measures **as those measurements**, not v1's priority-seen→both-parties-agree coordination clock. Keep a separate optionally reported “Before Align…” estimate. Preserve the intended evaluation/waitlist/LOI conversion choice explicitly; v2's `follow_up_clicked` and operator-recorded `loi_sent`/`loi_signed` are not the same as v1's waitlist click or a customer signature.

### Correct status vocabulary

| Signal | Truthful status |
| --- | --- |
| Request submitted / countered | `pending` / `countered` |
| Requester accepted the counter | Back to `pending`, **not approved** |
| Approved change | Goal version written, request `approved`; **does not imply launch** |
| Leadership launch | *Unavailable pending v2 product/backend addition*; show a separately explicit status once implemented |
| App grant / last read | Authorized / last-read timestamp, no unsupported per-goal read version |
| Session directive | Received, applied or enforced **if an actual receipt exists**; absent stays Not observed |
| Work completion | Not verified unless independently observed with a source |
| Decline / rejection | Human judgment record, **not** system failure |
| Access request / LOI | Requested evaluation / operator-recorded sent / operator-verified signed; link click is never a signed LOI |

## D2 prototype and first-run QA acceptance

This document is **not** a rendered design. The following artifacts must precede a visual ruling:

- [ ] **P0 v2 Home + review clickthrough** in PR #34: both entry paths, typed pending rows, empty workspace, goal with shared sessions, valid approval set, no approver, counter→requester accepts→pending→approver agrees, rejected and stale states. Use sample/local *labeled* data, never invented connected source results.
- [ ] **P1 companion screens**: v2 Goals (arbitrary graph, selected-node inspector); Apps (OAuth vs device vs session); Work (real session binding, unreadable/private scope); Decision record/value (separate dimensions and conversion).
- [ ] **Visuals:** matching 1440, 1024, 900, 390 and 320 screenshots; contrast and keyboard focus; before/after live v1 images where available. No private D0 screenshot archive is currently claimed.
- [ ] **First-user test:** independent participant can identify first action, affected goal and true permission **without coaching**, plus what is **not observed**. Record cases where existing tools already handle the work.
- [ ] **D3 gates:** draft [PR #39](https://github.com/liminalworksinc/align/pull/39) is the v2 acceptance checklist; two new semantics require founder-approved spec and server tests before display. No PR #34 standalone HTML mock constitutes a successful v2 user or deployment test. All production changes await founder go.

## Scope of this decision

**Founder-ruled direction:** target v2 and preserve **both** recognition-first jobs; use v2 identities, teams, approval sets, change requests, evidence and sessions as the source model. **Design recommendation, not yet a founder ruling:** present both jobs in one contextual Home rather than imposing an explicit persona chooser. **Not approved here:** the combined-home proposal, exact screen comps, default routing, AI intake model/API, automatic work-to-goal mapping, agent execution telemetry, leadership-launch gating semantics, conditions verification mechanism, or the release timing of #37. Treat those as explicit open design/engineering decisions.
