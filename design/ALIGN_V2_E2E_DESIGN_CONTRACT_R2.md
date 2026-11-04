# Align v2 · R2 founder-ruled design contract

**October 30, 2026 · PR #34 / LIM-2449.** Supersedes R1's proposed condition-verifier and launch-approval semantics. **Founder ruled interaction behavior; v2 launcher authorization is still open.** This document is the current D2 design authority, not a production API or release approval.

**Evidence:** LIM-2454 ruling `33ad545d` (launch releases plan to agents) and `35376283` (condition acknowledgment, adaptive Home). R1 D2 **NOT CLEARED** verdict LIM-2449 `8abad2c0`; reference application model PR #37 `237268f` and v2 acceptance checklist draft PR #39. [R2 interactive sample](./prototypes/lim-2449-v2-sample-e2e-r2.html) · [R2 verification](./ALIGN_V2_E2E_R2_TEST_REPORT.md).

## Ruling 1 — agreement and launch are separate

The founder has selected **launch as the point where bound agents receive the new executable plan**.

| Dimension | Before approval | Approved / launch not decided | Explicit “Not yet” | Launched |
|---|---|---|---|---|
| Human decision | Pending | **Agreed** (immutable decision, target version recorded) | **Agreed** | **Agreed** |
| Leadership launch decision | None | `undecided` | `not_yet` (explicit hold) | `approved` (exact target version) |
| Agent-effective version | Previous launched version | **Previous** | **Previous** | **New** (directive issued) |
| New goal-version directive | None | **None** | **None** | Issued for bound eligible sessions |
| Existing work | May continue on previous version | Not automatically stopped | Not automatically stopped | Receipt may report received/applied, **not task completion** |

**Exact UI:** “Agreed, launch not yet” is valid both before a launch ruling (with detail **No launch decision**) and after an explicit hold (detail **Not yet — held**). Never collapse these details in the record. A hold is not Stop. Approval may create a non-agent-effective target record, but **must not make the new version effective in agent sessions**. If an app can read the approved but unlaunched plan, state that it is *not effective for agents* and keep the prior launched version distinguishable. Stale-version refusal, exact-version launch, session permissions, and repeated-ruling behavior require backend security tests.

**Outstanding v2 authority question (Sean + founder):** v2 currently has **no Leadership role**. Who may perform a launch? Candidates (not approvals) include a workspace-scoped permission, designated people, or a separate approval set. The R2 HTML uses a **Launch gate preview** that is explicitly not an actor or permission grant. Do not create Morgan/Leadership as a production v2 identity or enable `launch` mutations until this is ruled. The precise authority model must be server-enforced, scoped and auditable. The “Approve and launch” compound action likewise awaits a ruling.

## Ruling 2 — “Accept if…” is requester attestation, not external verification

1. Eligible approver submits a **counter revision** with a changed target, a **required counter note (1–2000 characters)** and a **separate condition text** if choosing “Accept if…”.
2. Requester accepts the exact counter target/terms → request returns to `pending`. This acceptance is **not** goal approval, and by itself is **not** condition-fulfilment acknowledgment.
3. A member of the effective approval set gives final approval, recording target version, revision, actor and time. Condition remains **Not confirmed yet**.
4. Requester alone can later perform **one acknowledgment action** saying the condition is met. Store `condition_text`, `acknowledged_by` (real requester identity) and `acknowledged_at`. The record displays the condition and requester acknowledgment beside approval. No verifier role, `confirmed` state, external verification requirement, evidence-reference field or launch block on verification.
5. If no acknowledgment exists, show **Not confirmed yet**. After acknowledgment, show **Acknowledged by [requester] at [time]**, **not Verified/Passed/Confirmed**. The attestation is a statement by the requester, not independently established fulfilment. The implementation must reject non-requester acknowledgment (403), repeats and stale revisions (409).

**Important sequencing detail:** R2 places requester attestation **after final approval** to demonstrate the full journey. LIM-2464/Sean still need to settle whether it must instead occur before approval, or merely before a separate subsequent workflow. It **does not block launch** under the founder's removal of the verification gate. Do not silently convert acknowledgment into confirmation of objective success.

