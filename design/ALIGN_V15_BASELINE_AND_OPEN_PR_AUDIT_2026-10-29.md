# Align · Fly v15 source baseline and open-PR audit

**Reviewed:** Thu Oct 29, 2026 PT; **corrected Fri Oct 30, 2026 PT** after new PR #37 and #32 cherry-pick verification. **Scope:** source evidence, branch ancestry, declared test coverage, CI metadata and proposed design consequences. This is not a live staging E2E test, security audit or approval to merge.

## A. Production baseline — PR #36, now merged/deployed

- **[PR #36](https://github.com/liminalworksinc/align/pull/36)**: merged 2026-10-30 05:35:43Z; commit **`e044f11a9fca5b12713beed68df05a4348e9f675`**. GitHub confirms merge. LIM-2445's release note reports **Fly v15 live around 22:37 PT Oct 29**; that deployment is **reported by the release owner**, not independently re-exercised in this audit.
- Source-of-truth files on main: `components/DecisionValueCard.tsx`, `components/DecisionView.tsx`, `components/YourTurnView.tsx`, `lib/value.ts`, `lib/funnel.ts`, `lib/config.ts`, `app/api/timer/route.ts`, `scripts/test-funnel.mjs`, `scripts/ws-admin.mjs`.
- **When card appears:** only after a **custom-workspace proposal is `RATIFIED`** (not when merely drafted/countered/accepted by the requester); rendered on Your turn and decision record.
- **What is shown:** authoritative before/after goal target, named owner approval with version, requesting-team proposal/acknowledgment, independently decided Leadership launch, work linked to the owning goal split into new vs old-plan work, and timestamps for proposal→ratification and proposal→launch decision. These are reported spans, **not estimates of time saved**.
- **Feedback:** optional question **“Before Align, how long would getting this decision usually take?”** with a finite response set and ≤500-character optional text; the operator's estimate is always distinguished from recorded elapsed time.
- **Conversion:** source validates a Google Forms waitlist URL and a separate optional `ALIGN_LOI_URL` (or defaults LOI link to the waitlist form's optional last step). A **waitlist click or LOI-link click is not a signed LOI**, an independent test, buying authority or paid demand.
- **Funnel:** view, feedback, waitlist-click and LOI-click events recorded by workspace/proposal/role, gated to ratified decision context; `ws-admin funnel` may aggregate; do not present raw clicks as signatures.
- **Known release follow-ups (LIM-2445):** full external operator walkthrough and a verified test submission reaching the form sheet remain outstanding. Do not claim funnel conversion has been observed because the link is deployed.

### Design implication for PR #34

The redesign must **KEEP** and materially improve this post-ratification **Decision → Value → Feedback → Waitlist → Optional LOI** transition. Do not remove it while replacing the white v15 card with a Liminal ink/paper artifact. Preserve all server gates, data provenance and event wiring, keep own estimate vs measured timestamps separate, and test whether the call to action is actually encountered on mobile without inflating `value_card_viewed`.

**New clickable, fictional rendering:** [v15-aligned remaining screens with post-decision value/CTA](./prototypes/lim-2450-2453-dribbble-surfaces-v2-v15.html). This deliberately **does not open the production form or send funnel events**. It is a design preview, not an E2E reimplementation. [Original four-screen Dribbble gallery](./prototypes/lim-2450-2453-dribbble-surface-studies-v1.html) retained for contrast.

### Handoff for the future implementation PR (LIM-2455)

1. Only render the value card for ratified custom proposals, for roles permitted by server state; do not render on fictional pending/declined examples.
2. Preserve `DecisionValueCard`'s actual `nextStep` links and `lib/value.ts` validation, as well as `POST /api/timer` funnel actions. The view event must preserve the intersection/visibility guard; do not double-count a card mounted offscreen.
3. Explicitly separate plan **authorized** / Leadership **launch decided** / sandbox **tested or not** / **work observed or not**. Rejection is a human verdict, not an alarm.
4. Use the original goal target, acceptance-version record and work-item IDs, never invented per-goal agent reads. Whole-plan read freshness stays a **hash of the full plan**, not a goal version.
5. Render the operator's optional baseline estimate beside **actual measured spans**, never as a claimed saving.
6. Keep real error states, assistive-tech focus, external-link security and privacy-safe event dimensions. Preserve funnel events throughout visual refactors.
7. Use Liminal warm stone + canonical pigment/material system on **read-only archival record**, reserving Agency-yellow and Surge-coral roles pending founder decisions.
8. Compare against screenshot A = **live v15** (not the old Fly v13); founder rulings for BOTH work-first and decision-first approaches are intact. The D2 v3 browser pass does not automatically validate newer v4/gallery screens.

## B. Every open pull request — audit at current main `e044f11`

**Seven open after closing #28:** #22, #23, #24, #25, #29, #34, **#37**. GitHub's `rebased-on-main` job only checks branch-tip ancestry; success does **not** equal application/test-suite clearance.

| PR | Actual scope, status and delta | Risk / finding | Next action — **not an approval to merge** |
| --- | --- | --- | --- |
| **[#34](https://github.com/liminalworksinc/align/pull/34)** · draft | Design-only; original v3 gate passed head `e55baf1` with 0 High/0 Medium; v4 dual entry and additional screen studies now added | New gallery/v4 are **not yet browser or founder-approved**. Older PR copy mentions v13 and older read-freshness claims; document which have been superseded. | Keep draft. Rerun 1440/1024/900/390/320 and screen-reader/cold-user A/B against **v15**, then founder screen-level rulings in LIM-2454. Never merge a design artifact as production UI. |
| **[#22](https://github.com/liminalworksinc/align/pull/22)** · open, not draft | README text-only rewrite; ~18 additions, 3 deletions; compared to current main: **1 ahead, 50 behind** | Its claim **“It is not hosted yet”** is false after v15. It also describes older tool/count/testing context and lacks the shipped value/funnel feature. Old SpeedHacks demo must remain explicitly separate from hosted tester capabilities. | **Revise README against main e044f11**, state what custom hosted workspaces do and do not capture, disclose v15 funnel and pending test evidence; then lightweight doc review. Do not merge outdated copy as-is. |
| **[#37](https://github.com/liminalworksinc/align/pull/37)** · draft | **v2-only application replacement**, 1,135 changed files / 104 commits; Literate AI wrapper, full org/team/goal sessions, identity and security/retention/pre-seed features. Current base includes v15. | **Not equivalent to #29 flag:** v2 config says “v2 (/app, /api/v2) is always on, in Mode L and hosted”; root redirects to /app. Merging would retire v1 rather than leave an opt-in sidecar. PR explicitly says the ports of #32 LIM-2437 and #36 LIM-2445 features are in progress. Claimed 613 tests are **before full port**; Docker test and full suite CI not done. | **Hold.** Complete feature-equivalence matrix, data migration/restore/rollback, hosted tenant/auth/privacy checks, full tests and Docker build, counsel/security reviews, and founder release decision. Compare v2 schema against #29 before integrating. |
| **[#29](https://github.com/liminalworksinc/align/pull/29)** · draft | 37 files; `ALIGN_GOAL_SESSIONS=1` gated v2 allocation, target share, steering and reallocation; ahead 1 / behind 41 main | Strong local self-reported tests and short controlled proxy, **not the three-week live A/B/A result**. The goal-sessions system remains feature-gated; migration/privacy/percentages and automated steering change product semantics. | Preserve draft. Require founder product/consent ruling, migrate and test on current main, run planned live experiment, verify private-goal suppression and no steering on unsupported users before any activation. |
| **[#23](https://github.com/liminalworksinc/align/pull/23)** · draft recovery | 7 files, new v2 read-only goal-registry bridge gated by `ALIGN_GOAL_SESSIONS=1` and `ALIGN_GOAL_REGISTRY=1`; 1 ahead / 55 behind | Preservation snapshot, not ready. Branch ancestry check **failed** because it doesn't contain current main. Registry fields/identity/digest could create an expanded integration contract, and the v2 init path must be reviewed. | Retain as archive; define downstream consumer, grant model and external-reference lifecycle; rebase into a small independent feature PR only if needed. Don't merge preservation snapshot. |
| **[#24](https://github.com/liminalworksinc/align/pull/24)** · draft recovery | **140 files**, ~15,501 additions, 7 deletions of earlier v2 platform | **`mergeable=false`** on GitHub; enormous old platform recovery branch with stale migration/auth/dependency surface. No repository-wide validation claimed. | Keep solely as historical snapshot; selectively cherry-pick vetted features to fresh, scoped PRs; **never merge whole preservation PR**. Consider closing after confirmed archive retention and creator sign-off. |
| **[#25](https://github.com/liminalworksinc/align/pull/25)** · draft recovery | Two files changing Next/ESLint config from 16.4.0 to **16.4.2**; ahead 1 / behind 144 | **Already included in current `main`**: `package.json` currently pins both `next` and `eslint-config-next` to **16.4.2**. Branch-containment CI failed; this is redundant recovery, not a new upgrade. | Mark **superseded / archival**, no merge. Close only if owner confirms recovery intent is satisfied. |

### Release ordering recommendation

1. **No bulk merge.** #34 stays design-only, #24/#25/#23 are archives or gate-only experiments, #29 requires an experiment, and #37 is a separate **v2 replacement application** whose v1-equivalence and deployment gates are not yet met. #28 has already been integrated through merged #32 and is **closed as superseded**.
2. **Repair #22 first for investor/reviewer truth**, because it is a straightforward docs-only candidate and its “not hosted” claim is now externally misleading. Confirm exact production capabilities before editing.
3. Validate the **actual v15 conversion funnel** end-to-end before widening traffic: external tester workflow, one test form row, workspace event counts and distinction between clicks vs signed LOI. This work is independent of designing v16.
4. Continue **LIM-2454** founder review on the two approved entry paths plus v15-preserving post-decision UX; then separate production D3 work via LIM-2455.

## B.1 Correction: #28 is already integrated through #32

My original audit incorrectly characterized #28 as needing a new rebase. Verified: Sean's `#28` commit `5733ee8` was cherry-picked as `4345c42` into [#32](https://github.com/liminalworksinc/align/pull/32). #32 merged into `main` at `5b74d8683592eeea4ae0850156ea7b9759b23258`. A commit comparison of `5b74d86…e044f11` confirms main is **five commits ahead, zero behind** that merged point. #32 included follow-up fixes to scoped MCP data, import, hooks and paste commands. [Original #28](https://github.com/liminalworksinc/align/pull/28) has now been **closed, not merged**, as superseded. No reconstruction is required. This establishes that its features are present in the shipped source tree; **not** that every first-prompt hook path, hosted tester device, or external AI app was independently exercised in v15.

## B.2 #37 versus #29: important gating distinction

Both are v2-direction code, but **only #29 is an opt-in `ALIGN_GOAL_SESSIONS` feature-flagged addition to the current app**. In [#37](https://github.com/liminalworksinc/align/pull/37) the code explicitly declares v2 `/app` and `/api/v2` **always on** under `components/legacy-project-wrapper/implementation/lib/v2/config.ts`; its migrated `proxy.ts` redirects root to `/app`. It removes v1 app routes and shared passcode model. As a **draft and unmerged PR**, #37 is not live, but merging it must be treated as a **full release migration**, with no assumption that `ALIGN_GOAL_SESSIONS` protects Fly v15 after merge. It includes a more general per-person, per-team, per-goal authorization model, so D3's product components should map to that long-term model, while release regression tests anchor to actual v15 behavior.

Its PR body explicitly marks **LIM-2437/#32 ask/limit/activity/brief** and **LIM-2445/#36 value/feedback/waitlist/LOI** as **being ported**, not fully verified on v2. Latest head inspected: `9b77e5c`, 1,135 changed files, 104 commits, draft. The `rebased-on-main` workflow succeeded, **but that job only checks branch ancestry**, not the local suite, image build or released behavior. The claimed `613 passed` was before the full port and is not merge clearance.

## C. Limits of this review

- PR metadata/files, GitHub compare, source files in #37's migrated implementation and published branch workflows were consulted; the existing CI check `rebased-on-main` is a branch-ancestry assertion, not a full clean build. #23/#25 failed that check; #24 shows unmergeable.
- No local checkout rebuild, full server/web integration test, Fly health call or browser screenshot from current production was run in this audit.
- Individual PR authors' stated local test counts are **claims in PR descriptions**; they are not fresh post-rebase CI evidence for current main.
- The design prototype's conversion CTA is **disabled/demo only**; real v15 CTA and event recording remain sourced only in production code. Do not use gallery interactions as customer metrics.