**Other mandatory v2 behavior:** an approver may **decline while request is `countered`** as well as when `pending`; every decline needs a **reason of 1–2000 characters**, and an ordinary/conditional counter always needs its own **note of 1–2000 characters**, distinct from condition. Invalid fields receive an error message and keyboard focus, and the user's draft is retained. Server errors still require permission and conflict tests beyond the prototype.

## Ruling 3 — one adaptive Home, both recognized operator jobs

**Founder-approved layout direction:** a single Home surfaces (A) “Which decision is waiting on whom?” and (B) “Is any work still following the previous plan?” with no extra entry chooser. Distinguish typed change requests, alignments, asks and any future launch task, each linked to the authoritative object and its server-derived `can` permissions. Never infer agent completion from activity, spend, an app read or directive receipts. Preserve existing v2 identity, team memberships, approval sets, workspace creation gates and session controls.

The Northstar starter is a **fictional gated sample** in the standalone R2 preview, not evidence that a new workspace was created or that a non-eligible user may access the production sample.

## First complete P0 tester path

`Sample → Adaptive Home (both paths) → Exact change diff → Accept if… counter + required note + separate condition → Requester accepts revision → Final eligible approval → Approved / launch not yet → Launch authority unresolved, simulate Not yet then release → One canonical record → Work with version and receipt boundaries`.

A requester acknowledgment after agreement is available separately in the prototype. The launched target is effective only after the launch simulation; before that no new goal directive is queued. After an `applied` receipt, work completion remains **Not observed**.

**First-use acceptance questions:** Who decides next? Is agreement distinct from launch? Is “Not confirmed yet” an independent check or unacknowledged requester attestation? What do received/applied receipts actually establish? Test with two fresh participants; Dhivya may give returning-operator feedback but is not a naïve participant.

## D2 visual fixes and production boundaries

| R1 failed check | R2 change | Residual proof |
|---|---|---|
| 320/390 body sideways overflow 161/91 px | At ≤800px, `.shell{grid-template-columns:minmax(0,1fr)}`; added min-width containment | **Needs fresh rendered Chromium widths 320/390/900/1024/1440** |
| Missing decline reason and counter note | Mandatory 1–2000 chars and separate counter condition, error focus/retained draft | Reducer tests **pass**; real DOM/mobile checks pending |
| Font defaults | `Space Grotesk` UI and `Space Mono` small provenance labels, Google Fonts with browser fallbacks | Rendered font network/fallback check pending |
| Countered request cannot be declined | Approver may reject pending/countered with required reason | Reducer test pass |
| Error focus | `S.focusField` routes focus to target, condition, note, decline-reason | Browser/keyboard QA pending |
| Record eyebrow contrast 1.82:1 | Paper eyebrow `#6e3152` on `#f3f1ef`; calculated **8.38:1** | Browser computed CSS still needs verification |
| Value/funnel removed | Restored **post-agreement Decision Value**, measured vs estimated caveat, optional baseline, **separate** waitlist / non-binding LOI preview | Prototype creates **no real clicks, submissions, funnel events or signatures** |
| Launch authority invented in R1 | Removed named v2 Leadership/independent verifier; **launch gate preview** explicitly says authority TBD | Permission model unresolved, do not implement grant |

**R1:** historical unapproved artifact. **R2:** interaction candidate; scripted reducer tests alone do not clear D2. D0 private screenshot pixels need authorized inspection, and all new mobile/browser/focus paths must be rerun. **No app code, PR #37 implementation, merge or deployment is authorized by this document.**

### Backlog routing

LIM-2463: version/effective/launch split; **launcher authority TBD**. LIM-2464: requester-only condition acknowledgment (already rewritten by product owner). LIM-2465: adaptive Home with both entries. LIM-2466: record/Work/value parity. LIM-2454: visual D2 and final launcher authority; PR #39: actual v2 schema/API/E2E gates.
